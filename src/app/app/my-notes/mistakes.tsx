'use client';
// My Notebook's one list (21 Sep 2026): mistakes grouped by the paper they
// were last seen on, newest paper first, older papers folded, fixed ones under
// one link at the foot. Every card carries the two student actions on its
// face. The groups come pre-built from lib/notebook-groups (pure, tested);
// this file only draws them and keeps two toggles.
import { useState } from 'react';
import Link from 'next/link';
import { groupHeading, splitFold, type NotebookGroup, type NotebookGroups } from '@/lib/notebook-groups';
import { CorrectedButton, RemoveButton } from './mistake-actions';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const TONE = { rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-800' } as const;

export default function NotebookMistakes({ initial, weakest }: {
  initial: NotebookGroups;
  /** Weakest topics across the marked papers — one line at the top. */
  weakest: { topic: string; pct: number }[];
}) {
  const [groups, setGroups] = useState<NotebookGroup[]>(initial.groups);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  const { open, earlier } = splitFold(groups);
  const total = groups.reduce((n, g) => n + g.mistakes.length, 0);

  function drop(id: string) {
    setGroups(prev => prev.map(g => ({ ...g, mistakes: g.mistakes.filter(m => m.id !== id) })).filter(g => g.mistakes.length > 0));
  }

  const Group = ({ g }: { g: NotebookGroup }) => (
    <section className="space-y-2" data-group={g.key}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">{groupHeading(g)}</p>
      {g.mistakes.map(m => (
        <div key={m.id} data-item-id={`mistake:${m.id}`} className={`${CARD} p-4`}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold leading-snug ${m.tone === 'rose' ? 'text-navy' : 'text-gray-600'}`}>{m.title}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                {[m.where, m.seen > 1 ? `seen ${m.seen} times` : ''].filter(Boolean).join(' · ')}
              </p>
              {m.cameBack && <p className="text-[12px] text-rose-700 font-semibold mt-0.5">It came back after you marked it fixed.</p>}
            </div>
            <span className={`shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap ${TONE[m.tone]}`}>{m.stateText}</span>
          </div>
          {m.practice.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {m.practice.map(p => (
                <Link key={p.id} href={`/app/assignments/${p.id}`} className="text-[12px] font-semibold bg-amber-50 text-amber-800 rounded-full px-3 py-1">✏️ {p.title}</Link>
              ))}
            </div>
          )}
          {/* Remove on every card; "I've fixed this" only while the student has not said so yet. */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5" data-mistake-actions>
            {m.live && <CorrectedButton id={m.id} />}
            <RemoveButton id={m.id} onRemoved={() => drop(m.id)} />
          </div>
        </div>
      ))}
    </section>
  );

  return (
    <div className="space-y-4" data-notebook-mistakes>
      {weakest.length > 0 && (
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
        </p>
      )}

      {total === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          Nothing on your list. Each marked paper adds the slips it found here, so you know what to fix before the next one.
        </div>
      )}

      {open.map(g => <Group key={g.key} g={g} />)}

      {earlier.length > 0 && (
        <div className="space-y-4">
          <button type="button" onClick={() => setEarlierOpen(v => !v)} data-earlier
            className="text-[13px] font-semibold text-navy underline underline-offset-2">
            {earlierOpen ? 'Hide earlier papers' : `Earlier papers (${earlier.length}) ›`}
          </button>
          {earlierOpen && earlier.map(g => <Group key={g.key} g={g} />)}
        </div>
      )}

      {initial.fixed.length > 0 && (
        <div className="space-y-2 pt-2">
          <button type="button" onClick={() => setFixedOpen(v => !v)} data-show-fixed
            className="text-[13px] font-semibold text-emerald-700 underline underline-offset-2">
            {fixedOpen ? 'Hide fixed' : `Fixed (${initial.fixed.length}) ›`}
          </button>
          {fixedOpen && (
            <ul className="space-y-1">
              {initial.fixed.map(f => <li key={f.id} className="text-[13px] text-gray-500">✓ {f.title}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
