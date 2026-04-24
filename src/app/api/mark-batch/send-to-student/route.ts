import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

async function sendTelegramDocument(chatId: string, pdfUrl: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: pdfUrl,
      caption,
      parse_mode: 'Markdown',
    }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { batchId: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { batchId } = body;
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  // ── Fetch batch from Supabase ─────────────────────────────────────────────

  const supabase = getSupabase();
  const { data: sbRow } = await supabase
    .from('marking_batches')
    .select('final_pdf_url, student_name, marking_json, detection_json, status')
    .eq('id', batchId)
    .single();

  if (!sbRow) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (sbRow.status !== 'finalized') {
    return NextResponse.json({ error: 'Batch not yet finalized — assemble PDF first' }, { status: 400 });
  }
  if (!sbRow.final_pdf_url) {
    return NextResponse.json({ error: 'No assembled PDF found for this batch' }, { status: 400 });
  }

  // ── Calculate total marks ─────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = (sbRow.marking_json as any)?.results ?? [];
  const totalAwarded = results.reduce((sum: number, r: { marks?: { awarded?: number } }) => sum + (r.marks?.awarded ?? 0), 0);
  const totalMax = results.reduce((sum: number, r: { marks?: { max?: number } }) => sum + (r.marks?.max ?? 0), 0);
  const studentName = sbRow.student_name || 'Student';

  // ── Look up student Telegram IDs from Airtable ────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentId = (sbRow.detection_json as any)?.studentId as string | null;
  if (!studentId) {
    return NextResponse.json(
      { error: 'No student linked to this batch — select a student when uploading to enable delivery' },
      { status: 400 }
    );
  }

  let studentTelegramId: string | null = null;
  let parentTelegramId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = await airtableRequest('Students', `/${studentId}`, { method: 'GET' }) as any;
    studentTelegramId = (rec.fields?.['Student Telegram ID'] as string) || null;
    parentTelegramId = (rec.fields?.['Parent Telegram ID'] as string) || null;
  } catch (err) {
    console.error('[send-to-student] Airtable student lookup failed:', err);
    return NextResponse.json({ error: 'Failed to look up student — check Airtable Students record' }, { status: 500 });
  }

  const recipients = [studentTelegramId, parentTelegramId].filter((id): id is string => Boolean(id));
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No Telegram IDs found for this student — add Student Telegram ID or Parent Telegram ID in Airtable' },
      { status: 400 }
    );
  }

  // ── Send PDF via Telegram ─────────────────────────────────────────────────

  const scoreText = totalMax > 0 ? `\n\n📊 Score: *${totalAwarded}/${totalMax}*` : '';
  const caption = `📝 *${studentName}'s Marked Homework*${scoreText}\n\nMarked by AdrianMath AI · Reviewed by Adrian`;

  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const chatId of recipients) {
    try {
      await sendTelegramDocument(chatId, sbRow.final_pdf_url as string, caption);
      sentTo.push(chatId);
      console.log(`[send-to-student] Sent to ${chatId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[send-to-student] Failed to send to ${chatId}:`, msg);
      errors.push(msg);
    }
  }

  if (sentTo.length === 0) {
    return NextResponse.json(
      { error: 'Failed to deliver to any recipient', details: errors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sent: true,
    sentTo,
    errors: errors.length > 0 ? errors : undefined,
    totalAwarded,
    totalMax,
  });
}
