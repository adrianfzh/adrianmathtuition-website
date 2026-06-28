'use client';

// Casio fx-97SG X (ClassWiz) style scientific calculator.
// Reuses the shared expression engine. Scientific calculation with SHIFT /
// ALPHA modifiers, DEG/RAD (SETUP), π/e/Ans, factorial, abs, nPr/nCr, roots,
// and an S⇔D decimal⇔fraction toggle. Natural-display rendering and the MENU
// modes (Statistics / Table / Equation) are follow-ups. Mobile-first.
import { useState, useRef, useEffect, useCallback } from 'react';
import { evaluate, type AngleMode, type EvalCtx } from '@/lib/ti84/engine';

type Act = { ins: string } | { cmd: string };
type Cls = 'k' | 'ac';
interface Key { id: string; p: string; s?: string; a?: string; cls: Cls; n: Act; sa?: Act; aa?: Act; }
const k = (id: string, p: string, n: Act, o: Partial<Key> = {}): Key => ({ id, p, cls: o.cls ?? 'k', n, ...o });

// Function block — 6 columns (F0 has a gap under the cursor pad).
const F0: (Key | null)[] = [
  k('optn', 'OPTN', { cmd: 'soon' }, { s: 'QR' }),
  k('cube', 'x³', { ins: '^3' }),
  null, null,
  k('abs', 'Abs', { ins: 'abs(' }),
  k('fact', 'x!', { ins: '!' }),
];
const FROWS: Key[][] = [
  [
    k('frac', '▭/▭', { ins: '/' }),
    k('sqrt', '√▢', { ins: '√(' }, { s: '∛', sa: { ins: '∛(' } }),
    k('sq', 'x²', { ins: '²' }),
    k('powr', 'x▪', { ins: '^' }),
    k('log', 'log', { ins: 'log(' }, { s: '10ˣ', sa: { ins: '10^(' } }),
    k('ln', 'ln', { ins: 'ln(' }, { s: 'eˣ', sa: { ins: 'e^(' } }),
  ],
  [
    k('neg', '(−)', { ins: '−' }, { a: 'A', aa: { ins: 'A' } }),
    k('dms', '°’”', { cmd: 'soon' }, { a: 'B', aa: { ins: 'B' } }),
    k('inv', 'x⁻¹', { ins: '⁻¹' }, { a: 'C', aa: { ins: 'C' } }),
    k('sin', 'sin', { ins: 'sin(' }, { s: 'sin⁻¹', sa: { ins: 'sin⁻¹(' }, a: 'D', aa: { ins: 'D' } }),
    k('cos', 'cos', { ins: 'cos(' }, { s: 'cos⁻¹', sa: { ins: 'cos⁻¹(' }, a: 'E', aa: { ins: 'E' } }),
    k('tan', 'tan', { ins: 'tan(' }, { s: 'tan⁻¹', sa: { ins: 'tan⁻¹(' }, a: 'F', aa: { ins: 'F' } }),
  ],
  [
    k('sto', 'STO', { cmd: 'sto' }, { s: 'RECALL' }),
    k('eng', 'ENG', { cmd: 'soon' }),
    k('lp', '(', { ins: '(' }),
    k('rp', ')', { ins: ')' }, { a: 'X', aa: { ins: 'X' } }),
    k('sd', 'S⇔D', { cmd: 'sd' }),
    k('mplus', 'M+', { cmd: 'soon' }, { a: 'M', aa: { ins: 'M' } }),
  ],
];

// Number block — 5 columns.
const NROWS: Key[][] = [
  [
    k('7', '7', { ins: '7' }), k('8', '8', { ins: '8' }), k('9', '9', { ins: '9' }),
    k('del', 'DEL', { cmd: 'del' }, { cls: 'ac', s: 'INS' }), k('ac', 'AC', { cmd: 'ac' }, { cls: 'ac', s: 'OFF' }),
  ],
  [
    k('4', '4', { ins: '4' }), k('5', '5', { ins: '5' }), k('6', '6', { ins: '6' }),
    k('mul', '×', { ins: '×' }, { s: 'nPr', sa: { ins: 'nPr(' } }), k('div', '÷', { ins: '÷' }, { s: 'nCr', sa: { ins: 'nCr(' } }),
  ],
  [
    k('1', '1', { ins: '1' }), k('2', '2', { ins: '2' }), k('3', '3', { ins: '3' }),
    k('add', '+', { ins: '+' }), k('sub', '−', { ins: '−' }),
  ],
  [
    k('0', '0', { ins: '0' }), k('dot', '.', { ins: '.' }), k('exp', '×10ˣ', { ins: 'E' }, { s: 'π', sa: { ins: 'π' } }),
    k('ans', 'Ans', { ins: 'Ans' }), k('eq', '=', { cmd: 'eq' }),
  ],
];

