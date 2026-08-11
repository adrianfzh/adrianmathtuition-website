// /app/marking — the student's own marked scripts.
//
// This is the destination the release nudge points at: triage stamps
// `released_at`, Telegram rings the doorbell with a link to here, and this page
// is where the marks actually live (HANDOFF-MARKING-LOOP.md — portal is the
// destination, Telegram is the doorbell). Until this existed, that link 404'd.
//
// Server component: reads Supabase with the service key and scopes to the
// logged-in student's Airtable id. `paper_marking_runs` has no per-student RLS
// policy, so the ownership filter below IS the access control — it must never
// be driven by anything the client can set.
import Link from 'next/link';
import { currentStudent } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow, type StudentPaper } from '@/lib/portal-marking';

export const dynamic = 'force-dynamic';

// A year of papers is more than any student will scroll, and keeps the payload
// bounded for someone on a phone in a corridor.
const MAX_PAPERS = 40;

// One literal, not a concatenation: supabase-js parses the select string at the
// type level, and a `+` here widens it to `string` and loses the row type.
const COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, pdf_url, released_at, result_json';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

function scoreTint(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-600';
  if (pct >= 75) return 'bg-emerald-100 text-emerald-800';
  if (pct >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

function niceDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export default async function MarkingPage() {
  const { account } = await currentStudent();

  const { data } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('student_id', account.airtable_student_id)
    .not('released_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_PAPERS);

  const { papers, averagePct, trendPts, focus } = buildStudentMarking((data ?? []) as MarkingRunRow[]);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Marked papers</h1>

      {papers.length === 0 ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            Nothing here yet. When Adrian marks a paper for you it appears here — with the marks,
            what went wrong on each question, and your script with the red pen on it.
          </p>
          <Link href="/app" className="inline-block mt-3 text-sm font-semibold text-navy hover:underline">
            ‹ Back to dashboard
          </Link>
        </div>
      ) : (
        <>
          <Summary papers={papers} averagePct={averagePct} trendPts={trendPts} />

          {focus.length > 0 && (
            <div className={`${CARD} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Work on next</p>
              <div className="flex flex-wrap gap-2">
                {focus.map(t => (
                  <span key={t.topic} className="text-sm bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1">
                    {t.topic} <span className="text-gray-500">{t.pct}%</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Where you lost the most marks across your marked papers.
              </p>
            </div>
          )}

          {papers.map(p => <Paper key={p.id} paper={p} />)}
        </>
      )}
    </div>
  );
}

function Summary({ papers, averagePct, trendPts }: {
  papers: StudentPaper[]; averagePct: number | null; trendPts: number | null;
}) {
  const latest = papers.find(p => p.pct !== null);
  if (!latest) return null;

  // ±5 points is the band inside which a score change is just paper-to-paper
  // noise. Calling a 2-point move "improving" would be dishonest encouragement.
  const trend =
    trendPts === null ? null
      : trendPts >= 5 ? { text: `↑ ${trendPts} pts`, cls: 'text-emerald-700' }
      : trendPts <= -5 ? { text: `↓ ${Math.abs(trendPts)} pts`, cls: 'text-rose-700' }
      : { text: 'steady', cls: 'text-gray-500' };

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className={`${CARD} p-4 text-center`}>
        <p className="text-2xl font-bold text-navy">{latest.pct}%</p>
        <p className="text-xs text-gray-500 mt-0.5">latest paper</p>
      </div>
      <div className={`${CARD} p-4 text-center`}>
        <p className="text-2xl font-bold text-navy">{averagePct}%</p>
        <p className="text-xs text-gray-500 mt-0.5">average of {papers.length}</p>
      </div>
      <div className={`${CARD} p-4 text-center`}>
        <p className={`text-2xl font-bold ${trend ? trend.cls : 'text-gray-300'}`}>{trend ? trend.text : '—'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{trend ? 'since your first' : 'no trend yet'}</p>
      </div>
    </div>
  );
}

function Paper({ paper }: { paper: StudentPaper }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-navy leading-snug break-words">{paper.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{niceDate(paper.date)}</p>
        </div>
        <span className={`shrink-0 text-sm font-bold rounded-full px-3 py-1 ${scoreTint(paper.pct)}`}>
          {paper.max > 0 ? `${paper.awarded}/${paper.max}` : '—'}
          {paper.pct !== null && <span className="font-semibold"> · {paper.pct}%</span>}
        </span>
      </div>

      {paper.pdfUrl && (
        <a
          href={paper.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 transition-opacity"
        >
          📄 Open your marked script
        </a>
      )}

      {paper.dropped.length > 0 ? (
        // Collapsed by default and rendered with <details> so this stays a
        // server component — no client bundle just to open a list.
        <details className="mt-3 group">
          <summary className="cursor-pointer text-sm font-semibold text-navy list-none flex items-center gap-1.5">
            <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">›</span>
            Where you lost marks ({paper.dropped.length} question{paper.dropped.length === 1 ? '' : 's'})
          </summary>
          <ul className="mt-2 space-y-2.5">
            {paper.dropped.map((q, i) => (
              <li key={`${q.questionNumber}-${i}`} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold text-navy">
                    Q{q.questionNumber}
                    {q.topic && <span className="ml-2 font-medium text-gray-400">{q.topic}</span>}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-gray-600">{q.awarded}/{q.max}</span>
                </div>
                {q.comment && <p className="text-[13px] text-gray-700 mt-1 leading-snug">{q.comment}</p>}
                {q.slips.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {q.slips.map((s, j) => (
                      <li key={j} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        paper.questions.length > 0 && (
          <p className="text-sm text-emerald-800 mt-3">✅ Full marks on every question marked.</p>
        )
      )}
    </div>
  );
}
