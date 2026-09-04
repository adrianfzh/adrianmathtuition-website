// GET /api/cron/retention — Phase G data-minimisation sweep (monthly cron).
//
// Purges a student's practice attempts — plus their weakness tags and the
// attempt photos/PDFs in Blob — once they have been inactive for
// RETENTION_MONTHS (12). Activity = latest graded attempt OR portal login,
// so an active student's history is never touched. Adrian's paper-marking
// archive (paper_marking_runs) is deliberately OUT of scope: that is his
// teaching record, not idle personal data.
//
// Blob files are deleted BEFORE their rows: if a blob delete fails, the rows
// stay and next month's run retries — nothing is ever orphaned unreachable.
// ?dry=1 reports what WOULD be purged without deleting anything.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { del } from '@vercel/blob';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurBlobUrl } from '@/lib/blob-url';
import { collectFileKeys, removeStudentFiles } from '@/lib/student-files';
import { RETENTION_MONTHS, retentionCutoffIso, latestActivityIso, isExpired } from '@/lib/retention';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && safeEqual(auth, `Bearer ${process.env.ADMIN_PASSWORD}`)) return true;
  return false;
}

// PostgREST caps responses at 1000 rows silently — page everything.
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const admin = getSupabaseAdmin();
  const cutoff = retentionCutoffIso();

  try {
    type AttemptKey = { airtable_student_id: string | null; user_id: string | null; attempted_at: string | null };
    const attempts = await allRows<AttemptKey>((from, to) =>
      admin.from('student_attempts').select('airtable_student_id, user_id, attempted_at').range(from, to));
    if (!attempts.length) {
      return NextResponse.json({ ok: true, dry, cutoff, students: 0, purgedStudents: 0, purgedAttempts: 0 });
    }

    // Newest attempt per student. Rows missing the airtable id (shouldn't
    // happen, but retention must not skip them) group under their user_id.
    const byKey = new Map<string, { latest: string | null; airtableId: string | null; userIds: Set<string> }>();
    for (const a of attempts) {
      const key = a.airtable_student_id || `user:${a.user_id}`;
      const e = byKey.get(key) || { latest: null, airtableId: a.airtable_student_id, userIds: new Set<string>() };
      e.latest = latestActivityIso(e.latest, a.attempted_at);
      if (a.user_id) e.userIds.add(a.user_id);
      byKey.set(key, e);
    }

    // Login recency — a student who still signs in keeps their history.
    const { data: accounts, error: accErr } = await admin
      .from('portal_accounts').select('id, airtable_student_id, last_seen_at');
    if (accErr) throw new Error(accErr.message);
    const seenByAirtable = new Map<string, string | null>();
    const seenByUser = new Map<string, string | null>();
    for (const acc of accounts || []) {
      if (acc.airtable_student_id) seenByAirtable.set(acc.airtable_student_id, acc.last_seen_at);
      seenByUser.set(acc.id, acc.last_seen_at);
    }

    let purgedStudents = 0, purgedAttempts = 0, deletedBlobs = 0, blobFailures = 0;
    const wouldPurge: string[] = [];

    for (const [key, e] of byKey) {
      const logins = [
        e.airtableId ? seenByAirtable.get(e.airtableId) : null,
        ...[...e.userIds].map(u => seenByUser.get(u)),
      ];
      const lastActivity = latestActivityIso(e.latest, ...logins);
      if (!isExpired(lastActivity, cutoff)) continue;
      wouldPurge.push(key);
      if (dry) continue;

      const filterCol = e.airtableId ? 'airtable_student_id' : 'user_id';
      const filterVal = e.airtableId || [...e.userIds][0] || '';

      type BlobRow = { id: number; answer_image_url: string | null; marking_pdf_url: string | null };
      const rows = await allRows<BlobRow>((from, to) =>
        admin.from('student_attempts').select('id, answer_image_url, marking_pdf_url')
          .eq(filterCol, filterVal).range(from, to));
      const urls = [...new Set(
        rows.flatMap(r => [r.answer_image_url, r.marking_pdf_url]).filter((u): u is string => !!u && isOurBlobUrl(u)),
      )];

      let blobsOk = true;
      // Private-store files referenced by the same rows (5 Sep 2026).
      const keys = collectFileKeys(rows);
      if (keys.length) {
        try { deletedBlobs += await removeStudentFiles(keys); }
        catch (err) {
          blobsOk = false;
          blobFailures += keys.length;
          console.warn('[retention] student-files delete failed, rows kept for retry:', (err as Error).message);
        }
      }
      for (let i = 0; i < urls.length; i += 50) {
        const chunk = urls.slice(i, i + 50);
        try {
          await del(chunk);
          deletedBlobs += chunk.length;
        } catch (err) {
          blobsOk = false;
          blobFailures += chunk.length;
          console.warn('[retention] blob delete failed, rows kept for retry:', (err as Error).message);
        }
      }
      if (!blobsOk) continue; // rows stay; next month retries the whole student

      for (const uid of e.userIds) {
        await admin.from('weakness_tags').delete().eq('user_id', uid);
      }
      if (e.airtableId) await admin.from('weakness_tags').delete().eq('airtable_student_id', e.airtableId);
      const { error: delErr } = await admin.from('student_attempts').delete().eq(filterCol, filterVal);
      if (delErr) throw new Error(delErr.message);
      purgedStudents += 1;
      purgedAttempts += rows.length;
    }

    if (!dry && (purgedStudents > 0 || blobFailures > 0)) {
      sendTelegram(
        `🗑 Retention sweep: purged ${purgedAttempts} practice attempt${purgedAttempts === 1 ? '' : 's'} ` +
        `from ${purgedStudents} student${purgedStudents === 1 ? '' : 's'} inactive over ${RETENTION_MONTHS} months` +
        (deletedBlobs ? ` (+${deletedBlobs} files)` : '') +
        (blobFailures ? `. ⚠ ${blobFailures} file deletes failed — those students kept for next month's retry.` : '.'),
      ).catch(() => {});
    }

    if (!dry) await logJobRun('retention', true, `swept ${byKey.size} departed students, purged ${purgedStudents}`);
    return NextResponse.json({
      ok: true, dry, cutoff,
      students: byKey.size,
      ...(dry ? { wouldPurgeStudents: wouldPurge.length } : { purgedStudents, purgedAttempts, deletedBlobs, blobFailures }),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[retention] sweep failed:', msg);
    sendTelegram(`⚠ Retention cron failed: ${msg.slice(0, 200)}`).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
