// Loop 1 — learn from Adrian's corrections (5 Oct 2026, Adrian: "do learn from your
// corrections loop"). SPEC-MARKING-CALIBRATION §2 Phase 2: every change a tutor makes to a
// marked paper is a labelled example of where the marker and the tutor disagree. This
// module turns ONE write (the desk's override, an ✏️ Annotate Done) into the rows that
// record it: one row per part per field that changed — the mark, the marker's note
// (error_summary), the verdict line — with the before and the after side by side.
//
// It DIFFS the run's result_json before and after the write instead of reading the
// request, so every door that changes the record is captured the same way, including
// the bot's own note edits during an Annotate compose (ai/compose-page.js applyRecordEdits,
// which overwrites error_summary in place — the old text survives only in `before`).
//
// Who and which org (SPEC-COMPANY §14.5, SPEC-TUTOR-TOOLS): every row carries
// `corrected_by` and `org_id` from day one. Today both are Adrian / the tuition business;
// when tutors arrive the caller passes theirs, and the learner (bot
// lib/correction-patterns.js) groups per tutor, so one tutor's habits never become
// another tutor's marker.
//
// Pure; tested. The insert lives in marking-corrections-store.ts.

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const textOrNull = (v: unknown): string | null => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s : null; };
const normLabel = (s: unknown) => str(s).replace(/[()\s.]/g, '').toLowerCase();

export type CorrectionSource = 'annotate' | 'desk' | 'backfill';
export type CorrectionField = 'marks' | 'note' | 'verdict';

export interface CorrectionContext {
  runId: string;
  source: CorrectionSource;
  /** ISO time of the write — part of the row's once-only key. */
  at: string;
  correctedBy?: string;
  orgId?: string;
  studentId?: string | null;
  paperName?: string | null;
  /** paper_marking_runs.paper_subject ("A Math", "Physics", …). */
  paperSubject?: string | null;
  /** paper_marking_runs.subject ("math", "chemistry", …). */
  subject?: string | null;
}

/** One row of `marking_corrections`, as inserted. */
export interface CorrectionRow {
  corrected_at: string;
  org_id: string;
  corrected_by: string;
  source: CorrectionSource;
  run_id: string;
  student_id: string | null;
  paper_name: string | null;
  level: string | null;
  subject: string | null;
  question: string;
  part: string;
  field: CorrectionField;
  marks_before: number | null;
  marks_after: number | null;
  marks_max: number | null;
  note_before: string | null;
  note_after: string | null;
  marker_error_kind: string | null;
  tutor_error_kind: string | null;
  tutor_reason: string | null;
  topic: string | null;
  scheme: string | null;
  photo_index: number | null;
  context: Json | null;
}

/** The note the desk's chip path writes on its own — not a reason a tutor gave. */
const AUTO_NOTES = [/^score chip retyped/i];

const LEVELS: Record<string, string> = {
  'a math': 'AM', 'e math': 'EM', 'h2 math': 'JC', physics: 'PHY', chemistry: 'CHEM', biology: 'BIO',
};

/** "A Math" → "AM", "Physics" → "PHY"; anything else null. */
export function levelOf(paperSubject: unknown): string | null {
  return LEVELS[str(paperSubject).trim().toLowerCase()] ?? null;
}

function resultsOf(json: unknown): Json[] {
  const r = asRecord(json)?.results;
  return Array.isArray(r) ? (r.map(asRecord).filter(Boolean) as Json[]) : [];
}

/** A question's address that survives a re-sort: its printed number + the page it was read on. */
const qKey = (r: Json) => `${str(r.question_number)}@${typeof r.photo_index === 'number' ? r.photo_index : ''}`;

function partsOf(r: Json): Json[] {
  const p = asRecord(r.marking)?.parts;
  return Array.isArray(p) ? (p.map(asRecord).filter(Boolean) as Json[]) : [];
}

function tutorReason(after: Json, before: Json): string | null {
  const ov = asRecord(after.triage_override);
  if (!ov) return null;
  const note = textOrNull(ov.note);
  if (!note || AUTO_NOTES.some(re => re.test(note))) return null;
  // the same note as before is not a NEW reason (a second edit that kept the note)
  const prev = asRecord(before.triage_override);
  if (prev && textOrNull(prev.note) === note && str(prev.at) === str(ov.at)) return null;
  return note;
}

function tutorKind(after: Json): string | null {
  const ov = asRecord(after.triage_override);
  return ov ? textOrNull(ov.error_kind) : null;
}

