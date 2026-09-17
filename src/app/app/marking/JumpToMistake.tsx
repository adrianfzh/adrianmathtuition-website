'use client';
// The landing for "See it on my paper" (17 Sep 2026): with ?page=N&at=0.62 the
// page scrolls so that point of page N sits mid-screen and a soft band glows
// there for two seconds. With only ?q= it does nothing (the link had no page).
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { fileHref } from '@/lib/student-files-url';

export type JumpPage = { index: number; layerUrl?: string | null; layerH?: number | null };

/** Where the question's own marks sit in the page's ink layer: the centre and height as fractions of the page, or null. */
async function measureInLayer(layerUrl: string, layerH: number, q: string): Promise<{ at: number; span: number } | null> {
  try {
    const svgText = await (await fetch(fileHref(layerUrl))).text();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
    host.innerHTML = svgText;
    document.body.appendChild(host);
    try {
      const want = q.replace(/\s+/g, '').toLowerCase();
      const groups = [...host.querySelectorAll<SVGGElement>('svg g[data-q]')].filter(g => {
        const gq = (g.getAttribute('data-q') || '').replace(/\s+/g, '').toLowerCase();
        return gq === want || gq.startsWith(want) || want.startsWith(gq);
      });
      if (!groups.length) return null;
      let top = Infinity, bottom = -Infinity;
      for (const g of groups) { try { const b = g.getBBox(); if (b.height > 0) { top = Math.min(top, b.y); bottom = Math.max(bottom, b.y + b.height); } } catch { /* unmeasurable */ } }
      if (!Number.isFinite(top) || bottom <= top) return null;
      return { at: (top + bottom) / 2 / layerH, span: (bottom - top) / layerH };
    } finally { host.remove(); }
  } catch { return null; }
}

export default function JumpToMistake({ pages = [] }: { pages?: JumpPage[] }) {
  const sp = useSearchParams();
  useEffect(() => {
    const page = sp?.get('page'); const atParam = Number(sp?.get('at') ?? ''); const q = sp?.get('q') || '';
    if (page == null || page === '') return;
    const el = document.getElementById(`page-${page}`);
    if (!el) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      // Pixel-exact when the page has the marker's layer and the question is in it; else the marker's region words.
      let frac = Number.isFinite(atParam) ? Math.max(0, Math.min(1, atParam)) : 0.1;
      let span = 0;
      const pg = pages.find(p => String(p.index) === String(page));
      if (pg?.layerUrl && pg.layerH && q) {
        const m = await measureInLayer(pg.layerUrl, pg.layerH, q);
        if (m) { frac = m.at; span = m.span; }
      }
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      const y = window.scrollY + r.top + r.height * frac - window.innerHeight / 2;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      const bandH = Math.max(80, Math.round(r.height * span) + 24);
      const band = document.createElement('div');
      band.style.cssText = `position:absolute;left:0;right:0;top:${Math.max(0, r.height * frac - bandH / 2)}px;height:${bandH}px;border-radius:12px;background:rgba(245,158,11,0.28);box-shadow:0 0 0 2px rgba(245,158,11,0.5);pointer-events:none;transition:opacity .6s;`;
      el.style.position = 'relative';
      el.appendChild(band);
      setTimeout(() => { band.style.opacity = '0'; setTimeout(() => band.remove(), 700); }, 2000);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  return null;
}
