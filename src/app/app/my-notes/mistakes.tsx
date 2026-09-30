'use client';
// My Notebook's one list (21 Sep 2026): mistakes grouped by the paper they
// were last seen on, newest paper first, older papers folded, fixed ones under
// one link at the foot. Since 1 Oct 2026 a paper's cards are its lost-marks
// QUESTIONS, each showing the comparison the page rendered (`compare[key]`,
// app/marking/MistakeCompare.tsx) with the entry tags and the two student
// actions under it; an entry no question claimed is a title-only card. The
// groups come pre-built from lib/notebook-groups (pure, tested); this file
// only draws them and keeps the toggles.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { groupHeading, isPaperGroup, splitCards, splitFold, type NotebookGroup, type NotebookGroupWithCards, type NotebookGroups, type NotebookMistake } from '@/lib/notebook-groups';
import { CorrectedButton, RemoveButton } from './mistake-actions';
import PaperSubjectPill from '@/components/PaperSubjectPill';
import { isScienceSubject } from '@/lib/portal-subjects';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const TONE = { rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-800' } as const;

/** `${runId}:${questionNumber}` → the server-rendered comparison. Missing = the group is folded. */
export type CompareNodes = Record<string, ReactNode>;

export default function NotebookMistakes({ initial, cardGroups, compare, showEarlier, weakest }: {
  initial: NotebookGroups;
  cardGroups: NotebookGroupWithCards[];
  compare: CompareNodes;
  /** `?earlier=1`: every group is open and rendered. */
  showEarlier: boolean;
  /** Weakest topics across the marked papers — one line at the top. */
  weakest: { topic: string; pct: number }[];
}) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [moreOpen, setMoreOpen] = useState<Set<string>>(() => new Set());
  const [fixedOpen, setFixedOpen] = useState(false);
  const alive = (m: NotebookMistake) => !removed.has(m.id);
  const drop = (id: string) => setRemoved(prev => new Set(prev).add(id));

  // The question-card groups when the page built them, else the plain ones (no papers loaded).
  const groups: NotebookGroupWithCards[] = cardGroups.length
    ? cardGroups
    : initial.groups.map((g): NotebookGroupWithCards => ({ ...g, cards: [], loose: g.mistakes }));
  const { open, earlier } = splitFold(groups);
  const shownGroups = showEarlier ? groups : open;
  const total = groups.reduce((n, g) => n + g.mistakes.filter(alive).length + g.cards.filter(c => c.entries.length === 0).length, 0);

  /** The tags + the two actions for the entries on a card (each entry keeps its own buttons). */
  const Entries = ({ entries }: { entries: NotebookMistake[] }) => (
    <>
      {entries.filter(alive).map(m => (
        <div key={m.id} data-item-id={`mistake:${m.id}`} className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-black/5" data-mistake-actions>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-orange-50 text-orange-800 rounded-full px-2.5 py-0.5">
            {m.title}
            {isScienceSubject(m.subject) && <PaperSubjectPill subject={m.subject} />}
          </span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 font-semibold whitespace-nowrap ${TONE[m.tone]}`}>{m.stateText}</span>
          {m.seen > 1 && <span className="text-[12px] text-gray-400">seen {m.seen} times</span>}
          {m.cameBack && <span className="text-[12px] text-rose-700 font-semibold">It came back after you marked it fixed.</span>}
          {m.practice.map(p => (
            <Link key={p.id} href={`/app/assignments/${p.id}`} className="text-[12px] font-semibold bg-amber-50 text-amber-800 rounded-full px-3 py-1">✏️ {p.title}</Link>
          ))}
          <span className="basis-full" />
          {m.live && <CorrectedButton id={m.id} />}
          <RemoveButton id={m.id} onRemoved={() => drop(m.id)} />
        </div>
      ))}
    </>
  );

  /** An entry the loaded papers hold no question for (a deleted run, a practice attempt): the title-only card. */
  const LooseCard = ({ m }: { m: NotebookMistake }) => (
    <div data-item-id={`mistake:${m.id}`} className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold leading-snug ${m.tone === 'rose' ? 'text-navy' : 'text-gray-600'}`}>
            {m.title}
            {isScienceSubject(m.subject) && <span className="ml-1.5 align-middle"><PaperSubjectPill subject={m.subject} /></span>}
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5">{[m.where, m.seen > 1 ? `seen ${m.seen} times` : ''].filter(Boolean).join(' · ')}</p>
          {m.cameBack && <p className="text-[12px] text-rose-700 font-semibold mt-0.5">It came back after you marked it fixed.</p>}
        </div>
        <span className={`shrink-0 text-[11px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap ${TONE[m.tone]}`}>{m.stateText}</span>
      </div>
      {m.practice.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {m.practice.map(p => <Link key={p.id} href={`/app/assignments/${p.id}`} className="text-[12px] font-semibold bg-amber-50 text-amber-800 rounded-full px-3 py-1">✏️ {p.title}</Link>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2.5" data-mistake-actions>
        {m.live && <CorrectedButton id={m.id} />}
        <RemoveButton id={m.id} onRemoved={() => drop(m.id)} />
      </div>
    </div>
  );

  const Group = ({ g }: { g: NotebookGroupWithCards }) => {
    // A card whose every entry the student removed goes with them; a card with no entry stays (it is the paper's own record).
    const cards = g.cards.filter(c => c.entries.length === 0 || c.entries.some(alive));
    const { open: openCards, more } = splitCards(cards);
    const showAll = moreOpen.has(g.key);
    const shown = showAll ? cards : openCards;
    const loose = g.loose.filter(alive);
    if (!shown.length && !loose.length) return null;
    return (
      <section className="space-y-2" data-group={g.key}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">{groupHeading(g)}</p>
        {shown.map(c => (
          <div key={c.key} data-question-card={c.key} className={`${CARD} p-4 space-y-2`}>
            {compare[c.key] ?? <p className="text-sm font-bold text-navy">Q{c.questionNumber}</p>}
            <Entries entries={c.entries} />
          </div>
        ))}
        {more.length > 0 && !showAll && (
          <button type="button" onClick={() => setMoreOpen(prev => new Set(prev).add(g.key))} data-more
            className="text-[13px] font-semibold text-navy underline underline-offset-2">
            {more.map(c => `Q${c.questionNumber}`).join(', ')} — {more.length} more on this paper ›
          </button>
        )}
        {loose.map(m => <LooseCard key={m.id} m={m} />)}
      </section>
    );
  };

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

      {shownGroups.map(g => <Group key={g.key} g={g} />)}

      {earlier.length > 0 && !showEarlier && (
        <Link href="?earlier=1" data-earlier className="inline-block text-[13px] font-semibold text-navy underline underline-offset-2">
          Earlier papers ({earlier.length}) ›
        </Link>
      )}
      {showEarlier && earlier.length > 0 && (
        <Link href="/app/my-notes" data-earlier className="inline-block text-[13px] font-semibold text-navy underline underline-offset-2">
          Hide earlier papers
        </Link>
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
