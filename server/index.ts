import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import mariadb from 'mariadb';
import { Client } from 'minio';
import sharp from 'sharp';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';

const env = process.env;
const app = Fastify({ logger: true, bodyLimit: 90 * 1024 * 1024 });
const pool = mariadb.createPool({
  host: env.DB_HOST || 'localhost',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'amanda',
  password: env.DB_PASSWORD,
  database: env.DB_NAME || 'amanda',
  connectionLimit: 5,
  bigIntAsNumber: true,
});
const store = new Client({
  endPoint: env.MINIO_HOST || 'localhost',
  port: Number(env.MINIO_PORT || 9000),
  useSSL: env.MINIO_SSL === 'true',
  accessKey: env.MINIO_USER || '',
  secretKey: env.MINIO_PASSWORD || '',
});
const bucket = env.MINIO_BUCKET || 'momentos';
const MAX_PHOTO = 12 * 1024 * 1024;
const MAX_VIDEO = 80 * 1024 * 1024;
const EMOJIS = ['❤️', '😍', '😂', '🥹', '👽', '🔥'] as const;
type Kind = 'foto' | 'video' | 'texto';
type MomentRow = {
  id: string; autor: string; legenda: string; objeto: string | null;
  tipo: Kind; mime: string | null; tamanho: number | null; criado_em: Date;
};

await app.register(multipart, { limits: { fileSize: MAX_VIDEO, files: 1, fields: 6, parts: 7, fieldSize: 10000 } });
await app.register(rateLimit, { global: false });
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  const err = error as { statusCode?: number; message: string; code?: string };
  const status = err.statusCode || 500;
  reply.code(status).send({
    message: status === 413 || err.code === 'FST_REQ_FILE_TOO_LARGE'
      ? 'O arquivo ultrapassou o limite permitido.'
      : status >= 500 ? 'Não foi possível concluir a operação. Confira se o banco e o storage estão ativos.' : err.message,
  });
});

// Migração incremental: mantém as fotos do banco antigo e os objetos do MinIO.
await pool.query(`CREATE TABLE IF NOT EXISTS momentos (
  id CHAR(36) PRIMARY KEY,
  autor VARCHAR(60) NOT NULL,
  legenda VARCHAR(500) NOT NULL,
  objeto VARCHAR(100) NOT NULL,
  criado_em TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (criado_em, id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const existing = await pool.query(`SELECT COLUMN_NAME,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'momentos'`);
const columns = new Set((existing as { COLUMN_NAME: string; IS_NULLABLE: string; CHARACTER_MAXIMUM_LENGTH: number | null }[]).map(x => x.COLUMN_NAME));
if (!columns.has('tipo')) await pool.query("ALTER TABLE momentos ADD COLUMN tipo ENUM('foto','video','texto') NOT NULL DEFAULT 'foto'");
if (!columns.has('mime')) await pool.query('ALTER TABLE momentos ADD COLUMN mime VARCHAR(100) NULL');
if (!columns.has('tamanho')) await pool.query('ALTER TABLE momentos ADD COLUMN tamanho BIGINT NULL');
// A coluna da versão anterior não aceitava NULL; textos não têm objeto no storage.
const objectColumn = (existing as { COLUMN_NAME: string; IS_NULLABLE: string; CHARACTER_MAXIMUM_LENGTH: number | null }[]).find(x => x.COLUMN_NAME === 'objeto');
if (objectColumn && (objectColumn.IS_NULLABLE === 'NO' || (objectColumn.CHARACTER_MAXIMUM_LENGTH || 0) < 255)) {
  await pool.query('ALTER TABLE momentos MODIFY COLUMN objeto VARCHAR(255) NULL');
}
await pool.query(`CREATE TABLE IF NOT EXISTS reacoes (
  momento_id CHAR(36) NOT NULL,
  emoji VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  quantidade INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (momento_id, emoji),
  CONSTRAINT fk_reacoes_momento FOREIGN KEY (momento_id)
    REFERENCES momentos(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
if (!await store.bucketExists(bucket)) await store.makeBucket(bucket);

function httpError(message: string, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}
function validId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw httpError('Identificador inválido.');
}
function authorized(header: string | undefined) {
  const expected = env.ADMIN_TOKEN || '';
  const actual = String(header || '').replace(/^Bearer\s+/i, '');
  return Boolean(expected) && Buffer.byteLength(actual) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function checkAdmin(req: { headers: { authorization?: string } }) {
  if (!authorized(req.headers.authorization)) throw httpError('Acesso administrativo não autorizado.', 401);
}
async function reactionsFor(ids: string[]) {
  const result: Record<string, Record<string, number>> = {};
  for (const id of ids) result[id] = {};
  if (!ids.length) return result;
  const holders = ids.map(() => '?').join(',');
  const rows = await pool.query(
    `SELECT momento_id,emoji,quantidade FROM reacoes WHERE momento_id IN (${holders})`, ids
  ) as { momento_id: string; emoji: string; quantidade: number }[];
  for (const row of rows) result[row.momento_id][row.emoji] = Number(row.quantidade);
  return result;
}
function publicMoment(row: MomentRow, reactions: Record<string, number> = {}) {
  return {
    id: row.id,
    autor: row.autor,
    legenda: row.legenda,
    tipo: row.tipo || 'foto',
    url: row.tipo === 'texto' ? null : '/api/midia/' + row.id,
    reacoes: reactions,
    criadoEm: row.criado_em instanceof Date ? row.criado_em.toISOString() : row.criado_em,
  };
}

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: await store.bucketExists(bucket) };
});

