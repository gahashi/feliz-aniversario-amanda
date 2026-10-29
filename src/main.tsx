import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import coastalScene from './assets/praia-rosa-fundo.png';
import coastalLoop from './assets/praia-rosa-loop.png';
import amandaOnBiz from './assets/amanda-biz-alien.png';
import Gemeo from './Gemeo';
import './style.css';

type Kind = 'foto' | 'video' | 'texto';
type Moment = {
  id: string;
  autor: string;
  legenda: string;
  tipo: Kind;
  url: string | null;
  reacoes: Record<string, number>;
  criadoEm: string;
};
type Page = { items: Moment[]; total: number; next: string | null };
const EMOJIS = ['❤️', '😍', '😂', '🥹', '👽', '🔥'];
const LIMITS = { foto: 12 * 1024 * 1024, video: 80 * 1024 * 1024, texto: 0 };
const TYPE_LABELS: Record<Kind, string> = { foto: 'Foto', video: 'Vídeo', texto: 'Mensagem' };
const TABS: { value: Kind; icon: string; label: string }[] = [
  { value: 'foto', icon: '▧', label: 'Foto' },
  { value: 'video', icon: '▷', label: 'Vídeo' },
  { value: 'texto', icon: '✎', label: 'Mensagem' },
];

async function responseJson<T>(r: Response): Promise<T> {
  const value = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((value as { message?: string }).message || 'Ocorreu um problema. Tente novamente.');
  return value as T;
}
function readableError(err: unknown, fallback = 'Ocorreu um problema. Tente novamente.') {
  const message = (err as Error | undefined)?.message?.trim();
  return message || fallback;
}
function shortDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
}
function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
// Os bilhetes entram em posições variadas do álbum, sem alterar a ordem salva no banco.
function scatterMessages(items: Moment[]): Moment[] {
  const result = items.filter(m => m.tipo !== 'texto');
  for (const note of items.filter(m => m.tipo === 'texto')) {
    result.splice(hashId(note.id) % (result.length + 1), 0, note);
  }
  return result;
}

