import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const LEVELS = new Set(['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2']);

// POST /api/admin/students/create  { name, level, email? }
// Creates a minimal Students record for an ad-hoc (unenrolled) student, so they
// can be given billable Ad-hoc lessons + invoices. No enrollment is created, so
// the monthly invoice generator (which loops Active Enrollments) never bills them.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, level, email } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!level || !LEVELS.has(level)) return NextResponse.json({ error: 'a valid level is required' }, { status: 400 });

  const fields: Record<string, unknown> = {
    'Student Name': name.trim(),
    Level: level,
    Status: 'Active',
  };
  if (email?.trim()) fields['Parent Email'] = email.trim();

  const rec = await airtableRequest('Students', '', { method: 'POST', body: JSON.stringify({ fields }) });
  return NextResponse.json({ id: rec.id, name: name.trim(), level });
}
