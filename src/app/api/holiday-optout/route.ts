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
import { pressNotice } from '@/lib/optout-notice';
import { roster, studentRate } from '@/lib/optout-rollup';

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

/** The student's name for the page, plus the level the notice puts in brackets.
 *  One record read; Airtable's single-record endpoint ignores `fields[]`, so
 *  everything arrives anyway. */
async function studentFacts(studentId: string): Promise<{ name: string; level: string; ip: boolean }> {
  try {
    const rec = await airtableRequest('Students', `/${studentId}`);
    const f = rec?.fields || {};
    const subjects: string[] = f['Subjects'] || [];
    return {
      name: String(f['Student Name'] || '').trim() || 'your child',
      level: String(f['Level'] || '').trim(),
      ip: String(f['Subject Level'] || '').trim() === 'IP' || subjects.includes('IP Math'),
    };
  } catch {
    return { name: 'your child', level: '', ip: false };
  }
}

export async function GET(req: NextRequest) {
  const auth = studentFromToken(req.nextUrl.searchParams.get('t'));
  if ('error' in auth) return auth.error;

  try {
    const [months, who] = await Promise.all([
      loadOptoutMonths(auth.studentId),
      studentFacts(auth.studentId),
    ]);
    if (!months) return NextResponse.json({ studentName: who.name, months: [], noSlots: true });
    return NextResponse.json({ studentName: who.name, months: monthChoices(months) });
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
    const who = await studentFacts(auth.studentId);

    if (!changes.length) {
      return NextResponse.json({ success: true, unchanged: true, studentName: who.name, months: monthChoices(months) });
    }

    const result = await applyOptoutChanges(auth.studentId, changes);
    const after = await loadOptoutMonths(auth.studentId);
    const choices = monthChoices(after || months);

    const skipping = wanted.filter((w) => w.skip).map((w) => months.find((m) => m.year === w.year && m.month === w.month)?.label).filter(Boolean) as string[];
    const keeping = wanted.filter((w) => !w.skip).map((w) => months.find((m) => m.year === w.year && m.month === w.month)?.label).filter(Boolean) as string[];

    // Awaited, not fired and forgotten: a serverless function can be torn down
    // the instant it responds, so an un-awaited send is a send that may never
    // happen. notify() never throws and never rejects, so the parent's
    // confirmation cannot fail on Adrian's notice.
    await notify(auth.studentId, who, choices, skipping, keeping, result.skippedLocked);

    return NextResponse.json({
      success: true,
      studentName: who.name,
      months: choices,
      applied: { skipping, keeping },
    });
  } catch (e: unknown) {
    console.error('[holiday-optout] public POST failed:', e);
    return NextResponse.json({ error: 'Could not save that just now — please reply to your invoice email' }, { status: 500 });
  }
}

/**
 * Adrian's line, the moment a parent presses Confirm.
 *
 * It used to read `(0 cancelled, 4 blocked ahead, 0 restored)` — a description
 * of the database write. Adrian, 16 Sep 2026, on being shown a plain-English
 * version: "yes". So it now says which months are off, what that is in lessons
 * and dollars, that the invoice will come out at $0 and the calendar is already
 * updated, and who else is skipping so far. Wording lives in
 * lib/optout-notice.ts so it can be read without sending anything.
 */
async function notify(
  studentId: string,
  who: { name: string; level: string; ip: boolean },
  after: { label: string; lessonCount: number; skipped: boolean; partial: boolean }[],
  skipping: string[],
  keeping: string[],
  leftAlone: string[],
): Promise<void> {
  try {
    const [rate, people] = await Promise.all([
      studentRate(studentId).catch(() => null),
      roster().catch(() => [] as { name: string; months: string[] }[]),
    ]);
    const text = pressNotice({
      name: who.name, level: who.level, ip: who.ip,
      nowSkipping: skipping, nowKeeping: keeping,
      after, ratePerLesson: rate, leftAlone, roster: people,
    });
    // One retry. A silent drop used to be the whole failure path: the opt-out
    // applied, Adrian heard nothing, and the first he knew of it was a $0
    // invoice. Telegram's own transient 5xx is the common case, so a second
    // attempt is worth more here than anywhere else in the file.
    if (await sendTelegram(text)) return;
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await sendTelegram(text))) console.error('[holiday-optout] Telegram notice failed twice for', studentId);
  } catch (e) {
    console.error('[holiday-optout] notice threw:', (e as Error).message);
  }
}
