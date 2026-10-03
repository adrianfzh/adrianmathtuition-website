'use client';
// The definitions list: a search box, the topics to jump to, one card a topic.
import { useMemo, useState } from 'react';
import { groupByTopic, searchDefinitions, splitBold, topicAnchor, type Definition } from '@/lib/science-definitions';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

export default function DefinitionsList({ definitions, topics, hint }: { definitions: readonly Definition[]; topics: readonly string[]; hint: string }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => groupByTopic(searchDefinitions(q, definitions), topics), [q, definitions, topics]);

  return (
    <div className="space-y-4">
      <input
        type="search" value={q} onChange={e => setQ(e.target.value)}
        placeholder={hint} aria-label="Search the definitions"
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      {!q.trim() && (
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
              <div key={x.id} className="py-2.5">
                <dt className="text-[15px] font-bold text-navy">{x.term}</dt>
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
