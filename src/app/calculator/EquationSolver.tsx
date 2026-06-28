'use client';

// Shared equation solver — TI-84 PlySmlt2 and Casio Equation mode.
// Polynomial roots (quadratic / cubic) and simultaneous linear systems (2 / 3
// unknowns). Coefficient entry via tap-to-focus inputs (mobile keyboard).
import { useState } from 'react';
import { quadratic, cubic, linear2, linear3, formatRoot } from '@/lib/ti84/solve';

type Mode = 'quad' | 'cubic' | 'sim2' | 'sim3';

const TABS: { id: Mode; label: string; eqn: string }[] = [
  { id: 'quad', label: 'Quadratic', eqn: 'ax² + bx + c = 0' },
  { id: 'cubic', label: 'Cubic', eqn: 'ax³ + bx² + cx + d = 0' },
  { id: 'sim2', label: '2 unknowns', eqn: 'a₁x + b₁y = c₁  ·  a₂x + b₂y = c₂' },
  { id: 'sim3', label: '3 unknowns', eqn: 'aᵢx + bᵢy + cᵢz = dᵢ' },
];

export default function EquationSolver({ title, accent, onClose }: { title: string; accent: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('quad');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string[] | null>(null);

  const num = (k: string) => { const v = parseFloat((vals[k] || '').replace(/[−–]/g, '-')); return isFinite(v) ? v : 0; };
  const set = (k: string, v: string) => { setVals((s) => ({ ...s, [k]: v })); setResult(null); };

  const solve = () => {
    if (mode === 'quad') { const r = quadratic(num('a'), num('b'), num('c')); setResult(r.length ? r.map((x, i) => `x${sub(i + 1)} = ${formatRoot(x)}`) : ['No solution']); }
    else if (mode === 'cubic') { const r = cubic(num('a'), num('b'), num('c'), num('d')); setResult(r.map((x, i) => `x${sub(i + 1)} = ${formatRoot(x)}`)); }
    else if (mode === 'sim2') { const s = linear2(num('a1'), num('b1'), num('c1'), num('a2'), num('b2'), num('c2')); setResult(s ? [`x = ${fmt(s.x)}`, `y = ${fmt(s.y)}`] : ['No unique solution']); }
    else { const s = linear3([[num('a1'), num('b1'), num('c1'), num('d1')], [num('a2'), num('b2'), num('c2'), num('d2')], [num('a3'), num('b3'), num('c3'), num('d3')]]); setResult(s ? [`x = ${fmt(s.x)}`, `y = ${fmt(s.y)}`, `z = ${fmt(s.z)}`] : ['No unique solution']); }
  };

  const clearAll = () => { setVals({}); setResult(null); };

  // coefficient layout per mode
  const grids: Record<Mode, { k: string; lbl: string }[][]> = {
    quad: [[{ k: 'a', lbl: 'a' }, { k: 'b', lbl: 'b' }, { k: 'c', lbl: 'c' }]],
    cubic: [[{ k: 'a', lbl: 'a' }, { k: 'b', lbl: 'b' }, { k: 'c', lbl: 'c' }, { k: 'd', lbl: 'd' }]],
    sim2: [[{ k: 'a1', lbl: 'a₁' }, { k: 'b1', lbl: 'b₁' }, { k: 'c1', lbl: 'c₁' }], [{ k: 'a2', lbl: 'a₂' }, { k: 'b2', lbl: 'b₂' }, { k: 'c2', lbl: 'c₂' }]],
    sim3: [[{ k: 'a1', lbl: 'a₁' }, { k: 'b1', lbl: 'b₁' }, { k: 'c1', lbl: 'c₁' }, { k: 'd1', lbl: 'd₁' }], [{ k: 'a2', lbl: 'a₂' }, { k: 'b2', lbl: 'b₂' }, { k: 'c2', lbl: 'c₂' }, { k: 'd2', lbl: 'd₂' }], [{ k: 'a3', lbl: 'a₃' }, { k: 'b3', lbl: 'b₃' }, { k: 'c3', lbl: 'c₃' }, { k: 'd3', lbl: 'd₃' }]],
  };
  const eqn = TABS.find((t) => t.id === mode)!.eqn;

  return (
    <div className="eqwrap">
      <div className="eqcard">
        <div className="eqhead" style={{ background: accent }}>
          <span>{title}</span>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="eqtabs">
          {TABS.map((t) => (
            <button key={t.id} className={mode === t.id ? 'on' : ''} style={mode === t.id ? { background: accent } : undefined}
              onClick={() => { setMode(t.id); setResult(null); }}>{t.label}</button>
          ))}
        </div>
        <div className="eqeqn">{eqn}</div>
        <div className="eqgrid">
          {grids[mode].map((row, ri) => (
            <div key={ri} className="eqrow">
              {row.map((f) => (
                <label key={f.k} className="eqfield">
                  <span>{f.lbl}</span>
                  <input inputMode="decimal" value={vals[f.k] ?? ''} onChange={(e) => set(f.k, e.target.value)} />
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="eqactions">
          <button className="eqsolve" style={{ background: accent }} onClick={solve}>Solve</button>
          <button className="eqclear" onClick={clearAll}>Clear</button>
        </div>
        {result && (
          <div className="eqresult">
            {result.map((r, i) => <div key={i}>{r}</div>)}
          </div>
        )}
      </div>
      <style jsx>{`
        .eqwrap { position: fixed; inset: 0; z-index: 60; background: rgba(15,17,20,.55); display: flex; align-items: flex-start; justify-content: center; padding: 60px 12px 12px; box-sizing: border-box; }
        .eqcard { width: 100%; max-width: 420px; background: #fbfbfa; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,.4); font-family: 'Helvetica Neue',Arial,sans-serif; }
        .eqhead { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; color: #fff; font-weight: 700; font-size: 15px; }
        .eqhead button { background: rgba(255,255,255,.25); border: none; color: #fff; width: 26px; height: 26px; border-radius: 50%; font-size: 13px; cursor: pointer; }
        .eqtabs { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; padding: 10px; }
        .eqtabs button { padding: 8px 2px; border: 1px solid #d7d7d3; background: #fff; border-radius: 8px; font-size: 11px; font-weight: 600; color: #333; cursor: pointer; }
        .eqtabs button.on { color: #fff; border-color: transparent; }
        .eqeqn { text-align: center; font-size: 13px; color: #555; padding: 2px 10px 10px; font-family: 'Cambria Math',Georgia,serif; }
        .eqgrid { padding: 0 12px 6px; display: flex; flex-direction: column; gap: 8px; }
        .eqrow { display: flex; gap: 8px; justify-content: center; }
        .eqfield { display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 80px; }
        .eqfield span { font-size: 12px; color: #666; margin-bottom: 2px; }
        .eqfield input { width: 100%; box-sizing: border-box; padding: 9px 4px; text-align: center; border: 1px solid #cfcfcb; border-radius: 8px; font-size: 16px; background: #fff; }
        .eqfield input:focus { outline: none; border-color: #888; }
        .eqactions { display: flex; gap: 8px; padding: 12px; }
        .eqsolve { flex: 2; padding: 12px; border: none; border-radius: 10px; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; }
        .eqclear { flex: 1; padding: 12px; border: 1px solid #cfcfcb; background: #fff; border-radius: 10px; font-weight: 600; cursor: pointer; }
        .eqresult { margin: 0 12px 14px; padding: 12px 14px; background: #f1f5ec; border: 1px solid #d5e0c8; border-radius: 10px; font: 700 16px/1.6 'Consolas','SF Mono',monospace; color: #16201a; }
      `}</style>
    </div>
  );
}

function sub(n: number): string { return ['₀', '₁', '₂', '₃', '₄', '₅'][n] ?? String(n); }
function fmt(n: number): string { const s = parseFloat(n.toPrecision(10)).toString(); return s.replace(/^(-?)0\./, '$1.'); }
