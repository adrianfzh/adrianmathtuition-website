'use client';

// TI-84 Plus CE style calculator.
//  Phase A: home-screen scientific calculator.
//  Phase B: Y= editor, WINDOW, GRAPH (canvas), ZOOM menu, TRACE.
// Mobile-first, exam-faithful key behaviour. STAT/TABLE/CALC (Phase C–D) stubbed.
import { useState, useRef, useEffect, useCallback } from 'react';
import { evaluate, compile, formatTI, type AngleMode, type EvalCtx } from '@/lib/ti84/engine';
import { findZero, findExtremum, findIntersect, derivative, integral, type F } from '@/lib/ti84/calc';
import { oneVarStats, twoVarStats } from '@/lib/ti84/stats';
import EquationSolver from './EquationSolver';

type Act = { ins: string } | { cmd: string };
interface Key { id: string; p: string; s?: string; a?: string; cls: 'kb' | 'kw' | 'kg' | 'k2' | 'ka'; n: Act; sa?: Act; aa?: Act; }
const k = (id: string, p: string, cls: Key['cls'], n: Act, opts: Partial<Key> = {}): Key => ({ id, p, cls, n, ...opts });

const GRAPH_ROW: Key[] = [
  k('y=', 'y=', 'kg', { cmd: 'yeq' }, { s: 'stat plot' }),
  k('window', 'window', 'kg', { cmd: 'win' }, { s: 'tblset', sa: { cmd: 'tblset' } }),
  k('zoom', 'zoom', 'kg', { cmd: 'zoom' }, { s: 'format' }),
  k('trace', 'trace', 'kg', { cmd: 'trace' }, { s: 'calc', sa: { cmd: 'calc' } }),
  k('graph', 'graph', 'kg', { cmd: 'graph' }, { s: 'table', sa: { cmd: 'table' } }),
];

