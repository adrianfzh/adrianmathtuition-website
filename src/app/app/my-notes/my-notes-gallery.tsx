'use client';

// The clippings gallery — the ✂️ band of My Notebook (/app/my-notes), grouped
// by the paper each clipping was cut from, newest first. Tap a clipping for
// the full view: edit the typed note (PATCH /api/portal/my-notes) or delete
// it (DELETE, with a confirm step — the file and the row both go, there is no
// undo). The page owns the h1 and band captions; this renders only the grid.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { groupNotes, MAX_NOTE, type MyNoteRow } from '@/lib/portal-notes';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

function niceDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });
}

export default function MyNotesGallery({ initialNotes }: { initialNotes: MyNoteRow[] }) {
  const [notes, setNotes] = useState<MyNoteRow[]>(initialNotes);
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => groupNotes(notes), [notes]);
  const open = openId ? notes.find(n => n.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            Save parts of your marked papers here — open a marked paper and tap ✂️.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Anything worth coming back to — a corrected working, a red-pen comment, a
            step you keep forgetting — clip it and it lives here.
          </p>
          <Link
            href="/app/marking"
            className="inline-block mt-3 text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90"
          >
            Open your marked papers ›
          </Link>
        </div>
      ) : (
        groups.map(g => (
          <section key={g.label} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {g.label} <span className="normal-case font-medium">· {g.notes.length} clipping{g.notes.length === 1 ? '' : 's'}</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {g.notes.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setOpenId(n.id)}
                  className={`${CARD} overflow-hidden text-left hover:shadow-md transition-shadow`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- student-cropped Blob PNG of arbitrary aspect; plain img matches the rest of the portal */}
                  <img
                    src={n.image_url}
                    alt={n.note || 'Saved clipping'}
                    loading="lazy"
                    className="w-full h-36 object-cover object-top bg-white border-b border-black/5"
                  />
                  <div className="p-2.5">
                    {n.note && <p className="text-[13px] text-gray-700 leading-snug line-clamp-2">{n.note}</p>}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {n.topic ? `${n.topic} · ` : ''}{niceDate(n.created_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {open && (
        <NoteLightbox
          note={open}
          onClose={() => setOpenId(null)}
          onSaved={updated => setNotes(list => list.map(n => (n.id === updated.id ? updated : n)))}
          onDeleted={id => {
            setNotes(list => list.filter(n => n.id !== id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function NoteLightbox({ note, onClose, onSaved, onDeleted }: {
  note: MyNoteRow;
  onClose: () => void;
  onSaved: (n: MyNoteRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [text, setText] = useState(note.note ?? '');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== (note.note ?? '').trim();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function saveNote() {
    if (busy) return;
    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/portal/my-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, note: text.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      onSaved((body as { note: MyNoteRow }).note);
      setFlash('Saved ✓');
      setTimeout(() => setFlash(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteNote() {
    if (busy) return;
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/portal/my-notes?id=${encodeURIComponent(note.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      onDeleted(note.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-label="Saved clipping">
      <div className="flex items-start justify-between gap-3 px-4 py-3 text-white shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{note.source_label}</p>
          <p className="text-[11px] text-white/60">
            {note.topic ? `${note.topic} · ` : ''}{niceDate(note.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-2xl leading-none px-2 py-1 text-white/80 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of the clipped Blob PNG */}
        <img
          src={note.image_url}
          alt={note.note || 'Saved clipping'}
          className="max-w-full max-h-full w-auto h-auto rounded-lg bg-white"
        />
      </div>

      <div className="shrink-0 bg-white rounded-t-2xl p-4 space-y-2.5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="Add a note — why did you save this?"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">Delete this clipping?</span>
              <button
                type="button"
                onClick={deleteNote}
                disabled={busy === 'delete'}
                className="text-sm font-semibold bg-rose-600 text-white rounded-xl px-3.5 py-2 hover:opacity-90 disabled:opacity-50"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy === 'delete'}
                className="text-sm font-semibold text-gray-600 rounded-xl px-3 py-2 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-rose-700 rounded-xl px-3 py-2 hover:bg-rose-50"
            >
              🗑 Delete
            </button>
          )}
          <div className="flex items-center gap-2">
            {flash && <span className="text-sm font-semibold text-emerald-700">{flash}</span>}
            <button
              type="button"
              onClick={saveNote}
              disabled={busy !== null || !dirty}
              className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
