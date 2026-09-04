'use client';

// The clippings-and-photos gallery — the saved band of My Notebook
// (/app/my-notes): ✂️ crops from marked papers grouped by the paper they were
// cut from, and 📷 photos of outside work (school worksheets, homework,
// textbook working) under their own heading — newest first throughout. Tap an
// item for the full view: edit the typed note (PATCH /api/portal/my-notes) or
// delete it (DELETE, with a confirm step — the file and the row both go,
// there is no undo). Past GALLERY_CHIP_THRESHOLD items a slim filter-chip row
// appears (All · topics present · 📷 Photos · ✂️ Clippings) — pure client
// filtering, no API. The page owns the h1 and band captions; this renders the
// add-photo door, the chips, and the grid.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  applyGalleryChip,
  galleryChips,
  groupGallery,
  noteKind,
  MAX_NOTE,
  type MyNoteRow,
  type TopicOptionGroup,
} from '@/lib/portal-notes';
import AddPhoto from './add-photo';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

import { fileHref } from '@/lib/student-files-url';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

function niceDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });
}

export default function MyNotesGallery({ initialNotes, topicGroups }: {
  initialNotes: MyNoteRow[];
  topicGroups: TopicOptionGroup[];
}) {
  const [notes, setNotes] = useState<MyNoteRow[]>(initialNotes);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chip, setChip] = useState('all');

  const chips = useMemo(() => galleryChips(notes), [notes]);
  // A deletion can retire the active chip (last item of a topic/kind, or the
  // whole row dropping under the threshold) — fall back to All, don't strand
  // the gallery on a filter that no longer exists.
  const activeChip = chips.some(c => c.key === chip) ? chip : 'all';
  const visible = useMemo(() => applyGalleryChip(notes, activeChip), [notes, activeChip]);
  const groups = useMemo(() => groupGallery(visible), [visible]);
  const open = openId ? notes.find(n => n.id === openId) ?? null : null;

  // A fresh save must be visible immediately — newest-first prepend, and snap
  // any active filter back to All so the new tile can't land off-screen.
  function addNote(n: MyNoteRow) {
    setNotes(list => [n, ...list]);
    setChip('all');
  }

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
          <p className="text-sm text-gray-600 mt-2">
            …or add a photo of any work you&apos;re doing on paper.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link
              href="/app/marking"
              className="inline-block text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90"
            >
              Open your marked papers ›
            </Link>
            <AddPhoto topicGroups={topicGroups} variant="button" onSaved={addNote} />
          </div>
        </div>
      ) : (
        <>
          <AddPhoto topicGroups={topicGroups} variant="tile" onSaved={addNote} />

          {chips.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 [-webkit-overflow-scrolling:touch]">
              {chips.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChip(c.key)}
                  className={`shrink-0 whitespace-nowrap text-[13px] font-semibold rounded-full px-3 py-1 transition-colors active:scale-95 ${
                    activeChip === c.key
                      ? 'bg-navy text-[hsl(45,100%,96%)]'
                      : 'bg-white border border-black/10 text-gray-600 hover:border-navy/30'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {groups.map(g => (
            <section key={`${g.kind}|${g.label}`} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {g.label}{' '}
                <span className="normal-case font-medium">
                  · {g.notes.length} {g.kind === 'photo' ? 'photo' : 'clipping'}{g.notes.length === 1 ? '' : 's'}
                </span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {g.notes.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setOpenId(n.id)}
                    className={`${CARD} overflow-hidden text-left hover:shadow-md transition-shadow`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- student-saved Blob image of arbitrary aspect; plain img matches the rest of the portal */}
                    <img
                      src={fileHref(n.image_url)}
                      alt={n.note || (g.kind === 'photo' ? 'Saved photo' : 'Saved clipping')}
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
          ))}
        </>
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
  const noun = noteKind(note.image_url) === 'photo' ? 'photo' : 'clipping';

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
      const body = await portalFetch<{ note: MyNoteRow }>('/api/portal/my-notes', {
        method: 'PATCH',
        json: { id: note.id, note: text.trim() },
        fallback: 'Couldn’t save that note — try again.',
      });
      onSaved(body.note);
      setFlash('Saved ✓');
      setTimeout(() => setFlash(null), 1500);
    } catch (e) {
      setError(portalMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteNote() {
    if (busy) return;
    setBusy('delete');
    setError(null);
    try {
      await portalFetch(`/api/portal/my-notes?id=${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
        fallback: `Couldn’t delete that ${noun} — try again.`,
      });
      onDeleted(note.id);
    } catch (e) {
      setError(portalMessage(e));
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-label={`Saved ${noun}`}>
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
        {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of the saved Blob image */}
        <img
          src={fileHref(note.image_url)}
          alt={note.note || `Saved ${noun}`}
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
              <span className="text-sm font-semibold text-rose-700">Delete this {noun}?</span>
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
