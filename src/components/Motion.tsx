'use client';

// Lightweight scroll-motion primitives for the marketing pages. No animation
// library — IntersectionObserver + CSS transitions. All three respect
// prefers-reduced-motion (content shows instantly, no movement).

import { useEffect, useRef, useState, type ReactNode } from 'react';

function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Fade-and-rise into view. `delay` (ms) staggers items in a grid. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : 'translateY(26px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Number that counts up when scrolled into view (e.g. 500 with suffix "+"). */
export function CountUp({ value, suffix = '', duration = 1300, className = '' }: { value: number; suffix?: string; duration?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return <span ref={ref} className={className}>{n}{suffix}</span>;
}

/** Animated minutes-per-student bar for the attention comparison. */
export function MinutesBar({ minutes, max, barClass, trackClass = 'bg-white/10' }: { minutes: number; max: number; barClass: string; trackClass?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className={`h-3 rounded-full overflow-hidden ${trackClass}`}>
      <div
        className={`h-full rounded-full ${barClass}`}
        style={{
          width: inView ? `${(minutes / max) * 100}%` : '0%',
          transition: 'width 1.4s cubic-bezier(0.16,1,0.3,1) 200ms',
        }}
      />
    </div>
  );
}
