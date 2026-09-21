'use client';

// The Notebook as ONE stream (SPEC-NOTEBOOK-V2 §9, 11 Sep 2026): a search box,
// filter chips, then every item newest first with an icon for its kind. Nothing
// is filed by hand — the page builds the items (lib/notebook-stream.ts), this
// filters and opens them. A mistake opens inline, a photo
// opens the lightbox, a page from Adrian opens its own route. ?open=<id> lands
// with that item open (the Home resurface card's door).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-fetch';
import { fileHref } from '@/lib/student-files-url';
import { CHIPS, filterStream, privateNoteItem, type StreamItem, type StreamKind, type StreamTag } from '@/lib/notebook-stream';
import { MAX_PRIVATE_NOTE, type PrivateNoteRow } from '@/lib/notebook-private-notes';
import type { MyNoteRow, TopicOptionGroup } from '@/lib/portal-notes';
import AddPhoto from './add-photo';
import { NoteLightbox } from './my-notes-gallery';
import { CorrectedButton, RemoveButton } from './mistake-actions';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const ICON: Record<StreamKind, string> = { mistake: '⚠️', photo: '📷', clip: '✂️', adrian: '📖', private: '✍️' };
const TONE: Record<StreamTag['tone'], string> = {
  rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800', emerald: 'bg-emerald-50 text-emerald-800',
  sky: 'bg-sky-50 text-sky-800', slate: 'bg-gray-100 text-gray-600', indigo: 'bg-indigo-50 text-indigo-800',
};

function niceDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getTime() === 0 ? '' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}


