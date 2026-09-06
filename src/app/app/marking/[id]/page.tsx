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

const COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, paper_subject';

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
    .select('id, status, pdf_url, score, out_of')
    .eq('airtable_student_id', sid).eq('source', 'practice-again').eq('kind', 'worksheet').eq('source_run_id', id)
    .neq('status', 'held').neq('status', 'revoked').limit(1);
  const sheet = (sheetRows ?? [])[0] as { id: string; status: string; pdf_url: string | null; score: number | null; out_of: number | null } | undefined;
  const hasCover = paper.dropped.length > 0;

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
            <img key={p.index} src={fileHref(p.url)} alt={`Page ${p.index + 1}`} loading="lazy" className="w-full rounded-2xl border border-black/5 bg-white" />
          ))}
        </section>
      )}

      {sheet && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">📘 Practice Again — written from this paper</p>
            <p className="text-[12px] text-emerald-800/80 mt-0.5">
              {sheet.status === 'marked' ? `Marked${sheet.score != null && sheet.out_of ? ` · ${sheet.score}/${sheet.out_of}` : ''}`
                : sheet.status === 'submitted' ? 'Handed in — being marked' : 'To do — work through the examples, then hand the practice in'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sheet.pdf_url && <a href={fileHref(sheet.pdf_url)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold bg-emerald-700 text-white rounded-xl px-3 py-1.5">Open sheet</a>}
            {sheet.status !== 'marked' && sheet.status !== 'submitted' && <Link href={`/app/submit?assignment=${sheet.id}`} className="text-xs font-semibold text-emerald-900 border border-emerald-700/30 rounded-xl px-3 py-1.5 bg-white">Hand in</Link>}
          </div>
        </section>
      )}

      {paper.pdfUrl && (
        <p className="text-center">
          <a href={`/api/portal/marking-pdf?run=${paper.id}&kind=marked`} target="_blank" rel="noopener noreferrer" data-track="marking:open"
            className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 bg-white hover:bg-navy/5">⬇ Download as PDF</a>
        </p>
      )}
    </div>
  );
}
