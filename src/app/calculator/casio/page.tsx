'use client';

// Casio fx-97SG X (ClassWiz) style scientific calculator — v1.
// Reuses the shared TI-84 expression engine. Scientific home calculation with
// SHIFT / ALPHA modifiers, DEG/RAD (SETUP), π/e/Ans, and an S⇔D decimal⇔fraction
// toggle. MENU modes (Statistics / Table / Equation) + natural-display are
// follow-ups. Mobile-first.
import { useState, useRef, useEffect, useCallback } from 'react';
import { evaluate, type AngleMode, type EvalCtx } from '@/lib/ti84/engine';

type Act = { ins: string } | { cmd: string };
interface Key { id: string; p: string; s?: string; a?: string; cls: 'fn' | 'num' | 'op' | 'ac' | 'eq' | 'shift' | 'alpha'; n: Act; sa?: Act; aa?: Act; }
const k = (id: string, p: string, cls: Key['cls'], n: Act, o: Partial<Key> = {}): Key => ({ id, p, cls, n, ...o });

// Function block (4 cols on ClassWiz numbers; we use 5 for layout). SHIFT labels
// orange, ALPHA labels red — same access pattern as the real ClassWiz.
const FUNC_ROWS: Key[][] = [
  [
    k('sqrt', '√▢', 'fn', { ins: '√(' }, { s: '∛' }),
    k('sq', 'x²', 'fn', { ins: '²' }, { s: 'x³' }),
    k('pow', 'x▢', 'fn', { ins: '^' }, { s: '^' }),
    k('log', 'log', 'fn', { ins: 'log(' }, { s: '10ˣ', sa: { ins: '10^(' } }),
    k('ln', 'ln', 'fn', { ins: 'ln(' }, { s: 'eˣ', sa: { ins: 'e^(' } }),
  ],
  [
    k('neg', '(−)', 'fn', { ins: '−' }, { a: 'A', aa: { ins: 'A' } }),
    k('sin', 'sin', 'fn', { ins: 'sin(' }, { s: 'sin⁻¹', sa: { ins: 'sin⁻¹(' }, a: 'B', aa: { ins: 'B' } }),
    k('cos', 'cos', 'fn', { ins: 'cos(' }, { s: 'cos⁻¹', sa: { ins: 'cos⁻¹(' }, a: 'C', aa: { ins: 'C' } }),
    k('tan', 'tan', 'fn', { ins: 'tan(' }, { s: 'tan⁻¹', sa: { ins: 'tan⁻¹(' }, a: 'D', aa: { ins: 'D' } }),
    k('inv', 'x⁻¹', 'fn', { ins: '⁻¹' }, { a: 'X', aa: { ins: 'X' } }),
  ],
  [
    k('lp', '(', 'fn', { ins: '(' }),
    k('rp', ')', 'fn', { ins: ')' }),
    k('comma', ',', 'fn', { ins: ',' }),
    k('pi', 'π', 'fn', { ins: 'π' }, { s: 'e', sa: { ins: 'e' } }),
    k('sd', 'S⇔D', 'fn', { cmd: 'sd' }),
  ],
];

const NUM_ROWS: Key[][] = [
  [
    k('7', '7', 'num', { ins: '7' }), k('8', '8', 'num', { ins: '8' }), k('9', '9', 'num', { ins: '9' }),
    k('del', 'DEL', 'op', { cmd: 'del' }, { s: 'INS' }), k('ac', 'AC', 'ac', { cmd: 'ac' }, { s: 'OFF' }),
  ],
  [
    k('4', '4', 'num', { ins: '4' }), k('5', '5', 'num', { ins: '5' }), k('6', '6', 'num', { ins: '6' }),
    k('mul', '×', 'op', { ins: '×' }), k('div', '÷', 'op', { ins: '÷' }),
  ],
  [
    k('1', '1', 'num', { ins: '1' }), k('2', '2', 'num', { ins: '2' }), k('3', '3', 'num', { ins: '3' }),
    k('add', '+', 'op', { ins: '+' }), k('sub', '−', 'op', { ins: '−' }),
  ],
  [
    k('0', '0', 'num', { ins: '0' }), k('dot', '.', 'num', { ins: '.' }), k('exp', '×10ˣ', 'num', { ins: 'E' }),
    k('ans', 'Ans', 'op', { ins: 'Ans' }), k('eq', '=', 'eq', { cmd: 'eq' }),
  ],
];

