import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Adrian's PERSONAL to-do list (managed from /admin/my-todos). Distinct from
// /api/admin/todo, which is the Airtable "Todos" build-test-fix loop queue —
// nothing automated ever reads or writes this list.
// Backing store: Supabase (math project) table admin_todos — RLS on, no
// policies, service-role only (same pattern as kiosk_prints).

type TodoRow = {
  id: string;
  task: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
  done_at: string | null;
};

const DONE_LIMIT = 30;

function shape(r: TodoRow) {
  return { id: r.id, task: r.task, done: r.done, dueDate: r.due_date, createdAt: r.created_at, doneAt: r.done_at };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });
  try {
    const supa = createServiceClient();
    // Open: due-dated items first (soonest on top), then undated by age.
    const [open, done] = await Promise.all([
      supa.from('admin_todos').select('*').eq('done', false)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supa.from('admin_todos').select('*').eq('done', true)
        .order('done_at', { ascending: false })
        .limit(DONE_LIMIT),
    ]);
    if (open.error || done.error) throw open.error || done.error;
    return NextResponse.json({
      open: (open.data as TodoRow[]).map(shape),
      done: (done.data as TodoRow[]).map(shape),
    });
  } catch (err: unknown) {
    return NextResponse.json({ open: [], done: [], error: (err as Error)?.message || 'Supabase error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { task, dueDate } = await req.json().catch(() => ({}));
  if (!task || !String(task).trim()) return NextResponse.json({ error: 'task required' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { data, error } = await supa.from('admin_todos')
      .insert({ task: String(task).trim(), due_date: dueDate || null })
      .select('id')
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, done, task, dueDate } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const fields: Record<string, unknown> = {};
  if (done !== undefined) {
    fields.done = !!done;
    fields.done_at = done ? new Date().toISOString() : null;
  }
  if (task !== undefined) fields.task = String(task).trim();
  if (dueDate !== undefined) fields.due_date = dueDate || null;
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { error } = await supa.from('admin_todos').update(fields).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'update failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, clearDone } = await req.json().catch(() => ({}));
  try {
    const supa = createServiceClient();
    if (clearDone) {
      const { error } = await supa.from('admin_todos').delete().eq('done', true);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await supa.from('admin_todos').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'delete failed' }, { status: 500 });
  }
}
