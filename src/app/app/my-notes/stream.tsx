'use client';

// The Notebook as ONE stream (SPEC-NOTEBOOK-V2 §9, 11 Sep 2026): a search box,
// filter chips, then every item newest first with an icon for its kind. Nothing
// is filed by hand — the page builds the items (lib/notebook-stream.ts), this
// filters and opens them. A saved answer or a mistake opens inline, a photo
// opens the lightbox, a page from Adrian opens its own route. ?open=<id> lands
// with that item open (the Home resurface card's door).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { portalFetch } from '@/lib/portal-fetch';
import { fileHref } from '@/lib/student-files-url';
import { renderToElement, whenKatexReady } from '@/lib/chat-solver';
import { CHIPS, filterStream, type StreamItem, type StreamKind, type StreamTag } from '@/lib/notebook-stream';
import type { MyNoteRow, TopicOptionGroup } from '@/lib/portal-notes';
import type { SaveRow } from '@/lib/notebook-saves';
import AddPhoto from './add-photo';
import { NoteLightbox } from './my-notes-gallery';
import { CorrectedButton } from './mistake-actions';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const ICON: Record<StreamKind, string> = { mistake: '⚠️', saved: '💾', photo: '📷', clip: '✂️', adrian: '📖', skill: '💬' };
const TONE: Record<StreamTag['tone'], string> = {
  rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800', emerald: 'bg-emerald-50 text-emerald-800',
  sky: 'bg-sky-50 text-sky-800', slate: 'bg-gray-100 text-gray-600', indigo: 'bg-indigo-50 text-indigo-800',
};

function niceDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getTime() === 0 ? '' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

/** Markdown + KaTeX, rendered the way the Ask tab renders an answer. */
export function MathBody({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    whenKatexReady(() => { if (ref.current) renderToElement(ref.current, text); });
  }, [text]);
  return <div ref={ref} className={className} />;
}

export default function NotebookStream({ items: initial, topicGroups, openId: openFromUrl }: {
  items: StreamItem[]; topicGroups: TopicOptionGroup[]; openId?: string | null;
}) {
  const [items, setItems] = useState<StreamItem[]>(initial);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | StreamKind>('all');
  const [openId, setOpenId] = useState<string | null>(openFromUrl ?? null);
  const [lightbox, setLightbox] = useState<MyNoteRow | null>(null);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const shown = useMemo(() => filterStream(items, kind, query), [items, kind, query]);

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
  async function renameSave(s: SaveRow) {
    const title = window.prompt('Name this card', s.title);
    if (title == null || !title.trim() || title.trim() === s.title) return;
    setBusy('rename:' + s.id);
    try {
      const r = await portalFetch<{ save: SaveRow }>('/api/portal/notebook/saves', { method: 'PATCH', json: { id: s.id, title } });
      setItems(prev => prev.map(it => (it.save?.id === s.id ? { ...it, title: r.save.title, save: r.save } : it)));
    } catch { setFlash('Could not rename it — try again.'); } finally { setBusy(''); }
  }
  async function deleteSave(s: SaveRow) {
    if (!window.confirm(`Delete “${s.title}” from your notebook?`)) return;
    setBusy('delete:' + s.id);
    try {
      await portalFetch('/api/portal/notebook/saves', { method: 'DELETE', json: { id: s.id } });
      setItems(prev => prev.filter(it => it.save?.id !== s.id));
    } catch { setFlash('Could not delete it — try again.'); } finally { setBusy(''); }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.kind === 'clip' ? 'photo' : it.kind] = (c[it.kind === 'clip' ? 'photo' : it.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-3" data-notebook-stream>
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />

      <div className="flex items-center gap-2">
        <div className={`${CARD} flex-1 flex items-center gap-2 px-3 py-2`}>
          <span aria-hidden className="text-gray-400">🔍</span>
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search — R-formula, sin 2x, Q7…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400" aria-label="Search my notebook" data-stream-search
          />
          {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 text-sm" aria-label="Clear search">✕</button>}
        </div>
        <AddPhoto topicGroups={topicGroups} variant="button" onSaved={addPhoto} />
      </div>

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Show">
        {CHIPS.map(c => (
          <button key={c.key} type="button" onClick={() => setKind(c.key)} data-chip={c.key}
            className={`text-[12px] font-semibold rounded-full px-3 py-1 border transition ${kind === c.key ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-gray-600 border-black/10'}`}>
            {c.label}{counts[c.key] ? <span className="ml-1 opacity-70">{counts[c.key]}</span> : null}
          </button>
        ))}
      </div>

      {flash && <p className="text-[12px] text-rose-700">{flash}</p>}

      {shown.length === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          {items.length === 0
            ? <>Nothing here yet. Your marked papers, saved answers and photos land here by themselves.</>
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
                <p className="text-[12px] text-gray-500 mt-0.5">{it.subtitle}{it.subtitle && niceDate(it.at) ? ' · ' : ''}{niceDate(it.at)}</p>
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
              {open && it.save && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                  {it.save.question_text && !/^\[?(image|photo)\]?$/i.test(it.save.question_text.trim()) && (
                    <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">You asked</p><MathBody text={it.save.question_text} className="text-[13px] text-gray-700 leading-relaxed" /></div>
                  )}
                  {it.save.image_url && (
                    /* eslint-disable-next-line @next/next/no-img-element -- the student's own photo question */
                    <img src={it.save.image_url.startsWith('http') && !it.save.image_url.includes('/api/files/') ? it.save.image_url : fileHref(it.save.image_url)} alt="Your question" className="max-h-56 rounded-lg border border-black/5" />
                  )}
                  <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">The answer</p><MathBody text={it.save.answer_text} className="text-sm text-gray-800 leading-relaxed" /></div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => renameSave(it.save!)} disabled={busy === 'rename:' + it.save.id} className="text-[12px] font-semibold text-navy border border-black/10 rounded-full px-3 py-1 hover:bg-navy/5">✏️ Rename</button>
                    <button type="button" onClick={() => deleteSave(it.save!)} disabled={busy === 'delete:' + it.save.id} className="text-[12px] font-semibold text-rose-700 border border-rose-200 rounded-full px-3 py-1 hover:bg-rose-50">🗑 Delete</button>
                  </div>
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
                  {it.mistake.live && <CorrectedButton id={it.mistake.id} />}
                </div>
              )}
              {open && it.skill && (
                <p className="mt-3 pt-3 border-t border-gray-100 text-[13px] text-gray-700">
                  You keep asking the app about this. It isn&apos;t a mistake — it&apos;s a hint about what to look at next. Turn this off in Settings if you&apos;d rather not see it.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && <NoteLightbox note={lightbox} onClose={() => setLightbox(null)} onSaved={noteSaved} onDeleted={noteDeleted} />}
    </div>
  );
}
