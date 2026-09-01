'use client';
// 🧺 On the shelf — the topics deliberately left out of a wave, with the
// evidence that decides the next one (IDEAS.md design 2026-08-30;
// SPEC-TEACHING-CYCLE step 4).
//
// Adrian's ask, 30 Aug 2026: "a dedicated place I can see the topics the sheet
// deliberately left out". Each row expands to the actual question, her score,
// and a link to her MARKED PAGE — so choosing wave 2 needs no archaeology.
// "Draft game plan from these" feeds the existing /api/admin/remediation draft
// pipeline with the waiting entries' source runs.
import { useCallback, useEffect, useMemo, useState } from 'react';

type Evidence = { question_number: string; prompt: string; awarded: number; max: number; annotated_page_url: string; error?: string };
type ShelfItem = {
  id: string; topic: string; skill_label: string; status: 'waiting' | 'started' | 'done';
  paper_name: string; marks_lost: number | null; evidence: Evidence[]; note: string | null;
  source_run_id: string | null; created_at: string; decided_at: string | null;
};
type Grouped = { waiting: ShelfItem[]; started: ShelfItem[]; done: ShelfItem[] };

const BADGE: Record<ShelfItem['status'], { bg: string; fg: string; label: string }> = {
  waiting: { bg: '#fef3c7', fg: '#92400e', label: 'waiting' },
  started: { bg: '#dbeafe', fg: '#1e40af', label: 'in progress' },
  done:    { bg: '#dcfce7', fg: '#166534', label: 'done' },
};

const BANK_LEVELS = ['EM', 'AM', 'JC1', 'JC2'];

/** Best guess at the bank level for the draft call — a default, never a decision:
 *  the select stays visible so Adrian can flip it. */
function guessBankLevel(studentLevel: string, subjects: string[]): string {
  const lvl = (studentLevel || '').toLowerCase();
  if (/j\s*c?\s*1|jc\s*1/.test(lvl)) return 'JC1';
  if (/j\s*c?\s*2|jc\s*2|jc/.test(lvl)) return 'JC2';
  const subj = subjects.join(' ').toLowerCase();
  return /a\s*-?\s*math|amath|add/.test(subj) ? 'AM' : 'EM';
}

