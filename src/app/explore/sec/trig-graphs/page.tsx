'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import katex from 'katex';

// ── Types & constants ──────────────────────────────────────────────────────────

type FnType = 'sin' | 'cos' | 'tan';
type Mode   = 'rad' | 'deg';

const FN_MAP: Record<FnType, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
};

function baseRange(mode: Mode) {
  return mode === 'rad'
    ? { xMin: -2 * Math.PI, xMax: 2 * Math.PI, span: 4 * Math.PI }
    : { xMin: -360, xMax: 360, span: 720 };
}

// ── Maths helpers ──────────────────────────────────────────────────────────────

function nearlyEq(x: number, y: number, tol = 0.04) { return Math.abs(x - y) < tol; }

function formatPi(ratio: number): string {
  if (nearlyEq(ratio, Math.round(ratio))) {
    const n = Math.round(ratio);
    return n === 1 ? 'π' : `${n}π`;
  }
  for (const den of [2, 3, 4, 6, 8]) {
    const num = ratio * den;
    if (nearlyEq(num, Math.round(num))) {
      const n = Math.round(num);
      return `${n === 1 ? 'π' : `${n}π`}/${den}`;
    }
  }
  return (ratio * Math.PI).toFixed(2);
}

function buildLatex(fnType: FnType, a: number, b: number, c: number, mode: Mode): string {
  const aR = parseFloat(a.toFixed(3));
  const bR = parseFloat(b.toFixed(3));
  const cR = parseFloat(c.toFixed(3));
  let eq = 'y = ';
  if (!nearlyEq(aR, 1) && !nearlyEq(aR, -1)) eq += `${aR}\\,`;
  else if (nearlyEq(aR, -1)) eq += '-';
  eq += `\\${fnType}(`;
  eq += nearlyEq(bR, 1) ? 'x' : `${bR}x`;
  if (mode === 'deg') eq += '^{\\circ}';
  eq += ')';
  if (!nearlyEq(cR, 0)) eq += cR > 0 ? ` + ${cR}` : ` - ${Math.abs(cR)}`;
  return eq;
}

// Show integers without decimal point; show floats with up to 2 d.p. (trailing zeros stripped)
function smartFmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function computeFeatures(fnType: FnType, a: number, b: number, c: number, mode: Mode) {
  const aAbs = Math.abs(a);
  let period: string;
  if (mode === 'deg') {
    const pDeg = (fnType === 'tan' ? 180 : 360) / Math.abs(b);
    period = `${smartFmt(pDeg)}°`;
  } else {
    period = formatPi((fnType === 'tan' ? 1 : 2) / Math.abs(b));
  }
  if (fnType === 'tan') return { amplitude: '— (none)', period, range: '(−∞, ∞)', max: '—', min: '—' };
  const ymax = aAbs + c, ymin = -aAbs + c;
  const fmt = (v: number) => smartFmt(v).replace('-', '−');
  return { amplitude: smartFmt(aAbs), period, range: `[${fmt(ymin)}, ${fmt(ymax)}]`, max: fmt(ymax), min: fmt(ymin) };
}

// ── Presets & canvas colours ───────────────────────────────────────────────────

const PRESETS = [
  { label: 'y = sin x',    a: 1,  b: 1, c: 0 },
  { label: 'y = 2 sin x',  a: 2,  b: 1, c: 0 },
  { label: 'y = sin 2x',   a: 1,  b: 2, c: 0 },
  { label: 'y = −sin x',   a: -1, b: 1, c: 0 },
  { label: 'y = 3sin2x+1', a: 3,  b: 2, c: 1 },
];

const CC = {
  bg:       'hsl(210,25%,97%)',
  grid:     'rgba(0,0,0,0.06)',
  axis:     'hsla(220,40%,13%,0.35)',
  label:    'hsla(220,40%,13%,0.5)',
  baseline: 'rgba(180,120,0,0.4)',
  curve:    'hsl(220,60%,20%)',
};

