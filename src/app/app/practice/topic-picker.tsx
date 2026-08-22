'use client';

// Student topic picker for /app/practice (2026-08-22).
//
// Three layers, each one tap, so a student can stop at whichever depth they
// mean (Adrian's brief: "practise generically, OR a specific part of the
// topic, OR a particular kind of question — get to the question fast, but to
// the question they want"):
//
//   1. Strand chips      — Algebra / Geometry & Trig / Calculus (3–4 per level)
//   2. Grouped list      — one row per FAMILY ("Differentiation", 5 parts);
//                          tap to unfold its variants. Bare topics are rows.
//   3. Topic sheet       — Standard/Advanced (remembered), "Start" = a mix of
//                          the whole topic, or one QUESTION TYPE from the
//                          bank's subgroup layer ("Tangent at a Point on the
//                          Circle"). Replaces the old separate "How hard?" step.
//
// Search cuts across all three: it matches topic names AND question-type
// names, and a matching type can be started straight from the result row.
// Pure grouping logic lives in lib/practice-strands.ts (tested).

import { useEffect, useMemo, useRef, useState } from 'react';
import { familyOf, groupTopics, strandKey, strandsFor, variantOf } from '@/lib/practice-strands';
import PortalIcon from '@/components/PortalIcon';

export type Tier = 'Standard' | 'Advanced';
export type TopicStatus = 'strong' | 'practising' | 'weak' | 'new';
export type TopicCard = {
  topic: string;
  questionCount: number;
  advancedCount: number;
  attempts: number;
  mastery: number | null;
  status: TopicStatus;
  lastPracticedAt: string | null;
};
export type Recommended = { topic: string; level: string; reason: string };
export type Subgroup = {
  id: number;
  topic: string;
  name: string;
  order: number | null;
  questionCount: number;
  advancedCount: number;
};

