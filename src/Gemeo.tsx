import { useEffect, useRef, useState } from 'react';
import amandaOnBiz from './assets/amanda-biz-alien.png';
import coast from './assets/praia-rosa-fundo.png';
import { MENSAGEM_DO_GEMEO } from './gemeoMensagem';
import './gemeo.css';

type Phase = 'waiting' | 'burning' | 'ready' | 'celebration' | 'letter';
const WORDS = ['FELIZ', 'ANIVERSÁRIO', 'AMANDA!'] as const;
const CLICKS_PER_ROUND = [4, 2, 2];
const JOKES = [
  ['Esse isqueiro tá igual Wi-Fi de praia...', 'ARMANDINHO É O TERROR!!!', 'Prensa beeeeem... a sorte, né? 😅', 'Não fura a roda! 👀'],
  ['Acende outra vez, ainda não acabou!', 'Quase! A brisa do Rosa tá forte.'],
  ['Última rodada. Capricha, gêmea!', 'Isso! Não fura a roda! 🛵'],
] as const;

const LEAVES = Array.from({ length: 27 }, (_, i) => ({
  left: `${(i * 43 + 7) % 101}%`,
  delay: `${(i % 11) * -0.61}s`,
  duration: `${5.6 + (i % 6) * .7}s`,
  drift: `${((i * 41) % 180) - 90}px`,
  rotation: `${((i * 59) % 480) - 240}deg`,
  glyph: i % 4 === 0 ? '🍁' : i % 3 === 0 ? '🍃' : '🌿',
}));
const CONFETTI = Array.from({ length: 58 }, (_, i) => ({
  left: `${(i * 71 + 13) % 100}%`,
  delay: `${(i % 12) * .11}s`,
  duration: `${3.7 + (i % 7) * .38}s`,
  drift: `${((i * 47) % 180) - 90}px`,
  rotation: `${(i * 83) % 540}deg`,
  color: ['#e2bc5d', '#bd393b', '#a7cd82', '#f4e6b6', '#d8e3a3', '#e98c63'][i % 6],
}));

function FallingLeaves() {
  return <div className="gem-leaves" aria-hidden="true">
    {LEAVES.map((leaf, i) => <span className="gem-leaf" key={i} style={{
      left:leaf.left, animationDelay:leaf.delay, animationDuration:leaf.duration,
      ['--gem-drift' as string]:leaf.drift, ['--gem-rotation' as string]:leaf.rotation,
    }}>{leaf.glyph}</span>)}
  </div>;
}
function Confetti() {
  return <div className="gem-confetti" aria-hidden="true">
    {CONFETTI.map((piece, i) => <span className="gem-confetti-piece" key={i} style={{
      left:piece.left, animationDelay:piece.delay, animationDuration:piece.duration,
      backgroundColor:piece.color,
      ['--gem-drift' as string]:piece.drift, ['--gem-rotation' as string]:piece.rotation,
    }} />)}
  </div>;
}
function Lighter({attempts, lit, onClick, round}: {attempts:number; lit:boolean; onClick:()=>void; round:number}) {
  const target = CLICKS_PER_ROUND[round];
  return <button type="button" onClick={onClick} disabled={lit}
    className={`gem-lighter-button ${lit ? 'gem-is-lit' : ''}`}
    aria-label={lit ? 'Isqueiro aceso' : `Tentar acender o isqueiro, tentativa ${attempts + 1} de ${target}`}>
    <span className="gem-lighter">
      <span className="gem-lighter-flame" aria-hidden="true"><span /></span>
      <span className="gem-lighter-head" aria-hidden="true"><span className="gem-lighter-wheel"/><span className="gem-lighter-neck"/></span>
      <span className="gem-lighter-shell" aria-hidden="true">
        <span className="gem-lighter-shine"/>
        <span className="gem-lighter-sticker"><span>GOOD</span><span>VIBRATIONS</span><b>✳</b></span>
        <span className="gem-lighter-brand">AMANDA EDITION · 2026</span>
      </span>
      <span key={`${round}-${attempts}`} className="gem-sparks" aria-hidden="true"><i/><i/><i/><i/><i/></span>
    </span>
    <span className="gem-tap-prompt">{lit ? 'ACENDEU!' : 'TOQUE PARA ACENDER'}</span>
  </button>;
}
function HerbalRoll({round}: {round:number}) {
  return <div key={round} className="gem-herbal-scene" aria-hidden="true">
    <div className="gem-herbal-smoke"><i/><i/><i/><i/></div>
    <div className="gem-herbal-body">
      <div className="gem-herbal-pulp"><span className="gem-herbal-fold"/></div>
      <span className="gem-herbal-tip"/>
      <span className="gem-herbal-ember"/>
      <span className="gem-herbal-ash"/>
    </div>
  </div>;
}

