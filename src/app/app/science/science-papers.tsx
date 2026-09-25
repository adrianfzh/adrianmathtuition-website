// The Science tab's paper list — shared by /app/science (Home) and
// /app/science/papers (the full list). Science runs are the student's own
// runs whose marking lane is not maths (paper_marking_runs.subject), released
// or still with Adrian. Deliberately simpler than the maths Papers page: no
// per-subject tiles, no Practice Again, no "Work on next" — marking first
// (Adrian, 10 Sep 2026: "for the science tab, just put marking functionality
// first"). Server component; ownership = the student_id filter, never the client.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import PaperSubjectPill, { SubjectEdge } from '@/components/PaperSubjectPill';
import PortalIcon from '@/components/PortalIcon';
import RemoveQueuedScience from './science-queue-remove';
import { queuedLabel } from '@/lib/daily-queue';
import { sgtTodayISO } from '@/lib/sgt';

export const SCIENCE_COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject, subject';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

function scoreChip(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-600';
  if (pct >= 75) return 'bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.7)]';
  if (pct >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

export function niceDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export type SciencePending = {
  id: string; created_at: string; paper_name: string | null; num_photos: number | null; subject: string | null;
  // 🕒 queued_for = the day the paper waits for (SPEC-PRACTICE-PHOTO §14);
  // queue_released_at = the midnight cron has put it in for marking.
  result_json: { queued_for?: string; queue_released_at?: string } | null;
};

/** The student's science runs: released papers (newest first) and the ones still being marked. */
export async function loadSciencePapers(sid: string, studentName: string | null, limit = 40) {
  const sb = getSupabaseAdmin();
  const [{ data: released }, { data: pendingRows }] = await Promise.all([
    sb.from('paper_marking_runs').select(SCIENCE_COLUMNS)
      .eq('student_id', sid).not('subject', 'eq', 'math')
      .not('released_at', 'is', null).is('superseded_by', null)
      .order('created_at', { ascending: false }).limit(limit),
    sb.from('paper_marking_runs').select('id, created_at, paper_name, num_photos, subject, result_json')
      .eq('student_id', sid).not('subject', 'eq', 'math')
      .eq('result_json->>portal_submission', 'true').is('result_json->>queue_removed_at', null).is('released_at', null)
      .order('created_at', { ascending: false }).limit(8),
  ]);
  const { papers } = buildStudentMarking((released ?? []) as MarkingRunRow[], { studentName });
  return { papers, pending: (pendingRows ?? []) as SciencePending[] };
}

function isQueued(p: SciencePending): boolean {
  return Boolean(p.result_json?.queued_for) && !p.result_json?.queue_released_at;
}

export function SciencePendingList({ pending }: { pending: SciencePending[] }) {
  if (!pending.length) return null;
  const today = sgtTodayISO();
  const marking = pending.filter(p => !isQueued(p));
  const queued = pending.filter(isQueued);
  return (
    <div className="bg-teal-50 rounded-3xl p-4 space-y-3">
      {marking.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 mb-1">Being marked</p>
          <p className="text-[13px] text-teal-900/80 mb-2">Usually back within the hour. You will get a notification when it is ready.</p>
          <ul className="space-y-1.5">
            {marking.map(p => (
              <li key={p.id} className="text-sm text-teal-900 flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  ⏳ {p.paper_name || 'Science paper'}
                  {p.subject && <PaperSubjectPill subject={p.subject} className="ml-1.5 align-middle" />}
                  {typeof p.num_photos === 'number' && p.num_photos > 0 && <span className="text-teal-700/60"> · {p.num_photos} page{p.num_photos === 1 ? '' : 's'}</span>}
                </span>
                <span className="shrink-0 text-xs text-teal-700/60">{niceDate(String(p.created_at).slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {queued.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 mb-1">Waiting for its day</p>
          <p className="text-[13px] text-teal-900/80 mb-2">Two science papers a day — these go for marking at midnight on their day. Remove one to free the day.</p>
          <ul className="space-y-1.5">
            {queued.map(p => (
              <li key={p.id} className="text-sm text-teal-900 flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  🕒 {p.paper_name || 'Science paper'}
                  {p.subject && <PaperSubjectPill subject={p.subject} className="ml-1.5 align-middle" />}
                  <span className="text-teal-700/60"> · {queuedLabel(String(p.result_json?.queued_for), today)}</span>
                </span>
                <RemoveQueuedScience runId={p.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SciencePaperCard({ paper }: { paper: ReturnType<typeof buildStudentMarking>['papers'][number] }) {
  return (
    <Link href={`/app/science/marking/${paper.id}`} data-track="marking:open" className={`${CARD} relative overflow-hidden p-4 pl-5 block hover:bg-black/[0.02] transition-colors`}>
      <SubjectEdge subject={paper.subject} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
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

// ── One tab per science (Adrian, 24 Sep 2026: "have tabs for physics
// chemistry and bio like Amath and Emath") ─────────────────────────────────
// The tabs are the sciences the student said they take (lib/portal-prefs
// studentSciences) plus any science a paper or a pending hand-in already
// carries. Each panel is rendered here on the server; SubjectPanels (the
// maths A Math | E Math strip) only switches between them, remembering the
// last tab under its own key so the maths memory is untouched.
import SubjectPanels, { type SubjectPanel } from '../marking/SubjectPanels';
import { SCIENCE_SUBJECTS, SCIENCE_SUBJECT_LABEL, type ScienceSubject } from '@/lib/portal-prefs';

const SCIENCE_TONE: Record<ScienceSubject, 'phy' | 'chem' | 'bio'> = { physics: 'phy', chemistry: 'chem', biology: 'bio' };

function laneOf(v: string | null | undefined): ScienceSubject | null {
  const s = (v ?? '').toLowerCase();
  return (SCIENCE_SUBJECTS as readonly string[]).includes(s) ? (s as ScienceSubject) : null;
}

type SciencePaper = ReturnType<typeof buildStudentMarking>['papers'][number];

/** The Chemistry tab's door to the qualitative-analysis flashcards (24 Sep 2026): a row above the papers. */
export function QaDoor() {
  return (
    <Link href="/app/science/qa" className={`${CARD} p-3 flex items-center gap-3 hover:brightness-[0.99] active:scale-[0.99] transition`}>
      <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 bg-purple-600 text-white" aria-hidden>
        <PortalIcon name="flask" className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy">Qualitative analysis flashcards</span>
        <span className="block text-[12px] text-gray-500">Cation, anion and gas tests · tap to flip</span>
      </span>
      <span className="shrink-0 text-gray-300 text-lg">›</span>
    </Link>
  );
}

export function ScienceTabs({ papers, pending, subjects, limit = 0, allHref = '/app/science/papers', panelExtras }: {
  papers: SciencePaper[]; pending: SciencePending[]; subjects: ScienceSubject[]; limit?: number; allHref?: string;
  /** Something above a science's papers — Home puts the QA flashcards door on Chemistry (24 Sep 2026). */
  panelExtras?: Partial<Record<ScienceSubject, ReactNode>>;
}) {
  const present = new Set<ScienceSubject>();
  for (const p of papers) { const s = laneOf(p.subject); if (s) present.add(s); }
  for (const p of pending) { const s = laneOf(p.subject); if (s) present.add(s); }
  const keys = SCIENCE_SUBJECTS.filter(s => subjects.includes(s) || present.has(s));
  if (keys.length === 0) return null;
  // A paper with no subject stamped (never from the app's own hand-in) sits under the first tab.
  const bucket = (p: SciencePaper) => laneOf(p.subject) ?? keys[0];
  const panels: SubjectPanel[] = keys.map(s => {
    const label = SCIENCE_SUBJECT_LABEL[s];
    const mine = papers.filter(p => bucket(p) === s);
    const pend = pending.filter(p => (laneOf(p.subject) ?? keys[0]) === s);
    const shown = limit > 0 ? mine.slice(0, limit) : mine;
    return {
      key: s, label, tone: SCIENCE_TONE[s], count: mine.length,
      content: (
        <div className="space-y-4">
          {panelExtras?.[s]}
          <SciencePendingList pending={pend} />
          {mine.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Marked papers</h2>
                {limit > 0 && mine.length > limit && (
                  <Link href={allHref} className="text-[12px] font-semibold text-navy hover:underline">All {mine.length} ›</Link>
                )}
              </div>
              {shown.map(p => <SciencePaperCard key={p.id} paper={p} />)}
            </>
          ) : pend.length === 0 ? (
            <p className="text-sm text-gray-500 px-1">No {label.toLowerCase()} paper marked yet — hand one in and it comes back here.</p>
          ) : null}
        </div>
      ),
    };
  });
  const newest = laneOf(pending[0]?.subject) ?? laneOf(papers[0]?.subject) ?? keys[0];
  return <SubjectPanels panels={panels} defaultKey={keys.includes(newest) ? newest : keys[0]} rememberKey="portal_science_subject" />;
}
