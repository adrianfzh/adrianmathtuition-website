// 📈 The score forecast card — Adrian's Papers tab only (17 Sep 2026, Adrian:
// "only show the prediction to me internally"). Server component: builds the
// student's topic profile from their marked papers of this subject and lays
// the bank's GCE 2025 and 2024 papers over it. Every number is a range, and
// the student's own past GCE papers give the honest error line at the foot.
import { loadGcePapers, loadStudentTopicPapers } from '@/lib/score-forecast-store';
import { backtest, buildProfile, forecastPaper, type Level } from '@/lib/score-forecast';

export default async function ForecastCard({ sid, subject }: { sid: string; subject: string }) {
  const level: Level | null = subject === 'A Math' ? 'AM' : subject === 'E Math' ? 'EM' : null;
  if (!level) return null;
  let gce, papers;
  try {
    gce = await loadGcePapers(level);
    papers = await loadStudentTopicPapers(sid, level, gce);
  } catch { return null; }
  if (!papers.length) return null;
  const profile = buildProfile(papers);
  const targets = ['2025', '2024'].flatMap(y => ['1', '2'].map(p => gce.get(`gce ${y} ${level.toLowerCase()} p${p}`))).filter((t): t is NonNullable<typeof t> => !!t);
  if (!targets.length) return null;
  const forecasts = targets.map(t => forecastPaper(profile, t));
  const bt = backtest([{ studentId: sid, papers }], gce, new Date(), { priorOnly: true });
  const evidenceMarks = papers.reduce((a, p) => a + p.questions.reduce((b, q) => b + q.max, 0), 0);
  return (
    // Folded by default (18 Sep 2026, Adrian: "make it default close, only when
    // i click it shows") — the tab leads with the papers; the forecast is a tap away.
    <details className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-4 group" data-forecast>
      <summary className="flex items-baseline justify-between gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700"><span className="inline-block w-3 transition-transform group-open:rotate-90">▸</span> 📈 Forecast · only you see this</p>
        <p className="text-[11px] text-indigo-700/70">from {papers.length} paper{papers.length === 1 ? '' : 's'} · {evidenceMarks} marks of evidence</p>
      </summary>
      <ul className="space-y-1.5 mt-2">
        {forecasts.map(f => (
          <li key={f.key} className="text-[13px] text-indigo-950">
            <span className="font-semibold">{f.label}</span>: <span className="font-bold tabular-nums">{f.low}–{f.high}</span>
            <span className="text-indigo-900/60"> of {f.total} · likely {Math.round(f.expected)}</span>
            {f.unknownMarks >= 5 && <span className="text-indigo-900/60"> · {Math.round(f.unknownMarks)} marks on topics never seen</span>}
            {f.carelessExpected >= 1 && <span className="text-indigo-900/60"> · about {Math.round(f.carelessExpected)} to careless slips</span>}
            {f.trendPer30d >= 0.02 && <span className="text-indigo-900/60"> · improving ≈ {Math.round(f.trendPer30d * 100)} % a month</span>}
            {f.losses.length > 0 && (
              <span className="block text-[12px] text-indigo-900/75 mt-0.5">
                would lose most on {f.losses.slice(0, 3).map(l => `${l.topic} −${Math.round(l.expectedLost)}`).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-indigo-900/60 mt-2">
        {bt.summary.n > 0
          ? `Checked on ${bt.summary.n} GCE paper${bt.summary.n === 1 ? '' : 's'} this student already sat, using only earlier papers: off by ${bt.summary.meanAbsError} marks on average${bt.summary.bias ? ` (${bt.summary.bias > 0 ? 'runs high' : 'runs low'} by ${Math.abs(bt.summary.bias)})` : ''}.`
          : 'No past GCE paper to check this against yet — treat it as a rough guide.'}
        {' '}A range, not a mark. Across all students it is off by about 4 marks (E Math) and 7 (A Math) where the papers cover the topics; a student&apos;s own improvement is projected forward when three or more papers show it.
      </p>
    </details>
  );
}
