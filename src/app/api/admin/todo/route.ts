import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// Task list backing the build-test-fix /loop. The loop reads open todos
// (oldest first), does each, and marks it Done. Managed from /admin/todo.
// Airtable table "Todos": Task (single line text), Status (single select:
// "To Do" / "Done"), Notes (long text). Record createdTime drives ordering.

type Todo = { id: string; task: string; status: string; notes: string; createdTime: string };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });
  try {
    const data = await airtableRequestAll('Todos', '');
    const todos: Todo[] = (data.records || [])
      .map((r: any) => ({
        id: r.id,
        task: r.fields['Task'] || '',
        status: r.fields['Status'] || 'To Do',
        notes: r.fields['Notes'] || '',
        createdTime: r.createdTime || '',
      }))
      .sort((a: Todo, b: Todo) => a.createdTime.localeCompare(b.createdTime));
    return NextResponse.json({ todos });
  } catch (err: any) {
    // Table missing or other Airtable error — surface clearly, don't 500 the page.
    return NextResponse.json({ todos: [], error: err?.message || 'Airtable error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { task } = await req.json().catch(() => ({}));
  if (!task || !String(task).trim()) return NextResponse.json({ error: 'task required' }, { status: 400 });
  try {
    const created = await airtableRequest('Todos', '', {
      method: 'POST',
      body: JSON.stringify({ fields: { Task: String(task).trim(), Status: 'To Do' } }),
    });
    return NextResponse.json({ id: created.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status, task, notes } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const fields: Record<string, string> = {};
  if (status !== undefined) fields['Status'] = status;
  if (task !== undefined) fields['Task'] = task;
  if (notes !== undefined) fields['Notes'] = notes;
  try {
    await airtableRequest('Todos', `/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'update failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await airtableRequest('Todos', `/${id}`, { method: 'DELETE' });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'delete failed' }, { status: 500 });
  }
}
