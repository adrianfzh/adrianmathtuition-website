'use client';

// Grading rubrics (Supabase `rubrics` table) — a folded section of /admin/essays since
// 5 Oct 2026; it was its own page, /admin/rubrics, which now redirects to
// /admin/essays#rubrics. These rows are what the older Solo grader reads
// (/api/learn/grade via lib/learn/rubric.ts). The E1 essay marker does NOT read
// them: its bands come from the repo files data/rubrics/*.json (lib/essay-rubric.ts,
// bot ai/essay-marker.js). Route: /api/admin/rubrics (GET, PATCH grading_notes).

import { useEffect, useState } from 'react';

type Descriptor = { band: number; range: string; text: string };
type Criterion = { name: string; maxMarks: number; descriptors: Descriptor[] };
type Rubric = {
  id: string; level: string; subject: string; paper: string; essay_type: string | null;
  criteria: Criterion[]; grading_notes: string | null; out_of: number | null;
};

export default function RubricsSection() {
  const [open, setOpen] = useState(false);
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});

  // Open by itself when reached through the old /admin/rubrics link.
  useEffect(() => { if (window.location.hash === '#rubrics') setOpen(true); }, []);

  useEffect(() => {
    if (!open || rubrics) return;
    fetch('/api/admin/rubrics').then(r => r.json()).then(d => {
      setRubrics(d.rubrics || []);
      setCanEdit(!!d.canEdit);
      setNotes(Object.fromEntries((d.rubrics || []).map((x: Rubric) => [x.id, x.grading_notes || ''])));
    }).catch(() => setRubrics([]));
  }, [open, rubrics]);

  async function saveNotes(id: string) {
    setSavedMsg(m => ({ ...m, [id]: 'Saving…' }));
    const r = await fetch('/api/admin/rubrics', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, grading_notes: notes[id] }),
    });
    const d = await r.json().catch(() => ({}));
    setSavedMsg(m => ({ ...m, [id]: r.ok ? 'Saved' : (d.error || 'Failed') }));
  }

  return (
    <details id="rubrics" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="bg-white rounded-2xl shadow-sm scroll-mt-4">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-navy">
        Grading rubrics <span className="font-normal text-gray-500">· the older Solo grader&apos;s bands (not the essay marker&apos;s)</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[12px] text-gray-500 mb-3">
          The essay marker above reads its bands from the repo (data/rubrics). These rows feed the older Solo grader.
          {canEdit ? '' : ' Band text is edited in the Supabase dashboard; examiner notes save here once SUPABASE_SECRET_KEY is set.'}
        </p>
        {rubrics === null && <p className="text-sm text-gray-400">Loading…</p>}
        {rubrics && rubrics.length === 0 && <p className="text-sm text-gray-400">No rubrics found.</p>}
        {(rubrics ?? []).map(rb => (
          <div key={rb.id} className="border border-gray-200 rounded-xl p-4 mb-3">
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="text-[15px] font-bold text-navy">{rb.level} {rb.subject} · {rb.paper}</h3>
              <span className="text-xs text-gray-500">out of {rb.out_of ?? '—'}</span>
            </div>
            {rb.criteria?.map(c => (
              <div key={c.name} className="mb-2">
                <div className="text-sm font-bold text-rose-700">{c.name} <span className="font-normal text-gray-400">/ {c.maxMarks}</span></div>
                {c.descriptors?.map(d => (
                  <div key={d.band} className="flex gap-2 text-[13px] text-gray-700 py-0.5">
                    <span className="shrink-0 w-20 text-gray-400">Band {d.band} ({d.range})</span>
                    <span>{d.text}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <label className="text-[13px] font-semibold text-gray-700">Examiner notes (extra grading guidance)</label>
              <textarea value={notes[rb.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [rb.id]: e.target.value }))} rows={3}
                className="w-full border border-gray-200 rounded-lg p-2 text-[13px] mt-1" />
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => saveNotes(rb.id)} className="bg-navy text-white rounded-lg px-4 py-1.5 text-sm font-semibold">Save notes</button>
                {savedMsg[rb.id] && <span className={`text-[13px] ${savedMsg[rb.id] === 'Saved' ? 'text-emerald-700' : savedMsg[rb.id] === 'Saving…' ? 'text-gray-500' : 'text-rose-700'}`}>{savedMsg[rb.id]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
