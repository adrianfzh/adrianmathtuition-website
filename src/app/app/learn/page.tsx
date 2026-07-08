'use client';
// /app/learn — topic list in spine order. Tap a topic to reveal its units
// (core → examples → checks → autopsy → try). Per-unit done ticks from
// localStorage. Admin (testing) additionally sees pending units, chipped.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { KIND_META, KIND_RANK } from '@/lib/learn';
import { getDoneMap } from '@/lib/learn-progress';
import type { LearnTopic, UnitKind, UnitSummary } from '@/lib/learn-types';

type SubjectOpt = { key: string; label: string };

function sortUnits(units: UnitSummary[]): UnitSummary[] {
  return [...units].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.unit_order - b.unit_order,
  );
}

export default function LearnPage() {
  const [subjects, setSubjects] = useState<SubjectOpt[]>([]);
  const [topics, setTopics] = useState<LearnTopic[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');

  useEffect(() => { setDone(getDoneMap()); }, []);

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
        setActiveSubject((d.subjects?.[0]?.key) ?? null);
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

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm';

  if (status === 'locked') {
    return <div className={`${card} p-5`}><p className="text-sm text-gray-500">Please sign in to view lessons.</p></div>;
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Learn</h1>

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
              <div key={key} className={card}>
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

                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {units.map(u => (
                      <Link
                        key={u.id}
                        href={`/app/learn/${u.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-[hsl(45,100%,98%)] transition-colors"
                      >
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
                          {done[u.id] ? '✓' : '○'}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
