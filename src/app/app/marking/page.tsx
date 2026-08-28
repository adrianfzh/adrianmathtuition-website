// /app/marking — the student's own marked scripts.
//
// This is the destination the release nudge points at: triage stamps
// `released_at`, Telegram rings the doorbell with a link to here, and this page
// is where the marks actually live (HANDOFF-MARKING-LOOP.md — portal is the
// destination, Telegram is the doorbell). Until this existed, that link 404'd.
//
// Server component: reads Supabase with the service key and scopes to the
// logged-in student's portal identity (Airtable rec… id, or acct:<uuid> for
// self-serve accounts). `paper_marking_runs` has no per-student RLS
// policy, so the ownership filter below IS the access control — it must never
// be driven by anything the client can set.
import Link from 'next/link';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow, type StudentPaper } from '@/lib/portal-marking';
import AnnotatedSolution from './AnnotatedSolution';
import ClipToNotes from './ClipToNotes';
import { mathHtml } from '@/lib/math-inline';
// Practice questions carry inline $…$ TeX — mathHtml KaTeXes only the math
// spans, and this stylesheet is what makes the output render as maths.
import 'katex/dist/katex.min.css';

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
  const account = await currentAccount();
  // rec… for tuition, acct:<uuid> for strangers — runs are stamped with this
  // same identity by /api/portal/submit, so paying strangers see their papers.
  const sid = portalIdentity(account);
  // Marking-only beta: /app/practice is closed to students, but the same flow
  // is embedded on Home — so their "Work on next" chips deep-link to /app?topic=
  // (the flow reads ?topic= on mount); the full portal links to /app/practice.
  // Practise has its own page for everyone since 2026-08-21 (it briefly
  // lived on Home during the marking-only beta).
  const practiceHref = (topic: string) => `/app/practice?topic=${encodeURIComponent(topic)}`;

  const sb = getSupabaseAdmin();
  // The released list, the pending list (papers this student handed in through
  // /app/submit that Adrian hasn't released yet — portal submissions ONLY, the
  // result_json stamp: a paper Adrian uploaded himself and chose not to
  // release must never surface as a phantom "being marked"; name + date +
  // page count, never a mark).
  const [{ data }, { data: pendingRows }] = await Promise.all([
    sb
      .from('paper_marking_runs')
      .select(COLUMNS)
      .eq('student_id', sid)
      .not('released_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MAX_PAPERS),
    sb
      .from('paper_marking_runs')
      .select('id, created_at, paper_name, num_photos')
      .eq('student_id', sid)
      .eq('result_json->>portal_submission', 'true')
      .is('released_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  const pending = pendingRows ?? [];

  const { papers, averagePct, trendPts, focus, streakNote } = buildStudentMarking((data ?? []) as MarkingRunRow[]);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {/* One "Papers" surface (Adrian, 2026-08-28: Hand in + Marked merged) —
          submitting is the tab's FIRST action, so the merge hides nothing. */}
      <h1 className="text-xl font-bold text-navy pt-1">Papers</h1>
      <Link
        href="/app/submit"
        className="flex items-center gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-sm hover:opacity-90 active:scale-[0.98] transition"
      >
        <span className="text-xl" aria-hidden>📷</span>
        <span className="flex-1">Hand in a paper</span>
        <span className="shrink-0 text-[hsl(43,90%,60%)] text-lg">›</span>
      </Link>

      {pending.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">With Adrian</p>
          <ul className="space-y-1.5">
            {pending.map(p => (
              <li key={p.id} className="text-sm text-gray-700 flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  ⏳ {p.paper_name || 'Submitted paper'}
                  {typeof p.num_photos === 'number' && p.num_photos > 0 && (
                    <span className="text-gray-400"> · {p.num_photos} page{p.num_photos === 1 ? '' : 's'}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-gray-400">{niceDate(String(p.created_at).slice(0, 10))}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-2">Handed in — it appears below once marked and released.</p>
        </div>
      )}

      {papers.length === 0 ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            Nothing here yet. When Adrian marks a paper for you it appears here — with the marks,
            what went wrong on each question, and your script with the red pen on it.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Finished a paper at home? <Link href="/app/submit" className="font-semibold text-navy hover:underline">Photograph and submit it</Link> and
            it comes back marked, right here.
          </p>
          <Link href="/app" className="inline-block mt-3 text-sm font-semibold text-navy hover:underline">
            ‹ Back to dashboard
          </Link>
        </div>
      ) : (
        <>
          <Summary papers={papers} averagePct={averagePct} trendPts={trendPts} />

          {streakNote && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {streakNote}
            </div>
          )}

          {focus.length > 0 && (
            <div className={`${CARD} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Work on next</p>
              <div className="flex flex-wrap gap-2">
                {focus.map(t => (
                  <Link
                    key={t.topic}
                    href={practiceHref(t.topic)}
                    className="text-sm bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1 hover:bg-[hsl(45,80%,88%)] transition-colors"
                  >
                    {t.topic} <span className="text-gray-500">{t.pct}%</span>
                    <span className="ml-1 text-gray-400">›</span>
                  </Link>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Where you lost the most marks across your marked papers — tap one to practise it.
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

      {(paper.pdfUrl || paper.pages.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {paper.pdfUrl && (
            <a
              href={paper.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 transition-opacity"
            >
              📄 Open your marked script
            </a>
          )}
          {/* ✂️ clip a region of the marked pages into /app/my-notes — only
              offered when the run has annotated page images to draw on. */}
          {paper.pages.length > 0 && (
            <ClipToNotes runId={paper.id} paperName={paper.name} pages={paper.pages} />
          )}
        </div>
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
                {q.schemes.length > 0 && (
                  // SEAB teacher-margin shorthand, per part — the same codes a
                  // school marker writes ("M1 A0" = method earned, accuracy lost).
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {q.schemes.map((s, j) => (
                      <span key={j} className="text-[11px] font-mono bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">
                        {s.label ? `${s.label} ` : ''}{s.scheme}
                      </span>
                    ))}
                  </div>
                )}
                {q.comment && <p className="text-[13px] text-gray-700 mt-1 leading-snug">{q.comment}</p>}
                {q.solution && (
                  <details className="mt-2 group/sol">
                    <summary className="cursor-pointer text-[13px] font-semibold text-navy list-none flex items-center gap-1.5">
                      <span className="text-gray-400 group-open/sol:rotate-90 transition-transform inline-block">›</span>
                      📖 The worked solution, annotated
                    </summary>
                    <AnnotatedSolution solution={q.solution} schemes={q.schemes} />
                  </details>
                )}
                {q.slips.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {q.slips.map((s, j) => (
                      <li key={j} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        <MathText text={s} />
                      </li>
                    ))}
                  </ul>
                )}
                {q.revise && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Link
                      href={q.revise.href}
                      className="inline-block text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5 hover:bg-[hsl(45,80%,88%)] transition-colors"
                    >
                      ✏️ Practise: {q.revise.name} <span className="text-gray-400">›</span>
                    </Link>
                    <a
                      href={q.revise.examplesHref}
                      className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-navy"
                    >
                      worked examples ›
                    </a>
                  </div>
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

      {paper.practice.length > 0 && (
        <details className="mt-3 group/pr">
          <summary className="cursor-pointer text-sm font-semibold text-navy list-none flex items-center gap-1.5">
            <span className="text-gray-400 group-open/pr:rotate-90 transition-transform inline-block">›</span>
            📝 Practice these next ({paper.practice.length})
          </summary>
          <p className="text-[11px] text-gray-400 mt-1.5">
            One follow-up question for each question that dropped marks. Try it on paper before peeking at the answer.
          </p>
          <a
            href={`/api/portal/practice-pdf?run=${paper.id}`}
            className="inline-block mt-2 text-xs font-semibold text-navy border border-navy/20 rounded-lg px-3 py-1.5 hover:bg-navy/5"
          >
            ⬇ Download as a worksheet (PDF)
          </a>
          <ul className="mt-2 space-y-2.5">
            {paper.practice.map((it, i) => (
              <li key={i} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                <p className="text-[11px] font-bold text-amber-800 mb-1">
                  For Q{it.for}
                  {it.topic && <span className="font-medium"> · {it.topic}</span>}
                  {it.origin && <span className="font-medium text-amber-700/70"> · {it.origin}</span>}
                </p>
                <MathText text={it.question} className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" />
                {it.note && <MathText text={it.note} className="text-[12px] text-gray-500 italic mt-1.5" />}
                {/* Bank picks (id = questions.id) open in the graded practice
                    flow — attempt it, get it marked, close the loop. Freshly
                    written items (id null) aren't in the bank, so they stay
                    try-on-paper with the answer below. */}
                {it.id && (
                  <div className="mt-2">
                    <Link
                      href={`/app/practice?qid=${it.id}&from=marked`}
                      className="inline-block text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5 hover:bg-[hsl(45,80%,88%)] transition-colors"
                    >
                      ✏️ Try it now <span className="text-gray-400">›</span>
                    </Link>
                  </div>
                )}
                {it.answer && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-emerald-700 list-none">
                      Show answer
                    </summary>
                    <MathText text={it.answer} className="text-[13px] text-emerald-800 mt-1 whitespace-pre-wrap" />
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Server-side KaTeX over inline $…$ spans (same treatment the admin marking
// page gives these strings — lib/math-inline decides what is maths and what
// is a dollar sign).
function MathText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
