// A hand-in that failed on the student's phone (Adrian, 7 Sep 2026: "monitor
// failures on students' end" — "is that built?"). The submit page retries every
// upload and the final send three times; when the retries are spent it tells the
// student what to do, and — since today — ALSO tells Adrian. The phone posts
// `{kind:'submit:failed', detail}` to /api/portal/event; the route sanitises the
// detail with the pure pieces here, stores it in portal_event_log.detail, and
// Telegrams one line per student per hour. The hub's activity card lists the
// last 24 hours (lib/portal-activity.ts). No photos travel — just the facts.
import { escapeTelegramHtml } from './telegram-html';

export const SUBMIT_FAILED_KIND = 'submit:failed';
/** One Telegram per student per hour — a phone that keeps failing is one problem, not ten. */
export const SUBMIT_FAILURE_NOTIFY_WINDOW_MS = 60 * 60_000;

export type SubmitFailureStage = 'upload' | 'send' | 'rejected';
const STAGES: readonly SubmitFailureStage[] = ['upload', 'send', 'rejected'];

export interface SubmitFailure {
  /** upload = a page would not reach the store; send = the final POST got no reply; rejected = the server said no (non-409). */
  stage: SubmitFailureStage;
  reason: string;
  pages: number;
  uploaded: number;
  paperName: string | null;
  attempts: number;
}

/** The detail the phone sent, clipped and bounded — or null when it is not a failure report at all. */
export function sanitizeSubmitFailure(raw: unknown): SubmitFailure | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stage = STAGES.includes(r.stage as SubmitFailureStage) ? (r.stage as SubmitFailureStage) : null;
  if (!stage) return null;
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const num = (v: unknown, max: number) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.floor(Number(v)))) : 0);
  const pages = num(r.pages, 200);
  const uploaded = Math.min(num(r.uploaded, 200), pages);
  return {
    stage,
    reason: clip(r.reason, 200) || 'unknown',
    pages,
    uploaded,
    paperName: clip(r.paperName, 80) || null,
    attempts: num(r.attempts, 10) || 3,
  };
}

/** Notify when there was no failure from this student inside the window. */
export function shouldNotifySubmitFailure(previousFailureIso: string | null | undefined, now: Date): boolean {
  if (!previousFailureIso) return true;
  const t = Date.parse(previousFailureIso);
  return Number.isNaN(t) || now.getTime() - t >= SUBMIT_FAILURE_NOTIFY_WINDOW_MS;
}

/** The Telegram line (HTML mode). */
export function submitFailureLine(studentName: string | null | undefined, f: SubmitFailure): string {
  const who = escapeTelegramHtml((studentName || '').trim() || 'A student');
  const what = f.stage === 'upload' ? 'a page would not upload'
    : f.stage === 'send' ? 'the last step could not reach us'
    : 'we rejected it';
  const pages = `${f.uploaded} of ${f.pages} page${f.pages === 1 ? '' : 's'} uploaded`;
  const paper = f.paperName ? ` · “${escapeTelegramHtml(f.paperName)}”` : '';
  return `⚠️ <b>${who}</b>'s hand-in failed on their phone — ${what} after ${f.attempts} tries: <i>${escapeTelegramHtml(f.reason)}</i>. ${pages}${paper}. They were told to try again.`;
}
