// /app/ask — the web math solver INSIDE the student portal ("Ask" tab).
// Same Fly-bot SSE stream as the public /chat page, via the shared client
// core in lib/chat-solver.ts — but session-scoped: the signed portalToken
// makes the bot link every question's Questions row to the student's Airtable
// record, which is the point (Adrian: "collect student's questions as data").
// (Until 9 Sept 2026 the client ALSO posted a caption-only stub row via
// /api/portal/ask-log, Subject hardcoded Math — a duplicate of the bot's row
// since 28 Aug, and a mislabelled one once web science shipped. Retired.)
//
// Part of the OPEN portal surface (like Home/Submit/Marked): no
// requireFullPortal() here on purpose — beta students may ask questions.
import { currentAccount } from '@/lib/portal-auth';
import { botLevelForAccount } from '@/lib/chat-solver';
import { saveAnswersOn } from '@/lib/portal-prefs';
import AskClient from './ask-client';

export const dynamic = 'force-dynamic';

export default async function AskPage() {
  const account = await currentAccount();
  const firstName = (account.display_name || '').trim().split(/\s+/)[0] || null;
  // The bot's /api/chat reads an optional `level` field ('EM'|'AM'|'JC'|'S1'|
  // 'S2') as its highest-priority system-prompt selector; there is NO name
  // field in its payload, so the greeting stays client-side only.
  const botLevel = botLevelForAccount(account.level, account.subjects);
  return <AskClient firstName={firstName} botLevel={botLevel} saveEnabled={saveAnswersOn(account.prefs)} />;
}
