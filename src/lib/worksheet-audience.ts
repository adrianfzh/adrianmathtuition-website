// Sub-group AUDIENCE for the printed-worksheet surfaces that identify a
// student WITHOUT a portal session (2026-09-02):
//
//   /api/kiosk/topics + /api/kiosk/worksheet — the kiosk's signed scan token
//       (x-kiosk-student, lib/kiosk-student.ts) carries the Airtable student id;
//   /api/bot/worksheet — the bot's worksheet-on-demand (x-render-secret), whose
//       body may carry `studentId` (an Airtable rec id) and/or `isIp`.
//
// Both drew as the plainest student until today, so an IP student could never
// print Modulus Functions (AM sub-groups 809–814, visibility 'ip') from the
// iPad or from Telegram, although the portal showed it to them.
//
// THE RULE — one home, in this order, the ordinary student on every doubt:
//   1. an explicit boolean `isIp` from the trusted caller wins outright
//      (no lookups — the bot may already know);
//   2. else a well-formed Airtable rec id → the student's ACTIVE portal
//      account's `portal_accounts.is_ip` (unique on airtable_student_id;
//      deactivated rows are ignored — an offboarded flag is stale). An account
//      that exists wins even when Airtable disagrees, so the kiosk and the bot
//      show exactly what the portal shows that student (the monthly
//      deactivate-inactive sweep is what brings the two back in line);
//   3. else — no account, or that lookup failed — `deriveIsIp` over the Airtable
//      Students record's `Subject Level` (lib/portal-ip.ts; single-record GET,
//      4 s timeout). Airtable is the source the flag is derived from, so
//      consulting it can only ever say IP when the record says IP;
//   4. anything else — malformed id, Airtable miss/timeout, a thrown error —
//      → ORDINARY. Never admin: admin sees 'hidden' rows, and a printed sheet
//      must narrow on a broken lookup, never widen.
//
// The decision is pure over injectable lookups (worksheet-audience.test.ts
// pins the order, the short-circuits and every fail-closed path); the IO
// adapters at the bottom are the only code the routes touch. The kiosk's
// deterministic daily draw and the eligibility gate (lib/kiosk-pool,
// lib/kiosk-draw) are untouched — this only decides the `audience` they get.
import type { SupabaseClient } from '@supabase/supabase-js';
import { airtableRequest } from './airtable';
import { deriveIsIp } from './portal-ip';

/** What the pool query receives. `admin` is ALWAYS false here — see rule 4. */
export type WorksheetAudience = { isIp: boolean; admin: false };

/** The plainest student: 'all' sub-groups only. */
export const ORDINARY_AUDIENCE: WorksheetAudience = { isIp: false, admin: false };

export type AccountLookup =
  | { kind: 'found'; isIp: boolean | null }
  | { kind: 'none' }
  | { kind: 'error' };

export type AirtableLookup =
  | { kind: 'found'; fields: Record<string, unknown> | null | undefined }
  | { kind: 'none' }
  | { kind: 'error' };

export type AudienceLookups = {
  /** The student's ACTIVE portal account, if any. */
  account: (studentId: string) => Promise<AccountLookup>;
  /** The Airtable Students record's fields (only `Subject Level` is read). */
  airtable: (studentId: string) => Promise<AirtableLookup>;
};

/** What a caller may say about who the sheet is for. Any other key is ignored
 *  — in particular nothing in a request body can ask for the admin view. */
export type AudienceRequest = { isIp?: unknown; studentId?: unknown };

/** Airtable record ids are `rec` + 14 alphanumerics. Anything else is not an
 *  id we will look up — it resolves to the ordinary student with no IO. */
const AIRTABLE_REC_ID = /^rec[A-Za-z0-9]{14}$/;

export function normaliseStudentId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return AIRTABLE_REC_ID.test(s) ? s : null;
}

/** Rules 2–4: is the student behind this Airtable id an IP-stream student? */
export async function resolveIsIp(studentId: unknown, lookups: AudienceLookups): Promise<boolean> {
  const sid = normaliseStudentId(studentId);
  if (!sid) return false;

  let account: AccountLookup;
  try {
    account = await lookups.account(sid);
  } catch {
    account = { kind: 'error' };
  }
  if (account.kind === 'found') return account.isIp === true;

  // No account, or the account lookup broke: Airtable is the source of truth
  // the flag is derived from, so ask it — it can only widen when the record
  // itself says IP.
  let record: AirtableLookup;
  try {
    record = await lookups.airtable(sid);
  } catch {
    record = { kind: 'error' };
  }
  if (record.kind === 'found') return deriveIsIp(record.fields);
  return false;
}

/** Rule 1 on top of resolveIsIp. The value the pool query wants. */
export async function resolveWorksheetAudience(
  req: AudienceRequest,
  lookups: AudienceLookups,
): Promise<WorksheetAudience> {
  if (typeof req.isIp === 'boolean') return { isIp: req.isIp, admin: false };
  return { isIp: await resolveIsIp(req.studentId, lookups), admin: false };
}

// ── IO adapters ──────────────────────────────────────────────────────────────

/** Bound the Airtable round-trip: a sheet must not hang on a slow lookup, and
 *  a timeout is just another "no verdict" (rule 4). */
export const AIRTABLE_LOOKUP_TIMEOUT_MS = 4000;

/** `portal_accounts.is_ip` for the ACTIVE account on this Airtable id. */
export function accountLookupVia(supa: SupabaseClient): AudienceLookups['account'] {
  return async (sid) => {
    const { data, error } = await supa
      .from('portal_accounts')
      .select('is_ip')
      .eq('airtable_student_id', sid)
      .is('deactivated_at', null)
      .maybeSingle();
    if (error) return { kind: 'error' };
    if (!data) return { kind: 'none' };
    return { kind: 'found', isIp: (data as { is_ip?: boolean | null }).is_ip ?? null };
  };
}

/** The Airtable Students record (single-record GET — `fields[]` is ignored
 *  there, so the whole record comes back; only `Subject Level` is read and
 *  nothing is logged). 404, 5xx, timeout and network failures all map to
 *  'error' — there is no verdict to act on. */
export function airtableLookup(timeoutMs = AIRTABLE_LOOKUP_TIMEOUT_MS): AudienceLookups['airtable'] {
  return async (sid) => {
    try {
      const rec = await airtableRequest('Students', `/${sid}`, { signal: AbortSignal.timeout(timeoutMs) });
      const fields = rec?.fields;
      return { kind: 'found', fields: fields && typeof fields === 'object' ? (fields as Record<string, unknown>) : null };
    } catch {
      return { kind: 'error' };
    }
  };
}

export function worksheetAudienceLookups(supa: SupabaseClient): AudienceLookups {
  return { account: accountLookupVia(supa), airtable: airtableLookup() };
}

/** The routes' one call: `{ studentId }` from the kiosk token, `{ isIp,
 *  studentId }` from the bot body, `{}` from a caller with no student. */
export function worksheetAudienceFor(supa: SupabaseClient, req: AudienceRequest): Promise<WorksheetAudience> {
  return resolveWorksheetAudience(req, worksheetAudienceLookups(supa));
}
