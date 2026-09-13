// "Their app, as they see it" — the admin mirror of one student's app (Adrian,
// 13 Sep 2026: "a place where i can see all the papers / practice again /
// hand-ins that students see in their app, so i can better troubleshoot …
// how they are grouped, questions/homework assigned, handed up or not, marked
// or not, sheets requested or assigned, and are they done").
//
// Built from the SAME pure rules the student's Papers page uses — the subject
// gate, buildStudentMarking, groupPracticeAgain, bundleList — so the grouping
// here is the grouping there by construction. What this adds is the state the
// student never sees: who asked for a sheet, the sheet job's stage, reminders
// sent, held/revoked rows, papers hidden by the subject gate, superseded
// markings, failed hand-ins, the event trail. Server-only (service key).
import { getSupabaseAdmin } from './supabase';
import { buildStudentMarking, type MarkingRunRow } from './portal-marking';
import { allowedSubjects, subjectAllowed } from './portal-subjects';
import { groupPracticeAgain, sheetParents } from './portal-marking-group';
import { bundleList } from './portal-paper-bundles';
import { coveredRunIds } from './sheet-queue';
import { readNoSheet } from './sheet-jobs';
import { isPracticeAgainHandin, type DeskRun } from './desk-state';

const RUN_COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, paper_subject, subject, superseded_by, queue_status, num_photos';

export interface AppSheet {
  id: string;
  status: string;
  title: string | null;
  /** Adrian released it from the desk → compulsory; else the student asked. */
  compulsory: boolean;
  required_at: string | null;
  created_at: string;
  reminded_at: string | null;
  reminder_count: number;
  submitted_at: string | null;
  marked_at: string | null;
  score: number | null;
  out_of: number | null;
  pdf_url: string | null;
  run_id: string | null;
  source_run_ids: string[];
  sheet_job_id: string | null;
}
export interface AppJob {
  id: string;
  status: string;
  stage: string | null;
  requested_by: string | null;
  created_at: string;
  completed_at: string | null;
  noSheet: boolean;
  noSheetReason: string;
  superseded: boolean;
  covers: string[];
}
export interface AppPaper {
  id: string;
  name: string;
  rawName: string | null;
  date: string;
  subject: string | null;
  awarded: number;
  max: number;
  created_at: string;
  released_at: string | null;
  isPracticeAgainHandin: boolean;
  earlierMarkings: number;
  sheet: AppSheet | null;
  job: AppJob | null;
  markedSheet: { id: string; name: string; awarded: number; max: number } | null;
}
export type AppEntry = { kind: 'paper'; paper: AppPaper } | { kind: 'bundle'; sheetId: string; papers: AppPaper[] };

export interface AppAssignment {
  id: string; kind: string; status: string; source: string | null; title: string | null; created_at: string;
  due_on: string | null; submitted_at: string | null; marked_at: string | null; score: number | null; out_of: number | null;
  required_at: string | null; reminder_count: number; find_tier: string | null; revoked_at: string | null;
}
export interface AppEssay { id: string; essay_kind: string; question: string | null; status: string; created_at: string; marked_at: string | null; bands: unknown; released_at: string | null }
export interface AppEvent { kind: string; created_at: string; detail: unknown }

export interface StudentAppView {
  identity: string;
  account: { display_name: string | null; email: string | null; level: string | null; subjects: string[] | null; last_seen_at: string | null; telegram_chat_id: number | null; deactivated_at: string | null; prefs: Record<string, unknown> } | null;
  subjectsAllowed: string[];
  entries: AppEntry[];
  hiddenBySubject: { id: string; name: string; subject: string | null; date: string }[];
  pending: { id: string; paper_name: string | null; created_at: string; queue_status: string | null; num_photos: number | null }[];
  earlier: { id: string; name: string; date: string; awarded: number; max: number }[];
  assignments: AppAssignment[];
  hiddenAssignments: AppAssignment[];
  essays: AppEssay[];
  events: AppEvent[];
  failedHandins: number;
  pushSubscriptions: number;
}

type AssignmentRow = {
  id: string; kind: string; status: string; source: string | null; title: string | null; created_at: string;
  source_run_id: string | null; source_run_ids: string[] | null; run_id: string | null; pdf_url: string | null;
  required_at: string | null; reminded_at: string | null; reminder_count: number | null; submitted_at: string | null; marked_at: string | null;
  score: number | null; out_of: number | null; due_on: string | null; find_tier: string | null; revoked_at: string | null; sheet_job_id: string | null;
};
type JobRow = { id: string; run_id: string; run_ids: string[] | null; status: string; stage: string | null; requested_by: string | null; created_at: string; completed_at: string | null; result: unknown; superseded_by: string | null };

