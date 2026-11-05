'use client';
// 👪 Send to parent — the tutor's side (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026: "summary would be a good thing to
// send to parents" → "yes"). Write the note from the board, read and edit it, then send the private link from the
// tutor's own WhatsApp. The parent's page is /p/<key> (read-only, the note only).
import { useEffect, useState } from 'react';
import { parentShareText, type ParentNote } from '@/lib/board-summary';

type Fields = { worked: string; watch: string; help: string };

export default function BoardParentNote({ boardId, childName, tutorName, onClose }: { boardId: string; childName: string; tutorName: string; onClose: () => void }) {
  const [note, setNote] = useState<Fields | null>(null);
  const [saved, setSaved] = useState<Fields | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'making' | 'ready'>('loading');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const first = childName.trim().split(/\s+/)[0] || 'your student';

  const take = (j: { note: ParentNote | null; link: string | null }) => {
    if (j.note) { const f = { worked: j.note.worked, watch: j.note.watch, help: j.note.help }; setNote(f); setSaved(f); setState('ready'); }
    else setState('none');
    setLink(j.link);
  };
  useEffect(() => {
    void fetch(`/api/tutor/boards/parent-note?id=${boardId}`, { cache: 'no-store' }).then(r => r.json()).then(take).catch(() => setState('none'));
  }, [boardId]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/tutor/boards/parent-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not save the note — try again.');
    take(j);
  };
  const make = async () => {
    if (saved && !window.confirm('Write a new note from the board? Your changes to this one are replaced.')) return;
    setState('making'); setErr('');
    try { await post({ op: 'make' }); } catch (e) { setErr((e as Error).message); setState(saved ? 'ready' : 'none'); }
  };
  const dirty = !!note && !!saved && (note.worked !== saved.worked || note.watch !== saved.watch || note.help !== saved.help);
  const save = async () => {
    if (!note) return;
    setBusy('Saving…'); setErr('');
    try { await post({ op: 'save', ...note }); } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };
  const wa = link ? `https://wa.me/?text=${encodeURIComponent(parentShareText(first, tutorName, link))}` : '';

  const box = (k: keyof Fields, label: string) => (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <textarea value={note?.[k] ?? ''} rows={5} maxLength={400} onChange={e => setNote(n => (n ? { ...n, [k]: e.target.value } : n))}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-[15px] leading-relaxed" data-parent-field={k} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Send to parent" data-parent-note>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="flex-1 text-lg font-bold">Send to {first}’s parent</h2>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">Close</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-4">
          <p className="text-sm text-slate-600">A short note from you, written from today’s board. Read it, change anything, then send it from your WhatsApp. The parent sees only this note — never the board.</p>
          {state === 'loading' && <p className="text-slate-500">Opening…</p>}
          {state === 'making' && <p className="text-slate-600">Writing the note from the board — about 20 seconds.</p>}
          {state === 'none' && <button type="button" onClick={() => void make()} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white">Write the note</button>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {state === 'ready' && note && (
            <>
              {box('worked', 'What we worked on')}
              {box('watch', 'What to watch')}
              {box('help', 'How you can help at home')}
              {dirty
                ? <button type="button" disabled={!!busy} onClick={() => void save()} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50">{busy || 'Save my changes'}</button>
                : link && (
                  <div className="space-y-2">
                    <a href={wa} target="_blank" rel="noreferrer" className="block w-full rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white">Send on WhatsApp</a>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <a href={link} target="_blank" rel="noreferrer" className="underline text-slate-600">See what the parent sees</a>
                      <button type="button" className="underline text-slate-600" onClick={() => void navigator.clipboard?.writeText(link)}>Copy link</button>
                      <button type="button" className="underline text-slate-600" onClick={() => void make()}>Write it again from the board</button>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
