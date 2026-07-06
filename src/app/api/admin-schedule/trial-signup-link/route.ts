// POST /api/admin-schedule/trial-signup-link
// Generates a signed signup link to convert a trial student into an enrolled
// student — the website equivalent of the bot's `/trial signup`. The HMAC scheme
// MUST match /api/signup-data + /api/signup validation exactly (param order:
// slotId, level, subjects, subjectLevel?, trialLessonId?, startDate?, expires).
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { trialLessonId?: string; studentName?: string; level: string; subjects: string[]; subjectLevel?: string; slotId: string; startDate?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { trialLessonId, studentName, level, subjects, subjectLevel, slotId, startDate } = body;
  if (!slotId || !level || !Array.isArray(subjects) || subjects.length === 0) {
    return NextResponse.json({ error: 'slotId, level and at least one subject are required' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set('slotId', slotId);
  params.set('level', level);
  params.set('subjects', subjects.join(','));
  if (subjectLevel) params.set('subjectLevel', subjectLevel);
  if (trialLessonId) params.set('trialLessonId', trialLessonId);
  if (startDate) params.set('startDate', startDate);
  params.set('expires', String(Date.now() + 24 * 60 * 60 * 1000));

  const sig = createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
    .update(params.toString()).digest('hex').slice(0, 16);
  params.set('sig', sig);

  // `name` is an unsigned convenience param — it only pre-fills the parent's
  // form field (which they can still edit), so it's deliberately outside the
  // HMAC. signup-data/signup rebuild the check string from an explicit param
  // list that excludes it, so appending it here won't break signature checks.
  if (studentName && studentName.trim()) params.set('name', studentName.trim());

  return NextResponse.json({ url: `https://www.adrianmathtuition.com/signup?${params.toString()}` });
}