// ── Scoped CSS ─────────────────────────────────────────────────────────────────

const CSS = `
  .trig-layout {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .trig-layout { grid-template-columns: 1fr; }
  }

  /* param card: desktop */
  .param-letter { font-size: 36px; }
  .param-role   { font-size: 12px; }
  .param-card   { padding: 16px 20px; gap: 10px; }
  /* param card: mobile */
  @media (max-width: 540px) {
    .param-letter { font-size: 20px !important; }
    .param-role   { display: none !important; }
    .param-card   { padding: 10px 10px !important; gap: 6px !important; }
    .param-input  { font-size: 14px !important; padding: 6px 8px !important; }
  }

  .btn-short { display: none; }

  .param-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 18px;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    color: hsl(220,60%,20%);
    background: hsl(210,20%,98%);
    border: 1.5px solid hsl(220,15%,85%);
    border-radius: 8px;
    outline: none;
    text-align: center;
    transition: border-color 0.15s, box-shadow 0.15s;
    -moz-appearance: textfield;
  }
  .param-input::-webkit-outer-spin-button,
  .param-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .param-input:focus {
    border-color: hsl(220,60%,20%);
    box-shadow: 0 0 0 3px hsla(220,60%,20%,0.1);
  }

  .trig-canvas-wrap {
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .trig-canvas-wrap.dragging { cursor: grabbing; }
`;

// ── Component ──────────────────────────────────────────────────────────────────

