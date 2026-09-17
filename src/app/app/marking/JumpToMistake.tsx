'use client';
// The landing for "See it on my paper" (17 Sep 2026): with ?page=N&at=0.62 the
// page scrolls so that point of page N sits mid-screen and a soft band glows
// there for two seconds. With only ?q= it does nothing (the link had no page).
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function JumpToMistake() {
  const sp = useSearchParams();
  useEffect(() => {
    const page = sp?.get('page'); const at = Number(sp?.get('at') ?? '');
    if (page == null || page === '') return;
    const el = document.getElementById(`page-${page}`);
    if (!el) return;
    const frac = Number.isFinite(at) ? Math.max(0, Math.min(1, at)) : 0.1;
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const y = window.scrollY + r.top + r.height * frac - window.innerHeight / 2;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      const band = document.createElement('div');
      band.style.cssText = `position:absolute;left:0;right:0;top:${Math.max(0, r.height * frac - 40)}px;height:80px;border-radius:12px;background:rgba(245,158,11,0.28);box-shadow:0 0 0 2px rgba(245,158,11,0.5);pointer-events:none;transition:opacity .6s;`;
      el.style.position = 'relative';
      el.appendChild(band);
      setTimeout(() => { band.style.opacity = '0'; setTimeout(() => band.remove(), 700); }, 2000);
    }, 350);
    return () => clearTimeout(t);
  }, [sp]);
  return null;
}
