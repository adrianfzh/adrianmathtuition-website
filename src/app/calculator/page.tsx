'use client';

// Phase A — TI-84 Plus CE style scientific calculator (home screen).
// Mobile-first, exam-faithful key behaviour. Graphing/TABLE/STAT (Phase B–D)
// keys are present but show a "coming soon" hint for now.
import { useState, useRef, useEffect, useCallback } from 'react';
import { evaluate, type AngleMode } from '@/lib/ti84/engine';

type Act = { ins: string } | { cmd: string };
interface Key { id: string; p: string; s?: string; a?: string; cls: 'kb' | 'kw' | 'kg' | 'k2' | 'ka'; n: Act; sa?: Act; aa?: Act; }

// Helper to build a key record.
const k = (id: string, p: string, cls: Key['cls'], n: Act, opts: Partial<Key> = {}): Key => ({ id, p, cls, n, ...opts });

const GRAPH_ROW: Key[] = [
  k('y=', 'y=', 'kg', { cmd: 'soon' }, { s: 'stat plot' }),
  k('window', 'window', 'kg', { cmd: 'soon' }, { s: 'tblset' }),
  k('zoom', 'zoom', 'kg', { cmd: 'soon' }, { s: 'format' }),
  k('trace', 'trace', 'kg', { cmd: 'soon' }, { s: 'calc' }),
  k('graph', 'graph', 'kg', { cmd: 'soon' }, { s: 'table' }),
];

// Main 7×5 grid + the two special rows handled separately.
const ROWS: Key[][] = [
  [
    k('math', 'math', 'kb', { cmd: 'soon' }, { s: 'test', a: 'A', aa: { ins: 'A' } }),
    k('apps', 'apps', 'kb', { cmd: 'soon' }, { s: 'angle', a: 'B', aa: { ins: 'B' } }),
    k('prgm', 'prgm', 'kb', { cmd: 'soon' }, { s: 'draw', a: 'C', aa: { ins: 'C' } }),
    k('vars', 'vars', 'kb', { cmd: 'soon' }, { s: 'distr' }),
    k('clear', 'clear', 'kg', { cmd: 'clear' }),
  ],
  [
    k('inv', 'x⁻¹', 'kb', { ins: '⁻¹' }, { s: 'matrix', a: 'D', aa: { ins: 'D' } }),
    k('sin', 'sin', 'kb', { ins: 'sin(' }, { s: 'sin⁻¹', sa: { ins: 'sin⁻¹(' }, a: 'E', aa: { ins: 'E' } }),
    k('cos', 'cos', 'kb', { ins: 'cos(' }, { s: 'cos⁻¹', sa: { ins: 'cos⁻¹(' }, a: 'F', aa: { ins: 'F' } }),
    k('tan', 'tan', 'kb', { ins: 'tan(' }, { s: 'tan⁻¹', sa: { ins: 'tan⁻¹(' }, a: 'G', aa: { ins: 'G' } }),
    k('pow', '^', 'kb', { ins: '^' }, { s: 'π', sa: { ins: 'π' }, a: 'H', aa: { ins: 'H' } }),
  ],
  [
    k('sq', 'x²', 'kb', { ins: '²' }, { s: '√', sa: { ins: '√(' }, a: 'I', aa: { ins: 'I' } }),
    k('comma', ',', 'kb', { ins: ',' }, { s: 'EE', sa: { ins: 'E' }, a: 'J', aa: { ins: 'J' } }),
    k('lp', '(', 'kb', { ins: '(' }, { s: '{', a: 'K', aa: { ins: 'K' } }),
    k('rp', ')', 'kb', { ins: ')' }, { s: '}', a: 'L', aa: { ins: 'L' } }),
    k('div', '÷', 'kg', { ins: '÷' }, { s: 'e', sa: { ins: 'e' }, a: 'M', aa: { ins: 'M' } }),
  ],
  [
    k('log', 'log', 'kb', { ins: 'log(' }, { s: '10ˣ', sa: { ins: '10^(' }, a: 'N', aa: { ins: 'N' } }),
    k('7', '7', 'kw', { ins: '7' }, { a: 'O', aa: { ins: 'O' } }),
    k('8', '8', 'kw', { ins: '8' }, { a: 'P', aa: { ins: 'P' } }),
    k('9', '9', 'kw', { ins: '9' }, { a: 'Q', aa: { ins: 'Q' } }),
    k('mul', '×', 'kg', { ins: '×' }, { s: '[', a: 'R', aa: { ins: 'R' } }),
  ],
  [
    k('ln', 'ln', 'kb', { ins: 'ln(' }, { s: 'eˣ', sa: { ins: 'e^(' }, a: 'S', aa: { ins: 'S' } }),
    k('4', '4', 'kw', { ins: '4' }, { a: 'T', aa: { ins: 'T' } }),
    k('5', '5', 'kw', { ins: '5' }, { a: 'U', aa: { ins: 'U' } }),
    k('6', '6', 'kw', { ins: '6' }, { a: 'V', aa: { ins: 'V' } }),
    k('sub', '−', 'kg', { ins: '−' }, { s: ']', a: 'W', aa: { ins: 'W' } }),
  ],
  [
    k('sto', 'sto▸', 'kb', { cmd: 'sto' }, { s: 'rcl', a: 'X', aa: { ins: 'X' } }),
    k('1', '1', 'kw', { ins: '1' }, { a: 'Y', aa: { ins: 'Y' } }),
    k('2', '2', 'kw', { ins: '2' }, { a: 'Z', aa: { ins: 'Z' } }),
    k('3', '3', 'kw', { ins: '3' }, { a: 'θ', aa: { ins: 'θ' } }),
    k('add', '+', 'kg', { ins: '+' }, { s: 'mem' }),
  ],
  [
    k('on', 'on', 'kb', { cmd: 'on' }, { s: 'off' }),
    k('0', '0', 'kw', { ins: '0' }, { s: 'catalog' }),
    k('dot', '.', 'kw', { ins: '.' }, { s: 'i' }),
    k('neg', '(-)', 'kw', { ins: '−' }, { s: 'ans', sa: { ins: 'Ans' } }),
    k('enter', 'enter', 'kg', { cmd: 'enter' }, { s: 'entry', sa: { cmd: 'entry' } }),
  ],
];