export default function TrigGraphsPage() {
  const [fnType,  setFnType]  = useState<FnType>('sin');
  const [mode,    setMode]    = useState<Mode>('rad');
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [c, setC] = useState(0);
  const [aStr, setAStr] = useState('1');
  const [bStr, setBStr] = useState('1');
  const [cStr, setCStr] = useState('0');
  const [xOffset, setXOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eqRef     = useRef<HTMLDivElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  const dragInfo       = useRef({ active: false, startPixel: 0, startOffset: 0 });
  const canvasCssWidth = useRef(600);

  // ── Commit helpers ───────────────────────────────────────────────────────────

  function commitA(s: string) { const v = parseFloat(s); if (!isNaN(v)) setA(v); }
  function commitB(s: string) { const v = parseFloat(s); if (!isNaN(v) && v !== 0) setB(v); }
  function commitC(s: string) { const v = parseFloat(s); if (!isNaN(v)) setC(v); }

  // ── KaTeX equation ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!eqRef.current) return;
    try {
      eqRef.current.innerHTML = katex.renderToString(
        buildLatex(fnType, a, b, c, mode),
        { throwOnError: false, displayMode: true },
      );
    } catch {
      eqRef.current.textContent = buildLatex(fnType, a, b, c, mode);
    }
  }, [fnType, a, b, c, mode]);

  // ── Canvas draw ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const W = Math.max(100, Math.min(rect.width, 900));
    const H = Math.round(W * 0.55);
    const dpr = window.devicePixelRatio || 1;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;
    canvasCssWidth.current = W;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const { xMin: bxMin, xMax: bxMax } = baseRange(mode);
    const xMin = bxMin + xOffset;
    const xMax = bxMax + xOffset;

    // Y range
    let yMin: number, yMax: number;
    if (fnType === 'tan') { yMin = -5; yMax = 5; }
    else { const hs = Math.max(2, Math.abs(a) + Math.abs(c) + 1); yMin = -hs; yMax = hs; }

    const px = (mx: number, my: number): [number, number] => [
      ((mx - xMin) / (xMax - xMin)) * W,
      H - ((my - yMin) / (yMax - yMin)) * H,
    ];

    // Background
    ctx.fillStyle = CC.bg;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = CC.grid;
    ctx.lineWidth = 1;
    const gridStep = mode === 'rad' ? Math.PI / 2 : 90;
    for (let x = Math.ceil(xMin / gridStep) * gridStep; x <= xMax; x += gridStep) {
      const [cx] = px(x, 0);
      if (cx >= 0 && cx <= W) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); }
    }
    for (let y = Math.ceil(yMin); y <= yMax; y++) {
      const [, cy] = px(0, y);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    }

    // Axes
    const [, y0] = px(0, 0);
    const [x0]   = px(0, 0);
    ctx.strokeStyle = CC.axis;
    ctx.lineWidth = 1.5;
    if (y0 >= 0 && y0 <= H) { ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke(); }
    if (x0 >= 0 && x0 <= W) { ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke(); }

    // X labels
    ctx.fillStyle  = CC.label;
    ctx.font       = '11px ui-monospace, monospace';
    ctx.textAlign  = 'center';
    if (mode === 'rad') {
      const candidates: [number, string][] = [];
      for (let n = -8; n <= 8; n++) {
        if (n !== 0) candidates.push([n * Math.PI / 2, n % 2 === 0 ? (n === 2 ? 'π' : n === -2 ? '−π' : `${n/2}π`) : `${n === 1 ? '' : n === -1 ? '−' : n}π/2`.replace('−π/2','−π/2') ]);
      }
      // Simpler: just hardcode nice labels for a wide range
      const rLabels: [number, string][] = [
        [-4*Math.PI,'−4π'],[-7*Math.PI/2,'−7π/2'],[-3*Math.PI,'−3π'],[-5*Math.PI/2,'−5π/2'],
        [-2*Math.PI,'−2π'],[-3*Math.PI/2,'−3π/2'],[-Math.PI,'−π'],[-Math.PI/2,'−π/2'],
        [Math.PI/2,'π/2'],[Math.PI,'π'],[3*Math.PI/2,'3π/2'],[2*Math.PI,'2π'],
        [5*Math.PI/2,'5π/2'],[3*Math.PI,'3π'],[7*Math.PI/2,'7π/2'],[4*Math.PI,'4π'],
      ];
      rLabels.forEach(([x, lbl]) => {
        if (x < xMin || x > xMax) return;
        const [cx] = px(x, 0);
        if (cx > 14 && cx < W - 14) ctx.fillText(lbl, cx, Math.min(y0 + 14, H - 4));
      });
    } else {
      for (let x = Math.ceil(xMin / 90) * 90; x <= xMax; x += 90) {
        if (x === 0) continue;
        const [cx] = px(x, 0);
        if (cx > 14 && cx < W - 14) ctx.fillText(`${x}°`, cx, Math.min(y0 + 14, H - 4));
      }
    }

    // Y labels
    ctx.textAlign = 'right';
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      if (y === 0) continue;
      const [, cy] = px(0, y);
      if (cy > 8 && cy < H - 4) ctx.fillText(y.toString().replace('-','−'), Math.max(x0 - 6, 22), cy + 4);
    }

    // Curves
    function drawCurve(aV: number, bV: number, cV: number, fn: FnType, color: string, lw: number) {
      const f = FN_MAP[fn];
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const samples = 2400, dx = (xMax - xMin) / samples;
      let inPath = false, prevY: number | null = null;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = xMin + i * dx;
        const arg = mode === 'deg' ? bV * x * (Math.PI / 180) : bV * x;
        const y = aV * f(arg) + cV;
        if (!isFinite(y) || Math.abs(y) > 1000) { inPath = false; prevY = null; continue; }
        if (prevY !== null && Math.abs(y - prevY) > Math.abs(yMax - yMin) * 0.7) inPath = false;
        if (y < yMin - 0.5 || y > yMax + 0.5) { inPath = false; prevY = y; continue; }
        const [cx, cy] = px(x, y);
        if (!inPath) { ctx.moveTo(cx, cy); inPath = true; } else { ctx.lineTo(cx, cy); }
        prevY = y;
      }
      ctx.stroke();
    }

    drawCurve(1, 1, 0, fnType, CC.baseline, 2);
    drawCurve(a, b, c, fnType, CC.curve, 3);
  }, [fnType, mode, a, b, c, xOffset]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  // Reset offset when mode changes
  useEffect(() => { setXOffset(0); }, [mode]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragInfo.current = { active: true, startPixel: e.clientX, startOffset: xOffset };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragInfo.current.active) return;
    const dx = e.clientX - dragInfo.current.startPixel;
    const mathDelta = (dx / canvasCssWidth.current) * baseRange(mode).span;
    setXOffset(dragInfo.current.startOffset - mathDelta);
  }

  function onPointerUp() { dragInfo.current.active = false; setDragging(false); }

  // ── Presets / reset ──────────────────────────────────────────────────────────

  function applyPreset(pa: number, pb: number, pc: number) {
    setA(pa); setB(pb); setC(pc);
    setAStr(String(pa)); setBStr(String(pb)); setCStr(String(pc));
  }

  function reset() {
    setFnType('sin'); setA(1); setB(1); setC(0); setXOffset(0);
    setAStr('1'); setBStr('1'); setCStr('0');
  }

  const features = computeFeatures(fnType, a, b, c, mode);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{CSS}</style>
      <div style={{ background: 'hsl(210,20%,98%)', minHeight: '100vh', padding: '24px 24px 80px', fontFamily: 'var(--font-sans,system-ui,sans-serif)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          <div style={{ marginBottom: 20 }}>
            <Link href="/" style={{ color: 'hsl(220,10%,46%)', fontSize: 13, textDecoration: 'none' }}>← Home</Link>
          </div>

          <header style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: 'hsl(220,40%,13%)', margin: 0 }}>
              Trigonometric Graphs Explorer
            </h1>
            <p style={{ color: 'hsl(220,10%,46%)', fontSize: 14, marginTop: 6 }}>
              Adjust a, b, c to explore y = a · trig(bx) + c
            </p>
          </header>

          {/* Function buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['sin','cos','tan'] as FnType[]).map(fn => {
              const active = fnType === fn;
              return (
                <button key={fn} onClick={() => setFnType(fn)} style={{
                  background:   active ? 'hsl(220,60%,20%)' : 'white',
                  border:       `1px solid ${active ? 'hsl(220,60%,20%)' : 'hsl(220,15%,88%)'}`,
                  color:        active ? 'white' : 'hsl(220,10%,46%)',
                  padding:      '8px 16px',
                  borderRadius: 8,
                  fontSize:     13,
                  fontStyle:    'italic',
                  fontWeight:   active ? 700 : 400,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                  whiteSpace:   'nowrap',
                }}>
                  <span className="btn-full">y = a {fn} bx + c</span>
                  <span className="btn-short">{fn}</span>
                </button>
              );
            })}
          </div>

          {/* Rad / Deg toggle — own line */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid hsl(220,15%,88%)' }}>
              {(['rad','deg'] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  background:    mode === m ? 'hsl(220,60%,20%)' : 'white',
                  color:         mode === m ? 'white' : 'hsl(220,10%,46%)',
                  border:        'none',
                  padding:       '6px 16px',
                  fontSize:      11,
                  fontWeight:    mode === m ? 600 : 400,
                  cursor:        'pointer',
                  transition:    'all 0.15s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Parameter cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <ParamCard letter="a" role="amplitude"      value={aStr} placeholder="e.g. 2 (height)" onChange={setAStr} onCommit={commitA} />
            <ParamCard letter="b" role="frequency"      value={bStr} placeholder="e.g. 2 (speed)"  onChange={setBStr} onCommit={commitB} />
            <ParamCard letter="c" role="vertical shift" value={cStr} placeholder="e.g. 1 (up/down)" onChange={setCStr} onCommit={commitC} />
          </div>

          {/* Canvas + sidebar */}
          <div className="trig-layout">

            <div style={{ background: 'white', border: '1px solid hsl(220,15%,88%)', borderRadius: 12, padding: 20 }}>
              {/* Equation */}
              <div ref={eqRef} style={{ textAlign: 'center', padding: '14px 0 18px', borderBottom: '1px solid hsl(220,15%,88%)', marginBottom: 16, minHeight: 60 }} />

              {/* Canvas */}
              <div
                ref={wrapRef}
                className={`trig-canvas-wrap${dragging ? ' dragging' : ''}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} draggable={false} />
              </div>

              {/* Legend + re-centre */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'hsl(220,10%,46%)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display:'inline-block', width:20, height:3, borderRadius:2, background: CC.curve }} /> Your curve
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display:'inline-block', width:20, height:3, borderRadius:2, background: CC.baseline }} /> Baseline (a=1,b=1,c=0)
                  </span>
                </div>
                {xOffset !== 0 && (
                  <button onClick={() => setXOffset(0)} style={{
                    background: 'white', border: '1px solid hsl(220,60%,20%)',
                    color: 'hsl(220,60%,20%)', padding: '4px 12px',
                    borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  }}>
                    ↺ Re-centre
                  </button>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ background: 'white', border: '1px solid hsl(220,15%,88%)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(220,10%,46%)', fontWeight: 500, marginBottom: 14, marginTop: 0 }}>
                Properties
              </h3>
              {([
                ['Amplitude', features.amplitude],
                ['Period',    features.period],
                ['Range',     features.range],
                ['Max',       features.max],
                ['Min',       features.min],
              ] as [string, string][]).map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13, borderBottom: '1px solid hsl(220,15%,93%)' }}>
                  <span style={{ color: 'hsl(220,10%,46%)' }}>{lbl}</span>
                  <span style={{ color: 'hsl(220,40%,13%)', fontFamily: 'ui-monospace,monospace' }}>{val}</span>
                </div>
              ))}

              <p style={{ fontSize: 12, color: 'hsl(220,10%,46%)', margin: '16px 0 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Presets</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p.a, p.b, p.c)}
                    style={{ background: 'hsl(220,15%,95%)', border: '1px solid hsl(220,15%,88%)', color: 'hsl(220,10%,46%)', padding: '5px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'ui-monospace,monospace' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.color='hsl(220,60%,20%)'; el.style.borderColor='hsl(220,60%,20%)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.color='hsl(220,10%,46%)'; el.style.borderColor='hsl(220,15%,88%)'; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button onClick={reset}
                style={{ width: '100%', marginTop: 16, background: 'transparent', color: 'hsl(220,10%,46%)', border: '1px solid hsl(220,15%,88%)', padding: 9, borderRadius: 6, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.color='hsl(220,40%,13%)'; el.style.borderColor='hsl(220,60%,20%)'; el.style.background='hsl(220,15%,95%)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.color='hsl(220,10%,46%)'; el.style.borderColor='hsl(220,15%,88%)'; el.style.background='transparent'; }}
              >
                Reset all
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── ParamCard ──────────────────────────────────────────────────────────────────

interface ParamCardProps {
  letter: string; role: string; value: string; placeholder: string;
  onChange: (s: string) => void; onCommit: (s: string) => void;
}

function ParamCard({ letter, role, value, placeholder, onChange, onCommit }: ParamCardProps) {
  return (
    <div className="param-card" style={{ background: 'white', border: '1px solid hsl(220,15%,88%)', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="param-letter" style={{ fontWeight: 700, color: 'hsl(220,60%,20%)', fontStyle: 'italic', lineHeight: 1, fontFamily: 'var(--font-display,Georgia,serif)' }}>
          {letter}
        </span>
        <span className="param-role" style={{ color: 'hsl(220,10%,46%)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{role}</span>
      </div>
      <input
        type="number"
        className="param-input"
        value={value}
        placeholder={placeholder}
        step="any"
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value); }}
      />
    </div>
  );
}
