'use client';
// 🧪 Science — the science bank's figure flags (3 Oct 2026, Adrian: "add the
// science flags to the Check page"). The figure sweep over the science bank files
// its defects in the science project's figure_flags; a science image question is
// served only once its row is 'clean', so every card here is a question students
// cannot see yet. Accept = the figure is fine (the row opens when nothing else
// holds it) · Keep hidden · Repair (recorded, stays held for the repair).

import { useCallback, useEffect, useState } from 'react';

type SciItem = {
  path: string; qid: string; status: string; severity: string; verdict: string; reason: string;
  src: string; subject: string; level: string; source: string; text: string; answer: string;
  rowStatus: string | null; quarantined: boolean;
};
type Action = 'accept' | 'hide' | 'repair';

const PAGE = 24;
const border = '#e2e8f0';
const muted = '#64748b';

export default function ScienceLane() {
  const [view, setView] = useState<'held' | 'open'>('held');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<SciItem[]>([]);
  const [totals, setTotals] = useState({ held: 0, open: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [cardErr, setCardErr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/admin/figures-bank?kind=science&view=${view}&page=${page}&pageSize=${PAGE}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? `failed (${r.status})`); return; }
      setItems(d.items ?? []);
      if (d.totals) setTotals(d.totals);
      if (!(d.items ?? []).length && page > 0) setPage(0);
    } catch { setErr('network error'); } finally { setLoading(false); }
  }, [view, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (it: SciItem, action: Action) => {
    if (busy) return;
    const key = it.path + it.qid;
    setBusy(key); setCardErr((e) => ({ ...e, [key]: '' }));
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'science', action, path: it.path, questionId: it.qid }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setCardErr((e) => ({ ...e, [key]: d.step ? `${d.step}: ${d.error}` : (d.error ?? `failed (${r.status})`) })); return; }
      setItems((cur) => cur.filter((x) => x.path + x.qid !== key));
      setTotals((t) => ({ ...t, [view]: Math.max(0, t[view] - 1) }));
    } catch { setCardErr((e) => ({ ...e, [key]: 'network error — nothing was written' })); }
    finally { setBusy(''); }
  };

  const total = view === 'held' ? totals.held : totals.open;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);
  const btn = (bg: string, fg: string, bd: string) => ({
    fontSize: 13.5, fontWeight: 700, color: fg, background: bg, border: `1px solid ${bd}`,
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {(['held', 'open'] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setPage(0); }}
            style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              color: view === v ? '#fff' : '#374151', background: view === v ? '#0f766e' : '#fff',
              border: `1px solid ${view === v ? '#0f766e' : border}` }}>
            {v === 'held' ? `Held · ${totals.held}` : `Wrong figure / shows the answer · ${totals.open}`}
          </button>
        ))}
        <span style={{ fontSize: 13, color: muted, marginLeft: 'auto' }}>page {page + 1} / {lastPage + 1}</span>
        <button disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}
          style={{ fontSize: 13, border: `1px solid ${border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
        <button disabled={page >= lastPage || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
          style={{ fontSize: 13, border: `1px solid ${border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {!loading && !err && items.length === 0 && (
        <div style={{ color: muted, fontSize: 14, padding: 24, textAlign: 'center' }}>Nothing here.</div>
      )}
      {items.map((it) => {
        const key = it.path + it.qid;
        return (
          <div key={key} style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{it.subject || it.level}</span>
              <span style={{ color: muted }}>{it.source}</span>
              <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6,
                background: it.severity === 'blocks-answering' || it.status === 'open' ? '#fef2f2' : '#f1f5f9',
                color: it.severity === 'blocks-answering' || it.status === 'open' ? '#b91c1c' : '#475569' }}>
                {it.verdict}{it.severity && it.severity !== 'null' ? ` · ${it.severity}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>{it.reason}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.src} alt="" loading="lazy"
              style={{ maxWidth: '100%', maxHeight: 420, display: 'block', margin: '0 auto 8px', border: `1px solid ${border}`, borderRadius: 6 }} />
            <details style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', color: muted }}>The question{it.answer ? ` · answer ${it.answer.slice(0, 40)}` : ''}</summary>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{it.text}</div>
            </details>
            {it.quarantined && <div style={{ fontSize: 12.5, color: '#b45309', marginBottom: 6 }}>This question is quarantined — accepting the figure will not open it.</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button disabled={!!busy} onClick={() => act(it, 'accept')} style={btn('#059669', '#fff', '#059669')}>✓ Figure is fine</button>
              <button disabled={!!busy} onClick={() => act(it, 'repair')} style={btn('#fff', '#0369a1', '#0369a1')}>🛠 Repair</button>
              <button disabled={!!busy} onClick={() => act(it, 'hide')} style={btn('#fff', '#b91c1c', '#b91c1c')}>Keep hidden</button>
              {busy === key && <span style={{ fontSize: 13, color: muted, alignSelf: 'center' }}>saving…</span>}
            </div>
            {cardErr[key] && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{cardErr[key]}</div>}
          </div>
        );
      })}
    </div>
  );
}
