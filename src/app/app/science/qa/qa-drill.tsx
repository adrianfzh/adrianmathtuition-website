'use client';
// The qualitative-analysis flashcard drill (24 Sep 2026, the chemistry study
// loop): tap a card to flip it, then ✓ Knew it or ↻ Again. "Again" cards come
// round once more at the end of the round; the ones a student knew are kept
// per device (localStorage, best-effort) so the next round can start with the
// ones still to learn. Two directions: the ion → what you see, or what you see
// → the ion. No server state, no switches, no marks.
import { useEffect, useMemo, useState } from 'react';
import {
  QA_GROUP_LABEL, buildDeck, orderRound, shuffle,
  type DeckCard, type QaCard, type QaDirection, type QaGroup,
} from '@/lib/qa-cards';

const KNOWN_KEY = 'portal_qa_known';
const ALL_GROUPS: QaGroup[] = ['cation', 'anion', 'gas'];

function readKnown(): Set<string> {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function writeKnown(known: Set<string>) {
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify([...known])); } catch { /* private window, blocked storage */ }
}

export default function QaDrill({ cards }: { cards: readonly QaCard[] }) {
  const [direction, setDirection] = useState<QaDirection>('forward');
  const [groups, setGroups] = useState<QaGroup[]>(ALL_GROUPS);
  const [known, setKnown] = useState<Set<string>>(() => new Set());
  const [seed, setSeed] = useState(1);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [queue, setQueue] = useState<DeckCard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ knew: 0, again: 0, total: 0 });
  const [againIds, setAgainIds] = useState<Set<string>>(() => new Set());

  useEffect(() => { setKnown(readKnown()); }, []);

  const deck = useMemo(() => buildDeck(cards, direction, groups), [cards, direction, groups]);
  const unknownCount = deck.filter(d => !known.has(d.id)).length;

  function start(unknownOnly: boolean) {
    const round = orderRound(shuffle(deck, seed), known, unknownOnly);
    setSeed(s => s + 1);
    setOnlyUnknown(unknownOnly);
    setQueue(round);
    setFlipped(false);
    setTally({ knew: 0, again: 0, total: round.length });
    setAgainIds(new Set());
  }

  function answer(knew: boolean) {
    if (!queue || queue.length === 0) return;
    const [card, ...rest] = queue;
    const nextKnown = new Set(known);
    if (knew) nextKnown.add(card.id); else nextKnown.delete(card.id);
    setKnown(nextKnown);
    writeKnown(nextKnown);
    const firstTime = !againIds.has(card.id);
    if (firstTime) setTally(t => ({ ...t, knew: t.knew + (knew ? 1 : 0), again: t.again + (knew ? 0 : 1) }));
    if (knew) setQueue(rest);
    else {
      // Back of the queue — it comes round again before the round ends.
      setAgainIds(prev => new Set(prev).add(card.id));
      setQueue([...rest, card]);
    }
    setFlipped(false);
  }

  function toggleGroup(g: QaGroup) {
    setGroups(prev => (prev.includes(g) ? prev.filter(x => x !== g) : ALL_GROUPS.filter(x => prev.includes(x) || x === g)));
    setQueue(null);
  }

  const card = queue?.[0] ?? null;
  const done = queue !== null && queue.length === 0;
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-[12px] font-semibold transition ${on ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`;

  return (
    <div className="space-y-3">
      {/* What to drill */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_GROUPS.map(g => (
          <button key={g} type="button" onClick={() => toggleGroup(g)} aria-pressed={groups.includes(g)} className={chip(groups.includes(g))}>
            {QA_GROUP_LABEL[g]}
          </button>
        ))}
        <span className="mx-1 text-gray-300" aria-hidden>·</span>
        <button type="button" onClick={() => { setDirection(d => (d === 'forward' ? 'reverse' : 'forward')); setQueue(null); }}
          className="rounded-full px-3 py-1 text-[12px] font-semibold bg-white text-gray-600 border border-gray-200">
          {direction === 'forward' ? 'Ion → what you see' : 'What you see → ion'}
        </button>
      </div>

      {card ? (
        <>
          <p className="text-[12px] text-gray-500">
            {tally.total - queue!.length + 1} of {tally.total}
            {againIds.has(card.id) && <span className="ml-1.5 text-amber-600 font-semibold">· again</span>}
          </p>
          <button
            type="button"
            onClick={() => setFlipped(f => !f)}
            aria-label={flipped ? 'Hide the answer' : 'Show the answer'}
            className={`w-full min-h-[11rem] rounded-3xl border p-5 text-left transition active:scale-[0.99] ${
              flipped ? 'bg-purple-50 border-purple-200' : 'bg-white border-black/5 shadow-[0_6px_16px_-4px_rgba(15,23,42,0.08)]'
            }`}
          >
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
              {QA_GROUP_LABEL[card.group].replace(/s$/, '')} · {card.cue}
            </p>
            <p className="mt-2 text-lg font-bold text-navy leading-snug">{card.front}</p>
            {flipped ? (
              <p className="mt-3 text-[15px] text-purple-900 leading-snug">{card.back}</p>
            ) : (
              <p className="mt-3 text-[13px] text-gray-400">Tap to see the answer</p>
            )}
          </button>
          {flipped ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => answer(false)}
                className="rounded-2xl bg-white border border-amber-200 text-amber-800 font-semibold py-3 active:scale-[0.98]">
                ↻ Again
              </button>
              <button type="button" onClick={() => answer(true)}
                className="rounded-2xl bg-purple-600 text-white font-semibold py-3 active:scale-[0.98]">
                ✓ Knew it
              </button>
            </div>
          ) : (
            <p className="text-center text-[12px] text-gray-400">Say it to yourself first, then flip.</p>
          )}
        </>
      ) : done ? (
        <div className="rounded-3xl bg-white border border-black/5 p-5 text-center space-y-3">
          <p className="text-base font-bold text-navy">Round done</p>
          <p className="text-[13px] text-gray-600">
            {tally.knew} of {tally.total} first time{tally.again > 0 ? ` · ${tally.again} came round again` : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => start(false)} className="rounded-full bg-purple-600 text-white font-semibold px-4 py-2 text-sm">Start again</button>
            {unknownCount > 0 && (
              <button type="button" onClick={() => start(true)} className="rounded-full bg-white border border-gray-200 text-gray-700 font-semibold px-4 py-2 text-sm">
                Only the {unknownCount} I don&apos;t know yet
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-black/5 p-5 text-center space-y-3">
          <p className="text-[13px] text-gray-600">
            {deck.length} card{deck.length === 1 ? '' : 's'}
            {known.size > 0 && unknownCount < deck.length ? ` · ${deck.length - unknownCount} you knew last time` : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => start(false)} disabled={deck.length === 0}
              className="rounded-full bg-purple-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-40">
              Start
            </button>
            {unknownCount > 0 && unknownCount < deck.length && (
              <button type="button" onClick={() => start(true)} className="rounded-full bg-white border border-gray-200 text-gray-700 font-semibold px-4 py-2 text-sm">
                Only the {unknownCount} I don&apos;t know yet
              </button>
            )}
          </div>
        </div>
      )}

      {known.size > 0 && (
        <p className="text-center">
          <button type="button" onClick={() => { const empty = new Set<string>(); setKnown(empty); writeKnown(empty); setQueue(null); }}
            className="text-[12px] text-gray-400 underline underline-offset-2">
            Forget what I knew
          </button>
        </p>
      )}
    </div>
  );
}
