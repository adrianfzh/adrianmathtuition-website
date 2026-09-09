// GET /api/admin/costs?days=30 — the marking pipeline's spend (9 Sep 2026).
//
// Two sources side by side: the bot's own pricing of every run (lib/costs.ts
// over paper_marking_runs — attributable to a paper, a student, a lane) and,
// when ANTHROPIC_ADMIN_KEY is set, the Anthropic Admin API's cost report — the
// invoice itself, per day, which is the only "exact" number. Gemini is shown as
// tokens only; Google bills it. Admin session/bearer. Fail-soft on the bill.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sgtTodayISO } from '@/lib/sgt';
import { costEntries, costByDay, costByPath, monthTotal, foldCostReport, type CostRunRow } from '@/lib/costs';

export const dynamic = 'force-dynamic';

const COLS = 'id, created_at, student_name, paper_name, num_photos, cost_usd, input_tokens, output_tokens, model, total_max, ' +
  'result_json->queue, result_json->portal_submission, result_json->telegram_handin, result_json->usage, result_json->vision_usage';

async function anthropicBill(sinceDay: string): Promise<{ available: boolean; days?: ReturnType<typeof foldCostReport>; note?: string }> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { available: false, note: 'Set ANTHROPIC_ADMIN_KEY (an Admin API key from console.anthropic.com → Settings → Admin keys) and the invoice appears here, per day.' };
  try {
    const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(`${sinceDay}T00:00:00Z`)}&bucket_width=1d&limit=31`;
    const r = await fetch(url, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { available: false, note: `Anthropic cost report: HTTP ${r.status}${j?.error?.message ? ` — ${j.error.message}` : ''}` };
    return { available: true, days: foldCostReport(j) };
  } catch (e) {
    return { available: false, note: `Anthropic cost report: ${(e as Error).message}` };
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 120);
  const since = new Date(Date.now() - days * 86_400_000);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('paper_marking_runs').select(COLS)
    .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(600);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // PostgREST returns json-path selections under their path names; fold them back into result_json.
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...r,
    result_json: { queue: r.queue ?? null, portal_submission: r.portal_submission ?? undefined, telegram_handin: r.telegram_handin ?? undefined, usage: r.usage ?? null, vision_usage: r.vision_usage ?? null },
  })) as unknown as CostRunRow[];
  const entries = costEntries(rows);
  const today = sgtTodayISO();
  const month = today.slice(0, 7);
  const bill = await anthropicBill(since.toISOString().slice(0, 10));
  return NextResponse.json({
    days, generatedAt: new Date().toISOString(), month,
    monthToDate: monthTotal(entries, month),
    byDay: costByDay(entries),
    byPath: costByPath(entries),
    runs: entries,
    bill,
    notes: [
      'Run costs are the bot\'s pricing of the Claude tokens it used (list price sync, 50 % batch, 10 % cache reads) — the same counts Anthropic bills.',
      'Pages the Mac read on the plan cost $0 here; a plan run\'s cost is the bot-side extras only.',
      'Gemini (placement, ink checks) is billed by Google and shown as tokens only; runs before 9 Sep 2026 evening carry no Gemini count.',
    ],
  });
}