export const STATUS_META: Record<TopicStatus, { label: string; cls: string; text: string }> = {
  strong: { label: 'Strong', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-600' },
  practising: { label: 'Practising', cls: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' },
  weak: { label: 'Needs work', cls: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-600' },
  new: { label: 'Not started', cls: 'bg-slate-50 text-slate-500 border-slate-200', text: 'text-slate-400' },
};

/** Remembered Standard/Advanced choice — one fewer tap every time after the first. */
export const TIER_KEY = 'practice_tier_v1';

// Decorative mastery ring (conic-gradient). The % is exposed as text; the ring
// itself is aria-hidden.
export function MasteryRing({ pct, size = 'md' }: { pct: number | null; size?: 'sm' | 'md' }) {
  const gold = 'hsl(42, 95%, 50%)';
  const track = 'hsl(220, 16%, 88%)';
  const deg = pct != null ? Math.round(Math.max(0, Math.min(100, pct)) * 3.6) : 0;
  return (
    <div
      aria-hidden
      className={`relative shrink-0 rounded-full ${size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'}`}
      style={{ background: pct != null ? `conic-gradient(${gold} ${deg}deg, ${track} ${deg}deg)` : track }}
    >
      <div className={`absolute inset-[3px] rounded-full bg-white flex items-center justify-center font-bold text-navy ${size === 'sm' ? 'text-[9px]' : 'text-[11px]'}`}>
        {pct != null ? `${pct}%` : '—'}
      </div>
    </div>
  );
}

function plural(n: number, word: string) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

const ROW = 'w-full text-left flex items-center gap-3 px-3.5 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/60';

function Chevron({ open }: { open?: boolean }) {
  return (
    <PortalIcon
      name={open === undefined ? 'chevron-right' : 'chevron-down'}
      className={`w-4 h-4 text-slate-300 shrink-0 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
    />
  );
}

/** A leaf topic row: ring · name · status · › */
function LeafRow({ t, label, sub, accent, indent, onClick }: {
  t: TopicCard; label?: string; sub?: string; accent?: boolean; indent?: boolean; onClick: () => void;
}) {
  const meta = STATUS_META[t.status];
  return (
    <button type="button" onClick={onClick} className={`${ROW} ${indent ? 'pl-6' : ''} ${accent ? 'bg-amber-50/60 hover:bg-amber-50' : ''}`}>
      <MasteryRing pct={t.mastery} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-navy text-[15px] leading-snug">{label ?? t.topic}</div>
        <div className={`text-[11px] mt-0.5 truncate ${accent ? 'text-amber-800' : meta.text}`}>
          {sub ?? `${meta.label} · ${plural(t.questionCount, 'question')}`}
        </div>
      </div>
      <Chevron />
    </button>
  );
}

export function TopicPicker({ level, topics, recommended, subgroups, loading, search, onSearch, onPick, onStartType }: {
  level: string;                 // bank taxonomy level (AM / EM / JC / S1 / S2) for strand chips
  topics: TopicCard[];
  recommended: Recommended[];
  subgroups: Subgroup[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  onPick: (topic: string) => void;                      // opens the topic sheet
  onStartType: (topic: string, sg: Subgroup) => void;   // search result → straight in
}) {
  // Parent keys this component on `level`, so a level switch remounts it
  // with fresh chip/accordion state — no reset effect needed.
  const [strand, setStrand] = useState('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const typesByTopic = useMemo(() => {
    const m = new Map<string, Subgroup[]>();
    for (const s of subgroups) { const a = m.get(s.topic) ?? []; a.push(s); m.set(s.topic, a); }
    return m;
  }, [subgroups]);

  const chips = strandsFor(level, topics.map(t => t.topic));
  const q = search.trim();
  const inStrand = (t: TopicCard) => strand === 'all' || strandKey(level, t.topic) === strand;
  const groups = groupTopics(topics.filter(inStrand));

  function toggle(family: string) {
    setOpen(prev => { const n = new Set(prev); if (n.has(family)) n.delete(family); else n.add(family); return n; });
  }

  const card = 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] overflow-hidden divide-y divide-slate-100';

  return (
    <div className="space-y-5">
      {/* Search — topics AND question types */}
      <div className="relative">
        <PortalIcon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search} onChange={(e) => onSearch(e.target.value)} type="search"
          placeholder="Search a topic or kind of question…"
          className="w-full bg-white rounded-2xl pl-10 pr-3 py-3 text-[15px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-amber-400/60 placeholder:text-slate-400"
        />
      </div>

      {loading ? (
        <div className={card} aria-busy>
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-[60px] bg-white"><div className="m-3.5 h-8 rounded-lg bg-slate-100 animate-pulse" /></div>)}
        </div>
      ) : topics.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No topics available for this level yet.</p>
      ) : q ? (
        /* ── Search results: flat, with matching question types startable in place ── */
        <SearchResults topics={topics} typesByTopic={typesByTopic} query={q} onPick={onPick} onStartType={onStartType} />
      ) : (<>
        {recommended.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Up next for you</h2>
            <div className={card}>
              {recommended.slice(0, 3).map((r) => {
                const t = topics.find(x => x.topic === r.topic) ?? {
                  topic: r.topic, questionCount: 0, advancedCount: 0, attempts: 0,
                  mastery: null, status: 'new' as const, lastPracticedAt: null,
                };
                return <LeafRow key={r.topic} t={t} sub={r.reason} accent onClick={() => onPick(r.topic)} />;
              })}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 mb-2 px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">All topics</h2>
            <span className="text-[11px] text-slate-400">{plural(topics.length, 'topic')}</span>
          </div>

          {chips.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 mb-3" role="tablist" aria-label="Strand">
              {[{ key: 'all', label: 'All' }, ...chips].map((c) => (
                <button key={c.key} type="button" role="tab" aria-selected={strand === c.key} onClick={() => setStrand(c.key)}
                  className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 motion-safe:transition-colors ${
                    strand === c.key ? 'bg-amber-400 text-navy' : 'bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:text-navy'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className={card}>
            {groups.map((g) => {
              if (g.topics.length === 1) {
                const only = g.topics[0];
                return <LeafRow key={only.topic} t={only.row} onClick={() => onPick(only.topic)} />;
              }
              const isOpen = open.has(g.family);
              const attempted = g.topics.filter(x => x.row.attempts > 0).length;
              return (
                <div key={g.family}>
                  <button type="button" onClick={() => toggle(g.family)} aria-expanded={isOpen} className={ROW}>
                    <span className="w-9 h-9 rounded-xl bg-navy/5 text-navy inline-flex items-center justify-center shrink-0 font-bold text-sm" aria-hidden>
                      {g.topics.length}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-navy text-[15px] leading-snug">{g.family}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {plural(g.topics.length, 'part')} · {plural(g.total, 'question')}{attempted ? ` · ${attempted} started` : ''}
                      </div>
                    </div>
                    <Chevron open={isOpen} />
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
                      {g.topics.map((v) => (
                        <LeafRow key={v.topic} t={v.row} label={v.variant ?? v.topic} indent onClick={() => onPick(v.topic)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </>)}
    </div>
  );
}

function SearchResults({ topics, typesByTopic, query, onPick, onStartType }: {
  topics: TopicCard[]; typesByTopic: Map<string, Subgroup[]>; query: string;
  onPick: (topic: string) => void; onStartType: (topic: string, sg: Subgroup) => void;
}) {
  const ql = query.toLowerCase();
  const hits = topics
    .map(t => {
      const types = typesByTopic.get(t.topic) ?? [];
      const typeHits = types.filter(s => s.name.toLowerCase().includes(ql));
      return { t, typeHits, topicHit: t.topic.toLowerCase().includes(ql) };
    })
    .filter(h => h.topicHit || h.typeHits.length > 0)
    // Topic-name hits first, then by how many types matched.
    .sort((a, b) => Number(b.topicHit) - Number(a.topicHit) || b.typeHits.length - a.typeHits.length);

  if (hits.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nothing matches “{query}”.</p>;
  }
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] overflow-hidden divide-y divide-slate-100">
      {hits.map(({ t, typeHits }) => (
        <div key={t.topic}>
          <LeafRow t={t} onClick={() => onPick(t.topic)} />
          {typeHits.length > 0 && (
            <div className="px-3.5 pb-3 -mt-1 flex flex-wrap gap-1.5">
              {typeHits.slice(0, 4).map((s) => (
                <button key={s.id} type="button" onClick={() => onStartType(t.topic, s)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-800 bg-amber-50 rounded-full pl-2.5 pr-2 py-1 hover:bg-amber-100 motion-safe:transition-colors">
                  {s.name}
                  <PortalIcon name="chevron-right" className="w-3 h-3 opacity-60" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The topic sheet — bottom sheet on phones, centred dialog on wider screens.
 * Start = whole-topic mix (tier applied); or one question type.
 */
export function TopicSheet({ topic, types, tier, onTier, onStart, onClose }: {
  topic: TopicCard;
  types: Subgroup[];
  tier: Tier;
  onTier: (t: Tier) => void;
  onStart: (sg: Subgroup | null) => void;
  onClose: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    startRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const noAdvanced = topic.advancedCount === 0;
  const countFor = (n: number, adv: number) => tier === 'Advanced' ? adv : Math.max(0, n - adv);
  const total = countFor(topic.questionCount, topic.advancedCount);
  const meta = STATUS_META[topic.status];
  const variant = variantOf(topic.topic);
  const family = familyOf(topic.topic);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Practise ${topic.topic}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 w-full h-full bg-navy/50 backdrop-blur-[1px] cursor-default" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6 pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col motion-safe:animate-[sheetUp_200ms_ease-out]">
          <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden><span className="w-10 h-1 rounded-full bg-slate-200" /></div>

          {/* Header */}
          <div className="px-5 pt-3 pb-3 flex items-start gap-3">
            <MasteryRing pct={topic.mastery} />
            <div className="min-w-0 flex-1">
              {variant && <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{family}</p>}
              <h2 className="font-bold text-navy text-lg leading-tight">{variant ?? topic.topic}</h2>
              <p className={`text-[12px] mt-0.5 ${meta.text}`}>{meta.label} · {plural(topic.questionCount, 'question')}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 -mr-1.5 -mt-1 w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-navy inline-flex items-center justify-center">
              <PortalIcon name="x" className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5 overflow-y-auto">
            {/* Tier — segmented, remembered */}
            <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mb-4" role="radiogroup" aria-label="Difficulty">
              {(['Standard', 'Advanced'] as Tier[]).map((t) => {
                const on = tier === t;
                const off = t === 'Advanced' && noAdvanced;
                return (
                  <button key={t} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => onTier(t)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold motion-safe:transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      on ? (t === 'Advanced' ? 'bg-navy text-[hsl(45,100%,96%)] shadow-sm' : 'bg-white text-navy shadow-sm') : 'text-slate-500 hover:text-navy'}`}>
                    {t === 'Advanced' ? <span className="inline-flex items-center gap-1"><PortalIcon name="flame" className="w-3.5 h-3.5" />Advanced</span> : 'Standard'}
                    <span className="block text-[10px] font-medium opacity-70 mt-0.5">
                      {t === 'Advanced' ? (noAdvanced ? 'none yet' : 'harder, multi-step') : 'typical exam'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Primary: the whole topic */}
            <button ref={startRef} type="button" onClick={() => onStart(null)} disabled={total === 0}
              className="w-full rounded-2xl bg-amber-400 text-navy px-4 py-3.5 text-left flex items-center gap-3 hover:bg-amber-300 active:bg-amber-500 motion-safe:transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40">
              <span className="w-10 h-10 rounded-xl bg-white/40 inline-flex items-center justify-center shrink-0" aria-hidden>
                <PortalIcon name="shuffle" className="w-5 h-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[15px]">Start practising</span>
                <span className="block text-[12px] opacity-80">A mix of every kind of question · {total}</span>
              </span>
              <PortalIcon name="chevron-right" className="w-5 h-5 opacity-70 shrink-0" />
            </button>

            {/* Or: one question type */}
            {types.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">Or just one kind of question</p>
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {types.map((s) => {
                    const n = countFor(s.questionCount, s.advancedCount);
                    return (
                      <button key={s.id} type="button" onClick={() => onStart(s)} disabled={n === 0}
                        className={`${ROW} py-2.5 disabled:opacity-40 disabled:cursor-not-allowed`}>
                        <span className="min-w-0 flex-1 text-[14px] font-medium text-navy leading-snug">{s.name}</span>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{n}</span>
                        <Chevron />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