export default function NotebookStream({ items: initial, topicGroups, openId: openFromUrl, weakest = [] }: {
  /** Weakest topics across the marked papers — one line at the top of the Mistakes view (17 Sep 2026). */
  weakest?: { topic: string; pct: number }[];
  items: StreamItem[]; topicGroups: TopicOptionGroup[]; openId?: string | null;
}) {
  const [items, setItems] = useState<StreamItem[]>(initial);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | StreamKind>('all');
  const [showFixed, setShowFixed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(openFromUrl ?? null);
  const [lightbox, setLightbox] = useState<MyNoteRow | null>(null);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  // ✍️ Private notes (SPEC-NOTEBOOK-V2 §8): the composer under the search box, and one note being edited inline.
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const shown = useMemo(() => filterStream(items, kind, query, showFixed), [items, kind, query, showFixed]);
  const fixedCount = useMemo(() => items.filter(it => it.kind === 'mistake' && it.mistake?.state === 'fixed').length, [items]);

  useEffect(() => {
    if (!openFromUrl) return;
    const el = document.querySelector(`[data-item-id="${CSS.escape(openFromUrl)}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [openFromUrl]);

  function addPhoto(n: MyNoteRow) {
    setItems(prev => [{
      id: `note:${n.id}`, kind: 'photo', title: n.note?.trim() || 'Photo', subtitle: ['Photo', n.topic].filter(Boolean).join(' · '),
      at: n.created_at, haystack: `${n.note ?? ''} ${n.topic ?? ''}`.toLowerCase(), note: n,
    }, ...prev]);
  }
  function noteSaved(n: MyNoteRow) {
    setItems(prev => prev.map(it => (it.note?.id === n.id ? { ...it, title: n.note?.trim() || it.title, note: n } : it)));
    setLightbox(n);
  }
  function noteDeleted(id: string) {
    setItems(prev => prev.filter(it => it.note?.id !== id));
    setLightbox(null);
  }
  async function writeNote() {
    if (!draft.trim() || busy) return;
    setBusy('write');
    try {
      const r = await portalFetch<{ note: PrivateNoteRow }>('/api/portal/notebook/private-notes', { method: 'POST', json: { body: draft } });
      setItems(prev => [privateNoteItem(r.note), ...prev]);
      setDraft('');
      setWriting(false);
      setKind(k => (k === 'all' || k === 'private' ? k : 'all'));
    } catch { setFlash('Could not save your note — try again.'); } finally { setBusy(''); }
  }
  async function saveEdit() {
    if (!editing || !editing.body.trim()) return;
    setBusy('edit:' + editing.id);
    try {
      const r = await portalFetch<{ note: PrivateNoteRow }>('/api/portal/notebook/private-notes', { method: 'PATCH', json: { id: editing.id, body: editing.body } });
      setItems(prev => prev.map(it => (it.priv?.id === r.note.id ? privateNoteItem(r.note) : it)));
      setEditing(null);
    } catch { setFlash('Could not save your note — try again.'); } finally { setBusy(''); }
  }
  async function deleteNote(p: PrivateNoteRow) {
    if (!window.confirm('Delete this note?')) return;
    setBusy('delete:' + p.id);
    try {
      await portalFetch('/api/portal/notebook/private-notes', { method: 'DELETE', json: { id: p.id } });
      setItems(prev => prev.filter(it => it.priv?.id !== p.id));
    } catch { setFlash('Could not delete it — try again.'); } finally { setBusy(''); }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) {
      if (it.kind === 'mistake' && it.mistake?.state === 'fixed') { c.all -= 1; continue; }
      c[it.kind === 'clip' ? 'photo' : it.kind] = (c[it.kind === 'clip' ? 'photo' : it.kind] ?? 0) + 1;
    }
    return c;
  }, [items]);

  return (
    <div className="space-y-3" data-notebook-stream>
      <div className="flex items-center gap-2">
        <div className={`${CARD} flex-1 flex items-center gap-2 px-3 py-2`}>
          <span aria-hidden className="text-gray-400">🔍</span>
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search — R-formula, sin 2x, Q7…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400" aria-label="Search my notebook" data-stream-search
          />
          {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 text-sm" aria-label="Clear search">✕</button>}
        </div>
        <button type="button" onClick={() => setWriting(w => !w)} data-write-note aria-expanded={writing}
          className={`shrink-0 text-[12px] font-semibold rounded-full px-3 py-2 border transition ${writing ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-navy border-black/10 hover:bg-navy/5'}`}>
          ✍️ Write
        </button>
        <AddPhoto topicGroups={topicGroups} variant="button" onSaved={addPhoto} />
      </div>

      {writing && (
        <div className={`${CARD} p-3 space-y-2`} data-note-composer>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} maxLength={MAX_PRIVATE_NOTE} autoFocus
            placeholder="A note to yourself." aria-label="Write a note"
            className="w-full text-sm bg-transparent outline-none resize-y placeholder:text-gray-400" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400">Private — only you can read these. Not Adrian, not the marker, not the app&apos;s AI.</p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => { setWriting(false); setDraft(''); }} className="text-[12px] font-semibold text-gray-500 rounded-full px-3 py-1 border border-black/10">Cancel</button>
              <button type="button" onClick={writeNote} disabled={!draft.trim() || busy === 'write'} data-note-save
                className="text-[12px] font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-full px-3 py-1 disabled:opacity-40">Save note</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Show">
        {CHIPS.map(c => (
          <button key={c.key} type="button" onClick={() => setKind(c.key)} data-chip={c.key}
            className={`text-[12px] font-semibold rounded-full px-3 py-1 border transition ${kind === c.key ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-gray-600 border-black/10'}`}>
            {c.label}{counts[c.key] ? <span className="ml-1 opacity-70">{counts[c.key]}</span> : null}
          </button>
        ))}
        {fixedCount > 0 && (kind === 'all' || kind === 'mistake') && (
          <button type="button" onClick={() => setShowFixed(v => !v)} data-show-fixed
            className={`text-[12px] font-semibold rounded-full px-3 py-1 border transition ${showFixed ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-emerald-700 border-emerald-200'}`}>
            {showFixed ? 'Hide fixed' : `Show fixed ${fixedCount}`}
          </button>
        )}
      </div>

      {/* Weakest topics — moved here from Papers on 17 Sep 2026 (Adrian: Papers
          says how you did, the Notebook says what to fix). Mistakes view only. */}
      {kind === 'mistake' && weakest.length > 0 && (
        <p className="text-[12.5px] text-gray-600 leading-relaxed" data-weakest>
          <span className="font-semibold text-navy">Weakest topics:</span>{' '}
          {weakest.map((t, i) => (
            <span key={t.topic}>
              {i > 0 ? ' · ' : ''}
              <Link href={`/app/practice?topic=${encodeURIComponent(t.topic)}`} className="underline underline-offset-2 hover:text-navy">
                {t.topic} <span className="text-gray-400">{t.pct}%</span>
              </Link>
            </span>
          ))}
          <span className="text-gray-400"> ›</span>
        </p>
      )}

      {flash && <p className="text-[12px] text-rose-700">{flash}</p>}

      {shown.length === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          {items.length === 0
            ? <>Nothing here yet. Your marked papers and photos land here by themselves.</>
            : <>Nothing matches. Try another word, or clear the search.</>}
        </div>
      )}

      <div className="space-y-2" data-stream-list>
        {shown.map(it => {
          const open = openId === it.id;
          const tag = it.tag ? <span className={`shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap ${TONE[it.tag.tone]}`}>{it.tag.text}</span> : null;
          const head = (
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>{ICON[it.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold leading-snug ${it.kind === 'mistake' && it.mistake?.state !== 'dark' ? 'text-gray-600' : 'text-navy'}`}>{it.title}</p>
                {/* A mistake's subtitle already ends with the date it was seen — don't print "28 Aug · 28 Aug" (Adrian, 18 Sep 2026). */}
                <p className="text-[12px] text-gray-500 mt-0.5">{it.subtitle}{it.subtitle && niceDate(it.at) && !it.subtitle.includes(niceDate(it.at)) ? ` · ${niceDate(it.at)}` : (!it.subtitle ? niceDate(it.at) : '')}</p>
              </div>
              {tag}
            </div>
          );
          if (it.kind === 'adrian' && it.href) {
            return <Link key={it.id} href={it.href} data-item-id={it.id} className={`${CARD} block p-4 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>{head}</Link>;
          }
          if (it.note) {
            return (
              <button key={it.id} type="button" data-item-id={it.id} onClick={() => setLightbox(it.note!)} className={`${CARD} block w-full text-left p-4 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the student's own stored image */}
                  <img src={fileHref(it.note.image_url)} alt="" loading="lazy" className="w-14 h-14 object-cover object-top rounded-lg border border-black/5 shrink-0" />
                  <div className="min-w-0 flex-1">{head}</div>
                </div>
              </button>
            );
          }
          return (
            <div key={it.id} data-item-id={it.id} className={`${CARD} p-4`}>
              <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="block w-full text-left">{head}</button>
              {it.mistake?.live && (
                <div className="flex flex-wrap items-center gap-2 mt-2.5 pl-8" data-mistake-actions>
                  <CorrectedButton id={it.mistake.id} />
                  <RemoveButton id={it.mistake.id} onRemoved={() => setItems(prev => prev.filter(x => x.id !== it.id))} />
                </div>
              )}
              {open && it.mistake && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  {it.mistake.where && <p className="text-[13px] text-gray-700">Last seen: {it.mistake.where}{it.mistake.seen > 1 ? ` · ${it.mistake.seen} times` : ''}</p>}
                  {it.mistake.cameBack && <p className="text-[12px] text-rose-700 font-semibold">It came back after you marked it fixed.</p>}
                  {it.mistake.practice.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {it.mistake.practice.map(p => (
                        <Link key={p.id} href={`/app/assignments/${p.id}`} className="text-[12px] font-semibold bg-amber-50 text-amber-800 rounded-full px-3 py-1">✏️ {p.title}</Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {open && it.priv && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2" data-private-open>
                  {editing?.id === it.priv.id ? (
                    <>
                      <textarea value={editing.body} onChange={e => setEditing({ id: it.priv!.id, body: e.target.value })} rows={5} maxLength={MAX_PRIVATE_NOTE} autoFocus aria-label="Edit note"
                        className="w-full text-sm bg-[hsl(45,100%,98%)] rounded-xl border border-black/5 p-2 outline-none resize-y" />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEdit} disabled={busy === 'edit:' + it.priv.id || !editing.body.trim()} data-note-edit-save
                          className="text-[12px] font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-full px-3 py-1 disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-[12px] font-semibold text-gray-500 rounded-full px-3 py-1 border border-black/10">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" data-private-body>{it.priv.body}</p>
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => setEditing({ id: it.priv!.id, body: it.priv!.body })} className="text-[12px] font-semibold text-navy border border-black/10 rounded-full px-3 py-1 hover:bg-navy/5">✏️ Edit</button>
                        <button type="button" onClick={() => deleteNote(it.priv!)} disabled={busy === 'delete:' + it.priv.id} className="text-[12px] font-semibold text-rose-700 border border-rose-200 rounded-full px-3 py-1 hover:bg-rose-50">🗑 Delete</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && <NoteLightbox note={lightbox} onClose={() => setLightbox(null)} onSaved={noteSaved} onDeleted={noteDeleted} />}
    </div>
  );
}