function contextOf(r: Json): Json | null {
  const mo = asRecord(r.marking_output) ?? {};
  const out: Json = {};
  const q = textOrNull(mo.question); if (q) out.question_text = q.slice(0, 1200);
  const sfa = textOrNull(mo.student_final_answer); if (sfa) out.student_final_answer = sfa.slice(0, 300);
  const oc = textOrNull(asRecord(r.marking)?.overall_comment); if (oc) out.overall_comment = oc.slice(0, 600);
  return Object.keys(out).length ? out : null;
}

/**
 * Every change between two versions of a run's result_json, as correction rows.
 *
 *  - a part whose `awarded` moved → field 'marks'
 *  - a part whose `error_summary` (the marker's note) changed → field 'note'
 *  - a part whose `verdict_line` changed → field 'verdict'
 *  - a question with NO parts whose total moved → one 'marks' row, part ''
 *
 * A part that went to full marks loses its note as a side effect of the mark (the desk
 * clears error_summary at full marks) — that is the mark's row, not a second 'note' row.
 * Questions are matched by printed number + page; a question present on one side only is
 * ignored (a re-mark, not a correction).
 */
export function diffCorrections(before: unknown, after: unknown, ctx: CorrectionContext): CorrectionRow[] {
  const prev = new Map(resultsOf(before).map(r => [qKey(r), r]));
  const out: CorrectionRow[] = [];
  const base = {
    corrected_at: ctx.at,
    org_id: ctx.orgId || 'tuition',
    corrected_by: ctx.correctedBy || 'adrian',
    source: ctx.source,
    run_id: ctx.runId,
    student_id: ctx.studentId ?? null,
    paper_name: ctx.paperName ?? null,
    level: levelOf(ctx.paperSubject),
    subject: ctx.subject ?? null,
  };
  for (const a of resultsOf(after)) {
    const b = prev.get(qKey(a));
    if (!b) continue;
    const question = str(a.question_number) || '?';
    const topic = textOrNull(asRecord(asRecord(a.marking_output)?.meta)?.topic_detected);
    const photo_index = typeof a.photo_index === 'number' ? a.photo_index : null;
    const reason = tutorReason(a, b);
    const kind = tutorKind(a);
    const context = contextOf(a);
    const row = (over: Partial<CorrectionRow> & Pick<CorrectionRow, 'part' | 'field'>): CorrectionRow => ({
      ...base, question, topic, photo_index, context,
      marks_before: null, marks_after: null, marks_max: null, note_before: null, note_after: null,
      marker_error_kind: null, tutor_error_kind: kind, tutor_reason: reason, scheme: null,
      ...over,
    });
    const aParts = partsOf(a), bParts = partsOf(b);
    if (!aParts.length || !bParts.length) {
      const was = numOrNull(asRecord(b.marking)?.total_awarded), now = numOrNull(asRecord(a.marking)?.total_awarded);
      if (was !== null && now !== null && was !== now) {
        out.push(row({ part: '', field: 'marks', marks_before: was, marks_after: now, marks_max: numOrNull(asRecord(a.marking)?.total_max) }));
      }
      continue;
    }
    for (const pa of aParts) {
      const pb = bParts.find(p => normLabel(p.label) === normLabel(pa.label));
      if (!pb) continue;
      const part = str(pa.label);
      const shared = {
        part,
        marks_max: numOrNull(pa.max),
        marker_error_kind: textOrNull(pb.error_kind),
        scheme: textOrNull(pa.scheme) ?? textOrNull(pb.scheme),
        note_before: textOrNull(pb.error_summary),
      };
      const was = numOrNull(pb.awarded), now = numOrNull(pa.awarded);
      const markMoved = was !== null && now !== null && was !== now;
      if (markMoved) out.push(row({ ...shared, field: 'marks', marks_before: was, marks_after: now, note_after: textOrNull(pa.error_summary) }));
      const noteWas = textOrNull(pb.error_summary), noteNow = textOrNull(pa.error_summary);
      const clearedByFullMarks = markMoved && noteNow === null && now !== null && now >= (numOrNull(pa.max) ?? Infinity);
      if (noteWas !== noteNow && !clearedByFullMarks) {
        out.push(row({ ...shared, field: 'note', marks_before: was, marks_after: now, note_after: noteNow }));
      }
      const vWas = textOrNull(pb.verdict_line), vNow = textOrNull(pa.verdict_line);
      if (vWas !== vNow) {
        out.push(row({ ...shared, field: 'verdict', marks_before: was, marks_after: now, note_before: vWas, note_after: vNow }));
      }
    }
  }
  return out;
}
