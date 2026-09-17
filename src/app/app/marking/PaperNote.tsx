'use client';
// My remark — the student's own remark on a paper (17 Sep 2026). A light box
// under the title; tap to edit, saved when they pause or leave the box. Adrian
// sees it on his Papers tab as "their note". Empty clears it.
import { useEffect, useRef, useState } from 'react';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { MAX_NOTE_LENGTH } from '@/lib/paper-label';

export default function PaperNote({ runId, note }: { runId: string; note: string | null }) {
  const [text, setText] = useState(note ?? '');
  const [saved, setSaved] = useState(note ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(value: string) {
    if (value === saved) return;
    setState('saving'); setErr(null);
    try {
      const d = await portalFetch<{ ok: boolean; note: string | null }>('/api/portal/marking/note', { json: { runId, note: value }, fallback: 'save your note' });
      setSaved(d.note ?? ''); setState('saved');
      setTimeout(() => setState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) { setState('error'); setErr(portalMessage(e)); }
  }
  // Save after a short pause in typing, and on leaving the box.
  useEffect(() => {
    if (text === saved) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-3 py-2" data-paper-note>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">My remark</p>
        <p className="text-[11px] text-gray-400">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? (err || 'Not saved') : text ? 'Adrian can read this too' : ''}
        </p>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => save(text)} maxLength={MAX_NOTE_LENGTH} rows={text ? 3 : 2}
        placeholder="What went wrong, what to remember next time…" aria-label="My remark on this paper"
        className="mt-1 w-full text-sm text-gray-700 bg-transparent outline-none resize-y placeholder:text-gray-300" />
    </div>
  );
}
