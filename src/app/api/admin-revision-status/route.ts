import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { studentId: string; status: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { studentId, status } = body;
  if (!studentId || !status) {
    return NextResponse.json({ error: 'Missing studentId or status' }, { status: 400 });
  }

  if (status !== 'Opted Out' && status !== 'No Response') {
    return NextResponse.json({ error: 'Invalid status. Must be "Opted Out" or "No Response"' }, { status: 400 });
  }

  try {
    await airtableRequest('Students', `/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'June Revision 2026': status } }),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[admin-revision-status] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
