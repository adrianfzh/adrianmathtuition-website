// POST /api/admin-invoices/referral-mark-paid
// Marks Referral Cash Paid = true on a student record.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { studentId: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

  await airtableRequest('Students', `/${body.studentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { 'Referral Cash Paid': true } }),
  });

  return NextResponse.json({ ok: true });
}