app.get('/api/momentos', async req => {
  const { cursor, tipo } = req.query as { cursor?: string; tipo?: string };
  if (tipo && !['foto', 'video', 'texto'].includes(tipo)) throw httpError('Filtro inválido.');
  let date: Date | undefined, id: string | undefined;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString();
      const pieces = decoded.split('|');
      if (pieces.length !== 2 || !pieces[0] || !pieces[1]) throw Error();
      date = new Date(pieces[0]); id = pieces[1];
      if (Number.isNaN(date.getTime())) throw Error();
      validId(id);
    } catch { throw httpError('Cursor inválido.'); }
  }
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (tipo) { clauses.push('tipo = ?'); args.push(tipo); }
  if (date && id) {
    clauses.push('(criado_em < ? OR (criado_em = ? AND id < ?))');
    args.push(date, date, id);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = await pool.query(`SELECT * FROM momentos${where} ORDER BY criado_em DESC,id DESC LIMIT 21`, args) as MomentRow[];
  const items = rows.slice(0, 20);
  const reactionMap = await reactionsFor(items.map(x => x.id));
  const count = await pool.query('SELECT COUNT(*) AS total FROM momentos');
  const last = items.at(-1);
  return {
    items: items.map(row => publicMoment(row, reactionMap[row.id])),
    total: Number(count[0].total),
    next: rows.length > 20 && last
      ? Buffer.from(new Date(last.criado_em).toISOString() + '|' + last.id).toString('base64url')
      : null,
  };
});

