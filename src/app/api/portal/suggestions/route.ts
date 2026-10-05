// POST /api/portal/suggestions { text, subject? } → { ok, left }
//
// 💡 Suggest something (5 Oct 2026, Adrian: "a suggestion button … students can
// suggest what they need for their exams, if reasonable and helpful - i will try to
// add it"). The student's own session only; text ≤ 500 characters; subject one of
// their own chips or none; three a Singapore day. Stores a `portal_suggestions` row
// and sends one plain line to the students topic. Behind SUGGESTIONS_OPEN_TO_STUDENTS
// (lib/portal-beta). Anonymous → 401 (the health check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { suggestionsOpen } from '@/lib/portal-beta';
import { cleanSuggestion, cleanSubject, suggestionSubjects, suggestionTelegramLine, underDailyCap, DAILY_SUGGESTION_CAP } from '@/lib/suggestions';
import { insertSuggestion, suggestionsSentToday } from '@/lib/suggestions-store';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await suggestionsOpen())) return NextResponse.json({ error: 'Not available yet' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; subject?: unknown };
  const cleaned = cleanSuggestion(body.text);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const subject = cleanSubject(body.subject, suggestionSubjects(account));
  const sid = portalIdentity(account);

  try {
    const sent = await suggestionsSentToday(sid);
    if (!underDailyCap(sent)) {
      return NextResponse.json({ error: `That's ${DAILY_SUGGESTION_CAP} for today — send more tomorrow.` }, { status: 429 });
    }
    const name = account.display_name?.trim() || null;
    await insertSuggestion({ account_id: account.id, airtable_student_id: sid, student_name: name, subject, text: cleaned.text });
    // One line to the students topic; a Telegram hiccup never fails the student's send.
    await sendTelegram(suggestionTelegramLine({ name: name || account.email, subject, text: cleaned.text }), 'students').catch(() => false);
    return NextResponse.json({ ok: true, left: Math.max(0, DAILY_SUGGESTION_CAP - sent - 1) });
  } catch (e) {
    console.error('[suggestions]', (e as Error).message);
    return NextResponse.json({ error: 'Could not send — try again in a moment.' }, { status: 500 });
  }
}
