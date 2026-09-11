// "Was this useful?" on a science paper (Adrian, 11 Sep 2026: "let the student
// use it, and ask them for the feedback if it is helpful"). One tap, an
// optional line, one Telegram line to the marking topic and one
// portal_event_log row. Pure half: the payload rule and the message line.
//
// This is the student's OPINION of the feedback — whether it helped. It is not
// the truth signal: that is the teacher's mark (lib/science-truth.ts), which
// says whether the marking was RIGHT. Two different questions, two doors.

export const SCIENCE_FEEDBACK_KIND = 'science:feedback';
export const SCIENCE_FEEDBACK_NOTE_MAX = 300;
/** Taps per student per day — a brake on a runaway client, not a quota. */
export const SCIENCE_FEEDBACK_DAILY_CAP = 20;

export interface ScienceFeedback {
  runId: string;
  useful: boolean;
  note: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** {runId, useful, note?} → the row's detail, or null when it is not one. */
export function sanitizeScienceFeedback(detail: unknown): ScienceFeedback | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const d = detail as Record<string, unknown>;
  const runId = typeof d.runId === 'string' ? d.runId.trim() : '';
  if (!UUID_RE.test(runId)) return null;
  if (typeof d.useful !== 'boolean') return null;
  const raw = typeof d.note === 'string' ? d.note.replace(/\s+/g, ' ').trim() : '';
  return { runId: runId.toLowerCase(), useful: d.useful, note: raw ? raw.slice(0, SCIENCE_FEEDBACK_NOTE_MAX) : null };
}

/** "🧪 Jamie on Physics · Prelim P2: 👍 useful — “the units line helped”" */
export function scienceFeedbackLine(studentName: string | null, paperName: string | null, fb: ScienceFeedback): string {
  const who = (studentName || '').trim() || 'A student';
  const paper = (paperName || '').trim() || 'a science paper';
  const verdict = fb.useful ? '👍 useful' : '👎 not really';
  return `🧪 ${who} on ${paper}: ${verdict}${fb.note ? ` — “${fb.note}”` : ''}`;
}
