'use client';
// The definitions list: a search box, the topics to jump to, one card a topic.
// ⭐ marks the terms exams ask most (14 Oct 2026), with a "⭐ only" chip. A
// link with ?term=<id> (from a lost mark on a marked paper) lands on that term
// and lights it up.
import { useEffect, useMemo, useState } from 'react';
import { groupByTopic, searchDefinitions, splitBold, topicAnchor, type Definition } from '@/lib/science-definitions';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

export default function DefinitionsList({ definitions, topics, hint, focus }: { definitions: readonly Definition[]; topics: readonly string[]; hint: string; focus?: string | null }) {
  const [q, setQ] = useState('');
  const [starOnly, setStarOnly] = useState(false);
  const hasStars = definitions.some(x => x.often);
  const groups = useMemo(
    () => groupByTopic(searchDefinitions(q, definitions).filter(x => !starOnly || x.often), topics),
    [q, starOnly, definitions, topics],
  );
  const focusId = focus && definitions.some(x => x.id === focus) ? focus : null;

  // The browser's own #anchor jump can land before the page settles; jump once more.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  return (
    <div className="space-y-4">
      <input
        type="search" value={q} onChange={e => setQ(e.target.value)}
        placeholder={hint} aria-label="Search the definitions"
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      {hasStars && (
        <div className="flex items-center gap-2 px-1">
          <p className="text-[13px] text-gray-500 flex-1">⭐ often asked in exams</p>
          <button
            type="button" onClick={() => setStarOnly(v => !v)} aria-pressed={starOnly}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${starOnly ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-navy'}`}
          >
            ⭐ only
          </button>
        </div>
      )}

      {!q.trim() && !starOnly && (
        <nav className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 text-[13px] font-semibold" aria-label="Jump to a topic">
          {groups.map(g => (
            <a key={g.topic} href={`#${topicAnchor(g.topic)}`} className="shrink-0 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-navy whitespace-nowrap">{g.topic}</a>
          ))}
        </nav>
      )}

      {groups.length === 0 && <p className="text-[14px] text-gray-500 px-1">Nothing matches “{q.trim()}”. Try one word.</p>}

      {groups.map(g => (
        <section key={g.topic} id={topicAnchor(g.topic)} className={`${CARD} px-4 py-3 scroll-mt-20`} aria-label={g.topic}>
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-blue-700">{g.topic}</h2>
          <dl className="divide-y divide-gray-100">
            {g.items.map(x => (
              <div key={x.id} id={x.id} className={`py-2.5 scroll-mt-24 ${x.id === focusId ? '-mx-2 px-2 rounded-2xl bg-amber-50 ring-2 ring-amber-300' : ''}`}>
                <dt className="text-[15px] font-bold text-navy">
                  {x.term}
                  {x.often && <span className="ml-1.5" role="img" aria-label="often asked in exams" title="Often asked in exams">⭐</span>}
                </dt>
                <dd className="mt-0.5 text-[15px] leading-relaxed text-gray-700">
                  {splitBold(x.text).map((r, i) => r.bold
                    ? <strong key={i} className="font-semibold text-navy bg-amber-100/70 rounded px-0.5">{r.text}</strong>
                    : <span key={i}>{r.text}</span>)}
                </dd>
                {x.formula && <dd className="mt-1 text-[14px] font-mono text-gray-500">{x.formula}</dd>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
