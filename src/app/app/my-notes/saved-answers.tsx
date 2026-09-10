'use client';

// 💾 Saved answers — the band in My Notebook (SPEC-NOTEBOOK-V2 §1, 11 Sep 2026).
// Cards grouped by topic, each tagged with its bank sub-skill, the student's own
// title editable in place; open a card to read the question and the worked
// answer rendered exactly as the Ask tab rendered it (the same renderToElement,
// KaTeX loaded here the same way). Rename → PATCH, delete → DELETE on
// /api/portal/notebook/saves.
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { portalFetch } from '@/lib/portal-fetch';
import { renderToElement, whenKatexReady } from '@/lib/chat-solver';
import { groupSavesByTopic, type SaveRow } from '@/lib/notebook-saves';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

function niceDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

function AnswerBody({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    whenKatexReady(() => { if (ref.current) renderToElement(ref.current, text); });
  }, [text]);
  return <div ref={ref} className={className} />;
}

export default function SavedAnswers({ initial }: { initial: SaveRow[] }) {
  const [saves, setSaves] = useState<SaveRow[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  if (saves.length === 0) return null;
  const groups = groupSavesByTopic(saves);

  async function rename(s: SaveRow) {
    const title = window.prompt('Name this card', s.title);
    if (title == null || !title.trim() || title.trim() === s.title) return;
    setBusy('rename:' + s.id);
    try {
      const r = await portalFetch<{ save: SaveRow }>('/api/portal/notebook/saves', { method: 'PATCH', json: { id: s.id, title } });
      setSaves(prev => prev.map(x => (x.id === s.id ? r.save : x)));
    } catch { setMsg('Could not rename it — try again.'); } finally { setBusy(''); }
  }
  async function remove(s: SaveRow) {
    if (!window.confirm(`Delete “${s.title}” from your notebook?`)) return;
    setBusy('delete:' + s.id);
    try {
      await portalFetch('/api/portal/notebook/saves', { method: 'DELETE', json: { id: s.id } });
      setSaves(prev => prev.filter(x => x.id !== s.id));
    } catch { setMsg('Could not delete it — try again.'); } finally { setBusy(''); }
  }

  return (
    <section data-saved-answers>
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        💾 Saved answers <span className="normal-case font-medium">· {saves.length}</span>
      </p>
      {msg && <p className="text-[12px] text-rose-700 mb-2">{msg}</p>}
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.topic}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.topic}</p>
            <div className="space-y-2">
              {g.saves.map(s => {
                const open = openId === s.id;
                return (
                  <div key={s.id} className={`${CARD} p-4`} data-save-id={s.id}>
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setOpenId(open ? null : s.id)} className="min-w-0 text-left flex-1">
                        <p className="text-sm font-bold text-navy leading-snug">{s.title}</p>
                        <p className="text-[12px] text-gray-500 mt-0.5">
                          {s.skill ? <span className="text-sky-800">{s.skill} · </span> : null}saved {niceDate(s.created_at)}
                        </p>
                      </button>
                      <span className={`text-gray-400 transition-transform inline-block ${open ? 'rotate-90' : ''}`} aria-hidden>›</span>
                    </div>
                    {open && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                        {s.question_text && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">You asked</p>
                            <AnswerBody text={s.question_text} className="text-[13px] text-gray-700 leading-relaxed" />
                          </div>
                        )}
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">The answer</p>
                          <AnswerBody text={s.answer_text} className="text-sm text-gray-800 leading-relaxed" />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={() => rename(s)} disabled={busy === 'rename:' + s.id}
                            className="text-[12px] font-semibold text-navy border border-black/10 rounded-full px-3 py-1 hover:bg-navy/5">✏️ Rename</button>
                          <button type="button" onClick={() => remove(s)} disabled={busy === 'delete:' + s.id}
                            className="text-[12px] font-semibold text-rose-700 border border-rose-200 rounded-full px-3 py-1 hover:bg-rose-50">🗑 Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">Saved from the Ask tab. The blue tag is the skill the answer was filed under; the title is yours to change.</p>
    </section>
  );
}
