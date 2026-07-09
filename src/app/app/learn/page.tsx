'use client';
// /app/learn — topic list in spine order. Tap a topic to reveal its units
// (core → examples → checks → autopsy → try). Per-unit done ticks from
// localStorage. Admin (testing) additionally sees pending units, chipped.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KIND_META } from '@/lib/learn';
import { getDoneMap, getSessionCleared } from '@/lib/learn-progress';
import type { LearnTopic, UnitKind, UnitSummary } from '@/lib/learn-types';
import RecallChat from './RecallChat';

type SubjectOpt = { key: string; label: string };

// Teaching order IS the path — unit_order encodes Adrian's notes sequence
// (core → example → check interleaved per subtopic). Never group by kind.
function sortUnits(units: UnitSummary[]): UnitSummary[] {
  return [...units].sort((a, b) => a.unit_order - b.unit_order);
}

// Part number from unit_order (601.xx → Part 1, 602.xx → Part 2 …)
function partOf(u: UnitSummary): number {
  return Math.floor(u.unit_order) % 100 || 1;
}

function LearnPageInner() {
  const searchParams = useSearchParams();
  const deepLinkTopic = searchParams.get('topic');
  const deepLinkSubject = searchParams.get('subject');

  const [subjects, setSubjects] = useState<SubjectOpt[]>([]);
  const [topics, setTopics] = useState<LearnTopic[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');
  const [sessionCleared, setSessionCleared] = useState(0);

  // Deep-link (from the dashboard Today stack): preselect subject + open topic once.
  const deepLinkApplied = useRef(false);
  const topicRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { setDone(getDoneMap()); setSessionCleared(getSessionCleared()); }, []);

  useEffect(() => {
    fetch('/api/portal/learn/overview')
      .then(async r => {
        if (r.status === 401) { setStatus('locked'); return null; }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setSubjects(d.subjects || []);
        setTopics(d.topics || []);
        // Honour a deep-link subject if the student actually owns it.
        const subjectKeys: string[] = (d.subjects || []).map((s: SubjectOpt) => s.key);
        const initialSubject = deepLinkSubject && subjectKeys.includes(deepLinkSubject)
          ? deepLinkSubject
          : (d.subjects?.[0]?.key ?? null);
        setActiveSubject(initialSubject);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  const visibleTopics = useMemo(() => {
    if (!activeSubject) return topics;
    // If a subject the student owns has topics, scope to it; otherwise show all
    // (covers the fixture, whose subject may differ from the student's).
    const scoped = topics.filter(t => t.subject === activeSubject);
    return scoped.length ? scoped : topics;
  }, [topics, activeSubject]);

  // Apply the deep-link once topics are loaded: switch subject, expand the topic,
  // and scroll it into view.
  useEffect(() => {
    if (deepLinkApplied.current || status !== 'ready' || !deepLinkTopic) return;
    const match =
      topics.find(t => t.topic === deepLinkTopic && (!deepLinkSubject || t.subject === deepLinkSubject)) ||
      topics.find(t => t.topic === deepLinkTopic);
    deepLinkApplied.current = true;
    if (!match) return;
    const key = `${match.subject}|${match.topic}`;
    setActiveSubject(match.subject);
    setOpenTopic(key);
    requestAnimationFrame(() => {
      topicRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [status, topics, deepLinkTopic, deepLinkSubject]);

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm';

  if (status === 'locked') {
    return <div className={`${card} p-5`}><p className="text-sm text-gray-500">Please sign in to view lessons.</p></div>;
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">Learn</h1>
          {sessionCleared > 0 && (
            <p className="text-sm text-[#1f9e6f] font-medium mt-0.5">
              {sessionCleared} {sessionCleared === 1 ? 'unit' : 'units'} cleared this session — keep going
            </p>
          )}
        </div>
        <Link
          href={`/app/learn/map${activeSubject ? `?subject=${encodeURIComponent(activeSubject)}` : ''}`}
          className="text-sm rounded-full px-4 py-1.5 font-semibold bg-white text-gray-600 border border-gray-200 hover:border-navy/40 transition-colors shrink-0"
        >
          🗺 Map
        </Link>
      </div>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <button
              key={s.key}
              onClick={() => { setActiveSubject(s.key); setOpenTopic(null); }}
              className={`text-sm rounded-full px-4 py-1.5 font-semibold transition-colors ${
                s.key === activeSubject
                  ? 'bg-navy text-[hsl(45,100%,96%)]'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {status === 'loading' && (
        <div className={`${card} p-5`}><p className="text-sm text-gray-400">Loading lessons…</p></div>
      )}
      {status === 'error' && (
        <div className={`${card} p-5`}><p className="text-sm text-red-500">Couldn’t load lessons. Please retry.</p></div>
      )}

      {status === 'ready' && visibleTopics.length === 0 && (
        <div className={`${card} p-5`}><p className="text-sm text-gray-500">No lessons available yet.</p></div>
      )}

      {status === 'ready' && (
        <div className="space-y-3">
          {visibleTopics.map(t => {
            const key = `${t.subject}|${t.topic}`;
            const units = sortUnits(t.units);
            const kinds = [...new Set(units.map(u => u.kind))] as UnitKind[];
            const doneCount = units.filter(u => done[u.id]).length;
            const isOpen = openTopic === key;
            return (
              <div key={key} ref={el => { topicRefs.current[key] = el; }} className={`${card} scroll-mt-20`}>
                <button
                  onClick={() => setOpenTopic(isOpen ? null : key)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy truncate">{t.topic}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {units.length} {units.length === 1 ? 'unit' : 'units'}
                      {doneCount > 0 && <span className="text-emerald-600"> · {doneCount} done</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base leading-none">
                      {kinds.map(k => <span key={k} title={KIND_META[k].label}>{KIND_META[k].icon}</span>)}
                    </span>
                    <span className={`text-gray-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </div>
                </button>

                {isOpen && (() => {
                  const nextUp = units.find(u => !done[u.id]) ?? units[0];
                  const nextIdx = units.indexOf(nextUp);
                  return (
                    <div className="border-t border-gray-100">
                      {/* One obvious way in: start or continue the path */}
                      <div className="px-5 py-3 bg-[hsl(45,100%,97%)]">
                        <Link
                          href={`/app/learn/${nextUp.id}`}
                          className="flex items-center justify-between gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-3 font-semibold text-sm shadow-sm hover:opacity-90 transition-opacity"
                        >
                          <span className="min-w-0 truncate">
                            {doneCount === 0 ? '▶ Start here' : '▶ Continue'} · {nextUp.title}
                          </span>
                          <span className="shrink-0 text-xs opacity-80">{doneCount}/{units.length}</span>
                        </Link>
                        <p className="text-[11px] text-gray-400 mt-2">
                          Lessons flow in order — finish one and it takes you to the next. You can also jump to any step below.
                        </p>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {units.map((u, i) => {
                          const showPart = i === 0 || partOf(u) !== partOf(units[i - 1]);
                          const isNext = i === nextIdx;
                          const isFuture = i > nextIdx;
                          return (
                            <div key={u.id}>
                              {showPart && units.some(x => partOf(x) !== partOf(units[0])) && (
                                <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                  Part {partOf(u)}
                                </p>
                              )}
                              <Link
                                href={`/app/learn/${u.id}`}
                                className={`flex items-center gap-3 px-5 py-3 hover:bg-[hsl(45,100%,98%)] transition-colors ${
                                  isNext ? 'bg-[hsl(43,90%,95%)]' : ''
                                } ${isFuture ? 'opacity-60' : ''}`}
                              >
                                <span className={`text-[11px] font-bold w-6 text-center shrink-0 ${isNext ? 'text-navy' : 'text-gray-300'}`}>
                                  {i + 1}
                                </span>
                                <span className="text-lg leading-none w-6 text-center shrink-0">{KIND_META[u.kind].icon}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-gray-800 block truncate">{u.title}</span>
                                  <span className="text-[11px] text-gray-400">{KIND_META[u.kind].label}</span>
                                </span>
                                {u.pending && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">
                                    pending
                                  </span>
                                )}
                                <span className={`text-sm shrink-0 ${done[u.id] ? 'text-emerald-500' : 'text-gray-200'}`}>
                                  {done[u.id] ? '✓' : isNext ? '›' : '○'}
                                </span>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      <RecallChat />
    </div>
  );
}

// useSearchParams must sit under a Suspense boundary for the App Router build.
export default function LearnPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-gray-400">Loading lessons…</div>}>
      <LearnPageInner />
    </Suspense>
  );
}
