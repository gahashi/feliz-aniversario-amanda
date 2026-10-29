import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import coastalScene from './assets/praia-rosa-fundo.png';
import coastalLoop from './assets/praia-rosa-loop.png';
import amandaOnBiz from './assets/amanda-biz-alien.png';
import Gemeo from './Gemeo';
import './style.css';
import './v9.css';

type Kind = 'foto' | 'video' | 'texto';
type Moment = {
  id: string;
  autor: string;
  legenda: string;
  tipo: Kind;
  url: string | null;
  reacoes: Record<string, number>;
  criadoEm: string;
  secao?: string;
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
function Composer({ onClose, onCreated, secao = '' }: { onClose: () => void; onCreated: (moment: Moment) => void; secao?: string }) {
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
    data.set('secao', secao);
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
function Wall({ secao = '' }: { secao?: string }) {
  const secret = Boolean(secao);
  const sectionLabel = secao.replaceAll('/', ' / ');
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
      if (secao) params.set('secao', secao);
      const result = await responseJson<Page>(await fetch('/api/momentos?' + params.toString(), { signal: controller.signal }));
      if (currentGeneration !== generation.current) return;
      setItems(old => replace ? result.items : [...old, ...result.items.filter(x => !old.some(y => x.id === y.id))]);
      setNext(result.next); setTotal(result.total);
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && currentGeneration === generation.current) setError(readableError(err));
    } finally {
      if (currentGeneration === generation.current) { setLoading(false); loadingRef.current = false; }
    }
  }, [secao]);
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
        document.documentElement.style.setProperty('--mural-loop-x', `${shift}px`);
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
  // Respeita exatamente a ordem definida no painel administrativo.
  const visible = items;
  return <div className="site-shell">
    <div className="reading-progress" aria-hidden="true" />
    <header className="topbar">
      <a href="/" className="brand" aria-label="Amanda Party, início">amanda<span className="brand-star">✳</span><small>party</small></a>
      <a href="#mural" className="header-wall">{secret ? `mural: ${sectionLabel} ↓` : 'o mural ↓'}</a>
      <button className="btn btn-top" onClick={() => setComposer(true)}>+ escrever</button>
    </header>
    <main>
      <section className="hero hero-journey" aria-labelledby="hero-title">
        <div className="hero-stage">
          <div className="hero-scene" aria-hidden="true" style={{ backgroundImage: `url(${coastalScene})` }} />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-copy">
            <p className="hero-kicker"><span className="kicker-dot"/> {secret ? 'UM MURAL SÓ DESTE LINK' : 'PRAIA, BRISA E UM DIA TODO SEU'}</p>
            {secret ? <h1 id="hero-title" className="secret-hero-title">Um mural<br/>só para<br/><em>{sectionLabel}.</em></h1> : <h1 id="hero-title">Feliz<br/>aniversário,<br/><em>Amanda.</em></h1>}
          </div>
          <div className="hero-tail">
            <p className="hero-description">{secret ? <>Essa página guarda apenas as publicações enviadas para <strong>/secreto/{secao}</strong>. O mural principal e os demais links continuam separados.</> : <>Entre o mar e a estrada, fizemos esse cantinho para guardar carinho, memórias e recados. <strong>As lembranças estão logo abaixo.</strong></>}</p>
            <div className="hero-actions"><button className="btn btn-primary" onClick={() => setComposer(true)}>Deixar uma lembrança <span aria-hidden="true">↗</span></button><a href="#mural" className="see-memories">Explorar o mural <span aria-hidden="true">↓</span></a></div>
          </div>
          <div className="rider-path" aria-hidden="true"><div className="rider-float"><img src={amandaOnBiz} alt="" className="hero-biz" /></div></div>
          <div className="hero-bottom"><span>{secret ? `01 / MURAL ${sectionLabel.toUpperCase()}` : '01 / UM DIA ESPECIAL'}</span><div className="scroll-cue"><span>DESLIZE PARA VER AS LEMBRANÇAS</span><span className="scroll-arrow">↓</span></div><span className="hero-memories">{total} lembrança{total === 1 ? '' : 's'} no mural</span></div>
        </div>
      </section>
      <div className="coast-transition" aria-hidden="true"><span>PEQUENAS HISTÓRIAS, GRANDES LEMBRANÇAS</span></div>
      <section id="mural" ref={muralRef} className="mural-section" aria-label="Mural de lembranças">
        <div className="mural-background-track" aria-hidden="true">
          <div className="mural-background-image" style={{ backgroundImage: `url(${coastalLoop})` }} />
          <div className="mural-background-wash" />
        </div>
        <div className="mural-content">
        <div className="mural-heading"><span className="section-overline">{secret ? `MURAL / ${sectionLabel.toUpperCase()}` : 'PARADA 01 · MEMÓRIAS'}</span><h2>{secret ? <>As lembranças<br/><em>desse cantinho.</em></> : <>Um mar de<br/><em>gente querida.</em></>}</h2><p>{secret ? 'Só aparecem aqui as fotos, vídeos e recados publicados neste endereço.' : 'Aqui cabe tudo: foto bonita, vídeo engraçado ou uma mensagem do coração.'}</p></div>        <div className="mural-meta"><span className="mural-count">{total} lembrança{total === 1 ? '' : 's'} no mural</span></div>
        {!loading && !items.length && !error && <div className="empty-state"><span>♡</span><h3>A primeira lembrança pode ser sua.</h3><p>{secret ? 'Compartilhe uma foto, vídeo ou recado neste mural.' : 'Deixa uma foto, vídeo ou recadinho pra Amanda!'}</p><button className="btn btn-primary" onClick={() => setComposer(true)}>Publicar uma lembrança ↗</button></div>}
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
    {composer && <Composer secao={secao} onClose={() => setComposer(false)} onCreated={created => { setTotal(n => n + 1); setItems(old => [created, ...old]); }} />}
    {selected && <Detail moment={selected} onClose={() => setSelectedId(null)} onReact={reactTo} />}
  </div>;
}
function movePublication(list: Moment[], sourceId: string, targetId: string): Moment[] {
  const from = list.findIndex(moment => moment.id === sourceId);
  const to = list.findIndex(moment => moment.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const result = [...list];
  const [selected] = result.splice(from, 1);
  result.splice(to, 0, selected);
  return result;
}

function Admin() {
  const [adminSection, setAdminSection] = useState(() => new URLSearchParams(window.location.search).get('secao') || '');
  const [sectionInput, setSectionInput] = useState(() => new URLSearchParams(window.location.search).get('secao') || '');
  const [token, setToken] = useState(() => sessionStorage.getItem('amanda-admin-token') || '');
  const [input, setInput] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [items, setItems] = useState<Moment[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [workingId, setWorkingId] = useState('');

  const [organizing, setOrganizing] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderDraft, setOrderDraft] = useState<Moment[]>([]);
  const [orderOriginal, setOrderOriginal] = useState<Moment[]>([]);
  const [orderVersion, setOrderVersion] = useState('');
  const [orderNotice, setOrderNotice] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);
  const pointerDragRef = useRef<{ id: string; pointer: number } | null>(null);
  const dirty = orderDraft.length === orderOriginal.length && orderDraft.some((m, i) => m.id !== orderOriginal[i].id);

  const loadItems = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (adminSection) params.set('secao', adminSection);
      const page = await responseJson<Page>(await fetch('/api/momentos?' + params.toString(), { cache: 'no-store' }));
      setItems(old => cursor ? [...old, ...page.items.filter(m => !old.some(x => x.id === m.id))] : page.items);
      setNext(page.next); setTotal(page.total);
    } catch (err) { setError(readableError(err)); }
  }, [adminSection]);
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    setChecking(true);
    fetch('/api/admin/session', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => responseJson<{ ok: boolean }>(r))
      .then(() => { if (!ignore) { setAuthorized(true); setError(''); } })
      .catch(() => { if (!ignore) { setAuthorized(false); setToken(''); setError('Token inválido.'); sessionStorage.removeItem('amanda-admin-token'); } })
      .finally(() => { if (!ignore) setChecking(false); });
    return () => { ignore = true; };
  }, [token]);
  useEffect(() => {
    if (authorized) void loadItems();
  }, [authorized, loadItems]);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setError(''); sessionStorage.setItem('amanda-admin-token', input.trim()); setToken(input.trim()); setInput('');
  }
  function logout() {
    sessionStorage.removeItem('amanda-admin-token');
    setToken(''); setAuthorized(false); setItems([]); setError(''); setOrganizing(false); setOrderDraft([]);
  }
  function switchSection(event: React.FormEvent) {
    event.preventDefault();
    const raw = sectionInput.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    const value = raw.startsWith('secreto/') ? raw.slice('secreto/'.length) : raw;
    if (value.length > 120 || (value && !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(value))) {
      setError('Nome de seção inválido. Use letras, números, hífen, underline ou barras.'); return;
    }
    if (value === adminSection) return;
    if (dirty && !window.confirm('Descartar a ordem ainda não salva antes de trocar de mural?')) return;
    setError(''); setOrderNotice(''); setOrganizing(false); setOrderDraft([]);
    setAdminSection(value); setSectionInput(value); setItems([]); setNext(null); setTotal(0);
    const params = new URLSearchParams();
    if (value) params.set('secao', value);
    window.history.replaceState(null, '', '/admin' + (params.size ? '?' + params.toString() : ''));
  }
  async function removeMoment(moment: Moment) {
    if (!window.confirm(`Excluir definitivamente esta publicação de ${moment.autor}?`)) return;
    setWorkingId(moment.id); setError('');
    try {
      await responseJson(await fetch(`/api/admin/momentos/${moment.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }));
      setItems(old => old.filter(m => m.id !== moment.id)); setTotal(x => Math.max(0, x - 1));
    } catch (err) { setError(readableError(err)); }
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
    } catch (err) { setError(readableError(err)); }
    finally { setWorkingId(''); }
  }
  async function openOrganizer() {
    setOrganizing(true); setOrderLoading(true); setError(''); setOrderNotice('');
    try {
      const params = new URLSearchParams();
      if (adminSection) params.set('secao', adminSection);
      const response = await responseJson<{ items: Moment[]; version: string }>(await fetch('/api/admin/ordem?' + params.toString(), {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      }));
      setOrderOriginal(response.items); setOrderDraft(response.items); setOrderVersion(response.version);
    } catch (err) { setOrderDraft([]); setError(readableError(err)); }
    finally { setOrderLoading(false); }
  }
  function closeOrganizer() {
    if (dirty && !window.confirm('Descartar as alterações que ainda não foram salvas?')) return;
    setOrganizing(false); setOrderNotice(''); setDraggingId(null);
  }
  function moveTo(sourceId: string, targetId: string) {
    setOrderDraft(old => movePublication(old, sourceId, targetId));
    setOrderNotice('');
  }
  async function saveOrder() {
    if (!dirty || orderSaving) return;
    setOrderSaving(true); setError(''); setOrderNotice('');
    try {
      const result = await responseJson<{ ok: boolean; version: string }>(await fetch('/api/admin/ordem', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderDraft.map(moment => moment.id), version: orderVersion, secao: adminSection }),
      }));
      setOrderOriginal([...orderDraft]); setOrderVersion(result.version);
      setOrderNotice('Ordem salva! As publicações já aparecem nessa sequência no mural.');
      void loadItems();
    } catch (err) { setError(readableError(err)); }
    finally { setOrderSaving(false); }
  }
  const locked = orderSaving || orderLoading;
  return <div className="admin-page"><header className="admin-header"><a href="/" className="brand">amanda<span className="brand-star">✳</span><small>admin</small></a><a href="/" className="back-to-wall">← Voltar ao mural</a>{authorized && <button className="btn btn-outline" onClick={logout}>Sair</button>}</header>
    <main className="admin-main"><div className="admin-title"><span className="eyebrow green">PAINEL PARTICULAR</span><h1>Nos bastidores <span>✳</span></h1><p>Gerencie as publicações, reações e a ordem das lembranças de cada mural.</p></div>
      {!authorized ? <form className="admin-login" onSubmit={login}><span className="login-icon">🔒</span><h2>Acesso administrativo</h2><p>Use o token ADMIN_TOKEN configurado no servidor.</p><label className="field-label">Token administrativo<input type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" placeholder="Cole seu token aqui" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={checking || !input.trim()}>{checking ? 'Verificando…' : 'Entrar no painel ↗'}</button></form>
        : <><form className="admin-section-picker" onSubmit={switchSection}>
            <label htmlFor="admin-section">Selecionar mural</label>
            <div><input id="admin-section" value={sectionInput} onChange={e => setSectionInput(e.target.value)} placeholder="Principal (vazio) ou ex.: gemeo" />
              <button className="btn btn-primary" type="submit">Abrir mural</button></div>
            <p>Atual: <strong>{adminSection ? `/secreto/${adminSection}` : 'Mural principal /'}</strong> · {adminSection ? <a href={`/secreto/${adminSection}`} target="_blank" rel="noreferrer">Visualizar seção ↗</a> : <a href="/" target="_blank" rel="noreferrer">Visualizar principal ↗</a>}. Deixe o campo vazio para gerenciar o principal.</p>
          </form><div className="admin-stats"><div><strong>{total}</strong><span>Publicações totais</span></div><div><strong>{items.reduce((sum, m) => sum + Object.values(m.reacoes).reduce((a, b) => a + b, 0), 0)}</strong><span>Reações carregadas</span></div></div>
          <nav className="admin-mode-switch" aria-label="Modo do painel">
            <button type="button" className={!organizing ? 'active' : ''} aria-current={!organizing ? 'page' : undefined} onClick={closeOrganizer} disabled={locked}>Gerenciar posts</button>
            <button type="button" className={organizing ? 'active' : ''} aria-current={organizing ? 'page' : undefined} onClick={() => { if (!organizing) void openOrganizer(); }} disabled={locked}>✥ Organizar mural</button>
          </nav>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {organizing ? <section className="organizer" aria-label="Organizar ordem do mural">
            <div className="organizer-heading"><div><span className="eyebrow green">ARRUME AS LEMBRANÇAS</span><h2>Na ordem que você quiser.</h2><p>Arraste os cards pela alça <strong>⠿</strong> ou use as setas no celular. A primeira posição aparece primeiro no mural. Só muda depois de salvar.</p></div>
              <div className="organizer-tools">
                <button className="btn btn-outline" type="button" onClick={() => { setOrderDraft([...orderOriginal]); setOrderNotice(''); }} disabled={!dirty || locked}>Desfazer</button>
                <button className="btn btn-primary" type="button" onClick={() => void saveOrder()} disabled={!dirty || locked}>{orderSaving ? 'Salvando…' : `Salvar ordem${dirty ? ' •' : ''}`}</button>
              </div>
            </div>
            {orderNotice && <p className="organizer-success" role="status">✓ {orderNotice}</p>}
            {orderLoading ? <p className="organizer-loading">Carregando publicações…</p> :
              <div className="organizer-list">
                {orderDraft.map((m, index) => <article className={`organizer-item${draggingId === m.id ? ' is-dragging' : ''}`} key={m.id} data-order-id={m.id}
                  onDragOver={event => { if (draggedRef.current && !locked) event.preventDefault(); }}
                  onDrop={event => { event.preventDefault(); if (draggedRef.current && !locked) moveTo(draggedRef.current, m.id); draggedRef.current = null; setDraggingId(null); }}>
                  <span className="organizer-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="organizer-thumbnail">{m.tipo === 'foto' ? <img src={m.url || ''} alt="" loading="lazy" /> : m.tipo === 'video' ? <><video src={m.url || ''} preload="metadata" muted playsInline /><span aria-hidden="true" className="organizer-play">▶</span></> : <span aria-hidden="true">✎</span>}</div>
                  <div className="organizer-info"><strong>{m.autor}</strong><span>{TYPE_LABELS[m.tipo]} · {shortDate(m.criadoEm)}</span><p>{m.legenda || '(sem legenda)'}</p></div>
                  <div className="organizer-controls">
                    <button type="button" className="organizer-arrow" title="Mover para cima" aria-label={`Subir publicação de ${m.autor}`} onClick={() => { if (index > 0) moveTo(m.id, orderDraft[index - 1].id); }} disabled={index === 0 || locked}>↑</button>
                    <button type="button" className="organizer-arrow" title="Mover para baixo" aria-label={`Descer publicação de ${m.autor}`} onClick={() => { if (index < orderDraft.length - 1) moveTo(m.id, orderDraft[index + 1].id); }} disabled={index === orderDraft.length - 1 || locked}>↓</button>
                    <button type="button" className="organizer-arrow organizer-top" title="Mover para o início" aria-label={`Mover publicação de ${m.autor} para o início`} onClick={() => { if (index > 0) moveTo(m.id, orderDraft[0].id); }} disabled={index === 0 || locked}>⇈</button>
                    <span className="organizer-handle" role="button" tabIndex={0} aria-label={`Arrastar publicação de ${m.autor}`} title="Arrastar para mudar a posição" draggable={!locked}
                      onDragStart={event => { draggedRef.current = m.id; setDraggingId(m.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', m.id); }}
                      onDragEnd={() => { draggedRef.current = null; setDraggingId(null); }}
                      onPointerDown={event => { if (event.pointerType === 'mouse' || locked) return; pointerDragRef.current = { id: m.id, pointer: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); setDraggingId(m.id); }}
                      onPointerMove={event => { if (pointerDragRef.current?.id !== m.id || pointerDragRef.current.pointer !== event.pointerId) return; const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-order-id]'); const targetId = target?.dataset.orderId; if (targetId && targetId !== m.id) moveTo(m.id, targetId); }}
                      onPointerUp={() => { pointerDragRef.current = null; setDraggingId(null); }}
                      onPointerCancel={() => { pointerDragRef.current = null; setDraggingId(null); }}
                      onKeyDown={event => { if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); moveTo(m.id, orderDraft[index - 1].id); } if (event.key === 'ArrowDown' && index < orderDraft.length - 1) { event.preventDefault(); moveTo(m.id, orderDraft[index + 1].id); } }}>⠿</span>
                  </div>
                </article>)}
                {!orderDraft.length && !error && <p className="admin-empty">Não há publicações para organizar.</p>}
              </div>}
            <div className="organizer-footer"><span>{orderDraft.length} publicações · {dirty ? 'Alterações não salvas' : 'Ordem atual salva'}</span><button type="button" className="btn btn-primary" onClick={() => void saveOrder()} disabled={!dirty || locked}>{orderSaving ? 'Salvando…' : 'Salvar ordem ↗'}</button></div>
          </section> : <>
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
        </>}
    </main>
  </div>;
}
const path = window.location.pathname.replace(/\/+$/, '') || '/';
let secretSection: string | null = null;
if (path.startsWith('/secreto/')) {
  try {
    const decoded = decodeURIComponent(path.slice('/secreto/'.length)).toLowerCase();
    if (decoded.length <= 120 && /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(decoded)) secretSection = decoded;
  } catch { /* endereço com codificação inválida */ }
}
createRoot(document.getElementById('root')!).render(path === '/gemeo' ? <Gemeo /> : path === '/admin' ? <Admin />
  : path === '/secreto' || path.startsWith('/secreto/') ? secretSection ? <Wall secao={secretSection} /> : <main className="secret-invalid"><h1>Endereço de mural inválido</h1><p>Use /secreto/gemeo ou outro nome com letras, números e hífens.</p><a href="/">Voltar ao mural principal</a></main>
  : <Wall />);
