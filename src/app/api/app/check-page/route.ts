// POST /api/app/check-page  (Authorization: Bearer <app access token>)
// Body: { image: <base64 JPEG of the page, line numbers drawn on it>, lines: [{ n, box }] }
// → CheckPageResult (lib/app-check-page): a tick or cross per line, what went wrong.
//
// ✅ Check this page in the Notebook iPad app (SPEC-STUDENT-APP.md §0c, 31 Oct 2026).
// Same marker as practice grading (GRADING_MODEL), answered while the student waits.
// Behind APP_CHECK_PAGE_OPEN_TO_STUDENTS (demo student only until the app ships);
// a stranger needs an active pass (requireActiveAccess), tuition rides free; daily cap
// counted in app_page_checks. Anonymous → 401 (the health check probes this).
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { bearerAccount, portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { createServiceClient } from '@/lib/supabase-server';
import { GRADING_MODEL } from '@/lib/practice-grade';
import { APP_CHECK_PAGE_OPEN_TO_STUDENTS, APP_CHECK_PAGE_PREVIEW_IDENTITIES } from '@/lib/portal-beta';
import { buildCheckPagePrompt, parseCheckPageReply, parseCheckPageRequest, CHECK_PAGE_DAILY_CAP, type CheckPageResult } from '@/lib/app-check-page';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(req: Request) {
  const account = await bearerAccount(req);
  if (!account) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const identity = portalIdentity(account);
  if (!APP_CHECK_PAGE_OPEN_TO_STUDENTS && !APP_CHECK_PAGE_PREVIEW_IDENTITIES.includes(identity)) {
    return NextResponse.json({ error: 'Checking pages isn’t open yet.' }, { status: 403 });
  }
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = parseCheckPageRequest(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = createServiceClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await db.from('app_page_checks').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).gte('created_at', since);
  if ((count || 0) >= CHECK_PAGE_DAILY_CAP) {
    return NextResponse.json({ error: `That’s ${CHECK_PAGE_DAILY_CAP} pages today. Checking opens again tomorrow.` }, { status: 429 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildCheckPagePrompt(parsed.req.lines);
  let result: CheckPageResult | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: GRADING_MODEL,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: parsed.req.image } },
            { type: 'text', text: prompt + (attempt ? '\n\nYour last reply was not valid JSON. Reply with the JSON only.' : '') },
          ],
        }],
      });
      const text = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('');
      result = parseCheckPageReply(text, parsed.req.lines);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  if (!result) {
    console.error('[app/check-page] failed:', lastErr);
    return NextResponse.json({ error: 'Couldn’t check this page. Try again.' }, { status: 502 });
  }

  const { error } = await db.from('app_page_checks').insert({
    user_id: account.id, identity, verdict: result.verdict, model: GRADING_MODEL,
    line_count: parsed.req.lines.length, result,
  });
  if (error) console.error('[app/check-page] save failed:', error.message);
  return NextResponse.json(result);
}
