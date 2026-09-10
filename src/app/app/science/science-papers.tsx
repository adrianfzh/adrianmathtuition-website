// The Science tab's paper list — shared by /app/science (Home) and
// /app/science/papers (the full list). Science runs are the student's own
// runs whose marking lane is not maths (paper_marking_runs.subject), released
// or still with Adrian. Deliberately simpler than the maths Papers page: no
// per-subject tiles, no Practice Again, no "Work on next" — marking first
// (Adrian, 10 Sep 2026: "for the science tab, just put marking functionality
// first"). Server component; ownership = the student_id filter, never the client.
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import PaperSubjectPill from '@/components/PaperSubjectPill';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';

export const SCIENCE_COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, paper_subject, subject';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';
const M = SURFACES.marking;

function scoreChip(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-600';
  if (pct >= 75) return 'bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.7)]';
  if (pct >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

export function niceDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export type SciencePending = { id: string; created_at: string; paper_name: string | null; num_photos: number | null; subject: string | null };

/** The student's science runs: released papers (newest first) and the ones still being marked. */
export async function loadSciencePapers(sid: string, studentName: string | null, limit = 40) {
  const sb = getSupabaseAdmin();
  const [{ data: released }, { data: pendingRows }] = await Promise.all([
    sb.from('paper_marking_runs').select(SCIENCE_COLUMNS)
      .eq('student_id', sid).not('subject', 'eq', 'math')
      .not('released_at', 'is', null).is('superseded_by', null)
      .order('created_at', { ascending: false }).limit(limit),
    sb.from('paper_marking_runs').select('id, created_at, paper_name, num_photos, subject')
      .eq('student_id', sid).not('subject', 'eq', 'math')
      .eq('result_json->>portal_submission', 'true').is('released_at', null)
      .order('created_at', { ascending: false }).limit(5),
  ]);
  const { papers } = buildStudentMarking((released ?? []) as MarkingRunRow[], { studentName });
  return { papers, pending: (pendingRows ?? []) as SciencePending[] };
}

export function SciencePendingList({ pending }: { pending: SciencePending[] }) {
  if (!pending.length) return null;
  return (
    <div className="bg-teal-50 rounded-3xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 mb-1">Being marked</p>
      <p className="text-[13px] text-teal-900/80 mb-2">Usually back within the hour. You will get a notification when it is ready.</p>
      <ul className="space-y-1.5">
        {pending.map(p => (
          <li key={p.id} className="text-sm text-teal-900 flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">
              ⏳ {p.paper_name || 'Science paper'}
              {p.subject && <span className="text-teal-700/60"> · {p.subject}</span>}
              {typeof p.num_photos === 'number' && p.num_photos > 0 && <span className="text-teal-700/60"> · {p.num_photos} page{p.num_photos === 1 ? '' : 's'}</span>}
            </span>
            <span className="shrink-0 text-xs text-teal-700/60">{niceDate(String(p.created_at).slice(0, 10))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SciencePaperCard({ paper }: { paper: ReturnType<typeof buildStudentMarking>['papers'][number] }) {
  return (
    <Link href={`/app/marking/${paper.id}`} data-track="marking:open" className={`${CARD} p-4 block hover:bg-black/[0.02] transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${M.tile}`} aria-hidden>
            <PortalIcon name={M.icon} className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-navy leading-snug break-words">{paper.name}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              <PaperSubjectPill subject={paper.subject} />
              <span>{niceDate(paper.date)}</span>
            </p>
          </div>
        </div>
        <span className={`shrink-0 text-sm font-bold rounded-full px-3 py-1 ${scoreChip(paper.pct)}`}>
          {paper.max > 0 ? `${paper.awarded}/${paper.max}` : '—'}
          {paper.pct !== null && <span className="font-semibold"> · {paper.pct}%</span>}
        </span>
      </div>
      {paper.dropped.length > 0 ? (
        <p className="mt-2 text-[12px] text-gray-500">Marks lost on {paper.dropped.length} question{paper.dropped.length === 1 ? '' : 's'} · open to see where ›</p>
      ) : paper.questions.length > 0 ? (
        <p className="mt-2 text-[12px] text-emerald-800">✅ Full marks on every question marked.</p>
      ) : null}
    </Link>
  );
}

/** The disclaimer as one quiet line under a list — the full version is on the form and on every paper. */
export function ScienceEstimateNote() {
  return (
    <p className="text-[11px] text-gray-400">
      Science marks are an estimate while marking is new. When your teacher marks a paper, enter their total on that paper&apos;s page.
    </p>
  );
}
