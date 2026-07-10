'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureAdminSession } from '@/lib/admin-client';

const LEVELS = [
  { slug: 's1', label: 'S1', sub: 'Secondary 1', atLevel: 'S1', from: '#1d4ed8', to: '#3b82f6' },
  { slug: 's2', label: 'S2', sub: 'Secondary 2', atLevel: 'S2', from: '#0369a1', to: '#0ea5e9' },
  { slug: 'em', label: 'EM', sub: 'E Maths',      atLevel: 'EM', from: '#6d28d9', to: '#a855f7' },
  { slug: 'am', label: 'AM', sub: 'A Maths',      atLevel: 'AM', from: '#065f46', to: '#10b981' },
  { slug: 'jc', label: 'JC', sub: 'H2 Maths',     atLevel: 'JC', from: '#92400e', to: '#f59e0b' },
];

// Tiles render instantly; counts load afterwards (Dropbox listing is slow, and
// the pill is not worth blocking the tap on).
export default function NotesGrid() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureAdminSession();
      try {
        const res = await fetch('/api/admin-notes/counts');
        if (res.ok && alive) setCounts((await res.json()).counts ?? {});
      } catch { /* pill just stays blank */ }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {LEVELS.map(({ slug, label, sub, atLevel, from, to }, i) => {
        const isLast = i === LEVELS.length - 1 && LEVELS.length % 2 !== 0;
        const n = counts?.[atLevel];
        return (
          <Link
            key={slug}
            href={`/admin/notes/${slug}`}
            style={{
              gridColumn: isLast ? 'span 2' : undefined,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              background: `linear-gradient(140deg, ${from}, ${to})`,
              borderRadius: 20, padding: '20px 20px 18px', minHeight: isLast ? 128 : 148,
              textDecoration: 'none',
              boxShadow: `0 10px 24px -8px ${from}66, 0 2px 6px rgba(16,24,40,0.08)`,
              position: 'relative', overflow: 'hidden', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
            <div style={{ position: 'absolute', bottom: -50, right: 20, width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

            <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{
                fontSize: 11.5, fontWeight: 700, color: '#fff',
                background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 20,
                backdropFilter: 'blur(2px)', minHeight: 18, minWidth: 24, textAlign: 'center',
                opacity: n === undefined ? 0.55 : 1, transition: 'opacity .2s ease',
              }}>
                {n === undefined ? '·' : n === 0 ? 'No notes yet' : `${n} note${n === 1 ? '' : 's'}`}
              </span>
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', fontWeight: 600 }}>{sub}</span>
                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>→</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
