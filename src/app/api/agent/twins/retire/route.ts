// POST /api/agent/twins/retire {bank, id, reason} — take back a twin a CLOUD SESSION filed
// (gen_meta.written_by = 'cloud-session'; nothing else can be touched here). Maths → deleted_at,
// science → practice_hidden + verified=false — the same as Retire on /admin/generated.
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor, stampTwins } from '@/lib/twins-door';
import { retireCloudTwin } from '@/lib/twin-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const denied = await twinsDoor(req, 'retire', { bank: raw?.bank ?? null, id: raw?.id ?? null });
  if (denied) return denied;
  const bank = raw?.bank === 'science' ? 'science' : raw?.bank === 'maths' ? 'maths' : null;
  const id = String(raw?.id ?? '');
  if (!bank || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bank=maths|science and id (uuid) required' }, { status: 400 });
  const reason = String(raw?.reason ?? 'retired by the session').slice(0, 200);
  const r = await retireCloudTwin(bank, id, reason);
  void stampTwins(r.ok, `${bank} twin ${id.slice(0, 8)} retire ${r.ok ? 'done' : `refused: ${r.error}`} — ${reason}`.slice(0, 290));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
