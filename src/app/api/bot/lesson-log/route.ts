// POST /api/bot/lesson-log — Adrian's answer to the end-of-lesson line (5 Oct
// 2026, /api/cron/lesson-end). The bot (lib/lesson-log.js) checks it is Adrian
// and passes the answer on; this route writes the Lessons row. Bearer
// BOT_INTERNAL_SECRET.
//
//   { packId, action: 'ok' }     ✓ tapped → the auto entry is confirmed as it stands
//   { messageId, text }          a reply to the line in plain words → read (a short
//                                model call, checked against the course's topic list;
//                                lib/lesson-autolog parseReplyPlain without it) into
//                                topics + homework; his topics replace the auto ones
// → { ok, text } — one plain line the bot sends back. 404 = not one of ours
//   (the bot then treats the message as ordinary).
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { safeEqual } from '@/lib/safe-equal';
import { getSupabaseAdmin } from '@/lib/supabase';
import { anthropicText } from '@/lib/claude-models';

// A short reading call; Sonnet 5 like the other unswitched small sites (claude-models.test.ts lists the approved Sonnet 5.5 ones).
const READ_MODEL = 'claude-sonnet-5';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { worksheetLevel } from '@/lib/stuck-send';
import { applyReply, autoLogLine, buildReplyPrompt, composeAutoLog, parseReplyModel, parseReplyPlain, type AutoLog } from '@/lib/lesson-autolog';
import { loadStudent, writeAutoLog, type PackRow } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as { packId?: string; action?: string; messageId?: number; text?: string };
  const sb = getSupabaseAdmin();
  let q = sb.from('lesson_packs').select('*');
  if (body.packId && /^[0-9a-f-]{36}$/.test(body.packId)) q = q.eq('id', body.packId);
  else if (Number.isInteger(body.messageId) && body.messageId! > 0) q = q.eq('line_message_id', body.messageId!);
  else return NextResponse.json({ error: 'packId or messageId is required' }, { status: 400 });
  const { data } = await q.limit(1);
  const pack = (data ?? [])[0] as PackRow | undefined;
  if (!pack) return NextResponse.json({ error: 'not one of the lesson lines' }, { status: 404 });
  const first = (pack.student_name ?? 'the student').split(/\s+/)[0];
  const log: AutoLog = pack.auto_log ?? composeAutoLog({ printed: [] });
  const now = new Date().toISOString();

  if (body.action === 'ok') {
    const w = await writeAutoLog(sb, pack, log, 'confirmed');
    await sb.from('lesson_packs').update({ confirmed_at: now, confirm_kind: 'ok' }).eq('id', pack.id);
    return NextResponse.json({ ok: true, text: w.written || w.reason === 'nothing recorded' ? `✓ ${first}'s lesson logged.` : `Not changed: ${first}'s lesson was ${w.reason}.` });
  }

  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const student = await loadStudent(pack.airtable_student_id);
  const canonical = [...new Set((student?.subjects.length ? student.subjects : ['EM' as const])
    .flatMap((s) => getTopicsForPaperLevel(worksheetLevel(s, student?.level ?? null)).flatMap((c) => c.topics)))];
  let read = null as ReturnType<typeof parseReplyModel>;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: READ_MODEL, max_tokens: 800,
        messages: [{ role: 'user', content: buildReplyPrompt(text, autoLogLine(first, log), canonical) }],
      });
      read = parseReplyModel(anthropicText(msg), canonical);
    } catch (e) {
      console.error('[lesson-log] model failed', (e as Error).message);
    }
  }
  if (!read) read = parseReplyPlain(text, canonical);
  const next = applyReply(log, read);
  const w = await writeAutoLog(sb, pack, next, 'confirmed', read.note || text.slice(0, 300));
  await sb.from('lesson_packs').update({ confirmed_at: now, confirm_kind: 'reply', reply_text: text.slice(0, 2000) }).eq('id', pack.id);
  if (!w.written) return NextResponse.json({ ok: true, text: `Not changed: ${first}'s lesson was ${w.reason}.` });
  const parts = [next.topics.length ? `topics ${next.topics.join(', ')}` : null, next.homework ? `homework "${next.homework}"` : null].filter(Boolean);
  return NextResponse.json({ ok: true, text: `✓ ${first}'s lesson logged${parts.length ? `: ${parts.join('; ')}` : ''}.` });
}
