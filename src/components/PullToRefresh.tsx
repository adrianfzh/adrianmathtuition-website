'use client';
// Custom pull-to-refresh for the admin app. The admin pages run as a standalone
// PWA (no browser chrome → no native pull-to-refresh) and globals.css sets
// overscroll-behavior:contain, so we implement the gesture ourselves: pull down
// while scrolled to the top → spinner → full reload.
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;   // px (after damping) to trigger a refresh

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      startY.current = atTop() ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busy.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && atTop()) {
        e.preventDefault();                       // take over the gesture
        const damped = Math.min(dy * 0.5, 110);
        pullRef.current = damped;
        setPull(damped);
      } else {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
      }
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        busy.current = true;
        setRefreshing(true);
        setPull(THRESHOLD);
        setTimeout(() => window.location.reload(), 150);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  return (
    <>
      <div aria-hidden style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: pull,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        overflow: 'hidden', pointerEvents: 'none', zIndex: 9999,
        transition: refreshing || pull === 0 ? 'height 0.2s ease' : 'none',
      }}>
        <div style={{
          paddingBottom: 10, fontSize: 20, color: '#64748b', lineHeight: 1,
          transform: refreshing ? 'none' : `rotate(${Math.min(pull * 2.4, 180)}deg)`,
          animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
        }}>{refreshing ? '⟳' : ready ? '↑' : '↓'}</div>
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
      {children}
    </>
  );
}
