'use client';
// 🔍 Search the papers in one tab (17 Sep 2026: "the search is also good").
// Every entry is rendered on the server and handed here with the words a
// student might type (the paper's name, its date, its score); this only
// decides which entries stay visible. The box appears once a tab holds
// SEARCH_FROM papers or more — below that, the list is already one screen.
//
// 📥 Handed in this week (Adrian, 22 Sep 2026, his tab only): the entries in
// `recent` sit in a frame above the search box. Dragging one out of the frame
// and dropping it on the list below (or tapping its "↓ Done" button — the
// same thing, for a finger) moves it into the list and stamps
// paper_marking_runs.recent_done_at through /api/admin/papers {runId,
// recentDone:true}; an undo line puts it back. Students never get `recent`.
import { useState, type DragEvent, type ReactNode } from 'react';

export const SEARCH_FROM = 8;

export interface SearchEntry { key: string; haystack: string; node: ReactNode }
/** One frame entry: the list key it shares with `entries`, and every run it stands for (a bundle = several). */
export interface RecentEntry { key: string; runIds: string[] }

async function stamp(runIds: string[], recentDone: boolean): Promise<boolean> {
  try {
    const rs = await Promise.all(runIds.map(runId => fetch('/api/admin/papers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, recentDone }) })));
    return rs.every(r => r.ok);
  } catch { return false; }
}

export default function PaperSearch({ entries, always = false, recent = [] }: { entries: SearchEntry[]; /** Adrian's tab: the box is always there. */ always?: boolean; recent?: RecentEntry[] }) {
  const [q, setQ] = useState('');
  const [inFrame, setInFrame] = useState<RecentEntry[]>(recent);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [undo, setUndo] = useState<RecentEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const frameKeys = new Set(inFrame.map(r => r.key));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const listed = entries.filter(e => !frameKeys.has(e.key));
  const shown = words.length ? listed.filter(e => words.every(w => e.haystack.includes(w))) : listed;
  const byKey = new Map(entries.map(e => [e.key, e]));

  async function moveOut(key: string) {
    const item = inFrame.find(r => r.key === key);
    if (!item) return;
    setInFrame(f => f.filter(r => r.key !== key));
    setUndo(item); setErr(null);
    if (!(await stamp(item.runIds, true))) { setErr('Could not save — it will be back in the frame next time.'); }
  }
  async function putBack() {
    if (!undo) return;
    const item = undo;
    setUndo(null);
    setInFrame(f => [item, ...f]);
    if (!(await stamp(item.runIds, false))) setErr('Could not save.');
  }
  const onDragStart = (key: string) => (e: DragEvent) => { setDragging(key); e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const key = e.dataTransfer.getData('text/plain') || dragging; setDragging(null); if (key && frameKeys.has(key)) void moveOut(key); };

  return (
    <div className="space-y-2.5">
      {(inFrame.length > 0 || undo) && (
        <section aria-label="Handed in this week" className="rounded-3xl border-2 border-emerald-300 bg-emerald-50/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[13px] font-bold text-emerald-900">📥 Handed in this week <span className="font-semibold text-emerald-700/70">({inFrame.length})</span></p>
            <p className="text-[11px] text-emerald-800/70">drag a paper down to the list when you are done with it</p>
          </div>
          {inFrame.map(r => {
            const e = byKey.get(r.key);
            if (!e) return null;
            return (
              <div key={r.key} draggable onDragStart={onDragStart(r.key)} onDragEnd={() => setDragging(null)}
                className={`relative cursor-grab active:cursor-grabbing ${dragging === r.key ? 'opacity-40' : ''}`}>
                {e.node}
                <button type="button" onClick={() => void moveOut(r.key)} aria-label="Done — move out of the frame"
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 shadow">↓ Done</button>
              </div>
            );
          })}
          {undo && (
            <p className="px-1 text-[12px] text-emerald-900/80">Moved out of the frame · <button type="button" onClick={() => void putBack()} className="underline font-semibold">put it back</button></p>
          )}
          {err && <p className="px-1 text-[12px] text-rose-700">{err}</p>}
        </section>
      )}
      <div onDragOver={e => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`space-y-2.5 rounded-3xl transition-shadow ${dragging ? `outline-dashed outline-2 outline-offset-4 ${over ? 'outline-emerald-500 bg-emerald-50/40' : 'outline-emerald-300'} min-h-[4rem]` : ''}`}>
        {(always || entries.length >= SEARCH_FROM) && (
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your papers — 2023, paper 2, prelim…" aria-label="Search papers"
            className="w-full text-sm bg-white border border-black/10 rounded-2xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-navy/20" data-paper-search />
        )}
        {dragging && <p className="text-center text-[12px] font-semibold text-emerald-700">Drop here — done with it</p>}
        {shown.length === 0 && !dragging && <p className="text-sm text-gray-500 px-1">No paper matches. Try another word.</p>}
        {shown.map(e => <div key={e.key}>{e.node}</div>)}
      </div>
    </div>
  );
}