interface HistItem { input: string; output: string; err?: boolean; }

export default function CalculatorPage() {
  const [entry, setEntry] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sec, setSec] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [angle, setAngle] = useState<AngleMode>('RAD');
  const [hist, setHist] = useState<HistItem[]>([]);
  const [ans, setAns] = useState(0);
  const [vars, setVars] = useState<Record<string, number>>({});
  const [recall, setRecall] = useState<number | null>(null);
  const [modeMenu, setModeMenu] = useState(false);
  const [toast, setToast] = useState('');
  const screenRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { screenRef.current?.scrollTo(0, screenRef.current.scrollHeight); }, [hist, entry, cursor]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1600);
  }, []);

  const insert = useCallback((text: string) => {
    setEntry((e) => e.slice(0, cursor) + text + e.slice(cursor));
    setCursor((c) => c + text.length);
    setRecall(null);
  }, [cursor]);

  const doEnter = useCallback(() => {
    const line = entry.trim();
    if (!line) return;
    let expr = line, target: string | null = null;
    const arrow = line.indexOf('→');
    if (arrow >= 0) { expr = line.slice(0, arrow); target = line.slice(arrow + 1).trim(); }
    const res = evaluate(expr, { angle, ans, vars });
    if (res.ok) {
      if (target && /^[A-Zθ]$/.test(target)) setVars((v) => ({ ...v, [target!]: res.value }));
      setAns(res.value);
      setHist((h) => [...h, { input: line, output: res.display }]);
    } else {
      setHist((h) => [...h, { input: line, output: 'ERR: ' + res.error, err: true }]);
    }
    setEntry(''); setCursor(0); setRecall(null);
  }, [entry, angle, ans, vars]);

  const press = useCallback((key: Key) => {
    // modifier keys toggle
    if (key.id === '2nd') { setSec((s) => !s); setAlpha(false); return; }
    if (key.id === 'alpha') { setAlpha((a) => !a); setSec(false); return; }

    const act: Act = sec ? (key.sa ?? key.n) : alpha ? (key.aa ?? key.n) : key.n;
    let keepAlpha = false;

    if ('ins' in act) {
      insert(act.ins);
    } else {
      switch (act.cmd) {
        case 'enter': doEnter(); break;
        case 'entry': {
          const last = [...hist].reverse().find((h) => !h.err);
          if (last) { setEntry(last.input); setCursor(last.input.length); }
          break;
        }
        case 'clear':
          if (entry) { setEntry(''); setCursor(0); }
          else setHist([]);
          break;
        case 'del':
          if (cursor > 0) { setEntry((e) => e.slice(0, cursor - 1) + e.slice(cursor)); setCursor((c) => c - 1); }
          break;
        case 'left': setCursor((c) => Math.max(0, c - 1)); break;
        case 'right': setCursor((c) => Math.min(entry.length, c + 1)); break;
        case 'up': {
          const inputs = hist.map((h) => h.input);
          if (!inputs.length) break;
          const idx = recall === null ? inputs.length - 1 : Math.max(0, recall - 1);
          setRecall(idx); setEntry(inputs[idx]); setCursor(inputs[idx].length);
          break;
        }
        case 'down': {
          const inputs = hist.map((h) => h.input);
          if (recall === null) break;
          const idx = recall + 1;
          if (idx >= inputs.length) { setRecall(null); setEntry(''); setCursor(0); }
          else { setRecall(idx); setEntry(inputs[idx]); setCursor(inputs[idx].length); }
          break;
        }
        case 'sto': insert('→'); setAlpha(true); keepAlpha = true; break;
        case 'modemenu': setModeMenu(true); break;
        case 'quit': setModeMenu(false); break;
        case 'on': setEntry(''); setCursor(0); break;
        case 'soon': showToast('Graphing & tables — coming in the next phase'); break;
        default: break;
      }
    }
    setSec(false);
    if (!keepAlpha) setAlpha(false);
  }, [sec, alpha, insert, doEnter, hist, entry, cursor, recall, showToast]);

  const DEL: Key = k('del', 'del', 'kb', { cmd: 'del' }, { s: 'ins' });
  const MODE: Key = k('mode', 'mode', 'kb', { cmd: 'modemenu' }, { s: 'quit', sa: { cmd: 'quit' } });
  const STATUS = `NORMAL FLOAT AUTO REAL ${angle === 'RAD' ? 'RADIAN' : 'DEGREE'} MP`;

  const Btn = ({ def }: { def: Key }) => {
    const showSec = sec && (def.s !== undefined);
    const showAlp = alpha && (def.a !== undefined);
    return (
      <button className={`key ${def.cls} ${showSec ? 'hot2' : ''} ${showAlp ? 'hota' : ''}`} onClick={() => press(def)}>
        {def.s && <span className="lblS">{def.s}</span>}
        {def.a && <span className="lblA">{def.a}</span>}
        <span className="lblP">{def.p}</span>
      </button>
    );
  };

  return (
    <div className="wrap">
      <div className="calc">
        <div className="head">
          <div className="model">TI-84 Plus CE</div>
          <div className="py">PYTHON</div>
        </div>

        {/* screen */}
        <div className="bezel">
          <div className="lcd" ref={screenRef}>
            <div className="status">{STATUS}</div>
            {hist.map((h, i) => (
              <div key={i} className="histItem">
                <div className="hi-in">{h.input}</div>
                <div className={`hi-out ${h.err ? 'hi-err' : ''}`}>{h.output}</div>
              </div>
            ))}
            <div className="entryLine">
              <span>{entry.slice(0, cursor)}</span><span className="caret" /><span>{entry.slice(cursor)}</span>
            </div>
          </div>
          {modeMenu && (
            <div className="modeMenu" onClick={() => setModeMenu(false)}>
              <div className="mm" onClick={(e) => e.stopPropagation()}>
                <div className="mm-title">MODE</div>
                <div className="mm-row">
                  <span>ANGLE</span>
                  <button className={angle === 'RAD' ? 'on' : ''} onClick={() => setAngle('RAD')}>RADIAN</button>
                  <button className={angle === 'DEG' ? 'on' : ''} onClick={() => setAngle('DEG')}>DEGREE</button>
                </div>
                <button className="mm-close" onClick={() => setModeMenu(false)}>Done (2nd · quit)</button>
              </div>
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>

        {/* graph key row */}
        <div className="grow">
          {GRAPH_ROW.map((g) => (
            <div className="fcell" key={g.id}>
              <div className="flab"><span className="fs">{g.s}</span></div>
              <Btn def={g} />
            </div>
          ))}
        </div>

        {/* special rows + dpad */}
        <div className="pad">
          <div style={{ gridArea: 's1c1' }}><Btn def={k('2nd', '2nd', 'k2', { cmd: 'second' })} /></div>
          <div style={{ gridArea: 's1c2' }}><Btn def={MODE} /></div>
          <div style={{ gridArea: 's1c3' }}><Btn def={DEL} /></div>
          <div style={{ gridArea: 's2c1' }}><Btn def={k('alpha', 'alpha', 'ka', { cmd: 'alpha' }, { s: 'A-lock' })} /></div>
          <div style={{ gridArea: 's2c2' }}><Btn def={k('X', 'x,T,θ,n', 'kb', { ins: 'X' })} /></div>
          <div style={{ gridArea: 's2c3' }}><Btn def={k('stat', 'stat', 'kb', { cmd: 'soon' }, { s: 'list' })} /></div>
          <div className="dpad" style={{ gridArea: 'dpad' }}>
            <button className="ar up" onClick={() => press(k('up', '', 'kg', { cmd: 'up' }))}>▲</button>
            <button className="ar left" onClick={() => press(k('left', '', 'kg', { cmd: 'left' }))}>◀</button>
            <button className="ar right" onClick={() => press(k('right', '', 'kg', { cmd: 'right' }))}>▶</button>
            <button className="ar down" onClick={() => press(k('down', '', 'kg', { cmd: 'down' }))}>▼</button>
          </div>
        </div>

        {/* main grid */}
        <div className="grid">
          {ROWS.flat().map((key) => (
            <div className="cell" key={key.id}><Btn def={key} /></div>
          ))}
        </div>

        <div className="foot"><span className="ti">TI</span> TEXAS INSTRUMENTS</div>
      </div>

      <style jsx>{`
        .wrap { min-height: 100dvh; display: flex; justify-content: center; align-items: flex-start;
          background: #e9eaec; padding: 10px; box-sizing: border-box; }
        .calc { width: 100%; max-width: 420px; background: linear-gradient(#fdfdfc,#e8e8e4);
          border: 1px solid #d3d3cf; border-radius: 30px; padding: 14px 16px 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,.22); box-sizing: border-box; }
        .head { text-align: center; margin-bottom: 8px; }
        .model { font: 700 17px/1 'Helvetica Neue',Arial,sans-serif; color: #1a1a1a; }
        .py { font: 9px/1 Arial; letter-spacing: 3px; color: #777; margin-top: 3px; }

        .bezel { position: relative; background: linear-gradient(#34373c,#0b0c0f);
          border-radius: 14px; padding: 12px; box-shadow: inset 0 2px 6px rgba(0,0,0,.6); }
        .lcd { background: #eef0e8; border-radius: 3px; height: 230px; overflow-y: auto;
          padding: 6px 8px; font-family: 'Consolas','SF Mono',monospace; color: #1a1f26;
          -webkit-overflow-scrolling: touch; }
        .status { font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden;
          border-bottom: 1px solid #c9cfc6; padding-bottom: 2px; margin-bottom: 4px; }
        .histItem { margin-bottom: 2px; }
        .hi-in { font-size: 14px; }
        .hi-out { font-size: 15px; font-weight: 700; text-align: right; }
        .hi-err { color: #b00; }
        .entryLine { font-size: 15px; word-break: break-all; min-height: 18px; }
        .caret { display: inline-block; width: 7px; height: 15px; margin: 0 -1px; vertical-align: -2px;
          background: #1a1f26; animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }

        .modeMenu { position: absolute; inset: 12px; background: rgba(20,22,26,.6);
          display: flex; align-items: center; justify-content: center; border-radius: 3px; }
        .mm { background: #eef0e8; border: 2px solid #1a1f26; border-radius: 4px; padding: 10px 12px;
          width: 86%; font-family: monospace; color: #1a1f26; }
        .mm-title { font-weight: 700; text-align: center; border-bottom: 1px solid #1a1f26; margin-bottom: 8px; }
        .mm-row { display: flex; align-items: center; gap: 6px; font-size: 13px; }
        .mm-row span { width: 52px; }
        .mm-row button { flex: 1; padding: 6px; border: 1px solid #8a8f86; background: #fff; border-radius: 4px;
          font-family: monospace; font-size: 12px; }
        .mm-row button.on { background: #1a1f26; color: #eef0e8; }
        .mm-close { margin-top: 10px; width: 100%; padding: 7px; border: none; background: #1a1f26;
          color: #eef0e8; border-radius: 4px; font-family: monospace; font-size: 12px; }
        .toast { position: absolute; left: 12px; right: 12px; bottom: 16px; background: rgba(20,22,26,.9);
          color: #fff; font: 12px/1.3 Arial; padding: 8px 10px; border-radius: 7px; text-align: center; }

        .grow { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; margin: 12px 0 8px; }
        .fcell { display: flex; flex-direction: column; }
        .flab { height: 9px; text-align: center; }
        .fs { font-size: 6.5px; color: #2f6cab; }

        .pad { display: grid; gap: 7px; margin-bottom: 7px;
          grid-template-columns: repeat(5,1fr);
          grid-template-areas: 's1c1 s1c2 s1c3 dpad dpad' 's2c1 s2c2 s2c3 dpad dpad'; }
        .dpad { position: relative; background: linear-gradient(#dde0e2,#b0b4b6); border: 1px solid #9ca0a2;
          border-radius: 50%; aspect-ratio: 1; align-self: center; justify-self: center; width: 86%;
          box-shadow: 0 1px 2px rgba(0,0,0,.35); }
        .ar { position: absolute; border: none; background: transparent; color: #2a2a2a; font-size: 12px;
          width: 34%; height: 34%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ar.up { top: 2%; left: 33%; } .ar.down { bottom: 2%; left: 33%; }
        .ar.left { left: 2%; top: 33%; } .ar.right { right: 2%; top: 33%; }

        .grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; }
        .cell { display: block; }
      `}</style>
      <style jsx global>{`
        .key { position: relative; width: 100%; aspect-ratio: 1.7/1; min-height: 40px; border-radius: 8px;
          border: 0.5px solid #0f0f11; cursor: pointer; padding: 0; overflow: visible;
          box-shadow: 0 1.4px 2px rgba(0,0,0,.42); -webkit-tap-highlight-color: transparent;
          font-family: 'Helvetica Neue',Arial,sans-serif; transition: transform .04s, filter .04s; }
        .key:active { transform: translateY(1px); filter: brightness(.9); }
        .key.kb { background: linear-gradient(#46464b,#1c1c1f 60%,#242427); }
        .key.kw { background: linear-gradient(#ffffff,#e6e6e2); border-color: #cfcfcb; }
        .key.kg { background: linear-gradient(#dde0e2,#b0b4b6); border-color: #9ca0a2; }
        .key.k2 { background: linear-gradient(#5a93cf,#235488); border-color: #1d4773; }
        .key.ka { background: linear-gradient(#6cbb5b,#347626); border-color: #2a6121; }
        .key .lblP { display: flex; align-items: center; justify-content: center; height: 100%;
          font-weight: 700; font-size: 14px; }
        .key.kb .lblP, .key.k2 .lblP, .key.ka .lblP { color: #fff; }
        .key.kw .lblP, .key.kg .lblP { color: #1b1b1b; }
        .key .lblP { font-size: clamp(9px, 3.2vw, 14px); }
        .key .lblS, .key .lblA { position: absolute; top: -9px; font-size: 8px; font-weight: 600;
          line-height: 1; white-space: nowrap; opacity: .92; }
        .key .lblS { left: 1px; color: #2f6cab; }
        .key .lblA { right: 1px; color: #3f8a34; }
        .key.hot2 .lblS { background: #2f6cab; color: #fff; border-radius: 3px; padding: 1px 2px; top: -10px; }
        .key.hota .lblA { background: #3f8a34; color: #fff; border-radius: 3px; padding: 1px 2px; top: -10px; }
      `}</style>
    </div>
  );
}