export default function ShelfSection({ studentId, studentName, studentLevel, subjects }: {
  studentId: string; studentName?: string; studentLevel?: string; subjects?: string[];
}) {
  const [groups, setGroups] = useState<Grouped>({ waiting: [], started: [], done: [] });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLevel, setDraftLevel] = useState('');
  const [drafted, setDrafted] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/shelf?studentId=${encodeURIComponent(studentId)}`);
      const d = await r.json();
      if (r.ok) setGroups(d.shelf ?? { waiting: [], started: [], done: [] });
      else setErr(d.error || 'could not load the shelf');
    } catch (e) { setErr((e as Error).message); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'start' | 'done' | 'reopen' | 'edit', skillLabel?: string) {
    setBusy(id); setErr('');
    try {
      const r = await fetch('/api/admin/shelf', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...(skillLabel != null ? { skill_label: skillLabel } : {}) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'update failed');
      setEditingId(null);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  // The runs behind the waiting entries — what the draft pipeline diagnoses from.
  const waitingRunIds = useMemo(
    () => [...new Set(groups.waiting.map(i => i.source_run_id).filter((x): x is string => !!x))],
    [groups.waiting],
  );

  async function draftGamePlan() {
    setBusy('draft'); setErr('');
    try {
      const level = draftLevel || guessBankLevel(studentLevel || '', subjects || []);
      const r = await fetch('/api/admin/remediation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft', studentId, studentName: studentName || '',
          level, runIds: waitingRunIds,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'draft failed');
      setDrafted(true); setDraftOpen(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  const items = [...groups.waiting, ...groups.started, ...groups.done];
  if (!items.length) return null;
  const openCount = groups.waiting.length + groups.started.length;

  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>
        Left out of an earlier wave on purpose — pick the next one from here.
        {openCount ? ` ${groups.waiting.length} waiting${groups.started.length ? `, ${groups.started.length} in progress` : ''}.` : ''}
      </p>
      {err && <div style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, padding: '6px 10px', borderRadius: 8, marginBottom: 8 }}>{err}</div>}

      {groups.waiting.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {drafted ? (
            <a href="/admin/remediation" style={{ fontSize: 13, fontWeight: 700, color: '#047857', textDecoration: 'none' }}>
              ✓ Draft created — review it on 🎯 Game plans →
            </a>
          ) : draftOpen ? (
            <>
              <select value={draftLevel || guessBankLevel(studentLevel || '', subjects || [])}
                onChange={e => setDraftLevel(e.target.value)}
                style={{ fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                {BANK_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button type="button" disabled={busy === 'draft'} onClick={draftGamePlan}
                style={{ fontSize: 13, fontWeight: 700, border: 'none', background: '#111827', color: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                {busy === 'draft' ? 'Drafting…' : `Draft from ${waitingRunIds.length} run${waitingRunIds.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={() => setDraftOpen(false)}
                style={{ fontSize: 13, border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <button type="button" disabled={!waitingRunIds.length}
              title={waitingRunIds.length
                ? 'Draft a 🎯 game plan from the marked runs behind the waiting topics — review it on /admin/remediation before anything reaches the student'
                : 'These entries carry no source run to diagnose from'}
              onClick={() => setDraftOpen(true)}
              style={{ fontSize: 13, fontWeight: 700, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3',
                borderRadius: 999, padding: '4px 12px', cursor: waitingRunIds.length ? 'pointer' : 'default', opacity: waitingRunIds.length ? 1 : 0.5 }}>
              🎯 Draft game plan from these
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => {
          const b = BADGE[it.status] ?? BADGE.done;
          const isOpen = open === it.id;
          const isEditing = editingId === it.id;
          return (
            <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', background: it.status === 'done' ? '#fafafa' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : it.id)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#111827', textAlign: 'left' }}>
                  {isOpen ? '▾' : '▸'} {it.topic}
                </button>
                <span style={{ background: b.bg, color: b.fg, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>{b.label}</span>
                {it.marks_lost != null && <span style={{ fontSize: 12, color: '#6b7280' }}>{it.marks_lost} marks</span>}
                {it.paper_name && <span style={{ fontSize: 12, color: '#9ca3af' }}>· {it.paper_name}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {it.status === 'waiting' && (
                    <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'start')}
                      title="This one is being taught now"
                      style={{ fontSize: 12, border: '1px solid #bfdbfe', color: '#1e40af', background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>▶ start</button>
                  )}
                  {it.status !== 'done' ? (
                    <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'done')}
                      style={{ fontSize: 12, border: '1px solid #86efac', color: '#166534', background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>✅ done</button>
                  ) : (
                    <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'reopen')}
                      style={{ fontSize: 12, border: '1px solid #e5e7eb', color: '#6b7280', background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>↩ reopen</button>
                  )}
                </span>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') act(it.id, 'edit', editLabel); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ flex: 1, fontSize: 13, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                  <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'edit', editLabel)}
                    style={{ fontSize: 12, border: 'none', background: '#111827', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)}
                    style={{ fontSize: 12, border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                it.skill_label && (
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
                    {it.skill_label}
                    <button type="button" onClick={() => { setEditingId(it.id); setEditLabel(it.skill_label); }}
                      title="Rename this skill"
                      style={{ border: 'none', background: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer', marginLeft: 6, padding: 0 }}>✏️</button>
                  </div>
                )
              )}

              {isOpen && (
                <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {it.evidence.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No stored evidence for this one.</span>}
                  {it.evidence.map((e, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        Q{e.question_number} <span style={{ fontWeight: 400, color: '#b91c1c' }}>{e.awarded}/{e.max}</span>
                      </div>
                      {e.prompt && <div style={{ color: '#374151', marginTop: 2 }}>{e.prompt}</div>}
                      {e.error && <div style={{ color: '#92400e', marginTop: 2, fontStyle: 'italic' }}>{e.error}</div>}
                      {e.annotated_page_url && (
                        <a href={e.annotated_page_url} target="_blank" rel="noreferrer"
                          style={{ color: '#1d4ed8', fontSize: 12, textDecoration: 'underline' }}>
                          see the marked page ↗
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