export default function Gemeo() {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [round, setRound] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [openEnvelope, setOpenEnvelope] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [lit, setLit] = useState(false);
  const timers = useRef<number[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasLetter = MENSAGEM_DO_GEMEO.trim().length > 0;
  const showingWords = phase === 'burning' || phase === 'ready';
  const leavesActive = phase !== 'waiting';
  const celebrating = phase === 'celebration' || phase === 'letter';

  function schedule(fn:()=>void, time:number) { timers.current.push(window.setTimeout(fn, time)); }
  function cancelTimers() { timers.current.forEach(window.clearTimeout); timers.current=[]; }
  useEffect(() => {
    document.body.classList.add('gem-page-body');
    return () => { document.body.classList.remove('gem-page-body'); timers.current.forEach(window.clearTimeout); };
  }, []);
  useEffect(() => {
    if (phase === 'letter') {
      const letter=document.getElementById('gem-letter-heading');
      letter?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
      letter?.focus({preventScroll:true});
    } else {heading.current?.focus({preventScroll:true});}
  }, [phase]);

  function tryLighting() {
    if (phase !== 'waiting' && phase !== 'ready') return;
    const next=attempts+1;
    setAttempts(next);
    if(next < CLICKS_PER_ROUND[round]) return;
    setLit(true);
    schedule(() => {
      setPhase('burning');
      setLit(false);
    }, 550);
    schedule(() => {
      if(round === WORDS.length - 1) {
        setPhase('celebration');
      } else {
        setPhase('ready');
        setRound(round+1);
        setAttempts(0);
      }
    }, 3450);
  }
  function restart() {
    cancelTimers();
    setPhase('waiting'); setRound(0); setAttempts(0); setLit(false);
    setOpenEnvelope(false);setShowSecret(false);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  const joke = JOKES[round][Math.min(attempts, JOKES[round].length-1)];

  return <main className={`gem-root gem-phase-${phase}`}>
    <div className="gem-coast" aria-hidden="true" style={{backgroundImage:`url(${coast})`}}/>
    <div className="gem-sun-glow" aria-hidden="true" />
    <div className="gem-horizon" aria-hidden="true"><span/><span/><span/></div>
    <div className="gem-noise" aria-hidden="true" />
    {leavesActive && <FallingLeaves/>}
    {celebrating && <Confetti/>}
    <header className="gem-header">
      <a className="gem-back" href="/" aria-label="Voltar ao mural de aniversário">← <span>voltar ao mural</span></a>
      <span className="gem-brand">AMANDA <b>✳</b> PARTY</span>
      <span className="gem-made-by">uma surpresa do teu gêmeo</span>
    </header>

    {phase === 'waiting' && <section className="gem-screen gem-intro">
      <div className="gem-intro-copy">
        <p className="gem-overline">DO TEU IRMÃO, COM REGGAE E ZOEIRA</p>
        <h1 ref={heading} tabIndex={-1}>Ei, Amanda.<br/><em>Tem uma surpresa<br/>pra ti.</em></h1>
        <p className="gem-lead">Sem discurso chato. Só tu, uma brisa boa e um isqueiro que não colabora muito.</p>
      </div>
      <div className="gem-lighting-area">
        <div className="gem-lighting-top"><span>01</span><span>MISSÃO: ACENDER</span><span>✳</span></div>
        <Lighter attempts={attempts} lit={lit} onClick={tryLighting} round={round}/>
        <div className="gem-lighting-feedback" role="status" aria-live="polite">
          <p>{lit ? 'AÊ! AGORA FOI! 🔥' : joke}</p>
          <div className="gem-attempt-dots">{Array.from({length:CLICKS_PER_ROUND[round]},(_,i)=><i key={i} className={i<attempts ? 'gem-active-dot':''}/>)}</div>
        </div>
      </div>
      <p className="gem-bottom-note">PROIBIDO PULAR A SURPRESA <span>☼</span></p>
    </section>}

    {showingWords && <section className="gem-screen gem-burn-screen" aria-labelledby="gem-burning-heading">
      <p className="gem-overline">{phase === 'burning' ? 'A MAGIA TÁ ACONTECENDO' : 'AINDA NÃO ACABOU...'}</p>
      <h1 id="gem-burning-heading" ref={heading} tabIndex={-1} className="gem-burn-heading">Três palavras.<br/><em>Três vezes de sorte.</em></h1>
      <div className="gem-birthday-words" aria-label={`Feliz aniversário Amanda! — ${round+1} de 3 palavras`}>
        {WORDS.map((word,i)=><div key={word} className={`gem-word-line ${i<round?'gem-word-done':i===round&&phase==='burning'?'gem-word-burning':''} ${i===round?'gem-word-current':''}`}>
          <span className="gem-word-outline" aria-hidden="true">{word}</span>
          <span className="gem-word-fill" aria-hidden="true">{word}</span>
          {i===round && phase==='burning' && <HerbalRoll round={round}/>}
        </div>)}
      </div>
      {phase==='burning'
        ? <p className="gem-burning-caption" role="status">{round===0?'Primeiro as folhas... deixa a brisa trabalhar 🍃':round===1?'ARMANDINHO É O TERROR!!!':'Última palavra. Segura a emoção, gêmea!'}</p>
        : <div className="gem-next-ignition"><p className="gem-burning-caption">{joke}</p>
            <Lighter attempts={attempts} lit={lit} onClick={tryLighting} round={round}/>
            <div className="gem-attempt-dots">{Array.from({length:CLICKS_PER_ROUND[round]},(_,i)=><i key={i} className={i<attempts?'gem-active-dot':''}/>)}</div>
            <p className="gem-next-counter">PARTE {round+1} DE 3 · TOQUE PARA CONTINUAR</p>
          </div>}
    </section>}

    {celebrating && <section className="gem-screen gem-celebration" aria-labelledby="gem-celebration-heading">
      <div className="gem-celebration-inner">
        <span className="gem-overline">AGORA SIM · CONFETE LIBERADO</span>
        <div className="gem-celebration-flower" aria-hidden="true">✳</div>
        <h1 ref={heading} id="gem-celebration-heading" tabIndex={-1}>Feliz<br/>aniversário,<br/><em>Amanda!</em></h1>
        <p>Que nunca falte reggae, praia, histórias absurdas e uma Biz com a roda inteirinha. 💚</p>
        <div className="gem-rider-art"><img src={amandaOnBiz} alt="Amanda na Biz vermelha com um alien de carona"/></div>
        <p className="gem-from-brother">Do teu irmão gêmeo — o único que podia inventar uma dessas. 😎</p>
        {phase === 'celebration' && <button className="gem-button" type="button" onClick={() => {setPhase('letter');setOpenEnvelope(false);}}>Tem uma carta pra ti <span>↗</span></button>}
      </div>
    </section>}

    {phase === 'letter' && <section className="gem-letter-section" aria-labelledby="gem-letter-heading">
      <div className="gem-letter-wrap">
        <span className="gem-overline">ÚLTIMO PRESENTE · SÓ PRA TI</span>
        <h2 id="gem-letter-heading" tabIndex={-1}>Uma coisa que eu<br/><em>queria te dizer.</em></h2>
        <p className="gem-letter-subtitle">Agora é a parte que eu não vou tentar fazer graça.</p>
        {!openEnvelope ? <button type="button" className="gem-envelope" onClick={() => setOpenEnvelope(true)} aria-label="Abrir a carta do seu irmão">
          <span className="gem-envelope-back"/><span className="gem-envelope-note">PARA AMANDA<br/><small>DO TEU GÊMEO</small></span>
          <span className="gem-envelope-flap"/><span className="gem-envelope-seal">✳</span><span className="gem-envelope-hint">TOQUE PARA ABRIR ↗</span>
        </button> : <div className="gem-letter-paper">
          <div className="gem-letter-paper-top"><span>PARA: AMANDA</span><span>DE: TEU GÊMEO</span></div>
          <div className="gem-letter-text">{hasLetter
            ? MENSAGEM_DO_GEMEO.trim().split(/\n\s*\n/).map((para,i)=><p key={i}>{para.trim()}</p>)
              : <p className="gem-letter-placeholder">Aiiiiii calica agora eu vi🍁!!! Feliz aniversario Amanda voce é incrivel cuida bem desse seu pe 🦶 para nois poder voltar com a legiao do mal e tocar o terror ☠️. A proposito to pensando com pessoal da atletica a gente marca de ir na praia do rosa em fevereiro vamo ver se ate la voce ta bem. Sabe que eu me importo muito com voce 💚💚💚 FELIZ ANIVERSARIO 🎉🎉🎉🎉</p>}
          </div>
          <p className="gem-letter-sign">Teu gêmeo <span>✳</span></p>
        </div>}
        <div className="gem-letter-actions">
          <button type="button" onClick={restart}>↺ Ver a surpresa de novo</button>
          <button type="button" onClick={() => setShowSecret(v=>!v)}>{showSecret?'Esconder recadinho':'👽 P.S. do alien'}</button>
        </div>
        {showSecret && <p className="gem-easter-egg">O alien mandou dizer: não fura a roda e aproveita a carona. 👽</p>}
      </div>
    </section>}
    <footer className="gem-footer"><span>FEITO PELO TEU GÊMEO · 2026</span><span>PAZ, AMOR E BOAS RISADAS ✳</span></footer>
  </main>;
}
