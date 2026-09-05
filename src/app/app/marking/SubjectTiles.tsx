'use client';
// The three tiles on /app/marking (latest %, average, trend), per subject.
//
// One subject → the same three tiles the page has always shown, no tabs.
// Two or more (an E Math + A Math account with papers in both) → a row of
// subject pills above the tiles; tapping one swaps the numbers underneath.
// The arithmetic is done server-side (lib/portal-papers-stats, pure + tested);
// this component only chooses which block to show, so the only client state
// is the active tab — no fetch, no recompute.
import { useState } from 'react';
import { subjectPill } from '@/lib/portal-subjects';
import { trendLabel, type SubjectStats } from '@/lib/portal-papers-stats';
import { SUBJECT_TONE } from '@/components/PaperSubjectPill';

// Home's soft elevated card — the same surface the rest of the page uses.
const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

const TREND_CLS = { up: 'text-emerald-700', down: 'text-rose-700', steady: 'text-gray-500' } as const;

export default function SubjectTiles({ stats }: { stats: SubjectStats[] }) {
  const [active, setActive] = useState(0);
  if (stats.length === 0) return null;
  const idx = Math.min(active, stats.length - 1);
  const s = stats[idx];

  return (
    <div className="space-y-2.5">
      {stats.length > 1 && (
        <div role="tablist" aria-label="Subject" className="flex flex-wrap gap-2">
          {stats.map((st, i) => {
            const pill = subjectPill(st.subject);
            if (!pill || pill.tone === 'other') return null;
            const on = i === idx;
            const tone = SUBJECT_TONE[pill.tone];
            return (
              <button
                key={st.subject}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${on ? `${tone.solid} shadow-sm` : `${tone.soft} hover:brightness-95`}`}
              >
                {pill.text}
                <span className={`ml-1.5 font-semibold ${on ? 'text-white/80' : 'opacity-70'}`}>{st.papers}</span>
              </button>
            );
          })}
        </div>
      )}
      <Tiles s={s} />
    </div>
  );
}

function Tiles({ s }: { s: SubjectStats }) {
  const trend = trendLabel(s.trendPts);
  return (
    <div role="tabpanel" className="grid grid-cols-3 gap-3">
      <div className={`${CARD} p-4 text-center`}>
        <p className="text-2xl font-bold text-navy">
          {s.latestPct === null ? '—' : `${s.latestPct}%`}
          {/* Celebration is earned, not decoration: 75%+ is the same bar the streak notice uses. */}
          {s.latestPct !== null && s.latestPct >= 75 ? ' 🎉' : ''}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">latest paper</p>
      </div>
      <div className={`${CARD} p-4 text-center`}>
        <p className="text-2xl font-bold text-navy">{s.averagePct === null ? '—' : `${s.averagePct}%`}</p>
        <p className="text-xs text-gray-500 mt-0.5">average of {s.papers}</p>
      </div>
      <div className={`${CARD} p-4 text-center`}>
        <p className={`text-2xl font-bold ${trend ? TREND_CLS[trend.tone] : 'text-gray-300'}`}>{trend ? trend.text : '—'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{trend ? 'since your first' : 'no trend yet'}</p>
      </div>
    </div>
  );
}
