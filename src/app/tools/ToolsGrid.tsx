'use client';

import { useState } from 'react';

export type ToolLevel = 'sec' | 'jc';
export type Tool = {
  slug: string;
  icon: string;
  title: string;
  desc: string;
  levels: ToolLevel[];
};

const FILTERS: { key: 'all' | ToolLevel; label: string; blurb: string }[] = [
  { key: 'all', label: 'All tools', blurb: '' },
  { key: 'sec', label: 'Secondary', blurb: 'O-Level E-Math and A-Math, Sec 1 to Sec 4.' },
  { key: 'jc', label: 'JC', blurb: 'H2 Math, JC1 and JC2.' },
];

// Most tools genuinely serve both levels, so a tool tagged for both shows up
// under whichever filter you pick rather than being exiled to a middle group.
function badge(levels: ToolLevel[]) {
  if (levels.length === 2) return 'Sec · JC';
  return levels[0] === 'jc' ? 'JC' : 'Sec';
}

export default function ToolsGrid({ tools }: { tools: Tool[] }) {
  const [filter, setFilter] = useState<'all' | ToolLevel>('all');
  const shown = filter === 'all' ? tools : tools.filter((t) => t.levels.includes(filter));
  const active = FILTERS.find((f) => f.key === filter);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          const count = f.key === 'all' ? tools.length : tools.filter((t) => t.levels.includes(f.key as ToolLevel)).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={on}
              className={
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ' +
                (on
                  ? 'bg-navy text-white border-navy'
                  : 'bg-card text-muted-foreground border-border hover:border-amber hover:text-navy')
              }
            >
              {f.label}
              <span className={'text-xs font-normal ' + (on ? 'text-white/70' : 'text-muted-foreground/70')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground mb-8 min-h-[1.25rem]">
        {active?.blurb}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {shown.map((t) => (
          <a
            key={t.slug}
            href={`/tools/${t.slug}.html`}
            className="group flex flex-col bg-card border border-border rounded-2xl p-5 md:p-6 hover:border-amber hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-3xl" aria-hidden>{t.icon}</div>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {badge(t.levels)}
              </span>
            </div>
            <h2 className="font-semibold text-[17px] text-navy group-hover:text-amber-dark transition-colors">{t.title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed flex-1">{t.desc}</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy mt-4 group-hover:gap-2 transition-all">
              Open <span aria-hidden>→</span>
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
