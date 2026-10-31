'use client';
// 📓 iPad notebooks — the student's Notebook app notebooks, read-only (SPEC-STUDENT-APP.md §0e,
// 31 Oct 2026, Adrian: "yes" to seeing a student's notebook before a lesson). Each written page
// is the picture the app sent with its backup; a tap opens it large on this page.
import { useEffect, useState } from 'react';

type Page = { n: number; url: string; verdict: string | null; summary: string | null };
type Notebook = { id: string; title: string; updatedAt: string; pageCount: number; pages: Page[] };

const VERDICT: Record<string, { label: string; color: string }> = {
  correct: { label: '✓ checked: right', color: '#166534' },
  partial: { label: '◐ checked: partly right', color: '#92400e' },
  wrong: { label: '✗ checked: wrong', color: '#b42318' },
  unreadable: { label: 'checked: couldn’t read', color: '#64748b' },
};

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export default function AppNotebooksSection({ studentId }: { studentId: string }) {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [big, setBig] = useState<Page | null>(null);

  useEffect(() => {
    fetch(`/api/admin/student-notebooks?studentId=${encodeURIComponent(studentId)}`)
      .then(async r => { const d = await r.json(); if (r.ok) setNotebooks(d.notebooks); else setErr(d.error || 'could not load'); })
      .catch(e => setErr((e as Error).message));
  }, [studentId]);

  if (err) return <p style={{ color: '#b42318', fontSize: 14 }}>{err}</p>;
  if (!notebooks) return <p style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</p>;
  if (!notebooks.length) return <p style={{ color: '#64748b', fontSize: 14 }}>No notebooks from the iPad app yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notebooks.map(nb => {
        const open = openId === nb.id;
        return (
          <div key={nb.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12 }}>
            <button onClick={() => setOpenId(open ? null : nb.id)}
              style={{ width: '100%', textAlign: 'left', padding: '12px 14px', background: 'none', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', flex: 1 }}>{nb.title}</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {nb.pages.length} written page{nb.pages.length === 1 ? '' : 's'} · changed {ago(nb.updatedAt)}
              </span>
              <span style={{ color: '#94a3b8' }}>{open ? '▾' : '▸'}</span>
            </button>
            {open && (
              <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {nb.pages.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>Nothing written yet.</p>}
                {nb.pages.map(p => (
                  <button key={p.n} onClick={() => setBig(p)}
                    style={{ padding: 0, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'zoom-in', textAlign: 'left', overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Page ${p.n}`} loading="lazy" style={{ width: '100%', display: 'block', aspectRatio: '210 / 297', objectFit: 'cover', objectPosition: 'top' }} />
                    <div style={{ padding: '6px 8px', fontSize: 12, color: '#475569' }}>
                      Page {p.n}
                      {p.verdict && VERDICT[p.verdict] && (
                        <div style={{ color: VERDICT[p.verdict].color, fontWeight: 600 }}>{VERDICT[p.verdict].label}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {big && (
        <div onClick={() => setBig(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <div style={{ width: 'min(900px, 100%)', maxHeight: '100%', overflow: 'auto', background: '#fff', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px', fontSize: 14, fontWeight: 600, color: '#0f172a', borderBottom: '1px solid #e5e7eb' }}>
              Page {big.n}{big.summary ? ` · ${big.summary}` : ''}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt={`Page ${big.n}`} style={{ width: '100%', display: 'block' }} />
          </div>
        </div>
      )}
    </div>
  );
}
