// /api/admin/stuck — the weekly stuck picture and its "send" door (5 Oct 2026).
//
// GET  → the latest reports (newest first, `?limit=`, default 4): the picture,
//        the prepared sheets and who each was already sent to.
// POST {reportId?, index? | slug?, target: 'stuck' | 'all'}
//      → assigns the prepared sheet as a "From Adrian" worksheet to each
//        recipient through /api/admin/assignments (the same door the student
//        profile's Send-work card uses: the row, the Telegram nudge, the push).
//        A student already sent that sheet is skipped. Without reportId, the
//        newest report carrying the slug is used — the bot's typed
//        "send <slug>".
//
// Auth: Adrian (cookie or Bearer ADMIN_PASSWORD), or the bot with
// Bearer BOT_INTERNAL_SECRET (his ✅ tap / typed reply in Telegram — the bot
// checks it is Adrian before it calls). This is the ONLY place a stuck sheet
// reaches a student.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { findMaterial, recipientsFor, studentNote, type SendTarget, type StoredMaterial } from '@/lib/stuck-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SITE = 'https://www.adrianmathtuition.com';

function who(req: NextRequest): 'admin' | 'bot' | null {
  if (verifyAdminAuth(req)) return 'admin';
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (secret && safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) return 'bot';
  return null;
}

export async function GET(req: NextRequest) {
  if (!who(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = Math.min(12, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 4));
  const { data, error } = await getSupabaseAdmin()
    .from('stuck_reports')
    .select('id, created_at, week_from, week_to, dry, picture, materials, twin_focus, message, telegram_sent')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(req: NextRequest) {
  const by = who(req);
  if (!by) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { reportId?: string; index?: number; slug?: string; target?: string };
  const target: SendTarget = body.target === 'all' ? 'all' : 'stuck';
  const sb = getSupabaseAdmin();

  // which report
  let q = sb.from('stuck_reports').select('id, materials, picture').order('created_at', { ascending: false });
  if (body.reportId) q = q.eq('id', body.reportId);
  const { data: rows, error } = await q.limit(body.reportId ? 1 : 8);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let report: { id: string; materials: StoredMaterial[]; picture: { names?: Record<string, string> } } | null = null;
  let found: ReturnType<typeof findMaterial> = null;
  for (const r of (rows ?? []) as Array<{ id: string; materials: StoredMaterial[]; picture: { names?: Record<string, string> } }>) {
    const f = findMaterial(r.materials ?? [], typeof body.index === 'number' ? body.index : String(body.slug ?? ''));
    if (f) { report = r; found = f; break; }
  }
  if (!report || !found) return NextResponse.json({ error: `No prepared sheet ${body.slug ? `"${body.slug}"` : `#${body.index}`} in ${body.reportId ? 'that report' : 'the recent reports'}` }, { status: 404 });

  const m = found.material;
  const { to, already } = recipientsFor(m, target);
  const names = report.picture?.names ?? {};
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return NextResponse.json({ error: 'ADMIN_PASSWORD not set' }, { status: 503 });

  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const studentId of to) {
    try {
      // A cron/bot-originated call builds its own admin Bearer — never forward
      // the header it arrived with (docs/OPS.md, the page-gap-sweep lesson).
      const res = await fetch(`${SITE}/api/admin/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({
          studentId, kind: 'worksheet', pdfUrl: m.pdfUrl,
          title: m.title || `${m.area} practice`, topic: m.topics[0] ?? m.area,
          level: m.subject, note: studentNote(m),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) done.push(studentId);
      else failed.push({ id: studentId, error: ((await res.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${res.status}` });
    } catch (e) {
      failed.push({ id: studentId, error: (e as Error).message });
    }
  }

  if (done.length) {
    // kept on each student's list of things made for them (the Next lesson card, 5 Oct 2026)
    await sb.from('student_materials').insert(done.map((sid) => ({
      airtable_student_id: sid, title: m.title || `${m.area} practice`, topic: m.topics[0] ?? m.area, label: m.area,
      level: m.subject, kind: 'practice', source: 'stuck', file_url: m.pdfUrl, question_ids: m.questionIds ?? [],
      status: 'ready', given_at: new Date().toISOString(), meta: { subject: m.subject, topics: m.topics, count: m.count ?? 0, reportId: report!.id },
    }))).then(({ error }) => { if (error) console.error('[stuck] student_materials:', error.message); });
    const materials = [...report.materials];
    materials[found.index] = { ...m, sent: [...(m.sent ?? []), { at: new Date().toISOString(), target, studentIds: done, by }] };
    await sb.from('stuck_reports').update({ materials }).eq('id', report.id);
  }

  const nameOf = (id: string) => names[id] ?? id;
  return NextResponse.json({
    ok: failed.length === 0,
    reportId: report.id, slug: m.slug, area: m.area, groupLabel: m.groupLabel, target,
    sent: done.map(nameOf), already: already.map(nameOf),
    failed: failed.map((f) => ({ name: nameOf(f.id), error: f.error })),
  }, { status: failed.length && !done.length ? 502 : 200 });
}
