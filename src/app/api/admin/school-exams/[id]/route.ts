// 📝 One school exam scan (SPEC-EXAM-TRACKER.md) — admin only.
// GET                                   → { scan }
// PATCH { parts }                        → Adrian's corrections to the check table
// POST  { action: 'confirm', firstName } → "Looks right": comparison + next lessons + parent
//        note; fills Result Score / Total / Tested Topics on the Airtable Exams row ONLY where empty
// POST  { action: 'reread', level }      → read the pages again
// DELETE                                 → remove the scan and its pages
import { NextRequest, NextResponse, after } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';
import { removeStudentFiles, keyFromUrl } from '@/lib/student-files';
import { cleanPart, compareExams, examLabel, lossByTopic, totals, type ExamPart } from '@/lib/school-exam';
import { deleteScan, getScan, previousScan, runRead, updateScan, writeExamReport, type ScanReport } from '@/lib/school-exam-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/;

async function load(ctx: Ctx) {
  const { id } = await ctx.params;
  return UUID.test(id) ? getScan(id) : null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scan = await load(ctx);
  if (!scan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ scan });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scan = await load(ctx);
  if (!scan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b = await req.json().catch(() => ({})) as { parts?: unknown[] };
  const parts = (Array.isArray(b.parts) ? b.parts : []).map(p => cleanPart(p)).filter((p): p is ExamPart => !!p);
  if (!parts.length) return NextResponse.json({ error: 'no parts' }, { status: 400 });
  const t = totals(parts);
  const read = { parts, written_total: scan.read?.written_total ?? { got: null, max: null } };
  return NextResponse.json({ scan: await updateScan(scan.id, { read, total_got: t.got, total_max: t.max }) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scan = await load(ctx);
  if (!scan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (b.action === 'reread') {
    const row = await updateScan(scan.id, { status: 'reading', error: null });
    after(() => runRead(scan.id, String(b.level || '')));
    return NextResponse.json({ scan: row });
  }

  if (b.action === 'confirm') {
    const parts = scan.read?.parts ?? [];
    if (!parts.length) return NextResponse.json({ error: 'nothing read yet' }, { status: 400 });
    const prev = await previousScan(scan);
    const comparison = prev?.read?.parts?.length ? compareExams(prev.read.parts, parts) : null;
    const prevLabel = prev ? examLabel(prev.exam_type, prev.exam_date, prev.subject) : null;
    const label = examLabel(scan.exam_type, scan.exam_date, scan.subject);
    const written = await writeExamReport({
      firstName: String(b.firstName || '').trim().split(/\s+/)[0] || 'your child',
      label, parts, comparison, prevLabel,
    }).catch(e => { console.error('[school-exams] report', (e as Error).message); return null; });
    const report: ScanReport = {
      loss_by_topic: lossByTopic(parts), comparison, prev_id: prev?.id ?? null, prev_label: prevLabel,
      ...(written ?? {}),
    };
    const row = await updateScan(scan.id, { status: 'done', report, checked_at: new Date().toISOString() });
    if (scan.airtable_exam_id) await fillExamRow(scan.airtable_exam_id, parts).catch(e => console.error('[school-exams] airtable', (e as Error).message));
    return NextResponse.json({ scan: row, reportFailed: !written });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

/** Result Score / Result Total / Tested Topics on the Exams row — only the ones still empty. */
async function fillExamRow(examId: string, parts: readonly ExamPart[]) {
  const rec = await airtableRequest('Exams', `/${examId}`);
  const f = rec?.fields ?? {};
  const t = totals(parts);
  const fields: Record<string, unknown> = {};
  if (f['Result Score'] == null) fields['Result Score'] = t.got;
  if (f['Result Total'] == null) fields['Result Total'] = t.max;
  if (!f['Tested Topics']) fields['Tested Topics'] = [...new Set(parts.map(p => p.topic).filter(x => x !== 'Other'))].join(', ');
  if (Object.keys(fields).length) await airtableRequest('Exams', `/${examId}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scan = await load(ctx);
  if (!scan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await removeStudentFiles(scan.files.map(u => keyFromUrl(u)).filter((k): k is string => !!k)).catch(() => 0);
  await deleteScan(scan.id);
  return NextResponse.json({ ok: true });
}
