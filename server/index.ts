import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import mariadb from 'mariadb';
import {Client} from 'minio';
import sharp from 'sharp';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
const env=process.env;
const app=Fastify({logger:true});
const pool=mariadb.createPool({host:env.DB_HOST||'localhost',port:Number(env.DB_PORT||3306),user:env.DB_USER||'amanda',password:env.DB_PASSWORD,database:env.DB_NAME||'amanda',connectionLimit:5,bigIntAsNumber:true});
const store=new Client({endPoint:env.MINIO_HOST||'localhost',port:Number(env.MINIO_PORT||9000),useSSL:env.MINIO_SSL==='true',accessKey:env.MINIO_USER||'',secretKey:env.MINIO_PASSWORD||''});
const bucket=env.MINIO_BUCKET||'momentos';
await app.register(multipart,{limits:{fileSize:12*1024*1024,files:1,fields:2,parts:3,fieldSize:2000}});
await app.register(rateLimit,{global:false});
app.setErrorHandler((error,_req,reply)=>{app.log.error(error);const err=error as {statusCode?:number;message:string};const status=err.statusCode||500;reply.code(status).send({message:status===413?'A foto deve ter até 12 MB.':status>=500?'Não foi possível concluir. Tente novamente.':err.message});});
await pool.query(`CREATE TABLE IF NOT EXISTS momentos (id CHAR(36) PRIMARY KEY, autor VARCHAR(60) NOT NULL, legenda VARCHAR(500) NOT NULL, objeto VARCHAR(100) NOT NULL, criado_em TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3), INDEX(criado_em, id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
if(!await store.bucketExists(bucket))await store.makeBucket(bucket);
app.get('/api/health',async()=>{await pool.query('SELECT 1');await store.bucketExists(bucket);return {ok:true};});
app.get('/api/momentos',async(req)=>{
 const {cursor}=req.query as {cursor?:string};
 let rows;
 if(cursor){const [date,id]=Buffer.from(cursor,'base64url').toString().split('|');if(!date||!id||isNaN(Date.parse(date)))throw Object.assign(new Error('Cursor inválido'),{statusCode:400});rows=await pool.query('SELECT * FROM momentos WHERE criado_em < ? OR (criado_em = ? AND id < ?) ORDER BY criado_em DESC,id DESC LIMIT 21',[new Date(date),new Date(date),id]);}
 else rows=await pool.query('SELECT * FROM momentos ORDER BY criado_em DESC,id DESC LIMIT 21');
 const more=rows.length>20;const items=rows.slice(0,20);const last=items.at(-1);
 const count=await pool.query('SELECT COUNT(*) AS total FROM momentos');
 return {items:items.map((r:any)=>({id:r.id,autor:r.autor,legenda:r.legenda,url:'/api/fotos/'+r.id})),total:count[0].total,next:more&&last?Buffer.from(last.criado_em.toISOString()+'|'+last.id).toString('base64url'):null};
});
app.get('/api/fotos/:id',async(req,reply)=>{const {id}=req.params as {id:string};const rows=await pool.query('SELECT objeto FROM momentos WHERE id=?',[id]);if(!rows.length)return reply.code(404).send({message:'Foto não encontrada'});reply.type('image/webp').header('Cache-Control','public,max-age=86400');return reply.send(await store.getObject(bucket,rows[0].objeto));});
app.post('/api/momentos',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
 let autor='',legenda='',buffer:Buffer|undefined;
 for await(const part of req.parts()){if(part.type==='file'){if(part.fieldname!=='foto')throw Object.assign(new Error('Campo de foto inválido'),{statusCode:400});buffer=await part.toBuffer();}else if(part.fieldname==='autor')autor=String(part.value).trim();else if(part.fieldname==='legenda')legenda=String(part.value).trim();}
 if(!buffer||!autor||autor.length>60||legenda.length>500)return reply.code(400).send({message:'Envie uma foto, seu nome (até 60 caracteres) e uma legenda de até 500 caracteres.'});
 let photo:Buffer;
 try{photo=await sharp(buffer,{limitInputPixels:40000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{return reply.code(400).send({message:'Essa imagem não abriu. Tente JPG, PNG ou WebP.'});}
 const id=randomUUID(),objeto=id+'.webp';await store.putObject(bucket,objeto,photo,photo.length,{'Content-Type':'image/webp'});
 try{await pool.query('INSERT INTO momentos (id,autor,legenda,objeto) VALUES (?,?,?,?)',[id,autor,legenda,objeto]);}catch(error){await store.removeObject(bucket,objeto).catch(()=>{});throw error;}
 return reply.code(201).send({id,autor,legenda,url:'/api/fotos/'+id});
});
app.delete('/api/momentos/:id',async(req,reply)=>{const expected=env.ADMIN_TOKEN||'';const actual=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return reply.code(401).send({message:'Não autorizado'});const {id}=req.params as {id:string};const rows=await pool.query('SELECT objeto FROM momentos WHERE id=?',[id]);if(rows.length){await pool.query('DELETE FROM momentos WHERE id=?',[id]);await store.removeObject(bucket,rows[0].objeto);}return {ok:true};});
await app.register(staticFiles,{root:resolve('dist')});
app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({message:'Não encontrado'}):reply.sendFile('index.html'));
await app.listen({port:Number(env.PORT||3000),host:'0.0.0.0'});
