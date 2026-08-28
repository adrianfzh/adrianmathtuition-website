// Student resource requests — the "Request" tab (v1, deliberately
// human-in-the-loop: the student asks for a worksheet/notes/anything on
// /app/requests → Adrian's Telegram rings → he fulfils or rejects on
// /admin/requests → the result link lands back on the student's list).
// The autonomous fulfil-it-yourself agent comes later; v1 only captures,
// notifies, and carries the answer back.
//
// Pure helpers only — validation, the daily cap, and the Telegram text.
// I/O (Supabase reads) lives in lib/portal-requests.ts, matching the
// assignments split (lib/assignments.ts pure / lib/portal-assignments.ts I/O).
import { sgtStartOfDayIso } from './portal-submit-limit';

// Two asks per student per SGT calendar day — same cost-brake shape as the
// hand-in cap (portal-submit-limit.ts), but looser: a request costs Adrian a
// glance, not an Opus marking run. SGT is UTC+8 with no DST, so the shared
// sgtStartOfDayIso boundary needs no timezone library.
export const DAILY_REQUEST_CAP = 2;

export const DETAIL_MIN = 10;
export const DETAIL_MAX = 1000;

export const REQUEST_KINDS = ['worksheet', 'notes', 'other'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export type RequestStatus = 'queued' | 'approved' | 'done' | 'rejected';

// Mirrors Supabase portal_requests (RLS locked, service-role only).
export interface PortalRequestRow {
  id: string;
  airtable_student_id: string;
  kind: string;
  detail: string;
  status: RequestStatus;
  admin_note: string | null;
  result_url: string | null;
  created_at: string;
  decided_at: string | null;
  /** Auto-drafted worksheet awaiting Adrian's vet (lib/request-draft) - never
   *  shown to the student; becomes result_url only via his approve. */
  draft_url?: string | null;
  draft_meta?: unknown;
}

/** Anything not a known kind collapses to 'other' — the column has a default
 *  of 'other' for the same reason; a weird client can't invent categories. */
export function normalizeKind(input: unknown): RequestKind {
  return (REQUEST_KINDS as readonly string[]).includes(input as string)
    ? (input as RequestKind)
    : 'other';
}

export function kindLabel(kind: string): string {
  switch (normalizeKind(kind)) {
    case 'worksheet': return '📄 Worksheet';
    case 'notes': return '📚 Notes';
    default: return '❓ Other';
  }
}

/** Trim + length-check the free-text ask. The floor kills "vectors pls"-grade
 *  one-worders that Adrian can't act on; the ceiling keeps the row (and the
 *  Telegram ping) readable. */
export function validateDetail(input: unknown):
  | { ok: true; detail: string }
  | { ok: false; error: string } {
  if (typeof input !== 'string') return { ok: false, error: 'Tell us what you need first.' };
  const detail = input.trim();
  if (detail.length < DETAIL_MIN) {
    return { ok: false, error: `Add a bit more detail (at least ${DETAIL_MIN} characters) so Adrian knows exactly what to make.` };
  }
  if (detail.length > DETAIL_MAX) {
    return { ok: false, error: `Keep it under ${DETAIL_MAX} characters — the essentials are enough.` };
  }
  return { ok: true, detail };
}

/** Minimal escape for Telegram parse_mode:'HTML' — student-typed text goes
 *  into the message, and a stray < or & would otherwise 400 the whole send. */
export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const REVIEW_URL = 'https://www.adrianmathtuition.com/admin/requests';

/** The doorbell text for Adrian's chat. Truncates BEFORE escaping so an
 *  entity can never be cut in half mid-`&amp;`. */
export function requestTelegramText(studentName: string, kind: string, detail: string): string {
  const name = escapeTelegramHtml(studentName.trim() || 'A student');
  const trimmed = detail.trim();
  const preview = escapeTelegramHtml(trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed);
  return `🙋 <b>${name}</b> requests: ${kindLabel(kind)} — “${preview}”\nReview: ${REVIEW_URL}`;
}

// ── Daily cap count ──────────────────────────────────────────────────────────
// Structural client type instead of the generated Supabase client: the deep
// generated generics trip TS2589 through helpers (see portal-submit-limit.ts,
// which hit this first), and a three-method shape is trivially fakeable in
// tests. A head count transfers no rows.
type CountResult = { count: number | null; error: unknown };

interface CountQuery extends PromiseLike<CountResult> {
  gte(column: string, value: string): CountQuery;
  eq(column: string, value: string): CountQuery;
}

export interface RequestCountingClient {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): CountQuery;
  };
}

/** Requests this student has filed since SGT midnight. Every row counts —
 *  including rejected ones, so re-filing a rejected ask still spends a slot
 *  (the brake is on Adrian's attention, not on outcomes). */
export async function countRequestsToday(
  client: RequestCountingClient,
  studentId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await client
    .from('portal_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sgtStartOfDayIso(now))
    .eq('airtable_student_id', studentId);
  return count ?? 0;
}

/** A result link must be a plain web URL — nothing javascript:-shaped can ever
 *  become a student's "Get it" button. */
export function validResultUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const url = input.trim();
  if (!url || url.length > 2048) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}