// Mantém também o endpoint antigo para links de fotos que já foram compartilhados.
async function sendMedia(id: string, range: string | undefined, reply: any) {
  validId(id);
  const rows = await pool.query('SELECT objeto,tipo,mime,tamanho FROM momentos WHERE id=?', [id]);
  if (!rows.length || !rows[0].objeto) throw httpError('Mídia não encontrada.', 404);
  const row = rows[0] as Pick<MomentRow, 'objeto' | 'tipo' | 'mime' | 'tamanho'>;
  const mime = row.mime || 'image/webp';
  reply.type(mime).header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, max-age=3600');
  if (!range) return reply.send(await store.getObject(bucket, row.objeto!));
  const metadata = await store.statObject(bucket, row.objeto!);
  const size = metadata.size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  }
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  }
  reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`)
    .header('Content-Length', end - start + 1);
  return reply.send(await store.getPartialObject(bucket, row.objeto!, start, end - start + 1));
}
app.get('/api/midia/:id', async (req, reply) => {
  return sendMedia((req.params as { id: string }).id, req.headers.range, reply);
});
app.get('/api/fotos/:id', async (req, reply) => {
  return sendMedia((req.params as { id: string }).id, req.headers.range, reply);
});

app.post('/api/momentos', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req, reply) => {
  let autor = '', legenda = '', tipo: Kind | '' = '', buffer: Buffer | undefined;
  let mimeType = '';
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (!['arquivo', 'foto'].includes(part.fieldname)) throw httpError('Campo de arquivo inválido.');
      buffer = await part.toBuffer();
      mimeType = part.mimetype;
    } else if (part.fieldname === 'autor') autor = String(part.value).trim();
    else if (part.fieldname === 'legenda') legenda = String(part.value).trim();
    else if (part.fieldname === 'tipo') tipo = String(part.value) as Kind;
  }
  if (!tipo) tipo = buffer ? (mimeType.startsWith('video/') ? 'video' : 'foto') : 'texto';
  if (!['foto', 'video', 'texto'].includes(tipo)) throw httpError('Tipo de publicação inválido.');
  if (autor.length > 60 || legenda.length > 500) throw httpError('Nome ou mensagem muito longos.');
  autor = autor || 'Alguém especial';
  if (tipo === 'texto' && (!legenda || buffer)) throw httpError('Escreva uma mensagem sem anexar arquivo.');
  if (tipo !== 'texto' && !buffer) throw httpError('Escolha uma foto ou vídeo.');
  let fileData: Buffer | undefined, objectName: string | null = null, savedMime: string | null = null;
  const id = randomUUID();
  if (tipo === 'foto') {
    if (!buffer || buffer.length > MAX_PHOTO) throw httpError('A foto deve ter até 12 MB.', 413);
    try {
      fileData = await sharp(buffer, { limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 }).toBuffer();
    } catch { throw httpError('Imagem inválida. Use JPG, PNG ou WebP.'); }
    objectName = id + '.webp'; savedMime = 'image/webp';
  } else if (tipo === 'video') {
    if (!buffer || buffer.length > MAX_VIDEO) throw httpError('O vídeo deve ter até 80 MB.', 413);
    const mp4 = ['video/mp4', 'application/mp4'].includes(mimeType)
      && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    const webm = mimeType === 'video/webm' && buffer.subarray(0, 4).equals(Buffer.from([0x1A, 0x45, 0xDF, 0xA3]));
    if (!mp4 && !webm) throw httpError('Use um vídeo MP4 ou WebM válido.');
    fileData = buffer;
    objectName = id + (mp4 ? '.mp4' : '.webm');
    savedMime = mp4 ? 'video/mp4' : 'video/webm';
  }
  if (fileData && objectName && savedMime) {
    await store.putObject(bucket, objectName, fileData, fileData.length, { 'Content-Type': savedMime });
  }
  try {
    await pool.query('INSERT INTO momentos (id,autor,legenda,objeto,tipo,mime,tamanho) VALUES (?,?,?,?,?,?,?)',
      [id, autor, legenda, objectName, tipo, savedMime, fileData?.length || null]);
  } catch (error) {
    if (objectName) await store.removeObject(bucket, objectName).catch(() => {});
    throw error;
  }
  return reply.code(201).send(publicMoment({
    id, autor, legenda, objeto: objectName, tipo, mime: savedMime,
    tamanho: fileData?.length || null, criado_em: new Date(),
  }));
});

app.post('/api/momentos/:id/reacoes', {
  config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
}, async (req, reply) => {
  const { id } = req.params as { id: string };
  validId(id);
  const { emoji } = (req.body || {}) as { emoji?: string };
  if (!emoji || !EMOJIS.includes(emoji as (typeof EMOJIS)[number])) throw httpError('Emoji inválido.');
  const rows = await pool.query('SELECT id FROM momentos WHERE id=?', [id]);
  if (!rows.length) throw httpError('Publicação não encontrada.', 404);
  await pool.query(`INSERT INTO reacoes (momento_id, emoji, quantidade) VALUES (?,?,1)
    ON DUPLICATE KEY UPDATE quantidade=quantidade+1`, [id, emoji]);
  const counts = await reactionsFor([id]);
  return reply.send({ reacoes: counts[id] });
});

app.get('/api/admin/session', { preHandler: checkAdmin }, async () => ({ ok: true }));
app.delete('/api/admin/momentos/:id/reacoes', { preHandler: checkAdmin }, async req => {
  const { id } = req.params as { id: string };
  validId(id);
  const { emoji } = (req.body || {}) as { emoji?: string };
  if (emoji && !EMOJIS.includes(emoji as (typeof EMOJIS)[number])) throw httpError('Emoji inválido.');
  if (emoji) await pool.query('DELETE FROM reacoes WHERE momento_id=? AND emoji=?', [id, emoji]);
  else await pool.query('DELETE FROM reacoes WHERE momento_id=?', [id]);
  const counts = await reactionsFor([id]);
  return { ok: true, reacoes: counts[id] };
});

async function deleteMoment(id: string) {
  validId(id);
  const rows = await pool.query('SELECT objeto FROM momentos WHERE id=?', [id]);
  if (!rows.length) throw httpError('Publicação não encontrada.', 404);
  await pool.query('DELETE FROM momentos WHERE id=?', [id]);
  if (rows[0].objeto) await store.removeObject(bucket, rows[0].objeto).catch(err => {
    app.log.warn({ err, id }, 'Objeto órfão no MinIO após exclusão.');
  });
  return { ok: true };
}
app.delete('/api/admin/momentos/:id', { preHandler: checkAdmin }, async req =>
  deleteMoment((req.params as { id: string }).id));
// Compatibilidade com o comando curl de exclusão da versão anterior.
app.delete('/api/momentos/:id', { preHandler: checkAdmin }, async req =>
  deleteMoment((req.params as { id: string }).id));

await app.register(staticFiles, { root: resolve('dist') });
app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/')
  ? reply.code(404).send({ message: 'Rota não encontrada.' })
  : reply.sendFile('index.html'));
await app.listen({ port: Number(env.PORT || 3000), host: '0.0.0.0' });
