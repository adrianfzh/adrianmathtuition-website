// sketch_checks — the rows behind the graph-sketch checker (SPEC-SKETCH-CHECK.md,
// 5 Oct 2026). Server-only. The photo goes under the student's own handins/ prefix
// (so /api/files serves it to them and to nobody else), a QUEUED row is inserted,
// and the bot is pinged; the bot reads, judges, draws, and writes the row. The
// result page polls it.
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabase';
import { putStudentFile, isValidKey } from './student-files';
import type { SketchReport, SketchRowStatus } from './sketch-check';

export interface SketchRow {
  id: string;
  created_at: string;
  airtable_student_id: string;
  question_ref: string | null;
  expr: string | null;
  shown: string | null;
  exact: boolean;
  photo_url: string;
  result_url: string | null;
  status: SketchRowStatus;
  report: SketchReport | null;
  right_count: number | null;
  item_count: number | null;
  error: string | null;
  checked_at: string | null;
}

const COLUMNS = 'id, created_at, airtable_student_id, question_ref, expr, shown, exact, photo_url, result_url, status, report, right_count, item_count, error, checked_at';
const LIST_COLUMNS = 'id, created_at, question_ref, shown, status, right_count, item_count';

/** Largest photo accepted (base64 chars ≈ 3 MB of JPEG) — the client downscales to 1600 px first. */
export const MAX_PHOTO_B64 = 4_000_000;

export interface SketchSubmission {
  identity: string;
  studentName: string | null;
  questionRef: string | null;
  questionId: string | null;
  expr: string | null;
  shown: string | null;
  domain: [number | null, number | null] | null;
  exact: boolean;
  asks: string[] | null;
  photoB64: string;
  questionPhotoB64: string | null;
}

export type SketchOutcome = { ok: true; id: string } | { ok: false; status: number; error: string };

function bytes(b64: string): Buffer {
  return Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64');
}

export async function submitSketch(s: SketchSubmission): Promise<SketchOutcome> {
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return { ok: false, status: 503, error: 'The checker is not available right now.' };
  const id = randomUUID();
  const seg = s.identity.replace(/[^A-Za-z0-9._:()\- ]/g, '_');
  const photoKey = `handins/${seg}/sketch-${id}.jpg`;
  const qKey = `handins/${seg}/sketch-${id}-question.jpg`;
  const resultKey = `handins/${seg}/sketch-${id}-checked.png`;
  if (![photoKey, qKey, resultKey].every(isValidKey)) return { ok: false, status: 400, error: 'Could not store the photo.' };

  const photo = await putStudentFile({ key: photoKey, body: bytes(s.photoB64), contentType: 'image/jpeg' });
  const qPhoto = s.questionPhotoB64 ? await putStudentFile({ key: qKey, body: bytes(s.questionPhotoB64), contentType: 'image/jpeg' }) : null;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('sketch_checks').insert({
    id, airtable_student_id: s.identity, student_name: s.studentName,
    question_ref: s.questionRef, question_id: s.questionId,
    expr: s.expr, domain: s.domain, shown: s.shown, exact: s.exact,
    photo_url: photo.url, question_photo_url: qPhoto?.url ?? null, status: 'queued',
  });
  if (error) return { ok: false, status: 500, error: 'Could not save the photo.' };

  let ok = false;
  let why = '';
  try {
    const r = await fetch(`${botBase}/api/sketch-check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: id, photoUrl: photo.url, questionPhotoUrl: qPhoto?.url ?? null, resultKey,
        expr: s.expr, domain: s.domain, exact: s.exact, shown: s.shown, asks: s.asks, studentName: s.studentName,
      }),
      signal: AbortSignal.timeout(15000),
    });
    ok = r.status === 202;
    if (!ok) why = `bot answered ${r.status}`;
  } catch (e) {
    why = e instanceof Error ? e.message : String(e);
  }
  if (!ok) {
    await sb.from('sketch_checks').update({ status: 'failed', error: 'The checker did not pick this up. Try again in a minute.', error_detail: why }).eq('id', id);
    return { ok: false, status: 503, error: 'The checker did not pick this up. Try again in a minute.' };
  }
  return { ok: true, id };
}

/** One check. A student identity scopes it; `{ admin: true }` is Adrian; null opens nothing. */
export async function loadSketch(id: string, scope: string | { admin: true } | null): Promise<SketchRow | null> {
  if (!scope) return null;
  let q = getSupabaseAdmin().from('sketch_checks').select(COLUMNS).eq('id', id);
  if (typeof scope === 'string') q = q.eq('airtable_student_id', scope);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SketchRow | null) ?? null;
}

export type SketchListRow = Pick<SketchRow, 'id' | 'created_at' | 'question_ref' | 'shown' | 'status' | 'right_count' | 'item_count'>;

export async function listSketches(identity: string, limit = 20): Promise<SketchListRow[]> {
  const { data, error } = await getSupabaseAdmin().from('sketch_checks').select(LIST_COLUMNS)
    .eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SketchListRow[];
}

/** Checks started since the Singapore day began (a failed pickup does not count). */
export async function countSketchesToday(identity: string, sinceISO: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('sketch_checks').select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', identity).gte('created_at', sinceISO).neq('status', 'failed');
  if (error) throw new Error(error.message);
  return count ?? 0;
}
