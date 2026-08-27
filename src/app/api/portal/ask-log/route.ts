// POST /api/portal/ask-log — logs one /app/ask question against the signed-in
// student. Appends a row to the Airtable `Questions` table (the bot's Q&A log)
// with the Student record LINKED — the attribution the bot's own web-chat row
// cannot make (it logs anonymously as Username 'web'). The client fires this
// fire-and-forget alongside the actual /api/chat call to the Fly bot, so a
// failure here never delays or breaks an answer.
//
// Field mapping (live-schema-checked 2026-08-28):
//   Caption    (singleLineText)       — the question text, '[image]' if photo-only
//   Student    (multipleRecordLinks)  — [airtable_student_id]; SKIPPED for
//                                       stranger accounts (no Students record)
//   Username   (singleLineText)       — 'portal' (the source marker; the bot
//                                       writes 'web' for anonymous web asks);
//                                       strangers log as 'portal · <name>'
//   Chat ID    (singleLineText)       — the portal-… session id, correlating
//                                       with the bot's own answer row
//   Timestamp  (dateTime)             — now, ISO
//   Subject    (singleSelect)         — 'Math' (the portal solver is math-only)
//
// Also probed by /api/health-check: anonymous POST must 401.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { airtableRequest } from '@/lib/airtable';
import type { PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id, display_name')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'airtable_student_id' | 'display_name'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { text?: unknown; hasImage?: unknown; chatId?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
  const hasImage = body.hasImage === true;
  if (!text && !hasImage) return NextResponse.json({ error: 'Nothing to log' }, { status: 400 });
  const chatId = typeof body.chatId === 'string' ? body.chatId.slice(0, 100) : '';

  // Stranger accounts (airtable_student_id = '') have no Students record to
  // link — Airtable would reject [''] as a bad record id. Log them by NAME
  // instead: the Student link is skipped and Username carries the name string
  // after the 'portal' source marker (Questions has no other free-text name
  // field — schema checked 2026-08-28), so grep-by-'portal' still finds every
  // portal ask and Adrian can still see who asked.
  const fields: Record<string, unknown> = {
    'Timestamp': new Date().toISOString(),
    'Caption': text || '[image]',
    ...(account.airtable_student_id
      ? { 'Student': [account.airtable_student_id], 'Username': 'portal' }
      : { 'Username': `portal · ${(account.display_name || 'stranger').slice(0, 60)}` }),
    'Subject': 'Math',
  };
  if (chatId) fields['Chat ID'] = chatId;

  try {
    // typecast — same belt-and-braces the bot's question-log writer uses: a
    // select value that drifts from the base's options must not lose the row.
    const rec = await airtableRequest('Questions', '', {
      method: 'POST',
      body: JSON.stringify({ fields, typecast: true }),
    });
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e) {
    console.error('[ask-log] Questions write failed:', (e as Error).message);
    return NextResponse.json({ error: 'log failed' }, { status: 500 });
  }
}
