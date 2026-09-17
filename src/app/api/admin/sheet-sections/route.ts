// /api/admin/sheet-sections — the section bank (17 Sep 2026, SPEC-SECTION-BANK.md).
//   GET ?q=<missed step words>&subject=&level=&limit=&retired=1
//        → { hits: [{id, title, gap, level, subject, student_name, paper_name,
//                    questions, docx_path, section_index, created_at,
//                    last_vetted_at, practice_question_ids, line}] }
//        No q → the newest rows (vetted first). The sheet worker calls this
//        BEFORE authoring a section: same missed step → reuse that section
//        (Adrian's docx, re-verified), different step → write and the bank
//        grows by one when the job completes.
//   PATCH { id, vetted?: bool, retired?: bool, reason? } → { ok }
//        Adrian's two verbs on a row. Retired rows never surface to the worker.
// Bearer ADMIN_PASSWORD or the admin session cookie; anonymous → 401 (the
// health-check probes it). Rows are filed by /api/admin/sheet-jobs {action:'done'}.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { searchSheetSections, setSectionState } from '@/lib/sheet-sections-store';
import { describeHit } from '@/lib/sheet-sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const hits = await searchSheetSections(getSupabaseAdmin(), {
    q: p.get('q'),
    subject: p.get('subject'),
    level: p.get('level')?.toUpperCase() || null,
    limit: Number(p.get('limit')) || 12,
    includeRetired: p.get('retired') === '1',
  });
  return NextResponse.json({ hits: hits.map(h => ({ ...h, line: describeHit(h) })) });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; vetted?: unknown; retired?: unknown; reason?: unknown };
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const out = await setSectionState(getSupabaseAdmin(), body.id, {
    ...(typeof body.vetted === 'boolean' ? { vetted: body.vetted } : {}),
    ...(typeof body.retired === 'boolean' ? { retired: body.retired } : {}),
    reason: typeof body.reason === 'string' ? body.reason : null,
  });
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: 400 });
}
