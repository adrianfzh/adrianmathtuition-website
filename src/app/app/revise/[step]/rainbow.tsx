'use client';
// The "Rainbow" — Adrian's way of showing an expansion (9 Oct 2026): an arrow
// from each term of the first bracket to each term of the second, numbered in
// the order they are multiplied. The first term's arrows arc above the line,
// the second term's below. `arrows` = how many are drawn so far; the newest one
// is in colour so the eye is on the piece being multiplied.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Brackets } from '@/lib/revise-step';
import type { Term } from '@/lib/poly';

const INK = '#334155';
export const ACTIVE = '#b45309';
const PAD = 48; // room above and below the line for the arcs

function Body({ t }: { t: Term }) {
  const n = Math.abs(t.coef);
  const letters = Object.keys(t.vars).sort();
  return (
    <>
      {(n !== 1 || letters.length === 0) && <span>{n}</span>}
      {letters.map(v => (
        <span key={v} style={{ fontFamily: 'KaTeX_Math, "Times New Roman", serif', fontStyle: 'italic' }}>
          {v}{t.vars[v] > 1 && <sup style={{ fontFamily: 'KaTeX_Main, serif', fontStyle: 'normal', fontSize: '0.7em' }}>{t.vars[v]}</sup>}
        </span>
      ))}
    </>
  );
}

interface Arc { d: string; lx: number; ly: number; n: number }

export default function Rainbow({ br, arrows }: { br: Brackets; arrows: number }) {
  const box = useRef<HTMLDivElement>(null);
  const spans = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const host = box.current;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    const at = (key: string) => {
      const r = spans.current.get(key)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2 - hr.left, top: r.top - hr.top, bottom: r.bottom - hr.top } : null;
    };
    const out: Arc[] = [];
    let n = 0;
    br.a.forEach((_, i) => {
      br.b.forEach((__, j) => {
        n++;
        const from = at(`a${i}`), to = at(`b${j}`);
        if (!from || !to) return;
        const above = i === 0;
        // Arrows leaving the same term fan out a little so they do not sit on each other.
        const x1 = from.x + (j - (br.b.length - 1) / 2) * 7;
        const x2 = to.x;
        const y = above ? from.top + 2 : from.bottom - 2;
        const lift = Math.min(PAD - 10, 10 + Math.abs(x2 - x1) * 0.2) * (above ? -1 : 1);
        const c = lift * 1.33;
        out.push({
          d: `M ${x1} ${y} C ${x1 + (x2 - x1) * 0.15} ${y + c}, ${x2 - (x2 - x1) * 0.15} ${y + c}, ${x2} ${y}`,
          lx: (x1 + x2) / 2, ly: y + lift, n,
        });
      });
    });
    setArcs(out);
    setSize({ w: hr.width, h: hr.height });
  }, [br]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    // The letters are set in KaTeX's faces: measure again once they have loaded.
    let live = true;
    document.fonts?.ready.then(() => { if (live) measure(); });
    window.addEventListener('resize', measure);
    return () => { live = false; window.removeEventListener('resize', measure); };
  }, [measure]);

  const term = (t: Term, idx: number, side: 'a' | 'b') => (
    <span key={`${side}${idx}`}>
      {idx === 0 ? (t.coef < 0 && <span>−</span>) : <span className="mx-[0.4em]">{t.coef < 0 ? '−' : '+'}</span>}
      <span ref={el => { if (el) spans.current.set(`${side}${idx}`, el); else spans.current.delete(`${side}${idx}`); }}><Body t={t} /></span>
    </span>
  );

  return (
    <div
      ref={box}
      className="relative inline-block text-[26px] leading-none text-slate-900 whitespace-nowrap"
      style={{ padding: `${PAD}px 2px`, fontFamily: 'KaTeX_Main, "Times New Roman", serif' }}
      role="img"
      aria-label={`${arrows} of ${br.a.length * br.b.length} arrows drawn from the first bracket to the second`}
    >
      <span>(</span>{br.a.map((t, i) => term(t, i, 'a'))}<span>)</span>
      <span className="ml-[0.12em]">(</span>{br.b.map((t, j) => term(t, j, 'b'))}<span>)</span>
      <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <defs>
          {[INK, ACTIVE].map(col => (
            <marker key={col} id={`rb-${col.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill={col} />
            </marker>
          ))}
        </defs>
        {arcs.slice(0, arrows).map(a => {
          const col = a.n === arrows ? ACTIVE : INK;
          return (
            <g key={a.n}>
              <path d={a.d} fill="none" stroke={col} strokeWidth={1.6} markerEnd={`url(#rb-${col.slice(1)})`} />
              <circle cx={a.lx} cy={a.ly} r={8} fill="white" stroke={col} strokeWidth={1.2} />
              <text x={a.lx} y={a.ly + 3.5} textAnchor="middle" fontSize={10} fontFamily="system-ui, sans-serif" fill={col}>{a.n}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
