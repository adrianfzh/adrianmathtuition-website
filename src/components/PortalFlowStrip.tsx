'use client';

// "You are here" strip — the portal journey (Practise → Hand in → Marked work,
// with Notes at the head when that surface is live) with the current stage
// lit, plus a one-line hint saying how this page fits. Mounted on /app/practice
// and /app/marking.
//
// Dismissable per page (localStorage `portal_flow_v1_<stage>`), because it is a
// signpost, not a feature — once a student knows the shape of the portal it
// should get out of the way and stay out. Stages come from lib/portal-tour.ts,
// which drops anything the marking-only beta closes, so no chip is a dead link.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildFlowStages, flowStripKey, type FlowStageKey, type PortalSurfaces } from '@/lib/portal-tour';

export default function PortalFlowStrip({ current, surfaces }: {
  current: FlowStageKey;
  surfaces: PortalSurfaces;
}) {
  // Start hidden and reveal after the localStorage check so a dismissed strip
  // never flashes in on load.
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = true;
    try { dismissed = !!window.localStorage.getItem(flowStripKey(current)); } catch { dismissed = false; }
    setShow(!dismissed);
  }, [current]);

  if (!show) return null;

  const stages = buildFlowStages(surfaces, current);
  const here = stages.find(s => s.current);

  function dismiss() {
    setShow(false);
    try { window.localStorage.setItem(flowStripKey(current), '1'); } catch { /* private mode */ }
  }

  return (
    <div className="mb-4 rounded-2xl border border-black/5 bg-white/70 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {stages.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-gray-300 text-xs" aria-hidden>→</span>}
              {s.current ? (
                <span
                  aria-current="step"
                  className="text-xs font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-full px-2.5 py-1"
                >
                  <span className="mr-1" aria-hidden>{s.emoji}</span>{s.label}
                </span>
              ) : (
                <Link
                  href={s.href}
                  className="text-xs text-gray-500 rounded-full px-2.5 py-1 hover:text-navy hover:bg-navy/5 motion-safe:transition-colors"
                >
                  <span className="mr-1" aria-hidden>{s.emoji}</span>{s.label}
                </Link>
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this"
          className="shrink-0 text-gray-300 hover:text-gray-500 text-sm leading-none px-1.5 py-1"
        >
          ✕
        </button>
      </div>
      {here && <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">{here.hint}</p>}
    </div>
  );
}
