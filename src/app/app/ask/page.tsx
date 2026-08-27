// /app/ask — the web math solver INSIDE the student portal ("Ask" tab).
// Same Fly-bot SSE stream as the public /chat page, via the shared client
// core in lib/chat-solver.ts — but session-scoped: every question the student
// sends is also logged against their Airtable record (/api/portal/ask-log),
// which is the point (Adrian: "collect student's questions as data").
//
// Part of the OPEN portal surface (like Home/Submit/Marked): no
// requireFullPortal() here on purpose — beta students may ask questions.
import { currentAccount } from '@/lib/portal-auth';
import { botLevelForAccount } from '@/lib/chat-solver';
import AskClient from './ask-client';

export const dynamic = 'force-dynamic';

export default async function AskPage() {
  const account = await currentAccount();
  const firstName = (account.display_name || '').trim().split(/\s+/)[0] || null;
  // The bot's /api/chat reads an optional `level` field ('EM'|'AM'|'JC'|'S1'|
  // 'S2') as its highest-priority system-prompt selector; there is NO name
  // field in its payload, so the greeting stays client-side only.
  const botLevel = botLevelForAccount(account.level, account.subjects);
  return <AskClient firstName={firstName} botLevel={botLevel} />;
}
