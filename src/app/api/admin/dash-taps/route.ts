// /api/admin/dash-taps — the admin hub's "most opened" tally, kept in ONE place.
//
// The tools row learns which pages Adrian opens (6 Oct 2026). The tally lived in each
// browser, so his phone and his computer showed different tiles (Adrian, 8 Oct 2026:
// "why is the tiles for phone and web different?"). It now lives in the Airtable
// `Settings` row `admin_dash_taps` (Value = JSON { href: count }); the browser keeps a
// copy only so the row can draw before this answers.
//   GET                    → { counts }
//   POST { href }          → one more open of that tool → { counts }
//   POST { merge: counts } → a device's old private tally, added in once → { counts }
// Admin only. Rules: lib/admin-tools (bumpTap, mergeTaps, parseTaps) — pure, tested.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';
import { bumpTap, mergeTaps, parseTaps, type TapCounts } from '@/lib/admin-tools';

export const dynamic = 'force-dynamic';
const NAME = 'admin_dash_taps';

async function readRow(): Promise<{ id: string | null; counts: TapCounts }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${NAME}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, counts: parseTaps(typeof rec?.fields?.Value === 'string' ? (rec.fields.Value as string) : null) };
}

async function writeRow(id: string | null, counts: TapCounts): Promise<void> {
  const fields = { Value: JSON.stringify(counts) };
  if (id) await airtableRequest('Settings', `/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': NAME, ...fields } }) });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try { return NextResponse.json({ counts: (await readRow()).counts }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 }); }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { href?: unknown; merge?: unknown }));
  try {
    const row = await readRow();
    let next = row.counts;
    if (typeof body.href === 'string') next = bumpTap(next, body.href);
    else if (body.merge && typeof body.merge === 'object') next = mergeTaps(next, parseTaps(JSON.stringify(body.merge)));
    else return NextResponse.json({ error: 'href or merge required' }, { status: 400 });
    if (next !== row.counts) await writeRow(row.id, next);
    return NextResponse.json({ counts: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
