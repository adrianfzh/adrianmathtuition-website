// GET /api/admin/worksheet-builder/exports
// Last 20 worksheet_exports rows, newest first.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('worksheet_exports')
    .select('id, exported_at, title, subtitle, level, mode, format, question_count, total_marks, file_urls')
    .order('exported_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exports: data ?? [] });
}
