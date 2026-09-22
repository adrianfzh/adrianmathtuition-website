'use client';
// A Math | E Math — the Papers tab split by subject (Adrian, 17 Sep 2026:
// "separate A Math papers from E Math papers"). Each panel is rendered on the
// server (tiles, list, everything) and handed here as a node; the only client
// state is which panel is showing. One panel → no tabs, just the content.
// The default is the subject of the paper the student handed in last — unless
// this device already picked a tab: coming back from a paper lands on the tab
// you left (Adrian, 22 Sep 2026: "should be to the tab where user was last at").
const REMEMBER_KEY = 'portal_papers_subject';
import { useEffect, useState, type ReactNode } from 'react';
import { SUBJECT_TONE } from '@/components/PaperSubjectPill';
import type { SubjectTone } from '@/lib/portal-subjects';

export interface SubjectPanel {
  key: string;
  label: string;
  tone: SubjectTone;
  count: number;
  content: ReactNode;
}

export default function SubjectPanels({ panels, defaultKey }: { panels: SubjectPanel[]; defaultKey: string }) {
  const [active, setActive] = useState(defaultKey);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved && panels.some(p => p.key === saved)) setActive(saved);
    } catch { /* private mode — the default tab is fine */ }
  }, [panels]);
  const pick = (key: string) => {
    setActive(key);
    try { localStorage.setItem(REMEMBER_KEY, key); } catch { /* ignore */ }
  };
  if (panels.length === 0) return null;
  const current = panels.find(p => p.key === active) ?? panels[0];
  if (panels.length === 1) return <>{current.content}</>;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Subject" className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-black/[0.04] p-1">
        {panels.map(p => {
          const on = p.key === current.key;
          const tone = p.tone === 'other' ? { solid: 'bg-gray-700 text-white', soft: 'text-gray-600' } : { solid: SUBJECT_TONE[p.tone].solid, soft: 'text-gray-600' };
          return (
            <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => pick(p.key)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${on ? `${tone.solid} shadow-sm` : `${tone.soft} hover:bg-white/70`}`}>
              {p.label}
              <span className={`ml-1.5 font-semibold ${on ? 'text-white/80' : 'text-gray-400'}`}>{p.count}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" key={current.key}>{current.content}</div>
    </div>
  );
}
