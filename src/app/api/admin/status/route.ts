import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// At-a-glance project + ops status (see /admin/status). Aggregates a few key
// signals from Airtable so you can keep on top of things without digging.

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });

  const out: any = { todos: { open: 0, items: [] }, myTodos: { open: 0, overdue: 0 }, invoices: { unpaid: 0, owed: 0 }, students: 0, bot: { weekQuestions: 0 } };

  // Loop tasks (build-test-fix loop list, Airtable)
  try {
    const t = await airtableRequestAll('Todos', '');
    const open = (t.records || []).filter((r: any) => (r.fields['Status'] || 'To Do') !== 'Done');
    out.todos = { open: open.length, items: open.slice(0, 8).map((r: any) => r.fields['Task'] || '') };
  } catch { /* table may not exist */ }

  // Personal to-dos (Supabase admin_todos — /admin/my-todos)
  try {
    const supa = createServiceClient();
    const { data } = await supa.from('admin_todos').select('due_date').eq('done', false);
    const today = localToday();
    out.myTodos = {
      open: (data || []).length,
      overdue: (data || []).filter(r => r.due_date && r.due_date < today).length,
    };
  } catch { /* noop */ }

  // Unpaid invoices
  try {
    const formula = encodeURIComponent(`AND(NOT({Is Paid}), OR({Status}='Sent',{Status}='Approved'))`);
    const inv = await airtableRequestAll('Invoices', `?filterByFormula=${formula}&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Status`);
    const unpaid = (inv.records || []).filter((r: any) => r.fields['Status'] !== 'Voided');
    out.invoices = {
      unpaid: unpaid.length,
      owed: Math.round(unpaid.reduce((s: number, r: any) => s + Math.max(0, (r.fields['Final Amount'] || 0) - (r.fields['Amount Paid'] || 0)), 0)),
    };
  } catch { /* noop */ }

  // Students
  try {
    const s = await airtableRequestAll('Students', '?fields[]=Student Name');
    out.students = (s.records || []).length;
  } catch { /* noop */ }

  // Bot questions in the last 7 days
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
    const q = await airtableRequestAll('Questions', `?filterByFormula=${encodeURIComponent(`IS_AFTER({Timestamp}, '${since}')`)}&fields[]=Timestamp`);
    out.bot = { weekQuestions: (q.records || []).length };
  } catch { /* noop */ }

  return NextResponse.json(out);
}
