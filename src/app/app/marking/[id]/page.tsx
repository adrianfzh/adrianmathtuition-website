// /app/marking/[id] — ONE marked paper, inside the app (Adrian, 7 Sep 2026:
// "open a paper to its cover page inside the app, with the marked pages below
// it"). The cover ("Where your marks went") first, then every marked page, then
// the sheet written from it, then the PDF for anyone who wants the file.
// Same access rule as the list: the logged-in student's own released run.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { fileHref } from '@/lib/student-files-url';
import PaperSubjectPill from '@/components/PaperSubjectPill';
import ClipToNotes from '../ClipToNotes';
import PracticeAgainRequest, { type PracticeAgainState } from '../PracticeAgainRequest';
import { readNoSheet } from '@/lib/sheet-jobs';
import { displayPaperName } from '@/lib/paper-display-name';

const COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, paper_subject, superseded_by';

function niceDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const sb = getSupabaseAdmin();
  const { data: row } = await sb.from('paper_marking_runs').select(COLUMNS)
    .eq('id', id).eq('student_id', sid).not('released_at', 'is', null).maybeSingle();
  if (!row) notFound();
  const { papers } = buildStudentMarking([row as MarkingRunRow], { studentName: account?.display_name ?? null });
  const paper = papers[0];
  if (!paper) notFound();

  const { data: sheetRows } = await sb.from('portal_assignments')
    .select('id, run_id, status, pdf_url, score, out_of, required_at, source_run_id, source_run_ids')
    .eq('airtable_student_id', sid).eq('source', 'practice-again').eq('kind', 'worksheet')
    // A batch sheet (10 Sep 2026) is this paper's sheet when it covers this paper.
    .or(`source_run_id.eq.${id},source_run_ids.cs.{${id}}`)
    .neq('status', 'held').neq('status', 'revoked')
    // Newest first (9 Sep 2026): a sheet Adrian queued again replaces the earlier
    // one — release-with-sheet withdraws the old row, and this picks the new one
    // even where an old row survived (already handed in or marked).
    .order('created_at', { ascending: false }).limit(1);
  const sheet = (sheetRows ?? [])[0] as { id: string; run_id: string | null; status: string; pdf_url: string | null; score: number | null; out_of: number | null; required_at: string | null; source_run_id: string | null; source_run_ids: string[] | null } | undefined;
  // A batch sheet (10 Sep 2026): the other papers it covers, by their app names,
  // so the student sees that one sheet answers several papers.
  const siblingIds = (sheet?.source_run_ids ?? []).filter(x => x && x !== id);
  let siblings: { id: string; name: string }[] = [];
  if (siblingIds.length) {
    const { data: sibRows } = await sb.from('paper_marking_runs').select('id, paper_name').in('id', siblingIds).eq('student_id', sid);
    siblings = ((sibRows ?? []) as { id: string; paper_name: string | null }[]).map(r => ({ id: r.id, name: displayPaperName(r.paper_name, account?.display_name ?? null) }));
  }
  // No sheet with the student yet: is one being written, waiting on Adrian, or
  // was there nothing worth practising? Else offer the request button
  // (Practice Again on request, 8 Sep 2026 — /api/portal/practice-again/request).
  let requestState: PracticeAgainState = 'none';
  if (!sheet) {
    const { data: jobRows } = await sb.from('sheet_jobs').select('status, result')
      .or(`run_id.eq.${id},run_ids.cs.{${id}}`).order('created_at', { ascending: false }).limit(1);
    const job = (jobRows ?? [])[0] as { status: string; result: unknown } | undefined;
    if (job?.status === 'queued' || job?.status === 'claimed') requestState = 'queued';
    else if (job?.status === 'done') requestState = readNoSheet(job.result).noSheet ? 'nothing' : 'checking';
    // failed / cancelled: they may ask again
  }
  const hasCover = paper.dropped.length > 0;
  const supersededBy = (row as { superseded_by?: string | null }).superseded_by ?? null;
  // Why it was archived (Adrian, 7 Sep 2026: "should say the reason") — a
  // per-run line in result_json.superseded_reason when he wrote one, else the
  // honest default: the marking itself was wrong, so the paper was marked again.
  let supersededNote: string | null = null;
  if (supersededBy) {
    const rj = (row as { result_json?: Record<string, unknown> | null }).result_json ?? {};
    const reason = typeof rj.superseded_reason === 'string' && rj.superseded_reason.trim()
      ? rj.superseded_reason.trim()
      : 'This marking was not done correctly, so the paper was marked again.';
    const { data: current } = await sb.from('paper_marking_runs').select('created_at').eq('id', supersededBy).maybeSingle();
    const when = current?.created_at ? ` The current marking is from ${niceDate(String(current.created_at).slice(0, 10))}.` : '';
    supersededNote = `${reason}${when}`;
  }

  return (
    <div className="space-y-4 pb-8">
      <Link href="/app/marking" className="inline-block text-sm font-semibold text-navy hover:underline">← Papers</Link>

      <header className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-navy text-lg leading-snug break-words">{paper.name}</h1>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5"><PaperSubjectPill subject={paper.subject} /><span>{niceDate(paper.date)}</span></p>
          </div>
          <span className="shrink-0 text-sm font-bold rounded-full px-3 py-1 bg-navy/5 text-navy">
            {paper.max > 0 ? `${paper.awarded}/${paper.max}` : '—'}{paper.pct !== null && <span className="font-semibold"> · {paper.pct}%</span>}
          </span>
        </div>
      </header>

      {/* An earlier marking of a paper marked again (superseded_by) stays
          reachable from "Earlier markings" on the Papers list — archived, not
          deleted (Adrian, 7 Sep 2026) — but says so, and points at the current one. */}
      {supersededBy && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
          <span className="font-semibold">Earlier marking, archived.</span> {supersededNote}{' '}
          <Link href={`/app/marking/${supersededBy}`} className="font-semibold underline underline-offset-2">Open the current marking</Link>
        </p>
      )}

      {hasCover && (
        <section aria-label="Where your marks went" className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/portal/marking-cover?run=${paper.id}`} alt="Where your marks went" className="w-full block" />
        </section>
      )}

      {paper.pages.length > 0 && (
        <section aria-label="Marked pages" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your marked pages</h2>
            <ClipToNotes runId={paper.id} paperName={paper.name} pages={paper.pages} />
          </div>
          {paper.pages.map(p => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.index} src={fileHref(p.url)} alt={p.overflow ? `Worked solution after page ${Math.floor(p.index) + 1}` : `Page ${p.index + 1}`} loading="lazy" className="w-full rounded-2xl border border-black/5 bg-white" />
          ))}
        </section>
      )}

      {sheet && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              {(sheet.source_run_ids?.length ?? 0) > 1 ? `📘 Practice Again — one sheet for your ${sheet.source_run_ids!.length} papers` : '📘 Practice Again — from this paper'}
            </p>
            {siblings.length > 0 && (
              <p className="text-[12px] text-emerald-800/80 mt-0.5">
                Also covers{' '}
                {siblings.map((sb2, i) => (
                  <span key={sb2.id}>{i > 0 ? ' · ' : ''}<Link href={`/app/marking/${sb2.id}`} className="font-semibold underline underline-offset-2">{sb2.name}</Link></span>
                ))}
                {' '}— do it once, hand it in once.
              </p>
            )}
            <p className="text-[12px] text-emerald-800/80 mt-0.5">
              {sheet.status === 'marked' ? `Marked${sheet.score != null && sheet.out_of ? ` · ${sheet.score}/${sheet.out_of}` : ''}`
                : sheet.status === 'submitted' ? 'Handed in — being marked'
                : sheet.required_at ? 'To do — Adrian asked you to do this one. Work through the examples, then hand the practice in'
                : 'To do — work through the examples, then hand the practice in'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sheet.pdf_url && <a href={fileHref(sheet.pdf_url)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold bg-emerald-700 text-white rounded-xl px-3 py-1.5">Open sheet</a>}
            {sheet.status !== 'marked' && sheet.status !== 'submitted' && <Link href={`/app/submit?assignment=${sheet.id}`} className="text-xs font-semibold text-emerald-900 border border-emerald-700/30 rounded-xl px-3 py-1.5 bg-white">Hand in</Link>}
          </div>
          {/* The marked sheet opens from its paper (grouped, 8 Sep 2026) — same view as a paper. */}
          {sheet.status === 'marked' && sheet.run_id && (
            <Link href={`/app/marking/${sheet.run_id}`} data-track="marking:open"
              className="basis-full flex items-center justify-between gap-3 rounded-xl bg-white border border-emerald-200 px-3 py-2 hover:bg-emerald-50 transition-colors">
              <span className="text-sm font-semibold text-emerald-900">📄 Open your marked sheet</span>
              <span className="shrink-0 text-emerald-800 text-sm">›</span>
            </Link>
          )}
        </section>
      )}

      {!sheet && !supersededBy && !/^\s*practice again\b/i.test(paper.rawName ?? '') && <PracticeAgainRequest runId={paper.id} state={requestState} />}

      {paper.pdfUrl && (
        <p className="text-center">
          <a href={`/api/portal/marking-pdf?run=${paper.id}&kind=marked`} target="_blank" rel="noopener noreferrer" data-track="marking:open"
            className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 bg-white hover:bg-navy/5">⬇ Download as PDF</a>
        </p>
      )}
    </div>
  );
}
