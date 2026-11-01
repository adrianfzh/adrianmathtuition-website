'use client';

// ‹ Hub — a way back to the admin hub on EVERY admin page (1 Nov 2026, Adrian, on the
// Question Bank in the home-screen app: "There is no back button to go back to admin hub.
// Make sure all pages have back buttons"). Inside the installed admin app there is no
// browser toolbar, so a page without its own link to /admin was a dead end — 38 of them.
//
// One pill, mounted once in app/admin/layout.tsx, bottom-left (headers live top-left and
// the iOS status bar sits over the top edge; the basket / save bars sit bottom-right or
// span the bottom and keep their own z-index above ours where they need it).
// It steps aside when the page already shows its own link to the hub (a[href="/admin"]),
// on the hub itself, on /admin/file (its own ← Back), and when printing.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const SKIP = new Set(['/admin', '/admin/file']);

function pageHasHubLink(): boolean {
  const links = document.querySelectorAll('a[href="/admin"]:not([data-hub-back])');
  for (const a of Array.from(links)) {
    const el = a as HTMLElement;
    if (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') return true;
  }
  return false;
}

export default function AdminHubBack() {
  const pathname = usePathname() || '';
  const skip = SKIP.has(pathname.replace(/\/$/, '') || '/admin');
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (skip) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setHidden(pageHasHubLink()));
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [skip, pathname]);

  if (skip || hidden) return null;
  return (
    <a
      href="/admin"
      data-hub-back=""
      aria-label="Back to admin hub"
      className="admin-hub-back"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 30,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 14px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        color: '#334155',
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      ‹ Hub
      <style>{'@media print{.admin-hub-back{display:none!important}}'}</style>
    </a>
  );
}
