// "From Adrian" assigned work — pure helpers shared by the admin send routes,
// the student list/Home card and the marking hooks. See SPEC-ASSIGN.md.
// Keep this file free of I/O so it stays unit-testable (repo policy).

export type AssignmentKind = 'question' | 'worksheet';
export type AssignmentStatus = 'assigned' | 'submitted' | 'marked' | 'revoked';

export type AssignmentRow = {
  id: string;
  airtable_student_id: string;
  kind: AssignmentKind;
  question_id: string | null;
  title: string;
  topic: string | null;
  level: string | null;
  tier: string | null;
  note: string | null;
  reminder: string | null;
  pdf_url: string | null;
  pdf_source: string | null;
  due_on: string | null;           // 'YYYY-MM-DD'
  status: AssignmentStatus;
  attempt_id: number | null;
  run_id: string | null;
  score: number | null;
  out_of: number | null;
  created_at: string;
  submitted_at: string | null;
  marked_at: string | null;
  revoked_at: string | null;
};

export type CreateAssignmentInput = {
  studentId: string;
  kind: AssignmentKind;
  questionId?: string | null;
  title?: string | null;
  topic?: string | null;
  level?: string | null;
  tier?: string | null;
  note?: string | null;
  reminder?: string | null;
  pdfUrl?: string | null;
  pdfSource?: string | null;
  dueOn?: string | null;
};

