// GET|POST /api/cron/deactivate-inactive — monthly portal auto-offboarding.
//
// Any TUITION portal account (non-empty airtable_student_id, not already
// deactivated) whose student has had NO Active enrollment for ≥30 days gets
// `deactivated_at` stamped. That single column flips them to the S$29 pass
// gate like a stranger (lib/portal-passes.ts isTuitionAccount) — a graduate
// can pay to keep access. NOTHING is deleted: their marked papers, notebook
// and attempts stay keyed on the rec id, and reactivation is one call to
// /api/admin/passes {action:'reactivate'}.
//
// "Active enrollment" = an Airtable Enrollments row with Status='Active'
// (live-schema checked 2026-09-02: Status 'Active'|'Ended', End Date date,
// Student linked record). Departure date = the LATEST End Date once none are
// Active — the decision rules, including the fail-safe for undatable
// departures, live pure + tested in lib/deactivate-inactive.ts.
//
// The Enrollments read is ONE whole-table scan matched to students in JS —
// linked-record fields can't be filtered by rec id in a formula (the ARRAYJOIN
// gotcha joins display names, not ids), and one scan beats N per-student
// fetches anyway. Per-student writes are fail-soft: one failed update skips
// that student and the run carries on (next month retries).
//
// ?dry=1 previews (lists who WOULD be deactivated) and writes nothing — no
// Telegram, no job_runs stamp.
//
// Schedule (vercel.json): "30 19 2 * *" = 19:30 UTC on the 2nd = 03:30 SGT on
// the 3rd. Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
//
// Health-check: deliberately NO new probe — the job_runs rhythm line
// ('deactivate-inactive', monthly day 3 in lib/job-health.ts JOB_RHYTHMS)
// already alarms by absence if this cron dies, and the route touches no
// parent/student-facing surface a synthetic probe could exercise.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import {
  decideDeactivation,
  groupEnrollmentsByStudent,
  INACTIVITY_DAYS,
  type AirtableEnrollmentRecord,
} from '@/lib/deactivate-inactive';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && auth === `Bearer ${process.env.ADMIN_PASSWORD}`) return true;
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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type AccountRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  airtable_student_id: string | null;
};

async function run(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const now = new Date();
  const admin = getSupabaseAdmin();

  try {
    // Every still-tuition-free account linked to an Airtable student.
    const accounts = await allRows<AccountRow>((from, to) =>
      admin
        .from('portal_accounts')
        .select('id, email, display_name, airtable_student_id')
        .not('airtable_student_id', 'is', null)
        .is('deactivated_at', null)
        .range(from, to),
    );
    const candidates = accounts.filter((a) => (a.airtable_student_id ?? '').trim() !== '');

    if (!candidates.length) {
      if (!dry) await logJobRun('deactivate-inactive', true, 'no linked active portal accounts to check');
      return NextResponse.json({ ok: true, dry, checked: 0, deactivated: [] });
    }

    // ONE Enrollments scan + one Students name scan (see header — linked-record
    // fields are unfilterable by rec id, so we match in JS).
    const [enr, students] = await Promise.all([
      airtableRequestAll('Enrollments', '?fields[]=Student&fields[]=Status&fields[]=End Date'),
      airtableRequestAll('Students', '?fields[]=Student Name'),
    ]);
    const byStudent = groupEnrollmentsByStudent((enr.records || []) as AirtableEnrollmentRecord[]);
    const nameById = new Map<string, string>();
    for (const r of students.records || []) {
      nameById.set(r.id, (r.fields?.['Student Name'] as string) || r.id);
    }

    const deactivated: { accountId: string; studentId: string; name: string; lastEnrollmentEnd: string }[] = [];
    const kept: Record<string, number> = { 'active-enrollment': 0, 'ended-recently': 0, 'no-end-date': 0 };
    const studentMissing: string[] = []; // rec id gone from Airtable — undatable, kept (fail-safe)
    const errors: string[] = [];

    for (const acc of candidates) {
      const sid = (acc.airtable_student_id as string).trim();
      const name = nameById.get(sid) || acc.display_name || acc.email || sid;

      if (!nameById.has(sid)) {
        studentMissing.push(name);
        continue;
      }

      const decision = decideDeactivation(byStudent.get(sid) ?? [], now);
      if (decision.action === 'keep') {
        kept[decision.reason] = (kept[decision.reason] ?? 0) + 1;
        continue;
      }

      if (!dry) {
        // Fail-soft per student: a single failed write never aborts the run.
        const { error } = await admin
          .from('portal_accounts')
          .update({ deactivated_at: now.toISOString() })
          .eq('id', acc.id)
          .is('deactivated_at', null); // races with a manual deactivate stay idempotent
        if (error) {
          errors.push(`${name}: ${error.message}`);
          continue;
        }
      }
      deactivated.push({ accountId: acc.id, studentId: sid, name, lastEnrollmentEnd: decision.lastEnrollmentEnd });
    }

    // One summary Telegram, only when someone was actually deactivated.
    // Dry mode is silent by design — it's a preview, not an event.
    if (!dry && deactivated.length > 0) {
      const names = deactivated.map((d) => escapeHtml(d.name)).join(', ');
      sendTelegram(
        `🎓 Offboarded ${deactivated.length} graduated student${deactivated.length === 1 ? '' : 's'} ` +
          `from the portal: ${names}. No active enrollment for ${INACTIVITY_DAYS}+ days — they now see the ` +
          `S$29 pass gate; all their data stays. Reactivate any time: /api/admin/passes {action:'reactivate'}.` +
          (errors.length ? `\n⚠ ${errors.length} account${errors.length === 1 ? '' : 's'} skipped on error — next month retries.` : ''),
      ).catch(() => {});
    }

    if (!dry) {
      await logJobRun(
        'deactivate-inactive',
        true,
        `checked ${candidates.length} linked accounts, deactivated ${deactivated.length}` +
          (errors.length ? `, ${errors.length} skipped on error` : ''),
        deactivated.length ? { deactivated: deactivated.map((d) => d.name) } : undefined,
      );
    }

    return NextResponse.json({
      ok: true,
      dry,
      checked: candidates.length,
      [dry ? 'wouldDeactivate' : 'deactivated']: deactivated,
      kept,
      ...(studentMissing.length ? { studentMissing } : {}),
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[deactivate-inactive] sweep failed:', msg);
    sendTelegram(`⚠ Portal offboarding cron failed: ${escapeHtml(msg.slice(0, 200))}`).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
