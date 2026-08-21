'use client';

// First-login tour for the student portal. Four or five cards, shown once per
// device (localStorage `portal_tour_v1`), skippable from every step and
// replayable from Settings ("Replay the intro tour" clears the key and sends
// the student back to /app).
//
// Deliberately dependency-free: a bottom sheet + a ring drawn over whichever
// nav item the current step is about. Nav items carry `data-tour="…"`
// (src/app/app/layout.tsx); a step whose target is not on screen — e.g. Submit,
// which has no mobile tab on the full portal — simply shows the card with no
// ring instead of pointing at nothing.
//
// The step list comes from lib/portal-tour.ts, built from the surfaces THIS
// viewer can reach, so nothing in the tour leads to a page the marking-only
// beta bounces them off.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { buildTourSteps, PORTAL_TOUR_KEY, type PortalSurfaces } from '@/lib/portal-tour';

type Ring = { top: number; left: number; width: number; height: number };

const PAD = 6;

/** The visible element for a `data-tour` key (mobile tab vs desktop link). */
function measure(target: string | null): Ring | null {
  if (!target || typeof document === 'undefined') return null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    }
  }
  return null;
}

export default function PortalTour({ surfaces }: { surfaces: PortalSurfaces }) {
  const pathname = usePathname();
  const steps = useMemo(() => buildTourSteps(surfaces), [surfaces]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [ring, setRing] = useState<Ring | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Only ever pops up on the dashboard — nobody wants an overlay landing on
  // them mid-question. Settings' replay button routes back to /app first.
  const onDashboard = pathname === '/app';

  useEffect(() => {
    if (!onDashboard) return;
    let seen = true;
    try { seen = !!window.localStorage.getItem(PORTAL_TOUR_KEY); } catch { seen = true; }
    if (!seen) { setI(0); setOpen(true); }
  }, [onDashboard]);

  const finish = useCallback(() => {
    setOpen(false);
    try { window.localStorage.setItem(PORTAL_TOUR_KEY, '1'); } catch { /* private mode — just don't remember */ }
  }, []);

  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const next = useCallback(() => { if (last) finish(); else setI(n => n + 1); }, [last, finish]);
  const back = useCallback(() => setI(n => Math.max(0, n - 1)), []);

  // Re-measure on step change and whenever the layout moves under us.
  useEffect(() => {
    if (!open) return;
    const sync = () => setRing(measure(step?.target ?? null));
    sync();
    // Nav is sticky/fixed, but an address bar collapsing on iOS still shifts it.
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('scroll', sync, { passive: true });
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('scroll', sync);
    };
  }, [open, step?.target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, next, back]);

  useEffect(() => { if (open) nextRef.current?.focus(); }, [open, i]);

  if (!open || !step) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Portal tour">
      {/* Backdrop — tapping outside the card leaves the tour, same as Skip. */}
      <button
        type="button"
        aria-label="Skip the tour"
        onClick={finish}
        className="absolute inset-0 w-full h-full bg-navy/60 backdrop-blur-[1px] cursor-default"
      />

      {ring && (
        <div
          aria-hidden
          className="absolute rounded-2xl ring-2 ring-[hsl(43,90%,60%)] bg-white/10 pointer-events-none motion-safe:transition-all motion-safe:duration-200"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      )}

      {/* Bottom sheet — thumb-reachable, and clear of the mobile tab bar. */}
      <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6">
        <div className="mx-auto w-full max-w-sm bg-white rounded-2xl shadow-xl border border-black/5 p-5 mb-16 sm:mb-0 motion-safe:animate-[fadeIn_180ms_ease-out]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-navy text-base leading-snug">
              <span className="mr-1.5" aria-hidden>{step.emoji}</span>{step.title}
            </p>
            <button
              type="button"
              onClick={finish}
              className="shrink-0 -mt-1 -mr-1 text-xs text-gray-400 hover:text-navy px-2 py-1"
            >
              Skip
            </button>
          </div>

          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{step.body}</p>

          <div className="flex items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-1.5" aria-hidden>
              {steps.map((s, n) => (
                <span
                  key={s.key}
                  className={`h-1.5 rounded-full motion-safe:transition-all ${n === i ? 'w-4 bg-navy' : 'w-1.5 bg-gray-300'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button type="button" onClick={back} className="text-sm font-semibold text-gray-500 px-3 py-2 hover:text-navy">
                  Back
                </button>
              )}
              <button
                ref={nextRef}
                type="button"
                onClick={next}
                className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 motion-safe:transition-opacity"
              >
                {last ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
          <p className="sr-only">Step {i + 1} of {steps.length}. Press Escape to skip.</p>
        </div>
      </div>
    </div>
  );
}