export type ValidatedAssignment = {
  airtable_student_id: string;
  kind: AssignmentKind;
  question_id: string | null;
  title: string;
  topic: string | null;
  level: string | null;
  tier: string | null;
  note: string | null;
  reminder: string | null;
  pdf_url: string | null;
  pdf_source: string | null;
  due_on: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 120;
const MAX_NOTE = 600;

function clean(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

/** Validate an admin "send work" payload. Returns `{ ok:false, error }` with a
 *  human message on the first problem, else the row ready for insert (minus the
 *  server-owned defaults). A `question` needs a bank question id; a `worksheet`
 *  needs a PDF url. Titles default sensibly so Adrian never has to type one. */
export function validateAssignment(input: CreateAssignmentInput):
  { ok: true; row: ValidatedAssignment } | { ok: false; error: string } {
  const studentId = typeof input.studentId === 'string' ? input.studentId.trim() : '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return { ok: false, error: 'studentId must be an Airtable record id' };
  if (input.kind !== 'question' && input.kind !== 'worksheet') return { ok: false, error: 'kind must be question or worksheet' };

  const topic = clean(input.topic, 80);
  const level = clean(input.level, 20);
  const tierRaw = clean(input.tier, 20);
  const tier = tierRaw === 'Standard' || tierRaw === 'Advanced' ? tierRaw : null;
  const note = clean(input.note, MAX_NOTE);
  // A concept nudge rendered COLLAPSED above the question ("💡 Reminder") —
  // game-plan drills carry the step's rule here; optional everywhere else.
  const reminder = clean(input.reminder, MAX_NOTE);

  let due_on: string | null = null;
  if (input.dueOn != null && input.dueOn !== '') {
    if (typeof input.dueOn !== 'string' || !DATE_RE.test(input.dueOn) || Number.isNaN(Date.parse(input.dueOn + 'T00:00:00Z'))) {
      return { ok: false, error: 'dueOn must be YYYY-MM-DD' };
    }
    due_on = input.dueOn;
  }

  if (input.kind === 'question') {
    const qid = typeof input.questionId === 'string' ? input.questionId.trim() : '';
    if (!UUID_RE.test(qid)) return { ok: false, error: 'questionId (uuid) is required for a question' };
    const title = clean(input.title, MAX_TITLE) || (topic ? `${topic} question` : 'A question from Adrian');
    return {
      ok: true,
      row: { airtable_student_id: studentId, kind: 'question', question_id: qid, title, topic, level, tier, note, reminder, pdf_url: null, pdf_source: null, due_on },
    };
  }

  const pdfUrl = typeof input.pdfUrl === 'string' ? input.pdfUrl.trim() : '';
  if (!/^https:\/\//.test(pdfUrl)) return { ok: false, error: 'pdfUrl (https) is required for a worksheet' };
  const title = clean(input.title, MAX_TITLE);
  if (!title) return { ok: false, error: 'title is required for a worksheet' };
  const pdfSource = clean(input.pdfSource, 400);
  return {
    ok: true,
    row: { airtable_student_id: studentId, kind: 'worksheet', question_id: null, title, topic, level, tier, note, reminder, pdf_url: pdfUrl, pdf_source: pdfSource, due_on },
  };
}

/** Still needs the student's action (shows in the Home count / tab dot).
 *  `submitted` is included: a worksheet is out of the student's hands but not
 *  done, so the card reads "1 being marked" rather than vanishing. */
export function isPending(status: AssignmentStatus): boolean {
  return status === 'assigned' || status === 'submitted';
}

export function pendingCount(rows: Pick<AssignmentRow, 'status'>[]): number {
  return rows.reduce((n, r) => n + (isPending(r.status) ? 1 : 0), 0);
}

/** Local-date helper (SGT): 'YYYY-MM-DD' for "now" in Singapore. */
export function sgToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

function dayDiff(dueOn: string, today: string): number {
  const a = Date.parse(dueOn + 'T00:00:00Z');
  const b = Date.parse(today + 'T00:00:00Z');
  return Math.round((a - b) / 86_400_000);
}

/** "by today" / "by tomorrow" / "by Fri" / "by 3 Sep" / "was due Mon". Null when
 *  there is no due date. Never shouty — the spec says no nagging. */
export function dueLabel(dueOn: string | null | undefined, today: string = sgToday()): string | null {
  if (!dueOn || !DATE_RE.test(dueOn)) return null;
  const diff = dayDiff(dueOn, today);
  const d = new Date(dueOn + 'T00:00:00Z');
  const weekday = d.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'UTC' });
  const dayMonth = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (diff === 0) return 'by today';
  if (diff === 1) return 'by tomorrow';
  if (diff > 1 && diff < 7) return `by ${weekday}`;
  if (diff >= 7) return `by ${dayMonth}`;
  if (diff > -7) return `was due ${weekday}`;
  return `was due ${dayMonth}`;
}

export function isOverdue(row: Pick<AssignmentRow, 'due_on' | 'status'>, today: string = sgToday()): boolean {
  return isPending(row.status) && !!row.due_on && DATE_RE.test(row.due_on) && dayDiff(row.due_on, today) < 0;
}

/** Which student-facing page an assignment opens on. */
export function assignmentHref(row: Pick<AssignmentRow, 'id' | 'kind' | 'status'>): string {
  if (row.kind === 'question') return `/app/practice?assignment=${row.id}`;
  return `/app/assignments/${row.id}`;
}

/** Student-facing status chip text. */
export function statusLabel(row: Pick<AssignmentRow, 'status' | 'kind' | 'score' | 'out_of'>): string {
  switch (row.status) {
    case 'assigned': return row.kind === 'question' ? 'To do' : 'To do · print or view';
    case 'submitted': return 'Being marked';
    case 'marked':
      return row.score != null && row.out_of != null ? `Marked · ${row.score}/${row.out_of}` : 'Marked';
    case 'revoked': return 'Withdrawn';
  }
}

/** Allowed status transitions. Re-marks of the same attempt keep `marked`
 *  (latest wins); revoke only from a live state. */
export function canTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  if (from === to) return to === 'marked';            // re-mark overwrites score
  if (to === 'revoked') return from === 'assigned' || from === 'submitted';
  if (from === 'assigned') return to === 'submitted' || to === 'marked';
  if (from === 'submitted') return to === 'marked';
  return false;
}

/** Home card headline: "2 to do" / "1 being marked" / "1 to do · 1 being marked". */
export function homeCardSummary(rows: Pick<AssignmentRow, 'status'>[]): string | null {
  const todo = rows.filter(r => r.status === 'assigned').length;
  const marking = rows.filter(r => r.status === 'submitted').length;
  if (!todo && !marking) return null;
  const parts: string[] = [];
  if (todo) parts.push(`${todo} to do`);
  if (marking) parts.push(`${marking} being marked`);
  return parts.join(' · ');
}