function Reactions({ moment, onReact, disabled = false }: {
  moment: Moment; onReact: (id: string, emoji: string) => void; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const used = EMOJIS.filter(emoji => (moment.reacoes[emoji] || 0) > 0);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [expanded]);
  return <div className="reactions" aria-label="Reações desta publicação" ref={ref}>
    {used.map(emoji => <button key={emoji} className="reaction-pill" type="button"
      onClick={() => onReact(moment.id, emoji)} disabled={disabled}
      title={`Reagir com ${emoji}`} aria-label={`${emoji}: ${moment.reacoes[emoji] || 0} reações. Reagir.`}>
      <span>{emoji}</span><span className="reaction-count">{moment.reacoes[emoji] || 0}</span>
    </button>)}
    <button className="reaction-more" type="button" title="Adicionar reação"
      aria-label={expanded ? 'Fechar opções de emoji' : 'Adicionar reação'}
      aria-expanded={expanded} onClick={() => setExpanded(!expanded)} disabled={disabled}>+</button>
    {expanded && <div className="reaction-picker" role="menu" aria-label="Escolher reação">
      {EMOJIS.map(emoji => <button key={emoji} className="reaction-choice" type="button"
        onClick={() => { onReact(moment.id, emoji); setExpanded(false); }} disabled={disabled}>{emoji}</button>)}
    </div>}
  </div>;
}
function MomentCard({ moment, index, onOpen, onReact }: {
  moment: Moment; index: number; onOpen: (moment: Moment) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const variant = hashId(moment.id) % 5;
  const isNote = moment.tipo === 'texto';
  return <article className={`memory-card ${isNote ? 'note-card' : 'media-card'} paper-${variant}`}
    style={{ '--rotation': `${[-1.8, 1.6, -.8, 1.25, -1.2, .65][index % 6]}deg`, '--lift': `${[0, 18, 4, 22, 10, 28][index % 6]}px` } as React.CSSProperties}>
    <span className="card-tape" aria-hidden="true" />
    {isNote ? <div className="note-content">
      <span className="note-star" aria-hidden="true">✳</span>
      <p>{moment.legenda}</p>
      <span className="note-decoration" aria-hidden="true">♡ ✦</span>
    </div> : <>
      <button type="button" className="media-open" onClick={() => onOpen(moment)}
        aria-label={`Abrir ${TYPE_LABELS[moment.tipo].toLowerCase()} de ${moment.autor}`}>
        {moment.tipo === 'foto' ? <img src={moment.url || ''} alt={moment.legenda || `Foto de ${moment.autor}`} loading="lazy" />
          : <><video src={moment.url || ''} preload="metadata" muted playsInline />
            <span className="play-overlay" aria-hidden="true">▶</span></>}
      </button>
      {moment.legenda && <p className="media-caption">{moment.legenda}</p>}
    </>}
    <div className="card-byline"><span>de {moment.autor}</span><time dateTime={moment.criadoEm}>{shortDate(moment.criadoEm)}</time></div>
    {!isNote && <Reactions moment={moment} onReact={onReact} />}
  </article>;
}
function Modal({ children, onClose, locked = false }: {
  children: React.ReactNode; onClose: () => void; locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    document.body.classList.add('dialog-open');
    return () => { dialog?.close(); document.body.classList.remove('dialog-open'); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="party-dialog" onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}
    onClick={event => { if (event.target === ref.current && !locked) onClose(); }}>
    <button className="dialog-close" type="button" onClick={onClose} disabled={locked} aria-label="Fechar">✕</button>
    {children}
  </dialog>;
}
function Composer({ onClose, onCreated }: { onClose: () => void; onCreated: (moment: Moment) => void }) {
  const [kind, setKind] = useState<Kind>('foto');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [author, setAuthor] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function changeKind(next: Kind) {
    setKind(next); setFile(null); setCaption(''); setError('');
  }
  function chooseFile(next: File | null) {
    if (!next) { setFile(null); return; }
    const validMime = kind === 'foto'
      ? ['image/jpeg', 'image/png', 'image/webp'].includes(next.type)
      : ['video/mp4', 'video/webm'].includes(next.type);
    if (!validMime) { setError('Formato não aceito. Escolha ' + (kind === 'foto' ? 'JPG, PNG ou WebP.' : 'MP4 ou WebM.')); setFile(null); return; }
    if (next.size > LIMITS[kind]) { setError(`Arquivo muito grande. Máximo: ${kind === 'foto' ? 12 : 80} MB.`); setFile(null); return; }
    setError(''); setFile(next);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kind !== 'texto' && !file) return;
    if (kind === 'texto' && !caption.trim()) { setError('Escreva uma mensagem.'); return; }
    setBusy(true); setError('');
    const data = new FormData();
    data.set('tipo', kind); data.set('autor', author.trim()); data.set('legenda', caption.trim());
    if (file) data.set('arquivo', file);
    try {
      const created = await responseJson<Moment>(await fetch('/api/momentos', { method: 'POST', body: data }));
      onCreated(created); setSuccess(true);
    } catch (err) { setError(readableError(err, 'Não foi possível publicar agora. Se continuar, verifique os logs do servidor web.')); }
    finally { setBusy(false); }
  }
  if (success) return <Modal onClose={onClose}><div className="upload-success">
    <span className="success-icon">💌</span><p className="eyebrow">RECADO RECEBIDO!</p>
    <h2>Mais amor<br />nesse mural ♡</h2>
    <p>Sua lembrança já faz parte dessa história.</p>
    <button className="btn btn-primary" onClick={onClose}>Ver no mural <span>↗</span></button>
    <button className="text-link" onClick={() => { setSuccess(false); setFile(null); setCaption(''); }}>Enviar mais uma</button>
  </div></Modal>;
  return <Modal onClose={onClose} locked={busy}><div className="composer">
    <p className="eyebrow green">DEIXE SUA MARCA</p>
    <h2>Um carinho<br />pra Amanda <span>♡</span></h2>
    <p className="composer-intro">Uma foto, um vídeo ou aquelas palavras que ficam pra sempre.</p>
    <div className="kind-switch" role="group" aria-label="Tipo de publicação">
      {TABS.map(tab => <button type="button" className={kind === tab.value ? 'active' : ''}
        key={tab.value} onClick={() => changeKind(tab.value)} disabled={busy}>
        <span aria-hidden="true">{tab.icon}</span> {tab.label}</button>)}
    </div>
    <form onSubmit={submit}>
      {kind !== 'texto' && <label className={`dropzone ${preview ? 'has-preview' : ''}`}>
        {preview ? kind === 'foto'
          ? <img src={preview} alt="Prévia da foto" />
          : <video src={preview} muted playsInline controls preload="metadata" />
          : <span className="dropzone-empty"><span className="drop-icon">{kind === 'foto' ? '▧' : '▷'}</span>
              <strong>{kind === 'foto' ? 'Escolher uma foto' : 'Escolher um vídeo'}</strong>
              <small>{kind === 'foto' ? 'JPG, PNG ou WebP · até 12 MB' : 'MP4 ou WebM · até 80 MB (MP4 H.264 recomendado)'}</small>
            </span>}
        <input type="file" accept={kind === 'foto' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm'}
          onChange={e => { chooseFile(e.target.files?.[0] || null); }} disabled={busy} />
        {preview && <span className="change-file">Trocar arquivo ↗</span>}
      </label>}
      <label className="field-label">Seu nome <span>(opcional)</span>
        <input value={author} onChange={e => setAuthor(e.target.value)} maxLength={60}
          placeholder="Como a Amanda te chama?" disabled={busy} />
      </label>
      <label className="field-label">{kind === 'texto' ? 'Sua mensagem' : 'Legenda'} <span>{kind !== 'texto' && '(opcional)'}</span>
        <textarea value={caption} onChange={e => setCaption(e.target.value)}
          required={kind === 'texto'} maxLength={500} rows={kind === 'texto' ? 6 : 3}
          placeholder={kind === 'texto' ? 'Amanda, que nunca faltem histórias boas pra contar…' : 'Conta um pouquinho dessa lembrança…'} disabled={busy} />
        <small className="char-count">{caption.length}/500</small>
      </label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="btn btn-primary submit-btn" disabled={busy || (kind !== 'texto' && !file) || (kind === 'texto' && !caption.trim())}>
        {busy ? 'Publicando…' : 'Colocar no mural'} <span>↗</span>
      </button>
      <p className="privacy-note">O mural é público para quem tiver o link. Envie somente o que pode ser compartilhado.</p>
    </form>
  </div></Modal>;
}
function Detail({ moment, onClose, onReact }: {
  moment: Moment; onClose: () => void; onReact: (id: string, emoji: string) => void;
}) {
  return <Modal onClose={onClose}><div className="detail">
    {moment.tipo === 'video'
      ? <video className="detail-media" src={moment.url || ''} controls autoPlay playsInline preload="metadata" />
      : moment.tipo === 'foto' ? <img className="detail-media" src={moment.url || ''} alt={moment.legenda || 'Lembrança com Amanda'} />
        : <p className="detail-note">{moment.legenda}</p>}
    {moment.legenda && moment.tipo !== 'texto' && <h2>{moment.legenda}</h2>}
    <p className="detail-byline">Com carinho, {moment.autor} ♡</p>
    <Reactions moment={moment} onReact={onReact} />
  </div></Modal>;
}
function Wall() {
  const [items, setItems] = useState<Moment[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [composer, setComposer] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const muralRef = useRef<HTMLElement>(null);
  const loadingRef = useRef(false);
  const generation = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const fetchPage = useCallback(async (cursor: string | null, replace = false) => {
    if (loadingRef.current && !replace) return;
    if (replace) { generation.current++; requestController.current?.abort(); loadingRef.current = false; }
    const currentGeneration = generation.current;
    const controller = new AbortController(); requestController.current = controller;
    loadingRef.current = true; setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const result = await responseJson<Page>(await fetch('/api/momentos?' + params.toString(), { signal: controller.signal }));
      if (currentGeneration !== generation.current) return;
      setItems(old => replace ? result.items : [...old, ...result.items.filter(x => !old.some(y => x.id === y.id))]);
      setNext(result.next); setTotal(result.total);
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && currentGeneration === generation.current) setError(readableError(err));
    } finally {
      if (currentGeneration === generation.current) { setLoading(false); loadingRef.current = false; }
    }
  }, []);
  useEffect(() => {
    setItems([]); setNext(null);
    void fetchPage(null, true);
    return () => { requestController.current?.abort(); generation.current++; loadingRef.current = false; };
  }, [fetchPage]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !next || loading || error) return;
    const obs = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) void fetchPage(next); }, { rootMargin: '500px' });
    obs.observe(node); return () => obs.disconnect();
  }, [next, loading, error, fetchPage]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const progress = Math.min(1, window.scrollY / max);
      document.documentElement.style.setProperty('--travel-progress', `${(progress * 100).toFixed(2)}%`);
      const mural = muralRef.current;
      if (mural) {
        const bounds = mural.getBoundingClientRect();
        document.documentElement.classList.toggle('past-hero', bounds.top < 30);
        // Quantidade absoluta rolada no mural: descer = esquerda; subir = direita.
        // O PNG possui a paisagem + a mesma paisagem espelhada para fechar o loop.
        const inside = Math.max(0, -bounds.top);
        const shift = Math.round(inside * -0.32);
        mural.style.setProperty('--mural-loop-x', `${shift}px`);
      }
    };
    const scroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update(); window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', scroll);
    return () => { window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); cancelAnimationFrame(raf); document.documentElement.classList.remove('past-hero'); };
  }, []);
  async function reactTo(id: string, emoji: string) {
    const increase = (m: Moment, delta: number): Moment => m.id !== id ? m : {
      ...m, reacoes: { ...m.reacoes, [emoji]: Math.max(0, (m.reacoes[emoji] || 0) + delta) },
    };
    setItems(prev => prev.map(m => increase(m, 1)));
    try {
      await responseJson(await fetch(`/api/momentos/${encodeURIComponent(id)}/reacoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
      }));
    } catch (err) { setItems(prev => prev.map(m => increase(m, -1))); setError(readableError(err)); }
  }
  const selected = selectedId ? items.find(m => m.id === selectedId) || null : null;
  const visible = scatterMessages(items);
  return <div className="site-shell">
    <div className="reading-progress" aria-hidden="true" />
    <header className="topbar">
      <a href="/" className="brand" aria-label="Amanda Party, início">amanda<span className="brand-star">✳</span><small>party</small></a>
      <a href="#mural" className="header-wall">o mural ↓</a>
      <button className="btn btn-top" onClick={() => setComposer(true)}>+ escrever</button>
    </header>
    <main>
      <section className="hero hero-journey" aria-labelledby="hero-title">
        <div className="hero-stage">
          <div className="hero-scene" aria-hidden="true" style={{ backgroundImage: `url(${coastalScene})` }} />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-copy">
            <p className="hero-kicker"><span className="kicker-dot"/> PRAIA, BRISA E UM DIA TODO SEU</p>
            <h1 id="hero-title">Feliz<br/>aniversário,<br/><em>Amanda.</em></h1>
            <p className="hero-description">Entre o mar e a estrada, fizemos esse cantinho para guardar carinho, memórias e recados. <strong>As lembranças estão logo abaixo.</strong></p>
            <div className="hero-actions"><button className="btn btn-primary" onClick={() => setComposer(true)}>Deixar uma lembrança <span aria-hidden="true">↗</span></button><a href="#mural" className="see-memories">Explorar o mural <span aria-hidden="true">↓</span></a></div>
          </div>
          <div className="rider-path" aria-hidden="true"><div className="rider-float"><img src={amandaOnBiz} alt="" className="hero-biz" /></div></div>
          <div className="hero-bottom"><span>01 / UM DIA ESPECIAL</span><div className="scroll-cue"><span>DESLIZE PARA VER AS LEMBRANÇAS</span><span className="scroll-arrow">↓</span></div><span className="hero-memories">{total} lembrança{total === 1 ? '' : 's'} no mural</span></div>
        </div>
      </section>
      <div className="coast-transition" aria-hidden="true"><span>PEQUENAS HISTÓRIAS, GRANDES LEMBRANÇAS</span></div>
      <section id="mural" ref={muralRef} className="mural-section" aria-label="Mural de lembranças">
        <div className="mural-background-track" aria-hidden="true">
          <div className="mural-background-image" style={{ backgroundImage: `url(${coastalLoop})` }} />
          <div className="mural-background-wash" />
        </div>
        <div className="mural-content">
        <div className="mural-heading"><span className="section-overline">PARADA 01 · MEMÓRIAS</span><h2>Um mar de<br/><em>gente querida.</em></h2><p>Aqui cabe tudo: foto bonita, vídeo engraçado ou uma mensagem do coração.</p></div>        <div className="mural-meta"><span className="mural-count">{total} lembrança{total === 1 ? '' : 's'} no mural</span></div>
        {!loading && !items.length && !error && <div className="empty-state"><span>♡</span><h3>A primeira lembrança pode ser sua.</h3><p>Deixa uma foto, vídeo ou recadinho pra Amanda!</p><button className="btn btn-primary" onClick={() => setComposer(true)}>Publicar uma lembrança ↗</button></div>}
        <div className="masonry-grid">
          {visible.map((moment, i) => <MomentCard key={moment.id} moment={moment} index={i} onOpen={m => setSelectedId(m.id)} onReact={reactTo} />)}
        </div>
        <div ref={sentinel} className="wall-status" aria-live="polite">
          {loading ? 'Buscando mais lembranças…' : !next && items.length ? 'Esse é o fim do mural. Mas as histórias continuam. ♡' : ''}
          {error && <p className="inline-error" role="alert">{error} <button onClick={() => void fetchPage(next)}>Tentar novamente</button></p>}
        </div>
        <div className="end-cta"><span className="cta-doodle" aria-hidden="true">✳</span><p>Uma lembrança sua também faz parte dessa história.</p><button className="btn btn-outline" onClick={() => setComposer(true)}>Enviar carinho ↗</button></div>
        </div>
      </section>
      <section className="closing-coast" aria-hidden="true"><div className="closing-coast-line"/><span>fim da estrada, começo das lembranças ♡</span></section>
    </main>
    <footer className="site-footer"><div><a href="/" className="footer-logo">amanda ✳</a><span>feito com amor, brisa do mar e algumas risadas.</span></div><a href="/admin" className="admin-access">admin</a></footer>
    <button className="floating-create" onClick={() => setComposer(true)} aria-label="Adicionar lembrança">+ <span>Deixar recado</span></button>
    {composer && <Composer onClose={() => setComposer(false)} onCreated={created => { setTotal(n => n + 1); setItems(old => [created, ...old]); }} />}
    {selected && <Detail moment={selected} onClose={() => setSelectedId(null)} onReact={reactTo} />}
  </div>;
}
function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('amanda-admin-token') || '');
  const [input, setInput] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [items, setItems] = useState<Moment[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [workingId, setWorkingId] = useState('');
  const loadItems = useCallback(async (cursor?: string) => {
    try {
      const page = await responseJson<Page>(await fetch('/api/momentos' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { cache: 'no-store' }));
      setItems(old => cursor ? [...old, ...page.items.filter(m => !old.some(x => x.id === m.id))] : page.items);
      setNext(page.next); setTotal(page.total);
    } catch (err) { setError(readableError(err, 'Não foi possível publicar agora. Se continuar, verifique os logs do servidor web.')); }
  }, []);
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    setChecking(true);
    fetch('/api/admin/session', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => responseJson<{ ok: boolean }>(r))
      .then(() => { if (!ignore) { setAuthorized(true); setError(''); void loadItems(); } })
      .catch(() => { if (!ignore) { setAuthorized(false); setToken(''); setError('Token inválido.'); sessionStorage.removeItem('amanda-admin-token'); } })
      .finally(() => { if (!ignore) setChecking(false); });
    return () => { ignore = true; };
  }, [token, loadItems]);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setError(''); sessionStorage.setItem('amanda-admin-token', input.trim()); setToken(input.trim()); setInput('');
  }
  function logout() { sessionStorage.removeItem('amanda-admin-token'); setToken(''); setAuthorized(false); setItems([]); setError(''); }
  async function removeMoment(moment: Moment) {
    if (!window.confirm(`Excluir definitivamente esta publicação de ${moment.autor}?`)) return;
    setWorkingId(moment.id); setError('');
    try {
      await responseJson(await fetch(`/api/admin/momentos/${moment.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }));
      setItems(old => old.filter(m => m.id !== moment.id)); setTotal(x => Math.max(0, x - 1));
    } catch (err) { setError(readableError(err, 'Não foi possível publicar agora. Se continuar, verifique os logs do servidor web.')); }
    finally { setWorkingId(''); }
  }
  async function clearReactions(moment: Moment, emoji?: string) {
    if (!window.confirm(emoji ? `Zerar as reações ${emoji} desta publicação?` : 'Remover TODAS as reações desta publicação?')) return;
    setWorkingId(moment.id); setError('');
    try {
      const data = await responseJson<{ reacoes: Record<string, number> }>(await fetch(`/api/admin/momentos/${moment.id}/reacoes`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emoji ? { emoji } : {}),
      }));
      setItems(old => old.map(m => m.id === moment.id ? { ...m, reacoes: data.reacoes } : m));
    } catch (err) { setError(readableError(err, 'Não foi possível publicar agora. Se continuar, verifique os logs do servidor web.')); }
    finally { setWorkingId(''); }
  }
  return <div className="admin-page"><header className="admin-header"><a href="/" className="brand">amanda<span className="brand-star">✳</span><small>admin</small></a><a href="/" className="back-to-wall">← Voltar ao mural</a>{authorized && <button className="btn btn-outline" onClick={logout}>Sair</button>}</header>
    <main className="admin-main"><div className="admin-title"><span className="eyebrow green">PAINEL PARTICULAR</span><h1>Nos bastidores <span>✳</span></h1><p>Gerencie as publicações e reações que aparecem no mural.</p></div>
      {!authorized ? <form className="admin-login" onSubmit={login}><span className="login-icon">🔒</span><h2>Acesso administrativo</h2><p>Use o token ADMIN_TOKEN configurado no servidor.</p><label className="field-label">Token administrativo<input type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" placeholder="Cole seu token aqui" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={checking || !input.trim()}>{checking ? 'Verificando…' : 'Entrar no painel ↗'}</button></form>
        : <><div className="admin-stats"><div><strong>{total}</strong><span>Publicações totais</span></div><div><strong>{items.reduce((sum, m) => sum + Object.values(m.reacoes).reduce((a, b) => a + b, 0), 0)}</strong><span>Reações carregadas</span></div></div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="admin-list"><div className="admin-list-title"><h2>Publicações</h2><span>{items.length} exibidas</span></div>
            {items.map(m => <article className="admin-item" key={m.id}>
              <div className="admin-thumb">{m.tipo === 'foto' ? <img src={m.url || ''} alt="" /> : m.tipo === 'video' ? <video src={m.url || ''} preload="none" /> : <span>✎</span>}</div>
              <div className="admin-item-info"><strong>{TYPE_LABELS[m.tipo]} · {m.autor}</strong><p>{m.legenda || '(sem legenda)'}</p><small>{shortDate(m.criadoEm)} · {m.id}</small></div>
              <div className="admin-actions"><div className="admin-reactions">{EMOJIS.filter(e => m.reacoes[e]).map(e => <button title={`Zerar ${e}`} key={e} onClick={() => void clearReactions(m, e)} disabled={workingId === m.id}>{e} {m.reacoes[e]} ×</button>)}</div>
                <div className="admin-buttons"><button className="btn btn-outline" onClick={() => void clearReactions(m)} disabled={workingId === m.id || !Object.keys(m.reacoes).length}>Limpar reações</button><button className="btn btn-danger" onClick={() => void removeMoment(m)} disabled={workingId === m.id}>{workingId === m.id ? 'Processando…' : 'Excluir'}</button></div>
              </div>
            </article>)}
            {!items.length && <p className="admin-empty">Nenhuma publicação encontrada.</p>}
          </div>
          {next && <button className="btn btn-outline load-admin-more" onClick={() => void loadItems(next)}>Carregar mais publicações ↓</button>}
        </>}
    </main>
  </div>;
}
const path = window.location.pathname.replace(/\/+$/, '') || '/';
createRoot(document.getElementById('root')!).render(path === '/gemeo' ? <Gemeo /> : path === '/admin' ? <Admin /> : <Wall />);
