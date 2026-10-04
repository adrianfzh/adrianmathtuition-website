// /api/admin/student-materials — everything made for one student (5 Oct 2026,
// the Next lesson card). Admin only.
//
// GET  ?student=recXXX                → { materials }
// POST { id, action }                 action: 'printed' | 'given' | 'unmark' | 'remove'
//   printed — stamped by the card's Print button; the lesson's auto log reads it
//             (an item printed on a lesson day = used in that lesson)
//   given   — handed over without printing here (a sheet he already had)
//   unmark  — clears both stamps (a mis-tap)
//   remove  — hides it from the list (nothing is deleted)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { materialsFor } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f-]{36}$/;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sid = req.nextUrl.searchParams.get('student') ?? '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(sid)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  return NextResponse.json({ materials: await materialsFor(getSupabaseAdmin(), sid, 100) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; action?: string };
  if (!UUID_RE.test(body.id ?? '')) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const now = new Date().toISOString();
  const patch: Record<string, string | null> | null =
    body.action === 'printed' ? { printed_at: now }
      : body.action === 'given' ? { given_at: now }
        : body.action === 'unmark' ? { printed_at: null, given_at: null }
          : body.action === 'remove' ? { removed_at: now } : null;
  if (!patch) return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('student_materials').update(patch).eq('id', body.id!).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, material: data });
}
