'use client';
// 🧺 On the shelf — the topics deliberately left out of a wave, with the
// evidence that decides the next one (SPEC-TEACHING-CYCLE step 4).
//
// Adrian's ask, 30 Aug 2026: "a dedicated place I can see the topics the sheet
// deliberately left out". Each row expands to the actual question, her score,
// and a link to her MARKED PAGE — so choosing wave 2 needs no archaeology.
import { useCallback, useEffect, useState } from 'react';

type Evidence = { q: string; prompt: string; awarded: number; max: number; error: string; annotated_url: string };
type ShelfItem = {
  id: string; topic: string; skill: string; status: 'waiting' | 'started' | 'done' | 'dropped';
  paper_name: string; marks_lost: number | null; evidence: Evidence[]; note: string | null;
  source_run_id: string | null; created_at: string;
};

const BADGE: Record<ShelfItem['status'], { bg: string; fg: string; label: string }> = {
  waiting: { bg: '#fef3c7', fg: '#92400e', label: 'waiting' },
  started: { bg: '#dbeafe', fg: '#1e40af', label: 'in progress' },
  done:    { bg: '#dcfce7', fg: '#166534', label: 'done' },
  dropped: { bg: '#f3f4f6', fg: '#6b7280', label: 'dropped' },
};

export default function ShelfSection({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/shelf?studentId=${encodeURIComponent(studentId)}`);
      const d = await r.json();
      if (r.ok) setItems(d.shelf ?? []); else setErr(d.error || 'could not load the shelf');
    } catch (e) { setErr((e as Error).message); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: ShelfItem['status']) {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/shelf', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'update failed');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  const waiting = items.filter(i => i.status === 'waiting' || i.status === 'started');
  if (!items.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>
        Left out of an earlier wave on purpose — pick the next one from here.
        {waiting.length ? ` ${waiting.length} waiting.` : ''}
      </p>
      {err && <div style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, padding: '6px 10px', borderRadius: 8, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => {
          const b = BADGE[it.status];
          const isOpen = open === it.id;
          return (
            <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', background: it.status === 'done' || it.status === 'dropped' ? '#fafafa' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : it.id)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#111827', textAlign: 'left' }}>
                  {isOpen ? '▾' : '▸'} {it.topic}
                </button>
                <span style={{ background: b.bg, color: b.fg, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>{b.label}</span>
                {it.marks_lost != null && <span style={{ fontSize: 12, color: '#6b7280' }}>{it.marks_lost} marks</span>}
                {it.paper_name && <span style={{ fontSize: 12, color: '#9ca3af' }}>· {it.paper_name}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {it.status !== 'done' && (
                    <button type="button" disabled={busy === it.id} onClick={() => setStatus(it.id, 'done')}
                      style={{ fontSize: 12, border: '1px solid #86efac', color: '#166534', background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>✓ done</button>
                  )}
                  {it.status === 'waiting' && (
                    <button type="button" disabled={busy === it.id} onClick={() => setStatus(it.id, 'dropped')}
                      style={{ fontSize: 12, border: '1px solid #e5e7eb', color: '#6b7280', background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>drop</button>
                  )}
                </span>
              </div>
              {it.skill && <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{it.skill}</div>}
              {isOpen && (
                <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {it.evidence.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No stored evidence for this one.</span>}
                  {it.evidence.map((e, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        Q{e.q} <span style={{ fontWeight: 400, color: '#b91c1c' }}>{e.awarded}/{e.max}</span>
                      </div>
                      {e.prompt && <div style={{ color: '#374151', marginTop: 2 }}>{e.prompt}</div>}
                      {e.error && <div style={{ color: '#92400e', marginTop: 2, fontStyle: 'italic' }}>{e.error}</div>}
                      {e.annotated_url && (
                        <a href={e.annotated_url} target="_blank" rel="noreferrer"
                          style={{ color: '#1d4ed8', fontSize: 12, textDecoration: 'underline' }}>
                          see her marked page ↗
                        </a>
                      )}
                    </div>
                  ))}
                  {it.note && <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{it.note}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
