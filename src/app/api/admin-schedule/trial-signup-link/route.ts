// POST /api/admin-schedule/trial-signup-link
// Generates a signed signup link to convert a trial student into an enrolled
// student — the website equivalent of the bot's `/trial signup`. The HMAC scheme
// MUST match /api/signup-data + /api/signup validation exactly (param order:
// slotId, level, subjects, subjectLevel?, trialLessonId?, startDate?, note?, expires).
import { shortenUrl } from '@/lib/short-link';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { trialLessonId?: string; studentName?: string; level: string; subjects: string[]; subjectLevel?: string; slotId: string; startDate?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { trialLessonId, studentName, level, subjects, subjectLevel, slotId, startDate } = body;
  const note = (body.note || '').trim().slice(0, 400);
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
  // A note the parent reads on the form (3 Nov 2026, Chantal: "in November and
  // December lessons will be adhoc lessons, and billed accordingly"). SIGNED, so
  // nobody can change what the page says we promised.
  if (note) params.set('note', note);
  // 48h, not 24 — the link travels Adrian → student → parent, and the tighter
  // window kept expiring mid-handoff (Adrian's call, 2026-07-29). Keep the bot's
  // generateSignupUrl (handlers/flows.js) on the same number.
  params.set('expires', String(Date.now() + 48 * 60 * 60 * 1000));

  const sig = createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
    .update(params.toString()).digest('hex').slice(0, 16);
  params.set('sig', sig);

  // `name` is an unsigned convenience param — it only pre-fills the parent's
  // form field (which they can still edit), so it's deliberately outside the
  // HMAC. signup-data/signup rebuild the check string from an explicit param
  // list that excludes it, so appending it here won't break signature checks.
  if (studentName && studentName.trim()) params.set('name', studentName.trim());

  const longUrl = `https://www.adrianmathtuition.com/signup?${params.toString()}`;
  // Short /j/<code> for WhatsApp, living as long as the link itself (lib/short-link.ts).
  const url = await shortenUrl(longUrl, { expiresAt: new Date(Number(params.get('expires'))), purpose: 'signup' });
  return NextResponse.json({ url, longUrl });
}