const ROWS: Key[][] = [
  [
    k('math', 'math', 'kb', { cmd: 'mathmenu' }, { s: 'test', a: 'A', aa: { ins: 'A' } }),
    k('apps', 'apps', 'kb', { cmd: 'apps' }, { s: 'angle', a: 'B', aa: { ins: 'B' } }),
    k('prgm', 'prgm', 'kb', { cmd: 'soon' }, { s: 'draw', a: 'C', aa: { ins: 'C' } }),
    k('vars', 'vars', 'kb', { cmd: 'soon' }, { s: 'distr', sa: { cmd: 'distr' } }),
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

type Screen = 'home' | 'yeq' | 'window' | 'graph' | 'tblset' | 'table' | 'statedit' | 'statresult';
const DISTR_FNS = ['normalpdf', 'normalcdf', 'invNorm', 'binompdf', 'binomcdf', 'poissonpdf', 'poissoncdf'];
interface HistItem { input: string; output: string; err?: boolean; }

// TI-84 MODE screen rows (only ANGLE is wired; the rest are faithful display).
const MODE_ROWS: { key: string; def: number; opts: string[] }[] = [
  { key: 'num', def: 0, opts: ['NORMAL', 'SCI', 'ENG'] },
  { key: 'float', def: 0, opts: ['FLOAT', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
  { key: 'angle', def: 0, opts: ['RADIAN', 'DEGREE'] },
  { key: 'graph', def: 0, opts: ['FUNC', 'PAR', 'POL', 'SEQ'] },
  { key: 'cplx', def: 0, opts: ['REAL', 'a+bi', 're^θi'] },
  { key: 'screen', def: 0, opts: ['FULL', 'HORIZ', 'G-T'] },
];

type CalcOp = 'value' | 'zero' | 'min' | 'max' | 'intersect' | 'dydx' | 'integral';
const CALC_OPS: { id: CalcOp; label: string; prompts: string[] }[] = [
  { id: 'value', label: 'value', prompts: ['X=?'] },
  { id: 'zero', label: 'zero', prompts: ['Left Bound?', 'Right Bound?', 'Guess?'] },
  { id: 'min', label: 'minimum', prompts: ['Left Bound?', 'Right Bound?', 'Guess?'] },
  { id: 'max', label: 'maximum', prompts: ['Left Bound?', 'Right Bound?', 'Guess?'] },
  { id: 'intersect', label: 'intersect', prompts: ['First curve?', 'Second curve?', 'Guess?'] },
  { id: 'dydx', label: 'dy/dx', prompts: ['X=?'] },
  { id: 'integral', label: '∫f(x)dx', prompts: ['Lower Limit?', 'Upper Limit?'] },
];
const NY = 6; // Y1..Y6
const WINKEYS = ['Xmin', 'Xmax', 'Xscl', 'Ymin', 'Ymax', 'Yscl'] as const;
type WinKey = typeof WINKEYS[number];
const DEFAULT_WIN: Record<WinKey, string> = { Xmin: '-10', Xmax: '10', Xscl: '1', Ymin: '-10', Ymax: '10', Yscl: '1' };
const PLOT_COLORS = ['#1f5fc0', '#d8232a', '#111111', '#b5179e', '#2e7d32', '#e67e22'];
const TRACE_STEPS = 132;

export default function CalculatorPage() {
  const [screen, setScreen] = useState<Screen>('home');
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
  const [mathMenu, setMathMenu] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [toast, setToast] = useState('');
  // graphing
  const [yfns, setYfns] = useState<string[]>(Array(NY).fill(''));
  const [ySel, setYSel] = useState(0);
  const [win, setWin] = useState<Record<WinKey, string>>({ ...DEFAULT_WIN });
  const [winSel, setWinSel] = useState(0);
  const [traceOn, setTraceOn] = useState(false);
  const [traceFn, setTraceFn] = useState(0);
  const [traceI, setTraceI] = useState(Math.floor(TRACE_STEPS / 2));
  // TABLE
  const [tbl, setTbl] = useState<{ start: string; step: string }>({ start: '0', step: '1' });
  const [tblSel, setTblSel] = useState(0);   // 0 = TblStart, 1 = ΔTbl
  const [tblRow, setTblRow] = useState(0);   // scroll offset
  // CALC
  const [calcMenu, setCalcMenu] = useState(false);
  const [calcOp, setCalcOp] = useState<CalcOp | null>(null);
  const [calcStep, setCalcStep] = useState(0);
  const [calcVals, setCalcVals] = useState<number[]>([]);
  const [calcCurves, setCalcCurves] = useState<number[]>([]);
  const [calcResult, setCalcResult] = useState<{ text: string; x: number; y: number } | null>(null);
  // STAT
  const [lists, setLists] = useState<string[][]>([[], [], []]); // L1, L2, L3
  const [listSel, setListSel] = useState(0);
  const [rowSel, setRowSel] = useState(0);
  const [statMenu, setStatMenu] = useState(false);
  const [distrMenu, setDistrMenu] = useState(false);
  const [statResult, setStatResult] = useState<{ title: string; rows: [string, string][] } | null>(null);

  const screenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx = useCallback((extra?: Record<string, number>): EvalCtx => ({ angle, ans, vars: { ...vars, ...extra } }), [angle, ans, vars]);
  const winNum = useCallback((key: WinKey, fb: number): number => {
    const r = evaluate(win[key], ctx()); return r.ok ? r.value : fb;
  }, [win, ctx]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  useEffect(() => { if (screen === 'home') screenRef.current?.scrollTo(0, screenRef.current.scrollHeight); }, [hist, entry, cursor, screen]);

  // ── active edit buffer (home entry / Y= line / WINDOW field) ──
  const bufVal = (): string => screen === 'home' ? entry : screen === 'yeq' ? yfns[ySel]
    : screen === 'window' ? win[WINKEYS[winSel]] : screen === 'tblset' ? (tblSel === 0 ? tbl.start : tbl.step)
    : screen === 'statedit' ? (lists[listSel][rowSel] ?? '') : '';
  const bufSet = (fn: (s: string) => string) => {
    if (screen === 'home') setEntry(fn);
    else if (screen === 'yeq') setYfns((a) => a.map((v, i) => i === ySel ? fn(v) : v));
    else if (screen === 'window') setWin((w) => ({ ...w, [WINKEYS[winSel]]: fn(w[WINKEYS[winSel]]) }));
    else if (screen === 'tblset') setTbl((t) => tblSel === 0 ? { ...t, start: fn(t.start) } : { ...t, step: fn(t.step) });
    else if (screen === 'statedit') setLists((ls) => ls.map((col, ci) => {
      if (ci !== listSel) return col;
      const nc = [...col]; while (nc.length <= rowSel) nc.push(''); nc[rowSel] = fn(nc[rowSel] ?? ''); return nc;
    }));
  };
  const editable = screen === 'home' || screen === 'yeq' || screen === 'window' || screen === 'tblset' || screen === 'statedit';

  const insert = (text: string) => {
    const c = cursor; bufSet((s) => s.slice(0, c) + text + s.slice(c)); setCursor(c + text.length); setRecall(null);
  };

  const doEnter = useCallback(() => {
    const line = entry.trim();
    if (!line) return;
    let expr = line, target: string | null = null;
    let toFrac = false;
    if (expr.endsWith('►Frac')) { toFrac = true; expr = expr.slice(0, -5); }
    const arrow = expr.indexOf('→');
    if (arrow >= 0) { target = expr.slice(arrow + 1).trim(); expr = expr.slice(0, arrow); }
    const res = evaluate(expr, ctx());
    if (res.ok) {
      if (target && /^[A-Zθ]$/.test(target)) setVars((v) => ({ ...v, [target!]: res.value }));
      setAns(res.value);
      const out = toFrac ? (toFraction(res.value) ?? res.display) : res.display;
      setHist((h) => [...h, { input: line, output: out }]);
    } else {
      setHist((h) => [...h, { input: line, output: 'ERR: ' + res.error, err: true }]);
    }
    setEntry(''); setCursor(0); setRecall(null);
  }, [entry, ctx]);

  const firstFn = useCallback(() => { const i = yfns.findIndex((f) => f.trim()); return i < 0 ? 0 : i; }, [yfns]);

  // Compile Yn into a real x→y function with the current context baked in.
  const Fof = useCallback((idx: number): F | null => {
    const f = yfns[idx]; if (!f || !f.trim()) return null;
    const cp = compile(f); if (!cp.ok) return null;
    return (x: number) => cp.fn(ctx({ X: x }));
  }, [yfns, ctx]);

  const cursorX = useCallback(() => {
    const xmin = winNum('Xmin', -10), xmax = winNum('Xmax', 10);
    return xmin + (traceI / (TRACE_STEPS - 1)) * (xmax - xmin);
  }, [winNum, traceI]);

  const listNums = (i: number): number[] => {
    const out: number[] = [];
    for (const s of lists[i]) { if (!s.trim()) continue; const r = evaluate(s, ctx()); if (r.ok) out.push(r.value); }
    return out;
  };

  const startStat = (kind: 'edit' | '1var' | '2var' | 'linreg') => {
    setStatMenu(false);
    const sf = formatTI;
    if (kind === 'edit') { setScreen('statedit'); setListSel(0); setRowSel(0); setCursor((lists[0][0] ?? '').length); return; }
    if (kind === '1var') {
      const ov = oneVarStats(listNums(0));
      if (!ov) { showToast('L1 is empty'); return; }
      setStatResult({ title: '1-Var Stats (L1)', rows: [
        ['x̄', sf(ov.mean)], ['Σx', sf(ov.sumx)], ['Σx²', sf(ov.sumx2)], ['Sx', sf(ov.Sx)], ['σx', sf(ov.sigmax)],
        ['n', String(ov.n)], ['minX', sf(ov.min)], ['Q1', sf(ov.q1)], ['Med', sf(ov.med)], ['Q3', sf(ov.q3)], ['maxX', sf(ov.max)],
      ] });
      setScreen('statresult'); return;
    }
    const tv = twoVarStats(listNums(0), listNums(1));
    if (!tv) { showToast('Need L1 & L2 (≥2 points)'); return; }
    if (kind === '2var') setStatResult({ title: '2-Var Stats (L1,L2)', rows: [
      ['x̄', sf(tv.two.xbar)], ['Σx', sf(tv.two.sumx)], ['Σx²', sf(tv.two.sumx2)], ['ȳ', sf(tv.two.ybar)],
      ['Σy', sf(tv.two.sumy)], ['Σy²', sf(tv.two.sumy2)], ['Σxy', sf(tv.two.sumxy)], ['Sx', sf(tv.two.Sx)], ['Sy', sf(tv.two.Sy)], ['n', String(tv.two.n)],
    ] });
    else setStatResult({ title: 'LinReg  y=ax+b', rows: [
      ['a', sf(tv.reg.a)], ['b', sf(tv.reg.b)], ['r²', sf(tv.reg.r2)], ['r', sf(tv.reg.r)],
    ] });
    setScreen('statresult');
  };

  const distrInsert = (name: string) => {
    setDistrMenu(false);
    const text = name + '(';
    const ne = entry + text;
    setEntry(ne); setCursor(ne.length); setScreen('home');
  };

  const startCalc = (op: CalcOp) => {
    setCalcMenu(false);
    if (yfns.every((f) => !f.trim())) { showToast('Enter a function in Y= first'); return; }
    setCalcOp(op); setCalcStep(0); setCalcVals([]); setCalcCurves([]); setCalcResult(null);
    setScreen('graph'); setTraceOn(true); setTraceFn(firstFn()); setTraceI(Math.floor(TRACE_STEPS / 2));
  };

  const applyZoom = (kind: string) => {
    const W = canvasRef.current?.clientWidth || 300, H = canvasRef.current?.clientHeight || 200;
    let xmin = winNum('Xmin', -10), xmax = winNum('Xmax', 10), ymin = winNum('Ymin', -10), ymax = winNum('Ymax', 10);
    const set = (a: number, b: number, c: number, d: number, xs = '1', ys = '1') =>
      setWin({ Xmin: trim(a), Xmax: trim(b), Xscl: xs, Ymin: trim(c), Ymax: trim(d), Yscl: ys });
    if (kind === 'std') set(-10, 10, -10, 10);
    else if (kind === 'dec') set(-4.7, 4.7, -3.1, 3.1);
    else if (kind === 'trig') { const x = angle === 'DEG' ? 360 : 2 * Math.PI; set(-x, x, -4, 4, angle === 'DEG' ? '90' : trim(Math.PI / 2), '1'); }
    else if (kind === 'in' || kind === 'out') {
      const f = kind === 'in' ? 0.25 : 4, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const hx = (xmax - xmin) / 2 * f, hy = (ymax - ymin) / 2 * f;
      set(cx - hx, cx + hx, cy - hy, cy + hy, win.Xscl, win.Yscl);
    } else if (kind === 'sq') {
      const cx = (xmin + xmax) / 2, perY = H / (ymax - ymin), spanX = W / perY;
      set(cx - spanX / 2, cx + spanX / 2, ymin, ymax, win.Xscl, win.Yscl);
    } else if (kind === 'fit') {
      let lo = Infinity, hi = -Infinity;
      for (const f of yfns) { if (!f.trim()) continue; const cp = compile(f); if (!cp.ok) continue;
        for (let i = 0; i <= 100; i++) { const x = xmin + (i / 100) * (xmax - xmin); const y = cp.fn(ctx({ X: x }));
          if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } } }
      if (lo < hi) { const pad = (hi - lo) * 0.1 || 1; set(xmin, xmax, lo - pad, hi + pad, win.Xscl, win.Yscl); }
    }
    setZoomMenu(false); setScreen('graph'); setTraceOn(false);
  };

  const press = useCallback((key: Key) => {
    if (key.id === '2nd') { setSec((s) => !s); setAlpha(false); return; }
    if (key.id === 'alpha') { setAlpha((a) => !a); setSec(false); return; }
    const act: Act = sec ? (key.sa ?? key.n) : alpha ? (key.aa ?? key.n) : key.n;
    let keepAlpha = false;

    if ('ins' in act) {
      if (editable) insert(act.ins);
    } else {
      switch (act.cmd) {
        case 'enter':
          if (screen === 'graph' && calcOp) {
            const op = CALC_OPS.find((o) => o.id === calcOp)!;
            if (calcOp === 'intersect' && calcStep < 2) { setCalcCurves((cv) => [...cv, traceFn]); setCalcStep((s) => s + 1); break; }
            const x = cursorX();
            if (calcStep < op.prompts.length - 1) { setCalcVals((v) => [...v, x]); setCalcStep((s) => s + 1); break; }
            const vals = [...calcVals, x];
            const xmin = winNum('Xmin', -10), xmax = winNum('Xmax', 10);
            let r: { text: string; x: number; y: number } | null = null;
            if (calcOp === 'intersect') {
              const f = Fof(calcCurves[0]), g = Fof(calcCurves[1]);
              if (f && g) { const it = findIntersect(f, g, xmin, xmax, x); r = { text: `intersect  X=${fmtShort(it.x)}  Y=${fmtShort(it.y)}`, x: it.x, y: it.y }; }
            } else {
              const f = Fof(traceFn);
              if (f) {
                if (calcOp === 'value') r = { text: `X=${fmtShort(vals[0])}  Y=${fmtShort(f(vals[0]))}`, x: vals[0], y: f(vals[0]) };
                else if (calcOp === 'zero') { const z = findZero(f, vals[0], vals[1], vals[2]); r = { text: `zero  X=${fmtShort(z)}  Y=0`, x: z, y: f(z) }; }
                else if (calcOp === 'min' || calcOp === 'max') { const e = findExtremum(f, vals[0], vals[1], calcOp); r = { text: `${calcOp === 'min' ? 'minimum' : 'maximum'}  X=${fmtShort(e.x)}  Y=${fmtShort(e.y)}`, x: e.x, y: e.y }; }
                else if (calcOp === 'dydx') { const d = derivative(f, vals[0]); r = { text: `dy/dx=${fmtShort(d)}`, x: vals[0], y: f(vals[0]) }; }
                else if (calcOp === 'integral') { const I = integral(f, vals[0], vals[1]); r = { text: `∫f(x)dx=${fmtShort(I)}`, x: vals[1], y: f(vals[1]) }; }
              }
            }
            setCalcResult(r); setCalcOp(null); setCalcStep(0);
            break;
          }
          if (screen === 'home') doEnter();
          else if (screen === 'yeq') { const n = Math.min(ySel + 1, NY - 1); setYSel(n); setCursor(yfns[n].length); }
          else if (screen === 'window') { const n = Math.min(winSel + 1, WINKEYS.length - 1); setWinSel(n); setCursor(win[WINKEYS[n]].length); }
          else if (screen === 'tblset') { const n = Math.min(tblSel + 1, 1); setTblSel(n); setCursor((n === 0 ? tbl.start : tbl.step).length); }
          else if (screen === 'statedit') { setRowSel((r) => r + 1); setCursor(0); }
          break;
        case 'entry': { const last = [...hist].reverse().find((h) => !h.err); if (last) { setEntry(last.input); setCursor(last.input.length); } break; }
        case 'clear':
          if (screen === 'graph' && calcOp) { setCalcOp(null); setCalcStep(0); setCalcResult(null); break; }
          if (screen === 'home') { if (entry) { setEntry(''); setCursor(0); } else setHist([]); }
          else { bufSet(() => ''); setCursor(0); }
          break;
        case 'del': if (editable && cursor > 0) { bufSet((s) => s.slice(0, cursor - 1) + s.slice(cursor)); setCursor((c) => c - 1); } break;
        case 'left':
          if (screen === 'graph' && traceOn) setTraceI((i) => Math.max(0, i - 1));
          else if (screen === 'statedit') { const n = Math.max(0, listSel - 1); setListSel(n); setCursor((lists[n][rowSel] ?? '').length); }
          else setCursor((c) => Math.max(0, c - 1));
          break;
        case 'right':
          if (screen === 'graph' && traceOn) setTraceI((i) => Math.min(TRACE_STEPS - 1, i + 1));
          else if (screen === 'statedit') { const n = Math.min(2, listSel + 1); setListSel(n); setCursor((lists[n][rowSel] ?? '').length); }
          else setCursor((c) => Math.min(bufVal().length, c + 1));
          break;
        case 'up':
          if (screen === 'home') { const ins = hist.map((h) => h.input); if (ins.length) { const idx = recall === null ? ins.length - 1 : Math.max(0, recall - 1); setRecall(idx); setEntry(ins[idx]); setCursor(ins[idx].length); } }
          else if (screen === 'yeq') { const n = Math.max(0, ySel - 1); setYSel(n); setCursor(yfns[n].length); }
          else if (screen === 'window') { const n = Math.max(0, winSel - 1); setWinSel(n); setCursor(win[WINKEYS[n]].length); }
          else if (screen === 'tblset') { setTblSel(0); setCursor(tbl.start.length); }
          else if (screen === 'table') setTblRow((r) => r - 1);
          else if (screen === 'statedit') { const n = Math.max(0, rowSel - 1); setRowSel(n); setCursor((lists[listSel][n] ?? '').length); }
          else if (screen === 'graph' && traceOn) setTraceFn((f) => nextFn(yfns, f, -1));
          break;
        case 'down':
          if (screen === 'home') { const ins = hist.map((h) => h.input); if (recall !== null) { const idx = recall + 1; if (idx >= ins.length) { setRecall(null); setEntry(''); setCursor(0); } else { setRecall(idx); setEntry(ins[idx]); setCursor(ins[idx].length); } } }
          else if (screen === 'yeq') { const n = Math.min(NY - 1, ySel + 1); setYSel(n); setCursor(yfns[n].length); }
          else if (screen === 'window') { const n = Math.min(WINKEYS.length - 1, winSel + 1); setWinSel(n); setCursor(win[WINKEYS[n]].length); }
          else if (screen === 'tblset') { setTblSel(1); setCursor(tbl.step.length); }
          else if (screen === 'table') setTblRow((r) => r + 1);
          else if (screen === 'statedit') { const n = rowSel + 1; setRowSel(n); setCursor((lists[listSel][n] ?? '').length); }
          else if (screen === 'graph' && traceOn) setTraceFn((f) => nextFn(yfns, f, 1));
          break;
        case 'yeq': setScreen('yeq'); setCursor(yfns[ySel].length); break;
        case 'win': setScreen('window'); setWinSel(0); setCursor(win.Xmin.length); break;
        case 'graph': setScreen('graph'); setTraceOn(false); break;
        case 'trace': setScreen('graph'); setTraceOn(true); setTraceFn(firstFn()); setTraceI(Math.floor(TRACE_STEPS / 2)); break;
        case 'zoom': setZoomMenu(true); break;
        case 'tblset': setScreen('tblset'); setTblSel(0); setCursor(tbl.start.length); break;
        case 'table': setScreen('table'); break;
        case 'calc': setCalcMenu(true); break;
        case 'statmenu': setStatMenu(true); break;
        case 'distr': setDistrMenu(true); break;
        case 'sto': if (editable) { insert('→'); setAlpha(true); keepAlpha = true; } break;
        case 'on': setScreen('home'); setEntry(''); setCursor(0); break;
        case 'quit': setScreen('home'); setModeMenu(false); setZoomMenu(false); setMathMenu(false); break;
        case 'modemenu': setModeMenu(true); break;
        case 'mathmenu': setMathMenu(true); break;
        case 'apps': setShowApps(true); break;
        case 'soon': showToast('MATH / APPS / PRGM / VARS menus — not part of the JC build'); break;
        default: break;
      }
    }
    setSec(false);
    if (!keepAlpha) setAlpha(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, alpha, screen, editable, entry, cursor, hist, recall, doEnter, yfns, ySel, win, winSel, traceOn, traceFn, traceI, firstFn, showToast, tbl, tblSel, calcOp, calcStep, calcVals, calcCurves, cursorX, Fof, winNum, lists, listSel, rowSel]);

  // ── graph drawing ──
  useEffect(() => {
    if (screen !== 'graph') return;
    const cv = canvasRef.current; if (!cv) return;
    const cssW = cv.clientWidth, cssH = cv.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const g = cv.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH); g.fillStyle = '#fff'; g.fillRect(0, 0, cssW, cssH);

    const xmin = winNum('Xmin', -10), xmax = winNum('Xmax', 10), ymin = winNum('Ymin', -10), ymax = winNum('Ymax', 10);
    const xscl = winNum('Xscl', 1), yscl = winNum('Yscl', 1);
    if (!(xmax > xmin) || !(ymax > ymin)) { g.fillStyle = '#b00'; g.font = '12px monospace'; g.fillText('ERR: WINDOW RANGE', 10, 20); return; }
    const sx = (x: number) => (x - xmin) / (xmax - xmin) * cssW;
    const sy = (y: number) => cssH - (y - ymin) / (ymax - ymin) * cssH;

    // gridlines
    g.strokeStyle = '#dfe4ea'; g.lineWidth = 1; g.beginPath();
    if (xscl > 0 && (xmax - xmin) / xscl < 60) for (let x = Math.ceil(xmin / xscl) * xscl; x <= xmax; x += xscl) { g.moveTo(sx(x), 0); g.lineTo(sx(x), cssH); }
    if (yscl > 0 && (ymax - ymin) / yscl < 60) for (let y = Math.ceil(ymin / yscl) * yscl; y <= ymax; y += yscl) { g.moveTo(0, sy(y)); g.lineTo(cssW, sy(y)); }
    g.stroke();
    // axes
    g.strokeStyle = '#5a6675'; g.lineWidth = 1.2; g.beginPath();
    if (xmin <= 0 && xmax >= 0) { g.moveTo(sx(0), 0); g.lineTo(sx(0), cssH); }
    if (ymin <= 0 && ymax >= 0) { g.moveTo(0, sy(0)); g.lineTo(cssW, sy(0)); }
    g.stroke();

    // plots
    const N = Math.max(cssW, 200);
    yfns.forEach((f, fi) => {
      if (!f.trim()) return;
      const cp = compile(f); if (!cp.ok) return;
      g.strokeStyle = PLOT_COLORS[fi % PLOT_COLORS.length]; g.lineWidth = 2; g.beginPath();
      let pen = false;
      for (let i = 0; i <= N; i++) {
        const x = xmin + (i / N) * (xmax - xmin);
        let y: number; try { y = cp.fn(ctx({ X: x })); } catch { y = NaN; }
        if (!isFinite(y)) { pen = false; continue; }
        const py = sy(y);
        if (py < -cssH * 2 || py > cssH * 3) { pen = false; continue; }
        if (!pen) { g.moveTo(sx(x), py); pen = true; } else g.lineTo(sx(x), py);
      }
      g.stroke();
    });

    // trace cursor
    if (traceOn) {
      const f = yfns[traceFn];
      if (f && f.trim()) {
        const cp = compile(f);
        if (cp.ok) {
          const x = xmin + (traceI / (TRACE_STEPS - 1)) * (xmax - xmin);
          const y = cp.fn(ctx({ X: x }));
          if (isFinite(y)) {
            g.strokeStyle = '#444'; g.lineWidth = 1; g.beginPath();
            g.moveTo(sx(x), 0); g.lineTo(sx(x), cssH); g.moveTo(0, sy(y)); g.lineTo(cssW, sy(y)); g.stroke();
            g.fillStyle = PLOT_COLORS[traceFn % PLOT_COLORS.length];
            g.beginPath(); g.arc(sx(x), sy(y), 4, 0, 7); g.fill();
          }
        }
      }
    }

    // CALC result marker
    if (calcResult && isFinite(calcResult.x) && isFinite(calcResult.y)) {
      g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath();
      g.moveTo(sx(calcResult.x), 0); g.lineTo(sx(calcResult.x), cssH); g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.arc(sx(calcResult.x), sy(calcResult.y), 4.5, 0, 7); g.fill();
    }
  }, [screen, yfns, win, traceOn, traceFn, traceI, calcResult, ctx, winNum]);

  const STATUS = `NORMAL FLOAT AUTO REAL ${angle === 'RAD' ? 'RADIAN' : 'DEGREE'} MP`;

  const Caret = ({ s, c }: { s: string; c: number }) => (
    <><span>{s.slice(0, c)}</span><span className="caret" /><span>{s.slice(c)}</span></>
  );

  const Btn = ({ def, bare }: { def: Key; bare?: boolean }) => {
    const showSec = sec && def.s !== undefined;
    const showAlp = alpha && def.a !== undefined;
    return (
      <button className={`key ${def.cls} ${showSec ? 'hot2' : ''} ${showAlp ? 'hota' : ''}`} onClick={() => press(def)}>
        {!bare && def.s && <span className="lblS">{def.s}</span>}
        {!bare && def.a && <span className="lblA">{def.a}</span>}
        <span className="lblP">{def.p}</span>
      </button>
    );
  };

  // graph status bar — CALC result, CALC prompt, or TRACE readout
  let traceTxt = '';
  if (screen === 'graph') {
    if (calcResult) traceTxt = calcResult.text;
    else if (calcOp) {
      const op = CALC_OPS.find((o) => o.id === calcOp)!;
      const prompt = op.prompts[calcStep];
      if (calcOp === 'intersect' && calcStep < 2) traceTxt = `${op.label} · ${prompt} Y${traceFn + 1} (↑↓ change · ENTER)`;
      else traceTxt = `${op.label} · ${prompt}  X=${fmtShort(cursorX())}`;
    } else if (traceOn) {
      const f = yfns[traceFn];
      if (f && f.trim()) { const cp = compile(f); const y = cp.ok ? cp.fn(ctx({ X: cursorX() })) : NaN; traceTxt = `Y${traceFn + 1}  X=${fmtShort(cursorX())}  Y=${isFinite(y) ? fmtShort(y) : '—'}`; }
      else traceTxt = 'No function to trace';
    }
  }

  return (
    <div className="wrap">
      <a className="backBtn" href="/admin">‹ Back</a>
      <a className="switchBtn" href="/calculator/casio">⇄ Casio</a>
      <div className="calc">
        <div className="head"><div className="model">TI-84 Plus CE</div><div className="py">PYTHON</div></div>

        <div className="bezel">
          <div className="lcd" ref={screenRef}>
            {screen === 'home' && (<>
              <div className="status">{STATUS}</div>
              {hist.map((h, i) => (
                <div key={i} className="histItem"><div className="hi-in">{h.input}</div><div className={`hi-out ${h.err ? 'hi-err' : ''}`}>{h.output}</div></div>
              ))}
              <div className="entryLine"><Caret s={entry} c={cursor} /></div>
            </>)}

            {screen === 'yeq' && (<>
              <div className="status">Plot1  Plot2  Plot3</div>
              {yfns.map((f, i) => (
                <div key={i} className={`yrow ${i === ySel ? 'sel' : ''}`}>
                  <span className="ysw" style={{ background: PLOT_COLORS[i % PLOT_COLORS.length] }} />
                  <span className="ylab">Y{i + 1}=</span>
                  <span className="yexpr">{i === ySel ? <Caret s={f} c={cursor} /> : f}</span>
                </div>
              ))}
            </>)}

            {screen === 'window' && (<>
              <div className="status">WINDOW</div>
              {WINKEYS.map((kk, i) => (
                <div key={kk} className={`wrow ${i === winSel ? 'sel' : ''}`}>
                  <span className="wlab">{kk}=</span>
                  <span className="wval">{i === winSel ? <Caret s={win[kk]} c={cursor} /> : win[kk]}</span>
                </div>
              ))}
            </>)}

            {screen === 'graph' && (
              <div className="graphWrap">
                <canvas ref={canvasRef} className="cv" />
                {traceTxt && <div className="traceBar">{traceTxt}</div>}
              </div>
            )}

            {screen === 'tblset' && (<>
              <div className="status">TABLE SETUP</div>
              <div className={`wrow ${tblSel === 0 ? 'sel' : ''}`}><span className="wlab">TblStart=</span><span className="wval">{tblSel === 0 ? <Caret s={tbl.start} c={cursor} /> : tbl.start}</span></div>
              <div className={`wrow ${tblSel === 1 ? 'sel' : ''}`}><span className="wlab">&#916;Tbl=</span><span className="wval">{tblSel === 1 ? <Caret s={tbl.step} c={cursor} /> : tbl.step}</span></div>
              <div className="hint">Set start &amp; step, then 2nd · table</div>
            </>)}

            {screen === 'table' && (() => {
              const rs = evaluate(tbl.start, ctx()); const rt = evaluate(tbl.step, ctx());
              const start = rs.ok ? rs.value : 0;
              const step = rt.ok ? rt.value : 1;
              const defined = yfns.map((f, i) => ({ f, i })).filter((o) => o.f.trim()).slice(0, 3);
              const ROWS_N = 8;
              return (
                <div className="tbl">
                  <div className="trow thead"><span className="tc">X</span>{defined.map((o) => <span key={o.i} className="tc">Y{o.i + 1}</span>)}</div>
                  {Array.from({ length: ROWS_N }, (_, r) => {
                    const xv = start + (tblRow + r) * step;
                    return (
                      <div key={r} className="trow">
                        <span className="tc">{fmtShort(xv)}</span>
                        {defined.map((o) => { const cp = compile(o.f); const y = cp.ok ? cp.fn(ctx({ X: xv })) : NaN; return <span key={o.i} className="tc">{isFinite(y) ? fmtShort(y) : 'ERR'}</span>; })}
                      </div>
                    );
                  })}
                  {defined.length === 0 && <div className="hint">No functions in Y=</div>}
                </div>
              );
            })()}

            {screen === 'statedit' && (() => {
              const maxLen = Math.max(1, ...lists.map((l) => l.length));
              const rowsN = Math.max(maxLen + 1, rowSel + 2);
              return (
                <div className="tbl">
                  <div className="trow thead"><span className="tc rc">&nbsp;</span>{[0, 1, 2].map((i) => <span key={i} className={`tc ${i === listSel ? 'csel' : ''}`}>L{i + 1}</span>)}</div>
                  {Array.from({ length: rowsN }, (_, r) => (
                    <div key={r} className="trow">
                      <span className="tc rc">{r + 1}</span>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={`tc ${i === listSel && r === rowSel ? 'cellsel' : ''}`}>
                          {i === listSel && r === rowSel ? <Caret s={lists[i][r] ?? ''} c={cursor} /> : (lists[i][r] ?? '')}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}

            {screen === 'statresult' && statResult && (<>
              <div className="status">{statResult.title}</div>
              {statResult.rows.map(([kk, vv], i) => (
                <div key={i} className="srow"><span className="slab">{kk}</span><span className="sval">{vv}</span></div>
              ))}
              <div className="hint">2nd · quit (or any screen key) to exit</div>
            </>)}
          </div>

          {modeMenu && (
            <div className="overlay" onClick={() => setModeMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()} style={{ width: '94%', fontFamily: 'Consolas,monospace', textAlign: 'left' }}>
                <div className="ov-title">MODE</div>
                <div style={{ lineHeight: 1.8, fontSize: 13 }}>
                  {MODE_ROWS.map((row, ri) => (
                    <div key={ri}>
                      {row.opts.map((opt, oi) => {
                        const sel = row.key === 'angle' ? (opt === (angle === 'RAD' ? 'RADIAN' : 'DEGREE')) : oi === row.def;
                        const clickable = row.key === 'angle';
                        return (
                          <span key={oi} onClick={clickable ? () => setAngle(opt === 'RADIAN' ? 'RAD' : 'DEG') : undefined}
                            style={{ padding: '1px 4px', marginRight: 5, borderRadius: 2, cursor: clickable ? 'pointer' : 'default', background: sel ? '#1a1f26' : 'transparent', color: sel ? '#eef0e8' : '#1a1f26' }}>{opt}</span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <button className="ov-close" onClick={() => setModeMenu(false)}>Done (2nd · quit)</button>
              </div>
            </div>
          )}
          {mathMenu && (
            <div className="overlay" onClick={() => setMathMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-title">MATH</div>
                <div className="zgrid">
                  <button onClick={() => { insert('►Frac'); setMathMenu(false); }}>▸Frac</button>
                  <button onClick={() => { insert('^3'); setMathMenu(false); }}>³ cube</button>
                  <button onClick={() => { insert('∛('); setMathMenu(false); }}>³√(</button>
                  <button onClick={() => { insert('abs('); setMathMenu(false); }}>abs(</button>
                  <button onClick={() => { insert('nPr('); setMathMenu(false); }}>nPr(</button>
                  <button onClick={() => { insert('nCr('); setMathMenu(false); }}>nCr(</button>
                  <button onClick={() => { insert('!'); setMathMenu(false); }}>! factorial</button>
                  <button onClick={() => setMathMenu(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {zoomMenu && (
            <div className="overlay" onClick={() => setZoomMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-title">ZOOM</div>
                <div className="zgrid">
                  <button onClick={() => applyZoom('std')}>ZStandard</button>
                  <button onClick={() => applyZoom('dec')}>ZDecimal</button>
                  <button onClick={() => applyZoom('in')}>Zoom In</button>
                  <button onClick={() => applyZoom('out')}>Zoom Out</button>
                  <button onClick={() => applyZoom('sq')}>ZSquare</button>
                  <button onClick={() => applyZoom('trig')}>ZTrig</button>
                  <button onClick={() => applyZoom('fit')}>ZoomFit</button>
                  <button onClick={() => setZoomMenu(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {calcMenu && (
            <div className="overlay" onClick={() => setCalcMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-title">CALCULATE</div>
                <div className="zgrid">
                  {CALC_OPS.map((o, i) => <button key={o.id} onClick={() => startCalc(o.id)}>{i + 1}: {o.label}</button>)}
                  <button onClick={() => setCalcMenu(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {statMenu && (
            <div className="overlay" onClick={() => setStatMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-title">STAT</div>
                <div className="zgrid">
                  <button onClick={() => startStat('edit')}>1: Edit lists</button>
                  <button onClick={() => startStat('1var')}>1-Var Stats</button>
                  <button onClick={() => startStat('2var')}>2-Var Stats</button>
                  <button onClick={() => startStat('linreg')}>LinReg(ax+b)</button>
                  <button onClick={() => setStatMenu(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {distrMenu && (
            <div className="overlay" onClick={() => setDistrMenu(false)}>
              <div className="ov" onClick={(e) => e.stopPropagation()}>
                <div className="ov-title">DISTR</div>
                <div className="zgrid">
                  {DISTR_FNS.map((n) => <button key={n} onClick={() => distrInsert(n)}>{n}(</button>)}
                  <button onClick={() => setDistrMenu(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>

        <div className="grow">
          {GRAPH_ROW.map((g, i) => (
            <div className="fcell" key={g.id}>
              <div className="flab"><span className="fs">{g.s}</span> <span className="ffk">f{i + 1}</span></div>
              <Btn def={g} bare />
            </div>
          ))}
        </div>

        <div className="pad">
          <div style={{ gridArea: 's1c1' }}><Btn def={k('2nd', '2nd', 'k2', { cmd: 'second' })} /></div>
          <div style={{ gridArea: 's1c2' }}><Btn def={k('mode', 'mode', 'kb', { cmd: 'modemenu' }, { s: 'quit', sa: { cmd: 'quit' } })} /></div>
          <div style={{ gridArea: 's1c3' }}><Btn def={k('del', 'del', 'kb', { cmd: 'del' }, { s: 'ins' })} /></div>
          <div style={{ gridArea: 's2c1' }}><Btn def={k('alpha', 'alpha', 'ka', { cmd: 'alpha' }, { s: 'A-lock' })} /></div>
          <div style={{ gridArea: 's2c2' }}><Btn def={k('X', 'x,T,θ,n', 'kb', { ins: 'X' })} /></div>
          <div style={{ gridArea: 's2c3' }}><Btn def={k('stat', 'stat', 'kb', { cmd: 'statmenu' }, { s: 'list' })} /></div>
          <div className="dpad" style={{ gridArea: 'dpad' }}>
            <button className="ar up" onClick={() => press(k('up', '', 'kg', { cmd: 'up' }))}>▲</button>
            <button className="ar left" onClick={() => press(k('left', '', 'kg', { cmd: 'left' }))}>◀</button>
            <button className="ar right" onClick={() => press(k('right', '', 'kg', { cmd: 'right' }))}>▶</button>
            <button className="ar down" onClick={() => press(k('down', '', 'kg', { cmd: 'down' }))}>▼</button>
          </div>
        </div>

        <div className="grid">
          {ROWS.flat().map((key) => (<div className="cell" key={key.id}><Btn def={key} /></div>))}
        </div>

        <div className="foot"><span className="ti">TI</span> TEXAS INSTRUMENTS</div>
      </div>

      {showApps && <EquationSolver title="PlySmlt2 — Equation Solver" accent="#2f6cab" onClose={() => setShowApps(false)} />}

      <style jsx>{`
        .wrap { min-height: 100dvh; display: flex; justify-content: center; align-items: flex-start; background: #e9eaec; padding: 10px; box-sizing: border-box; }
        .backBtn, .switchBtn { position: fixed; top: 10px; z-index: 50; color: #fff;
          font: 600 13px/1 'Helvetica Neue',Arial,sans-serif; text-decoration: none; padding: 9px 13px; border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,.28); -webkit-tap-highlight-color: transparent; }
        .backBtn { left: 10px; background: rgba(20,22,26,.86); }
        .switchBtn { right: 10px; background: rgba(40,70,120,.92); }
        .backBtn:active { background: #000; }
        .calc { width: 100%; max-width: 420px; background: linear-gradient(#fdfdfc,#e8e8e4); border: 1px solid #d3d3cf; border-radius: 30px; padding: 14px 16px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.22); box-sizing: border-box; }
        .head { text-align: center; margin-bottom: 8px; }
        .model { font: 700 17px/1 'Helvetica Neue',Arial,sans-serif; color: #1a1a1a; }
        .py { font: 9px/1 Arial; letter-spacing: 3px; color: #777; margin-top: 3px; }
        .bezel { position: relative; background: linear-gradient(#34373c,#0b0c0f); border-radius: 14px; padding: 12px; box-shadow: inset 0 2px 6px rgba(0,0,0,.6); }
        .lcd { background: #eef0e8; border-radius: 3px; height: 236px; overflow-y: auto; padding: 6px 8px; font-family: 'Consolas','SF Mono',monospace; color: #1a1f26; -webkit-overflow-scrolling: touch; }
        .status { font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; border-bottom: 1px solid #c9cfc6; padding-bottom: 2px; margin-bottom: 4px; }
        .histItem { margin-bottom: 2px; }
        .hi-in { font-size: 14px; } .hi-out { font-size: 15px; font-weight: 700; text-align: right; } .hi-err { color: #b00; }
        .entryLine { font-size: 15px; word-break: break-all; min-height: 18px; }
        .caret { display: inline-block; width: 7px; height: 15px; margin: 0 -1px; vertical-align: -2px; background: #1a1f26; animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .yrow, .wrow { display: flex; align-items: center; font-size: 14px; padding: 1px 2px; border-radius: 2px; }
        .yrow.sel, .wrow.sel { background: #d6e7c8; }
        .ysw { width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; flex: none; }
        .ylab { font-weight: 700; } .yexpr, .wval { word-break: break-all; }
        .wlab { width: 64px; font-weight: 700; }
        .hint { font-size: 11px; color: #5a6675; margin-top: 8px; }
        .tbl { font-size: 13px; }
        .trow { display: flex; border-bottom: 1px solid #d6dccf; }
        .trow.thead { font-weight: 700; border-bottom: 1.5px solid #9aa3ad; }
        .tc { flex: 1; padding: 2px 4px; text-align: right; border-left: 1px solid #d6dccf; overflow: hidden; white-space: nowrap; }
        .tc:first-child { border-left: none; }
        .tc.rc { flex: 0 0 24px; text-align: center; color: #6b7682; }
        .tc.csel { background: #cfe0c0; }
        .tc.cellsel { background: #d6e7c8; }
        .srow { display: flex; font-size: 14px; padding: 2px 2px; border-bottom: 1px solid #e3e8dc; }
        .slab { width: 76px; font-weight: 700; }
        .sval { flex: 1; word-break: break-all; }
        .graphWrap { position: relative; height: 100%; }
        .cv { width: 100%; height: 100%; display: block; border-radius: 2px; }
        .traceBar { position: absolute; left: 0; bottom: 0; right: 0; background: rgba(238,240,232,.92); font-size: 12px; font-weight: 700; padding: 2px 4px; }
        .overlay { position: absolute; inset: 12px; background: rgba(20,22,26,.55); display: flex; align-items: center; justify-content: center; border-radius: 3px; }
        .ov { background: #eef0e8; border: 2px solid #1a1f26; border-radius: 4px; padding: 10px 12px; width: 88%; font-family: monospace; color: #1a1f26; }
        .ov-title { font-weight: 700; text-align: center; border-bottom: 1px solid #1a1f26; margin-bottom: 8px; }
        .ov-row { display: flex; align-items: center; gap: 6px; font-size: 13px; } .ov-row span { width: 52px; }
        .ov-row button { flex: 1; padding: 6px; border: 1px solid #8a8f86; background: #fff; border-radius: 4px; font: 12px monospace; }
        .ov-row button.on { background: #1a1f26; color: #eef0e8; }
        .ov-close { margin-top: 10px; width: 100%; padding: 7px; border: none; background: #1a1f26; color: #eef0e8; border-radius: 4px; font: 12px monospace; }
        .zgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .zgrid button { padding: 8px; border: 1px solid #8a8f86; background: #fff; border-radius: 4px; font: 12px monospace; }
        .toast { position: absolute; left: 12px; right: 12px; bottom: 16px; background: rgba(20,22,26,.9); color: #fff; font: 12px/1.3 Arial; padding: 8px 10px; border-radius: 7px; text-align: center; }
        .grow { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; margin: 12px 0 15px; }
        .fcell { display: flex; flex-direction: column; }
        .flab { height: 11px; text-align: center; white-space: nowrap; }
        .fs { font-size: 8px; color: #2f6cab; font-weight: 600; } .ffk { font-size: 7px; color: #8a8d90; }
        .pad { display: grid; column-gap: 7px; row-gap: 15px; margin-bottom: 15px; grid-template-columns: repeat(5,1fr); grid-template-areas: 's1c1 s1c2 s1c3 dpad dpad' 's2c1 s2c2 s2c3 dpad dpad'; }
        .dpad { position: relative; background: linear-gradient(#dde0e2,#b0b4b6); border: 1px solid #9ca0a2; border-radius: 50%; aspect-ratio: 1; align-self: center; justify-self: center; width: 86%; box-shadow: 0 1px 2px rgba(0,0,0,.35); }
        .ar { position: absolute; border: none; background: transparent; color: #2a2a2a; font-size: 12px; width: 34%; height: 34%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ar.up { top: 2%; left: 33%; } .ar.down { bottom: 2%; left: 33%; } .ar.left { left: 2%; top: 33%; } .ar.right { right: 2%; top: 33%; }
        .grid { display: grid; grid-template-columns: repeat(5,1fr); column-gap: 7px; row-gap: 15px; }
        .cell { display: block; }
        .foot { text-align: center; margin-top: 12px; font: 700 10px Arial; color: #3a3a3a; letter-spacing: .4px; }
        .ti { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: #c01722; color: #fff; font-size: 7px; margin-right: 5px; vertical-align: middle; }
      `}</style>
      <style jsx global>{`
        .key { position: relative; width: 100%; aspect-ratio: 1.7/1; min-height: 40px; border-radius: 8px; border: 0.5px solid #0f0f11; cursor: pointer; padding: 0; overflow: visible; box-shadow: 0 1.4px 2px rgba(0,0,0,.42); -webkit-tap-highlight-color: transparent; font-family: 'Helvetica Neue',Arial,sans-serif; transition: transform .04s, filter .04s; }
        .key:active { transform: translateY(1px); filter: brightness(.9); }
        .key.kb { background: linear-gradient(#46464b,#1c1c1f 60%,#242427); }
        .key.kw { background: linear-gradient(#ffffff,#e6e6e2); border-color: #cfcfcb; }
        .key.kg { background: linear-gradient(#dde0e2,#b0b4b6); border-color: #9ca0a2; }
        .key.k2 { background: linear-gradient(#5a93cf,#235488); border-color: #1d4773; }
        .key.ka { background: linear-gradient(#6cbb5b,#347626); border-color: #2a6121; }
        .key .lblP { display: flex; align-items: center; justify-content: center; height: 100%; font-weight: 700; font-size: clamp(9px,3.2vw,14px); }
        .key.kb .lblP, .key.k2 .lblP, .key.ka .lblP { color: #fff; }
        .key.kw .lblP, .key.kg .lblP { color: #1b1b1b; }
        .key .lblS, .key .lblA { position: absolute; top: -12px; font-size: 9.5px; font-weight: 600; line-height: 1; white-space: nowrap; opacity: .95; }
        .key .lblS { left: 1px; color: #2f6cab; } .key .lblA { right: 1px; color: #3f8a34; }
        .key.hot2 .lblS { background: #2f6cab; color: #fff; border-radius: 3px; padding: 1px 2px; }
        .key.hota .lblA { background: #3f8a34; color: #fff; border-radius: 3px; padding: 1px 2px; }
      `}</style>
    </div>
  );
}

function toFraction(x: number): string | null {
  if (!isFinite(x) || Number.isInteger(x)) return null;
  const sign = x < 0 ? '-' : ''; const v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v, n = 0;
  do { const a = Math.floor(b); [h0, h1] = [h1, a * h1 + h0]; [k0, k1] = [k1, a * k1 + k0]; const d = b - a; if (d < 1e-12) break; b = 1 / d; }
  while (++n < 40 && k1 < 1e6 && Math.abs(v - h1 / k1) > v * 1e-12);
  if (k1 < 2 || k1 > 100000 || Math.abs(v - h1 / k1) > 1e-9) return null;
  return `${sign}${h1}/${k1}`;
}
function trim(n: number): string { return parseFloat(n.toFixed(6)).toString(); }
function fmtShort(n: number): string { return parseFloat(n.toPrecision(6)).toString(); }
function nextFn(yfns: string[], cur: number, dir: number): number {
  const idxs = yfns.map((f, i) => f.trim() ? i : -1).filter((i) => i >= 0);
  if (!idxs.length) return cur;
  const pos = idxs.indexOf(cur);
  return idxs[(pos + dir + idxs.length) % idxs.length] ?? idxs[0];
}