export async function loadStudentAppView(identity: string): Promise<StudentAppView> {
  const sb = getSupabaseAdmin();
  const acctQuery = identity.startsWith('acct:')
    ? sb.from('portal_accounts').select('display_name, email, level, subjects, last_seen_at, telegram_chat_id, deactivated_at, prefs').eq('id', identity.slice(5)).maybeSingle()
    : sb.from('portal_accounts').select('display_name, email, level, subjects, last_seen_at, telegram_chat_id, deactivated_at, prefs').eq('airtable_student_id', identity).maybeSingle();

  const [acctRes, runsRes, earlierRes, pendingRes, assignRes, essayRes, eventRes, pushRes] = await Promise.all([
    acctQuery,
    sb.from('paper_marking_runs').select(RUN_COLUMNS).eq('student_id', identity).not('released_at', 'is', null).is('superseded_by', null).is('archived_at', null).order('created_at', { ascending: false }).limit(60),
    sb.from('paper_marking_runs').select(RUN_COLUMNS).eq('student_id', identity).not('released_at', 'is', null).not('superseded_by', 'is', null).order('created_at', { ascending: false }).limit(20),
    sb.from('paper_marking_runs').select('id, paper_name, created_at, queue_status, num_photos').eq('student_id', identity).is('released_at', null).is('archived_at', null).order('created_at', { ascending: false }).limit(10),
    sb.from('portal_assignments').select('id, kind, status, source, title, created_at, source_run_id, source_run_ids, run_id, pdf_url, required_at, reminded_at, reminder_count, submitted_at, marked_at, score, out_of, due_on, find_tier, revoked_at, sheet_job_id').eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(200),
    sb.from('essay_runs').select('id, essay_kind, question, status, created_at, marked_at, bands, released_at').eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(30),
    sb.from('portal_event_log').select('kind, created_at, detail').eq('identity', identity).order('created_at', { ascending: false }).limit(40),
    sb.from('portal_push_subscriptions').select('id', { count: 'exact', head: true }).eq('identity', identity),
  ]);

  const account = (acctRes.data as StudentAppView['account']) ?? null;
  const subjectAccount = account ? { subjects: account.subjects, level: account.level, airtable_student_id: identity.startsWith('acct:') ? '' : identity } : null;
  const subjectsAllowed = allowedSubjects(subjectAccount);

  const allRows = ((runsRes.data ?? []) as unknown as (MarkingRunRow & { superseded_by: string | null; queue_status: string | null; num_photos: number | null })[]);
  const rows = allRows.filter(r => subjectAllowed(subjectAccount, r.paper_subject));
  const hiddenRows = allRows.filter(r => !subjectAllowed(subjectAccount, r.paper_subject));
  const { papers } = buildStudentMarking(rows, { studentName: account?.display_name ?? null });
  const rowById = new Map(allRows.map(r => [r.id, r]));

  const assignments = ((assignRes.data ?? []) as AssignmentRow[]);
  const paperIds = new Set(papers.map(p => p.id));
  const sheetRowsAll = assignments.filter(a => a.source === 'practice-again' && a.kind === 'worksheet' && a.status !== 'held' && a.status !== 'revoked' && sheetParents(a).some(id => paperIds.has(id)));
  const sheetsByRun = new Map<string, AssignmentRow>();
  for (const r of sheetRowsAll) for (const pid of sheetParents(r)) if (!sheetsByRun.has(pid)) sheetsByRun.set(pid, r);
  const { top, markedSheetByParent } = groupPracticeAgain(papers, sheetRowsAll);

  // Sheet jobs behind every listed paper — newest first, one per paper (the newest).
  const { data: jobRows } = paperIds.size
    ? await sb.from('sheet_jobs').select('id, run_id, run_ids, status, stage, requested_by, created_at, completed_at, result, superseded_by')
        .or(`run_id.in.(${[...paperIds].join(',')}),run_ids.ov.{${[...paperIds].join(',')}}`).order('created_at', { ascending: false })
    : { data: [] as JobRow[] };
  const jobByRun = new Map<string, AppJob>();
  for (const j of (jobRows ?? []) as JobRow[]) {
    const covers = coveredRunIds(j);
    const ns = readNoSheet(j.result);
    const job: AppJob = { id: j.id, status: j.status, stage: j.stage, requested_by: j.requested_by, created_at: j.created_at, completed_at: j.completed_at, noSheet: ns.noSheet, noSheetReason: ns.reason, superseded: !!j.superseded_by, covers };
    for (const rid of covers) if (!jobByRun.has(rid)) jobByRun.set(rid, job);
  }

  // Earlier markings per paper name (the folded list at the bottom of the app).
  const earlierRows = ((earlierRes.data ?? []) as unknown as MarkingRunRow[]);
  const earlier = buildStudentMarking(earlierRows, { studentName: account?.display_name ?? null }).papers
    .map(p => ({ id: p.id, name: p.name, date: p.date, awarded: p.awarded, max: p.max }));
  const earlierCountByName = new Map<string, number>();
  for (const e of earlier) earlierCountByName.set(e.name, (earlierCountByName.get(e.name) ?? 0) + 1);

  const toSheet = (a: AssignmentRow | undefined): AppSheet | null => a ? ({
    id: a.id, status: a.status, title: a.title, compulsory: !!a.required_at, required_at: a.required_at, created_at: a.created_at,
    reminded_at: a.reminded_at, reminder_count: a.reminder_count ?? 0, submitted_at: a.submitted_at, marked_at: a.marked_at,
    score: a.score, out_of: a.out_of, pdf_url: a.pdf_url, run_id: a.run_id, source_run_ids: sheetParents(a), sheet_job_id: a.sheet_job_id,
  }) : null;
  const toPaper = (p: (typeof papers)[number]): AppPaper => {
    const row = rowById.get(p.id);
    const ms = markedSheetByParent.get(p.id);
    return {
      id: p.id, name: p.name, rawName: p.rawName ?? null, date: p.date, subject: p.subject ?? null, awarded: p.awarded, max: p.max,
      created_at: row?.created_at ?? '', released_at: row?.released_at ?? null,
      isPracticeAgainHandin: isPracticeAgainHandin(row as unknown as DeskRun),
      earlierMarkings: earlierCountByName.get(p.name) ?? 0,
      sheet: toSheet(sheetsByRun.get(p.id)),
      job: jobByRun.get(p.id) ?? null,
      markedSheet: ms ? { id: ms.id, name: ms.name, awarded: ms.awarded, max: ms.max } : null,
    };
  };
  const entries: AppEntry[] = bundleList(top, id => sheetsByRun.get(id) ? { id: sheetsByRun.get(id)!.id, source_run_ids: sheetsByRun.get(id)!.source_run_ids } : null)
    .map(e => e.kind === 'paper' ? { kind: 'paper', paper: toPaper(e.paper) } : { kind: 'bundle', sheetId: e.sheetId, papers: e.papers.map(toPaper) });

  const toAssignment = (a: AssignmentRow): AppAssignment => ({
    id: a.id, kind: a.kind, status: a.status, source: a.source, title: a.title, created_at: a.created_at, due_on: a.due_on,
    submitted_at: a.submitted_at, marked_at: a.marked_at, score: a.score, out_of: a.out_of, required_at: a.required_at,
    reminder_count: a.reminder_count ?? 0, find_tier: a.find_tier, revoked_at: a.revoked_at,
  });
  const others = assignments.filter(a => !(a.source === 'practice-again' && a.kind === 'worksheet'));
  const hiddenAssignments = assignments.filter(a => a.status === 'held' || a.status === 'revoked').map(toAssignment);

  const events = ((eventRes.data ?? []) as AppEvent[]);
  return {
    identity,
    account,
    subjectsAllowed,
    entries,
    hiddenBySubject: hiddenRows.map(r => ({ id: r.id, name: r.paper_name ?? 'Marked paper', subject: r.paper_subject ?? null, date: r.created_at.slice(0, 10) })),
    pending: ((pendingRes.data ?? []) as StudentAppView['pending']),
    earlier,
    assignments: others.filter(a => a.status !== 'held' && a.status !== 'revoked').map(toAssignment),
    hiddenAssignments,
    essays: ((essayRes.data ?? []) as AppEssay[]),
    events,
    failedHandins: events.filter(e => e.kind === 'submit:failed').length,
    pushSubscriptions: pushRes.count ?? 0,
  };
}
