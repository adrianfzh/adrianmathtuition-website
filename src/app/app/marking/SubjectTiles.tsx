// The three tiles on /app/marking (latest %, average, trend) for ONE subject,
// plus the sparkline of the last five papers (17 Sep 2026: "make scores more
// obvious — so students can see clearly and their progress"). The subject
// tabs that used to live here moved up to SubjectPanels, which switches the
// whole list, not just the numbers. Server component — the arithmetic is
// lib/portal-papers-stats (pure, tested); this only draws it.
import { trendLabel, type SubjectStats } from '@/lib/portal-papers-stats';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';
const TREND_CLS = { up: 'text-emerald-700', down: 'text-rose-700', steady: 'text-gray-500' } as const;

export default function SubjectTiles({ s }: { s: SubjectStats }) {
  const trend = trendLabel(s.trendPts);
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        <div className={`${CARD} p-3 text-center`}>
          <p className="text-2xl font-bold text-navy">
            {s.latestPct === null ? '—' : `${s.latestPct}%`}
            {/* Celebration is earned, not decoration: 75%+ is the same bar the streak notice uses. */}
            {s.latestPct !== null && s.latestPct >= 75 ? ' 🎉' : ''}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">latest paper</p>
        </div>
        <div className={`${CARD} p-3 text-center`}>
          <p className="text-2xl font-bold text-navy">{s.averagePct === null ? '—' : `${s.averagePct}%`}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">average of {s.papers}</p>
        </div>
        <div className={`${CARD} p-3 text-center`}>
          <p className={`text-2xl font-bold ${trend ? TREND_CLS[trend.tone] : 'text-gray-300'}`}>{trend ? trend.text : '—'}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{trend ? 'since your first' : 'no trend yet'}</p>
        </div>
      </div>
      {s.recentPcts.length >= 2 && <Sparkline pcts={s.recentPcts} />}
    </div>
  );
}

/** The last five papers as a line, oldest → newest, each point labelled. */
function Sparkline({ pcts }: { pcts: number[] }) {
  const W = 300, H = 64, L = 24, R = 24, TOP = 18, BOT = 10;
  const n = pcts.length;
  const x = (i: number) => (n === 1 ? W / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (pct: number) => TOP + (1 - pct / 100) * (H - TOP - BOT);
  const pts = pcts.map((p, i) => `${x(i)},${y(p)}`).join(' ');
  return (
    <div className={`${CARD} px-3 pt-2.5 pb-2`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Your last {n} papers</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 mt-0.5 text-navy" role="img" aria-label={`Scores, oldest to newest: ${pcts.map(p => `${p}%`).join(', ')}`}>
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pcts.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p)} r="4" fill={p >= 75 ? '#10b981' : p >= 50 ? '#f59e0b' : '#f43f5e'} stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={y(p) - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{p}%</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
