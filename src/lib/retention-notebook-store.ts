// The quiet-account half of the monthly retention sweep (5 Oct 2026): notebook,
// clippings, Ask questions, essays, humanities answers, the app-use log.
// Rules: lib/retention.ts notebookExpired (pure, tested). Run from
// /api/cron/retention after the practice-attempt sweep; `dry` counts only.
//
// Files go before rows (the clipping rows are the only pointer to legacy Blob
// images); a file failure keeps that student's rows for next month's retry.
import { del } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import { keyFromUrl, removeStudentFilesByPrefix } from '@/lib/student-files';
import { isOurBlobUrl } from '@/lib/blob-url';
import { QUIET_ACCOUNT_TABLES, latestActivityIso, notebookExpired, type IdentityActivity } from '@/lib/retention';


async function allRows<T>(admin: SupabaseClient, table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface NotebookSweep {
  identities: number;
  expired: number;
  rows: Record<string, number>; // per table: rows deleted (or that WOULD be, when dry)
  files: number;
  fileFailures: number;
}

export async function sweepNotebooks(admin: SupabaseClient, cutoffIso: string, dry: boolean): Promise<NotebookSweep> {
  // Who has notebook rows, how many, and when they last changed.
  const per = new Map<string, { counts: Record<string, number>; last: string | null }>();
  for (const { table, column, stamp } of QUIET_ACCOUNT_TABLES) {
    const rows = await allRows<Record<string, string | null>>(admin, table, `${column}, ${stamp}`);
    for (const r of rows) {
      const id = r[column];
      if (!id) continue;
      const e = per.get(id) || { counts: {}, last: null };
      e.counts[table] = (e.counts[table] || 0) + 1;
      e.last = latestActivityIso(e.last, r[stamp]);
      per.set(id, e);
    }
  }
  const out: NotebookSweep = { identities: per.size, expired: 0, rows: {}, files: 0, fileFailures: 0 };
  if (!per.size) return out;

  const accounts = await allRows<{ id: string; airtable_student_id: string | null; last_seen_at: string | null; deactivated_at: string | null }>(
    admin, 'portal_accounts', 'id, airtable_student_id, last_seen_at, deactivated_at');
  const attempts = await allRows<{ airtable_student_id: string | null; user_id: string | null; attempted_at: string | null }>(
    admin, 'student_attempts', 'airtable_student_id, user_id, attempted_at');
  const runs = await allRows<{ student_id: string | null; created_at: string | null }>(
    admin, 'paper_marking_runs', 'student_id, created_at');

  const lastBy = (pairs: [string | null | undefined, string | null][]) => {
    const m = new Map<string, string | null>();
    for (const [k, t] of pairs) if (k) m.set(k, latestActivityIso(m.get(k), t));
    return m;
  };
  const handIn = lastBy(runs.map((r) => [r.student_id, r.created_at]));
  const attemptBy = lastBy(attempts.flatMap((a) => [
    [a.airtable_student_id, a.attempted_at] as [string | null, string | null],
    [a.user_id ? `acct:${a.user_id}` : null, a.attempted_at] as [string | null, string | null],
  ]));

  for (const [identity, e] of per) {
    const accts = accounts.filter((a) => a.airtable_student_id === identity || `acct:${a.id}` === identity);
    const activity: IdentityActivity = {
      identity,
      currentTuition: accts.some((a) => !!a.airtable_student_id?.trim() && !a.deactivated_at),
      lastLogin: latestActivityIso(...accts.map((a) => a.last_seen_at)),
      lastAttempt: attemptBy.get(identity) ?? null,
      lastHandIn: handIn.get(identity) ?? null,
      lastNotebook: e.last,
    };
    if (!notebookExpired(activity, cutoffIso)) continue;
    out.expired += 1;
    if (dry) {
      for (const [t, n] of Object.entries(e.counts)) out.rows[t] = (out.rows[t] || 0) + n;
      continue;
    }

    // Files first: the private store's clippings folder + any legacy Blob images.
    let filesOk = true;
    try { out.files += await removeStudentFilesByPrefix(`clippings/${identity}`); }
    catch { filesOk = false; out.fileFailures += 1; }
    if (e.counts.portal_notes) {
      const { data: notes } = await admin.from('portal_notes').select('image_url').eq('airtable_student_id', identity);
      const legacy = (notes || []).map((n) => (n as { image_url: string | null }).image_url)
        .filter((u): u is string => !!u && keyFromUrl(u) === null && isOurBlobUrl(u));
      if (legacy.length) {
        try { await del(legacy); out.files += legacy.length; }
        catch { filesOk = false; out.fileFailures += legacy.length; }
      }
    }
    if (!filesOk) continue;

    for (const { table, column } of QUIET_ACCOUNT_TABLES) {
      if (!e.counts[table]) continue;
      const { error } = await admin.from(table).delete().eq(column, identity);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.rows[table] = (out.rows[table] || 0) + e.counts[table];
    }
  }
  return out;
}
