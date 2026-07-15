'use client';
// /admin/figures — visual figure review. Eyeball every figure, tick the bad ones;
// flagged figures become the Fable-regeneration worklist (table figure_regen_flags).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureAdminSession } from '@/lib/admin-client';

type Item = {
  unit_id: string; step_index: number | null; subject: string; topic: string;
  unit_order: number; kind: string; title: string; label: string; svg: string; flagged: boolean;
};

const SUBJECTS = ['AM', 'EM', 'S1', 'S2'];

function cleanSvg(svg: string) {
  return svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}

export default function FiguresPage() {
  const [subject, setSubject] = useState('AM');
  const [topic, setTopic] = useState<string>('');
  const [topics, setTopics] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureAdminSession();
    const q = new URLSearchParams({ subject, ...(topic ? { topic } : {}), ...(flaggedOnly ? { flaggedOnly: '1' } : {}) });
    const r = await fetch(`/api/admin/figures?${q}`);
    const d = await r.json();
    setItems(d.items || []); setTopics(d.topics || []);
    setLoading(false);
  }, [subject, topic, flaggedOnly]);

  useEffect(() => { load(); }, [load]);

  async function toggle(it: Item) {
    const flagged = !it.flagged;
    setItems(items.map(x => x === it ? { ...x, flagged } : x)); // optimistic
    await fetch('/api/admin/figures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: it.unit_id, step_index: it.step_index, flagged, subject: it.subject, topic: it.topic, unit_order: it.unit_order }),
    }).catch(() => load());
  }

  const flaggedCount = items.filter(i => i.flagged).length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <style>{`.fig-cell svg { width: 100%; height: auto; display: block; }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ color: '#1c3a5e', fontSize: 22, fontWeight: 800, margin: 0 }}>Figure review</h1>
        <Link href="/admin" style={{ color: '#8a97a8', fontSize: 14 }}>‹ Admin</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {SUBJECTS.map(s => (
          <button key={s} onClick={() => { setSubject(s); setTopic(''); }}
            style={{ padding: '6px 12px', borderRadius: 999, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (s === subject ? '#1c3a5e' : '#ddd'),
              background: s === subject ? '#1c3a5e' : '#fff', color: s === subject ? '#fff' : '#333' }}>{s}</button>
        ))}
        <select value={topic} onChange={e => setTopic(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          <option value="">All topics</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ fontSize: 14, color: '#555', display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} /> flagged only
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: '#8a2f3b', fontWeight: 700 }}>
          {flaggedCount} flagged{items.length ? ` / ${items.length} shown` : ''}
        </span>
      </div>

      {loading ? <p style={{ color: '#8a97a8' }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {items.map((it, idx) => (
            <div key={it.unit_id + ':' + (it.step_index ?? 'c') + idx}
              onClick={() => toggle(it)}
              style={{ cursor: 'pointer', borderRadius: 12, padding: 10, background: '#fff',
                border: '2px solid ' + (it.flagged ? '#d1495b' : '#e3ddcc'),
                boxShadow: it.flagged ? '0 0 0 3px #fdeef0' : 'none' }}>
              <div style={{ fontSize: 11, color: '#8a97a8', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{it.topic} · #{it.unit_order} · {it.label}</span>
                <span style={{ color: it.flagged ? '#d1495b' : '#bbb', fontWeight: 700 }}>{it.flagged ? '⚑ regen' : '○'}</span>
              </div>
              <div className="fig-cell" style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}
                dangerouslySetInnerHTML={{ __html: cleanSvg(it.svg) }} />
            </div>
          ))}
          {!items.length && <p style={{ color: '#8a97a8' }}>No figures for this filter.</p>}
        </div>
      )}
      <p style={{ color: '#8a97a8', fontSize: 13, marginTop: 16 }}>
        Tap a figure to flag/unflag it for regeneration. Flagged figures are queued for a Fable re-render
        (Mac B reads table <code>figure_regen_flags</code>).
      </p>
    </div>
  );
}
