// POST /api/portal/suggestions { text, anonymous? } → { ok }
//
// 💡 Suggestions (5 Oct 2026, Adrian: "a suggestion button … students can suggest
// what they need for their exams, if reasonable and helpful - i will try to add it").
// The form on /app/suggestions. A signed-in student only; text ≤ 500 characters; no
// daily limit. `anonymous: true` stores ONLY the text and the date — no account, no
// identity, no name (lib/suggestions senderFields; a check on the table enforces it)
// — and the Telegram line says "Anonymous". The one abuse guard needs no identity:
// the exact same text within a minute is dropped quietly (still answers ok).
// Behind SUGGESTIONS_OPEN_TO_STUDENTS (lib/portal-beta). Anonymous caller → 401
// (the health check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { suggestionsOpen } from '@/lib/portal-beta';
import { cleanSuggestion, isRecentDuplicate, senderFields, suggestionTelegramLine } from '@/lib/suggestions';
import { insertSuggestion, recentSuggestions } from '@/lib/suggestions-store';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await suggestionsOpen())) return NextResponse.json({ error: 'Not available yet' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; anonymous?: unknown };
  const cleaned = cleanSuggestion(body.text);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const anonymous = body.anonymous === true;

  try {
    if (isRecentDuplicate(cleaned.text, await recentSuggestions(), Date.now())) return NextResponse.json({ ok: true });
    const name = account.display_name?.trim() || null;
    await insertSuggestion({
      ...senderFields(anonymous, { accountId: account.id, identity: portalIdentity(account), name }),
      text: cleaned.text,
    });
    // One line to the students topic; a Telegram hiccup never fails the student's send.
    await sendTelegram(suggestionTelegramLine({ name, anonymous, text: cleaned.text }), 'students').catch(() => false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[suggestions]', (e as Error).message);
    return NextResponse.json({ error: 'Could not send — try again in a moment.' }, { status: 500 });
  }
}