interface HistItem { input: string; dec: string; frac: string | null; showFrac: boolean; err?: boolean; }

function toFraction(x: number): string | null {
  if (!isFinite(x) || Number.isInteger(x)) return null;
  const sign = x < 0 ? '-' : ''; const v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v, n = 0;
  do { const a = Math.floor(b); [h0, h1] = [h1, a * h1 + h0]; [k0, k1] = [k1, a * k1 + k0]; const d = b - a; if (d < 1e-12) break; b = 1 / d; }
  while (++n < 40 && k1 < 1e6 && Math.abs(v - h1 / k1) > v * 1e-12);
  if (k1 < 2 || k1 > 100000 || Math.abs(v - h1 / k1) > 1e-9) return null;
  return `${sign}${h1}/${k1}`;
}

export default function CasioPage() {
  const [entry, setEntry] = useState('');
  const [cursor, setCursor] = useState(0);
  const [shift, setShift] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [angle, setAngle] = useState<AngleMode>('DEG');
  const [hist, setHist] = useState<HistItem[]>([]);
  const [ans, setAns] = useState(0);
  const [vars] = useState<Record<string, number>>({});
  const [recall, setRecall] = useState<number | null>(null);
  const [setup, setSetup] = useState(false);
  const [toast, setToast] = useState('');
  const screenRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx = useCallback((): EvalCtx => ({ angle, ans, vars }), [angle, ans, vars]);
  useEffect(() => { screenRef.current?.scrollTo(0, screenRef.current.scrollHeight); }, [hist, entry, cursor]);
  const showToast = (m: string) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 1600); };
  const insert = (text: string) => { const c = cursor; setEntry((e) => e.slice(0, c) + text + e.slice(c)); setCursor(c + text.length); setRecall(null); };

  const doEquals = () => {
    const line = entry.trim(); if (!line) return;
    const res = evaluate(line, ctx());
    if (res.ok) { setAns(res.value); setHist((h) => [...h, { input: line, dec: res.display, frac: toFraction(res.value), showFrac: false }]); }
    else setHist((h) => [...h, { input: line, dec: 'Math ERROR', frac: null, showFrac: false, err: true }]);
    setEntry(''); setCursor(0); setRecall(null);
  };
  const toggleSD = () => setHist((h) => { if (!h.length) return h; const last = h[h.length - 1]; if (last.err || !last.frac) { showToast('No fraction form'); return h; } const c = [...h]; c[c.length - 1] = { ...last, showFrac: !last.showFrac }; return c; });

  const press = useCallback((key: Key) => {
    if (key.id === 'shift') { setShift((s) => !s); setAlpha(false); return; }
    if (key.id === 'alpha') { setAlpha((a) => !a); setShift(false); return; }
    const act: Act = shift ? (key.sa ?? key.n) : alpha ? (key.aa ?? key.n) : key.n;
    let keepAlpha = false;
    if ('ins' in act) insert(act.ins);
    else switch (act.cmd) {
      case 'eq': doEquals(); break;
      case 'del': if (cursor > 0) { setEntry((e) => e.slice(0, cursor - 1) + e.slice(cursor)); setCursor((c) => c - 1); } break;
      case 'ac': setEntry(''); setCursor(0); setRecall(null); break;
      case 'sd': toggleSD(); break;
      case 'sto': insert('→'); setAlpha(true); keepAlpha = true; break;
      case 'left': setCursor((c) => Math.max(0, c - 1)); break;
      case 'right': setCursor((c) => Math.min(entry.length, c + 1)); break;
      case 'up': { const ins = hist.map((x) => x.input); if (ins.length) { const i = recall === null ? ins.length - 1 : Math.max(0, recall - 1); setRecall(i); setEntry(ins[i]); setCursor(ins[i].length); } break; }
      case 'down': { const ins = hist.map((x) => x.input); if (recall !== null) { const i = recall + 1; if (i >= ins.length) { setRecall(null); setEntry(''); setCursor(0); } else { setRecall(i); setEntry(ins[i]); setCursor(ins[i].length); } } break; }
      case 'menu': showToast('Statistics / Table / Equation modes — coming soon'); break;
      case 'setup': setSetup(true); break;
      case 'on': setEntry(''); setCursor(0); break;
      case 'soon': showToast('Not in this version yet'); break;
      default: break;
    }
    setShift(false); if (!keepAlpha) setAlpha(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, alpha, cursor, entry, hist, recall, ctx]);

  const Caret = ({ s, c }: { s: string; c: number }) => (<><span>{s.slice(0, c)}</span><span className="caret" /><span>{s.slice(c)}</span></>);
  const Btn = ({ def }: { def: Key }) => {
    const hot = (shift && def.s) || (alpha && def.a);
    return (
      <button className={`ck ${def.cls} ${hot ? 'hot' : ''}`} onClick={() => press(def)}>
        {def.s && <span className="ls">{def.s}</span>}
        {def.a && <span className="la">{def.a}</span>}
        <span className="lp">{def.p}</span>
      </button>
    );
  };
  const Round = ({ id, label, color, n, s, sa }: { id: string; label: string; color?: string; n: Act; s?: string; sa?: Act }) => (
    <div className="rwrap">
      <span className="rlab" style={{ color }}>{label}</span>
      {s && <span className="rlab2">{s}</span>}
      <button className="round" onClick={() => press(k(id, label, n, { sa }))} />
    </div>
  );

  return (
    <div className="wrap">
      <a className="backBtn" href="/admin">‹ Back</a>
      <a className="switchBtn" href="/calculator">TI-84 ⇄</a>
      <div className="calc">
        <div className="head">
          <span className="brand">CASIO</span>
          <span className="model">fx-97SG X</span>
        </div>
        <div className="classwiz">CLASSWIZ</div>

        <div className="bezel">
          <div className="lcd" ref={screenRef}>
            <div className="status"><span>{angle === 'DEG' ? 'D' : 'R'}</span><span>{shift ? '⇧' : alpha ? 'α' : ''}</span><span className="up">▲</span></div>
            {hist.map((h, i) => (
              <div key={i} className="hi"><div className="hi-in">{h.input}</div><div className={`hi-out ${h.err ? 'err' : ''}`}>{h.showFrac && h.frac ? h.frac : h.dec}</div></div>
            ))}
            <div className="entry"><Caret s={entry} c={cursor} /></div>
          </div>
          {setup && (
            <div className="overlay" onClick={() => setSetup(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-t">SETUP</div>
                <div className="ov-r"><span>Angle</span>
                  <button className={angle === 'DEG' ? 'on' : ''} onClick={() => { setAngle('DEG'); setSetup(false); }}>Degree</button>
                  <button className={angle === 'RAD' ? 'on' : ''} onClick={() => { setAngle('RAD'); setSetup(false); }}>Radian</button>
                </div>
              </div>
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>

        {/* control cluster */}
        <div className="ctrl">
          <div className="cgroup">
            <Round id="shift" label="SHIFT" color="#e8942f" n={{ cmd: 'shift' }} />
            <Round id="alpha" label="ALPHA" color="#d8444f" n={{ cmd: 'alpha' }} />
          </div>
          <div className="cpad">
            <span className="cpadc" />
            <button className="ar up" onClick={() => press(k('up', '', { cmd: 'up' }))}>▲</button>
            <button className="ar down" onClick={() => press(k('down', '', { cmd: 'down' }))}>▼</button>
            <button className="ar left" onClick={() => press(k('left', '', { cmd: 'left' }))}>◀</button>
            <button className="ar right" onClick={() => press(k('right', '', { cmd: 'right' }))}>▶</button>
          </div>
          <div className="cgroup">
            <Round id="menu" label="MENU" color="#eee" s="SETUP" n={{ cmd: 'menu' }} sa={{ cmd: 'setup' }} />
            <Round id="on" label="ON" color="#eee" n={{ cmd: 'on' }} />
          </div>
        </div>

        {/* function block (6 cols) */}
        <div className="fgrid">
          {F0.map((key, i) => key ? <Btn key={key.id} def={key} /> : <span key={i} className="gap" />)}
          {FROWS.flat().map((key) => <Btn key={key.id} def={key} />)}
        </div>
        {/* number block (5 cols) */}
        <div className="ngrid">{NROWS.flat().map((key) => <Btn key={key.id} def={key} />)}</div>
      </div>

      <style jsx>{`
        .wrap { min-height: 100dvh; display: flex; justify-content: center; align-items: flex-start; background: #d9dbde; padding: 50px 10px 12px; box-sizing: border-box; }
        .backBtn, .switchBtn { position: fixed; top: 10px; z-index: 50; color: #fff; font: 600 13px/1 Arial; text-decoration: none; padding: 9px 13px; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,.28); -webkit-tap-highlight-color: transparent; }
        .backBtn { left: 10px; background: rgba(20,22,26,.86); } .switchBtn { right: 10px; background: rgba(40,70,120,.92); }
        .calc { width: 100%; max-width: 420px; border-radius: 18px 18px 14px 14px; padding: 16px 16px 22px; box-sizing: border-box;
          background-color: #1a1b1d; background-image: radial-gradient(rgba(255,255,255,.07) 0.6px, transparent 0.9px); background-size: 3.5px 3.5px;
          border: 1px solid #0c0c0d; box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06); }
        .head { display: flex; align-items: baseline; justify-content: space-between; }
        .brand { font: 800 24px Arial; letter-spacing: .5px; color: #f2f2f2; }
        .model { font: 700 17px Arial; color: #dcdcdc; }
        .classwiz { text-align: center; font: 700 13px Arial; letter-spacing: 7px; color: #c76b86; margin: 2px 0 14px; padding-left: 7px; }
        .bezel { position: relative; background: #0e0f10; border-radius: 8px; padding: 12px 12px 14px; box-shadow: inset 0 2px 6px rgba(0,0,0,.8); border: 1px solid #2a2b2d; }
        .lcd { background: #c4d2bb; border-radius: 2px; height: 132px; overflow-y: auto; padding: 5px 8px; font-family: 'Consolas','SF Mono',monospace; color: #16201a; }
        .status { display: flex; gap: 6px; font-size: 9px; font-weight: 700; color: #2f3d30; border-bottom: 1px solid #a7b89e; padding-bottom: 2px; margin-bottom: 3px; }
        .status .up { margin-left: auto; }
        .hi { margin-bottom: 2px; }
        .hi-in { font-size: 14px; color: #475247; }
        .hi-out { font-size: 23px; font-weight: 700; text-align: right; line-height: 1.1; }
        .hi-out.err { color: #a01818; font-size: 15px; }
        .entry { font-size: 18px; word-break: break-all; min-height: 22px; }
        .caret { display: inline-block; width: 2px; height: 18px; background: #16201a; animation: blink 1s steps(1) infinite; vertical-align: -3px; }
        @keyframes blink { 50% { opacity: 0; } }
        .overlay { position: absolute; inset: 12px; background: rgba(5,8,5,.55); display: flex; align-items: center; justify-content: center; border-radius: 2px; }
        .ov { background: #c4d2bb; border: 2px solid #16201a; border-radius: 4px; padding: 10px 12px; width: 86%; font-family: monospace; color: #16201a; }
        .ov-t { font-weight: 700; text-align: center; border-bottom: 1px solid #16201a; margin-bottom: 8px; }
        .ov-r { display: flex; align-items: center; gap: 6px; font-size: 13px; } .ov-r span { width: 48px; }
        .ov-r button { flex: 1; padding: 7px; border: 1px solid #6e7a68; background: #e8efe2; border-radius: 4px; font: 12px monospace; }
        .ov-r button.on { background: #16201a; color: #c4d2bb; }
        .toast { position: absolute; left: 12px; right: 12px; bottom: 14px; background: rgba(5,8,5,.92); color: #fff; font: 12px/1.3 Arial; padding: 8px 10px; border-radius: 7px; text-align: center; }

        .ctrl { display: flex; align-items: center; justify-content: space-between; margin: 18px 6px 16px; }
        .cgroup { display: flex; gap: 18px; }
        .rwrap { display: flex; flex-direction: column; align-items: center; }
        .rlab { font: 700 11px Arial; line-height: 1.1; }
        .rlab2 { font: 700 8px Arial; color: #e8942f; line-height: 1; }
        .round { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; margin-top: 5px; -webkit-tap-highlight-color: transparent;
          background: radial-gradient(circle at 50% 28%, #7c8088 0%, #474a50 42%, #1b1d20 100%);
          box-shadow: 0 2px 5px rgba(0,0,0,.7), inset 0 2px 2px rgba(255,255,255,.34), inset 0 -3px 4px rgba(0,0,0,.55); }
        .round:active { filter: brightness(1.25); }
        .cpad { position: relative; width: 104px; height: 58px; border-radius: 29px; border: none; background: radial-gradient(ellipse at 50% 32%, #4c4f55, #232529 55%, #16171a); box-shadow: 0 2px 5px rgba(0,0,0,.65), inset 0 2px 2px rgba(255,255,255,.2), inset 0 -3px 4px rgba(0,0,0,.5); }
        .cpadc { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(circle at 50% 30%, #7a7e85, #2a2c30); box-shadow: 0 1px 2px rgba(0,0,0,.5), inset 0 1.5px 2px rgba(255,255,255,.28), inset 0 -2px 3px rgba(0,0,0,.5); }
        .ar { position: absolute; border: none; background: transparent; color: #e2e2e2; font-size: 11px; line-height: 1; padding: 3px; cursor: pointer; z-index: 1; -webkit-tap-highlight-color: transparent; }
        .ar.up { top: 1px; left: 50%; transform: translateX(-50%); }
        .ar.down { bottom: 1px; left: 50%; transform: translateX(-50%); }
        .ar.left { left: 4px; top: 50%; transform: translateY(-50%); }
        .ar.right { right: 4px; top: 50%; transform: translateY(-50%); }

        .fgrid { display: grid; grid-template-columns: repeat(6,1fr); column-gap: 6px; row-gap: 17px; margin-bottom: 16px; }
        .ngrid { display: grid; grid-template-columns: repeat(5,1fr); column-gap: 8px; row-gap: 16px; }
        .gap { }
      `}</style>
      <style jsx global>{`
        .ck { position: relative; width: 100%; aspect-ratio: 1.42/1; min-height: 38px; border-radius: 7px; border: 1px solid #0c0d0e; cursor: pointer; padding: 0; overflow: visible;
          background: linear-gradient(#54565b,#3d3f44 46%,#313338); box-shadow: 0 2px 0 #131416, 0 3px 5px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.12); -webkit-tap-highlight-color: transparent; transition: transform .04s, filter .05s; }
        .ngrid .ck { aspect-ratio: 1.55/1; min-height: 46px; }
        .ck:active { transform: translateY(1px); filter: brightness(1.15); box-shadow: 0 1px 0 #0a0a0b; }
        .ck.ac { background: linear-gradient(#d8b24e,#b98a2c 62%,#a87d27); }
        .ck .lp { display: flex; align-items: center; justify-content: center; height: 100%; font-weight: 700; color: #f4f4f4; font-size: clamp(11px,3.6vw,16px); }
        .ngrid .ck .lp { font-size: clamp(15px,4.6vw,21px); }
        .ck.ac .lp { color: #2a2206; font-size: clamp(12px,3.6vw,16px); }
        .ck .ls, .ck .la { position: absolute; top: -12px; font-size: 9.5px; font-weight: 700; line-height: 1; white-space: nowrap; }
        .ck .ls { left: 1px; color: #e8942f; }
        .ck .la { right: 1px; color: #d8444f; }
        .ck.hot { outline: 2px solid #ffce6b; outline-offset: 1px; }
      `}</style>
    </div>
  );
}
