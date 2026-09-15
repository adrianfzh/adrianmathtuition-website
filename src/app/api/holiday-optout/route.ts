// GET/POST /api/holiday-optout — the PUBLIC door behind the "Choose which
// months to skip" button in the Oct–Dec invoice email (Adrian, 15 Sep 2026:
// "perhaps can provide a button for them to press? - can allow them to select
// which months?").
//
// Auth is the signed token in the link and nothing else — there is no parent
// login. lib/holiday-optout-token.ts explains what that token may stand for.
//
// ⚠ THE GET NEVER WRITES. Mail scanners, link previewers and corporate
// security gateways fetch every URL in an email before a human ever sees it,
// so a one-click opt-out link would silently un-enroll families who never
// pressed anything. The GET only reads; the page POSTs after a Confirm press.
// Do not "simplify" this into a single GET.
//
// Whole months only. A parent choosing which dates to skip is Adrian's screen
// (/api/admin/holiday-optout) — here a month is on or off, and a month Adrian
// has part-skipped by hand is shown as such rather than silently overwritten.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { verifyOptoutToken } from '@/lib/holiday-optout-token';
import {
  loadOptoutMonths, applyOptoutChanges, changesForMonths, monthChoices,
} from '@/lib/holiday-optout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Wanted = { year: number; month: number; skip: boolean };

/** The token, or a ready-made response saying why not. Never leaks which it was. */
function studentFromToken(token: unknown): { studentId: string } | { error: NextResponse } {
  const secret = process.env.SIGNUP_SECRET || '';
  if (!secret) {
    console.error('[holiday-optout] SIGNUP_SECRET is not set — every link is dead');
    return { error: NextResponse.json({ error: 'Link checking is unavailable' }, { status: 503 }) };
  }
  const studentId = verifyOptoutToken(token, secret);
  if (!studentId) {
    return {
      error: NextResponse.json(
        { error: 'This link is no longer valid. Please reply to your invoice email and I will sort it out.' },
        { status: 401 },
      ),
    };
  }
  return { studentId };
}

async function studentName(studentId: string): Promise<string> {
  try {
    const rec = await airtableRequest('Students', `/${studentId}`);
    return String(rec?.fields?.['Student Name'] || '').trim() || 'your child';
  } catch {
    return 'your child';
  }
}

export async function GET(req: NextRequest) {
  const auth = studentFromToken(req.nextUrl.searchParams.get('t'));
  if ('error' in auth) return auth.error;

  try {
    const [months, name] = await Promise.all([
      loadOptoutMonths(auth.studentId),
      studentName(auth.studentId),
    ]);
    if (!months) return NextResponse.json({ studentName: name, months: [], noSlots: true });
    return NextResponse.json({ studentName: name, months: monthChoices(months) });
  } catch (e: unknown) {
    console.error('[holiday-optout] public GET failed:', e);
    return NextResponse.json({ error: 'Could not load your lessons just now' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { t?: string; months?: Wanted[] } | null;
  const auth = studentFromToken(body?.t);
  if ('error' in auth) return auth.error;

  const wanted = Array.isArray(body?.months) ? body!.months! : [];
  if (!wanted.length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  for (const w of wanted) {
    if (!Number.isInteger(w?.year) || !Number.isInteger(w?.month) || typeof w?.skip !== 'boolean') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
  }

  try {
    const months = await loadOptoutMonths(auth.studentId);
    if (!months) return NextResponse.json({ error: 'No lessons are scheduled to change' }, { status: 409 });

    // The months the parent may actually answer about are the ones we offered;
    // changesForMonths drops anything else, and drops dates already in the
    // wanted state — so re-confirming an unchanged month writes nothing.
    const changes = changesForMonths(months, wanted);
    const name = await studentName(auth.studentId);

    if (!changes.length) {
      return NextResponse.json({ success: true, unchanged: true, studentName: name, months: monthChoices(months) });
    }

    const result = await applyOptoutChanges(auth.studentId, changes);
    const after = await loadOptoutMonths(auth.studentId);

    const skipping = wanted.filter((w) => w.skip).map((w) => months.find((m) => m.year === w.year && m.month === w.month)?.label).filter(Boolean);
    const keeping = wanted.filter((w) => !w.skip).map((w) => months.find((m) => m.year === w.year && m.month === w.month)?.label).filter(Boolean);
    const lines = [`🗓 ${name} — holiday months changed by parent`];
    if (skipping.length) lines.push(`• Skipping: ${skipping.join(', ')}`);
    if (keeping.length) lines.push(`• Back on: ${keeping.join(', ')}`);
    lines.push(`(${result.cancelled} cancelled, ${result.created} blocked ahead, ${result.restored + result.removed} restored)`);
    if (result.skippedLocked.length) lines.push(`⚠ left alone: ${result.skippedLocked.join(', ')}`);
    await sendTelegram(lines.join('\n')).catch(() => {});

    return NextResponse.json({
      success: true,
      studentName: name,
      months: monthChoices(after || months),
      applied: { skipping, keeping },
    });
  } catch (e: unknown) {
    console.error('[holiday-optout] public POST failed:', e);
    return NextResponse.json({ error: 'Could not save that just now — please reply to your invoice email' }, { status: 500 });
  }
}