interface HistItem { input: string; dec: string; frac: string | null; showFrac: boolean; err?: boolean; }

// Decimal → fraction via continued fractions (for S⇔D). Returns "a/b" or null.
function toFraction(x: number): string | null {
  if (!isFinite(x) || Number.isInteger(x)) return null;
  const sign = x < 0 ? '-' : ''; let v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v, n = 0;
  do {
    const a = Math.floor(b);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    const d = b - a; if (d < 1e-12) break; b = 1 / d;
  } while (++n < 40 && k1 < 1e6 && Math.abs(v - h1 / k1) > Math.abs(v) * 1e-12);
  if (k1 < 2 || k1 > 100000) return null;
  if (Math.abs(v - h1 / k1) > 1e-9) return null;
  return `${sign}${h1}/${k1}`;
}

export default function CasioPage() {
  const [entry, setEntry] = useState('');
  const [cursor, setCursor] = useState(0);
  const [shift, setShift] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [angle, setAngle] = useState<AngleMode>('DEG'); // Casio defaults to Degree
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
    if (res.ok) {
      setAns(res.value);
      setHist((h) => [...h, { input: line, dec: res.display, frac: toFraction(res.value), showFrac: false }]);
    } else {
      setHist((h) => [...h, { input: line, dec: 'Math ERROR', frac: null, showFrac: false, err: true }]);
    }
    setEntry(''); setCursor(0); setRecall(null);
  };

  const toggleSD = () => {
    setHist((h) => { if (!h.length) return h; const last = h[h.length - 1]; if (last.err || !last.frac) { showToast('No fraction form'); return h; } const c = [...h]; c[c.length - 1] = { ...last, showFrac: !last.showFrac }; return c; });
  };

  const press = useCallback((key: Key) => {
    if (key.id === 'shift') { setShift((s) => !s); setAlpha(false); return; }
    if (key.id === 'alpha') { setAlpha((a) => !a); setShift(false); return; }
    const act: Act = shift ? (key.sa ?? key.n) : alpha ? (key.aa ?? key.n) : key.n;
    if ('ins' in act) { insert(act.ins); }
    else {
      switch (act.cmd) {
        case 'eq': doEquals(); break;
        case 'del': if (cursor > 0) { setEntry((e) => e.slice(0, cursor - 1) + e.slice(cursor)); setCursor((c) => c - 1); } break;
        case 'ac': setEntry(''); setCursor(0); setRecall(null); break;
        case 'sd': toggleSD(); break;
        case 'left': setCursor((c) => Math.max(0, c - 1)); break;
        case 'right': setCursor((c) => Math.min(entry.length, c + 1)); break;
        case 'up': { const ins = hist.map((x) => x.input); if (ins.length) { const i = recall === null ? ins.length - 1 : Math.max(0, recall - 1); setRecall(i); setEntry(ins[i]); setCursor(ins[i].length); } break; }
        case 'down': { const ins = hist.map((x) => x.input); if (recall !== null) { const i = recall + 1; if (i >= ins.length) { setRecall(null); setEntry(''); setCursor(0); } else { setRecall(i); setEntry(ins[i]); setCursor(ins[i].length); } } break; }
        case 'menu': showToast('Statistics / Table / Equation modes — coming soon'); break;
        case 'setup': setSetup(true); break;
        case 'on': setEntry(''); setCursor(0); break;
        default: break;
      }
    }
    setShift(false); setAlpha(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, alpha, cursor, entry, hist, recall, ctx]);

  const STATUS = angle === 'DEG' ? 'D' : 'R';

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

  return (
    <div className="wrap">
      <a className="backBtn" href="/admin">‹ Back</a>
      <a className="switchBtn" href="/calculator">TI-84 ⇄</a>
      <div className="calc">
        <div className="head">
          <div className="brand">CASIO</div><div className="model">fx-97SG X</div>
          <div className="classwiz">CLASSWIZ</div>
        </div>

        <div className="bezel">
          <div className="lcd" ref={screenRef}>
            <div className="status">{STATUS} · {shift ? 'SHIFT' : alpha ? 'ALPHA' : 'Math'}</div>
            {hist.map((h, i) => (
              <div key={i} className="hi">
                <div className="hi-in">{h.input}</div>
                <div className={`hi-out ${h.err ? 'err' : ''}`}>{h.showFrac && h.frac ? h.frac : h.dec}</div>
              </div>
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
          <div style={{ gridArea: 'shift' }}><Btn def={k('shift', 'SHIFT', 'shift', { cmd: 'shift' })} /></div>
          <div style={{ gridArea: 'alpha' }}><Btn def={k('alpha', 'ALPHA', 'alpha', { cmd: 'alpha' })} /></div>
          <div style={{ gridArea: 'optn' }}><Btn def={k('optn', 'OPTN', 'fn', { cmd: 'menu' })} /></div>
          <div style={{ gridArea: 'menu' }}><Btn def={k('menu', 'MENU', 'fn', { cmd: 'menu' }, { s: 'SETUP', sa: { cmd: 'setup' } })} /></div>
          <div style={{ gridArea: 'on' }}><Btn def={k('on', 'ON', 'op', { cmd: 'on' })} /></div>
          <div className="cpad" style={{ gridArea: 'pad' }}>
            <button className="ar up" onClick={() => press(k('up', '', 'fn', { cmd: 'up' }))}>▲</button>
            <button className="ar left" onClick={() => press(k('left', '', 'fn', { cmd: 'left' }))}>◀</button>
            <button className="ar right" onClick={() => press(k('right', '', 'fn', { cmd: 'right' }))}>▶</button>
            <button className="ar down" onClick={() => press(k('down', '', 'fn', { cmd: 'down' }))}>▼</button>
          </div>
        </div>

        {/* function grid */}
        <div className="grid">{FUNC_ROWS.flat().map((key) => <Btn key={key.id} def={key} />)}</div>
        {/* number grid */}
        <div className="grid">{NUM_ROWS.flat().map((key) => <Btn key={key.id} def={key} />)}</div>
      </div>

      <style jsx>{`
        .wrap { min-height: 100dvh; display: flex; justify-content: center; align-items: flex-start; background: #d9dbde; padding: 10px; box-sizing: border-box; }
        .backBtn, .switchBtn { position: fixed; top: 10px; z-index: 50; background: rgba(20,22,26,.86); color: #fff; font: 600 13px/1 Arial; text-decoration: none; padding: 9px 13px; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,.28); -webkit-tap-highlight-color: transparent; }
        .backBtn { left: 10px; } .switchBtn { right: 10px; background: rgba(40,70,120,.92); }
        .calc { width: 100%; max-width: 420px; background: linear-gradient(#3c4046,#2a2d31); border: 1px solid #1c1e21; border-radius: 22px; padding: 14px 16px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); box-sizing: border-box; }
        .head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; color: #e8e8e8; }
        .brand { font: 800 16px Arial; letter-spacing: 1px; }
        .model { font: 700 14px Arial; margin-left: auto; }
        .classwiz { position: absolute; }
        .head .classwiz { position: static; font: 700 9px Arial; letter-spacing: 2px; color: #d98ba0; }
        .bezel { position: relative; background: #1c1e21; border-radius: 8px; padding: 10px; box-shadow: inset 0 2px 5px rgba(0,0,0,.7); }
        .lcd { background: #e7ece0; border-radius: 3px; height: 150px; overflow-y: auto; padding: 6px 8px; font-family: 'Consolas','SF Mono',monospace; color: #1b231a; }
        .status { font-size: 9px; font-weight: 700; color: #455040; border-bottom: 1px solid #c2cab8; padding-bottom: 2px; margin-bottom: 3px; }
        .hi { margin-bottom: 3px; }
        .hi-in { font-size: 13px; color: #38423580; color: #4a554a; }
        .hi-out { font-size: 19px; font-weight: 700; text-align: right; }
        .hi-out.err { color: #b00; font-size: 14px; }
        .entry { font-size: 16px; word-break: break-all; min-height: 20px; }
        .caret { display: inline-block; width: 2px; height: 16px; margin: 0 0; vertical-align: -2px; background: #1b231a; animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .overlay { position: absolute; inset: 10px; background: rgba(10,12,10,.55); display: flex; align-items: center; justify-content: center; border-radius: 3px; }
        .ov { background: #e7ece0; border: 2px solid #1b231a; border-radius: 5px; padding: 10px 12px; width: 86%; font-family: monospace; color: #1b231a; }
        .ov-t { font-weight: 700; text-align: center; border-bottom: 1px solid #1b231a; margin-bottom: 8px; }
        .ov-r { display: flex; align-items: center; gap: 6px; font-size: 13px; } .ov-r span { width: 48px; }
        .ov-r button { flex: 1; padding: 7px; border: 1px solid #8a948a; background: #fff; border-radius: 4px; font: 12px monospace; }
        .ov-r button.on { background: #1b231a; color: #e7ece0; }
        .toast { position: absolute; left: 10px; right: 10px; bottom: 12px; background: rgba(10,12,10,.92); color: #fff; font: 12px/1.3 Arial; padding: 8px 10px; border-radius: 7px; text-align: center; }
        .ctrl { display: grid; column-gap: 8px; row-gap: 16px; margin: 14px 0; grid-template-columns: repeat(5,1fr); grid-template-areas: 'shift alpha pad pad on' 'optn menu pad pad on'; }
        .cpad { position: relative; background: radial-gradient(circle at 50% 40%, #4c5057, #2f3338); border: 1px solid #202326; border-radius: 50%; aspect-ratio: 1; align-self: center; justify-self: center; width: 84%; box-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .ar { position: absolute; border: none; background: transparent; color: #e8e8e8; font-size: 11px; width: 34%; height: 34%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ar.up { top: 3%; left: 33%; } .ar.down { bottom: 3%; left: 33%; } .ar.left { left: 3%; top: 33%; } .ar.right { right: 3%; top: 33%; }
        .grid { display: grid; grid-template-columns: repeat(5,1fr); column-gap: 8px; row-gap: 14px; margin-bottom: 12px; }
        .grid:last-child { margin-bottom: 0; }
      `}</style>
      <style jsx global>{`
        .ck { position: relative; width: 100%; aspect-ratio: 1.55/1; min-height: 38px; border-radius: 7px; border: none; cursor: pointer; padding: 0; overflow: visible; -webkit-tap-highlight-color: transparent; box-shadow: 0 2px 0 rgba(0,0,0,.45), 0 2px 3px rgba(0,0,0,.35); font-family: Arial,sans-serif; transition: transform .04s, filter .05s; }
        .ck:active { transform: translateY(1px); filter: brightness(1.12); box-shadow: 0 1px 0 rgba(0,0,0,.45); }
        .ck.fn { background: linear-gradient(#54585f,#3c4046); }
        .ck.num { background: linear-gradient(#80858d,#5f646c); }
        .ck.op { background: linear-gradient(#54585f,#3c4046); }
        .ck.shift { background: linear-gradient(#54585f,#3c4046); }
        .ck.alpha { background: linear-gradient(#54585f,#3c4046); }
        .ck.ac { background: linear-gradient(#caa64a,#a9842f); }
        .ck.eq { background: linear-gradient(#5a93cf,#235488); }
        .ck .lp { display: flex; align-items: center; justify-content: center; height: 100%; font-weight: 700; color: #fff; font-size: clamp(10px,3.4vw,15px); }
        .ck.num .lp { color: #fff; }
        .ck .ls, .ck .la { position: absolute; top: -11px; font-size: 9px; font-weight: 700; line-height: 1; white-space: nowrap; }
        .ck .ls { left: 0; color: #e89a3c; }
        .ck .la { right: 0; color: #d36b6b; }
        .ck.shift .lp { color: #e89a3c; }
        .ck.alpha .lp { color: #d36b6b; }
        .ck.hot { outline: 2px solid #ffd479; }
      `}</style>
    </div>
  );
}
