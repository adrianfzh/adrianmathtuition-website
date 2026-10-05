// POST /api/bot/lesson-log — Adrian's answer to the end-of-lesson ping (5 Oct
// 2026, /api/cron/lesson-end). The bot (lib/lesson-log.js) checks it is Adrian,
// transcribes a voice note, and passes it on; this route writes the Lessons row.
// Bearer BOT_INTERNAL_SECRET.
//
//   { packId, action: 'ok' }                ✓ tapped → the lesson's entry (every student
//                                           of a group lesson) is confirmed as it stands;
//                                           with nothing printed, the night-before plan
//                                           becomes the log ("as planned")
//   { messageId, text, source? }            a reply to the ping, or to the bot's "Got it"
//                                           (a correction), as a voice transcript
//                                           (source 'voice') or typed words — ONE reader for
//                                           both (lib/lesson-voice: a short model call,
//                                           checked against the course's topic list;
//                                           parseNotePlain without it)
//   { text, source: 'voice', loose: true }  a voice note sent WITHOUT replying: counts for a
//                                           lesson that ended in the last two hours AND is
//                                           named in it (matchLoose); 404 when none is
//   { action: 'ack', packIds, ackId }       the bot's "Got it" message id, so a reply to it
//                                           finds the lesson
// → { ok, text, packIds } — text = one plain line the bot sends back. 404 = not one of
//   ours (the bot then treats the message as ordinary).
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { safeEqual } from '@/lib/safe-equal';
import { getSupabaseAdmin } from '@/lib/supabase';
import { anthropicText } from '@/lib/claude-models';
import { sgtClock, sgtTodayISO } from '@/lib/sgt';

// A short reading call; Sonnet 5 like the other unswitched small sites (claude-models.test.ts lists the approved Sonnet 5.5 ones).
const READ_MODEL = 'claude-sonnet-5';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { worksheetLevel } from '@/lib/stuck-send';
import { composeAutoLog, type AutoLog } from '@/lib/lesson-autolog';
import {
  ackText, buildNotePrompt, logAfterNote, matchLoose, mergeCorrection, mayWriteVoice, noteFor, noteSummary, parseNoteModel, parseNotePlain,
  planLog, voiceFields, type GroupRead, type StoredNote,
} from '@/lib/lesson-voice';
import { lessonLogFields, loadStudent, patchLesson, writeAutoLog, type PackRow } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Pack = PackRow;
const firstOf = (p: Pack) => (p.student_name ?? 'the student').split(/\s+/)[0];
const UUID = /^[0-9a-f-]{36}$/;

export async function POST(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as {
    packId?: string; packIds?: string[]; action?: string; messageId?: number; ackId?: number;
    text?: string; source?: string; loose?: boolean;
  };
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  // the bot's "Got it" message, so a reply to it is a correction
  if (body.action === 'ack') {
    const ids = (body.packIds ?? []).filter((x) => UUID.test(x));
    if (!ids.length || !Number.isInteger(body.ackId)) return NextResponse.json({ error: 'packIds and ackId are required' }, { status: 400 });
    await sb.from('lesson_packs').update({ ack_message_id: body.ackId }).in('id', ids);
    return NextResponse.json({ ok: true });
  }

  // ── find the lesson(s) ───────────────────────────────────────────────────
  let packs: Pack[] = [];
  const text = String(body.text ?? '').trim();
  if (body.packId && UUID.test(body.packId)) {
    const { data } = await sb.from('lesson_packs').select('*').eq('id', body.packId).limit(1);
    const p = (data ?? [])[0] as Pack | undefined;
    if (p?.line_message_id) {
      const { data: g } = await sb.from('lesson_packs').select('*').eq('line_message_id', p.line_message_id);
      packs = (g ?? []) as Pack[];
    } else if (p) packs = [p];
  } else if (Number.isInteger(body.messageId) && body.messageId! > 0) {
    const { data } = await sb.from('lesson_packs').select('*').or(`line_message_id.eq.${body.messageId},ack_message_id.eq.${body.messageId}`);
    packs = (data ?? []) as Pack[];
  } else if (body.loose && text) {
    const today = sgtTodayISO();
    const { data } = await sb.from('lesson_packs').select('*').eq('lesson_date', today);
    const all = (data ?? []) as Pack[];
    const c = sgtClock();
    const nowHHMM = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
    const hit = new Set(matchLoose(text, all.map((p) => ({ packId: p.id, name: p.student_name ?? '', end: p.lesson_end, date: String(p.lesson_date) })), today, nowHHMM).map((m) => m.packId));
    packs = all.filter((p) => hit.has(p.id));
  } else {
    return NextResponse.json({ error: 'packId, messageId or loose text is required' }, { status: 400 });
  }
  if (!packs.length) return NextResponse.json({ error: body.loose ? 'no lesson in the last two hours is named in it' : 'not one of the lesson lines' }, { status: 404 });
  const packIds = packs.map((p) => p.id);

  // ── ✓ ────────────────────────────────────────────────────────────────────
  if (body.action === 'ok') {
    const lines: string[] = [];
    for (const p of packs) {
      const auto: AutoLog = p.auto_log ?? composeAutoLog({ printed: [] });
      const log = auto.empty ? planLog(p.plan) ?? auto : auto;
      const w = await writeAutoLog(sb, p, log, 'confirmed');
      await sb.from('lesson_packs').update({ confirmed_at: now, confirm_kind: 'ok' }).eq('id', p.id);
      lines.push(w.written || w.reason === 'nothing recorded' ? `${firstOf(p)}${log.empty ? '' : `: ${log.phrases.join(', ')}`}` : `${firstOf(p)}: not changed (${w.reason})`);
    }
    return NextResponse.json({ ok: true, packIds, text: `✓ Logged — ${lines.join('; ')}.` });
  }

  // ── a note (voice or typed), or a correction ─────────────────────────────
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const source: 'voice' | 'text' = body.source === 'voice' ? 'voice' : 'text';
  const firsts = packs.map(firstOf);
  const canonical = new Set<string>();
  for (const p of packs) {
    const student = await loadStudent(p.airtable_student_id);
    for (const s of student?.subjects.length ? student.subjects : ['EM' as const]) {
      for (const c of getTopicsForPaperLevel(worksheetLevel(s, student?.level ?? null))) for (const t of c.topics) canonical.add(t);
    }
  }
  const list = [...canonical];
  const previous = packs.some((p) => p.voice_note)
    ? (packs.length === 1 ? packs[0].voice_note : Object.fromEntries(packs.filter((p) => p.voice_note).map((p) => [firstOf(p), p.voice_note])))
    : null;
  const printed = packs.map((p) => (p.auto_log && !p.auto_log.empty ? `${packs.length > 1 ? `${firstOf(p)}: ` : ''}${p.auto_log.phrases.join(', ')}` : null)).filter(Boolean).join('; ') || null;

  let read: GroupRead | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: READ_MODEL, max_tokens: 1000,
        messages: [{ role: 'user', content: buildNotePrompt({ text, source, students: firsts, canonical: list, printed, previous }) }],
      });
      read = parseNoteModel(anthropicText(msg), list, firsts);
    } catch (e) {
      console.error('[lesson-log] model failed', (e as Error).message);
    }
  }
  if (!read) read = parseNotePlain(text, list);

  const lines: string[] = [];
  for (const p of packs) {
    const first = firstOf(p);
    const note = mergeCorrection(p.voice_note, noteFor(read, first));
    const log = p.auto_log ?? null;
    const stored: StoredNote = { ...note, source, transcript: text.slice(0, 2000), at: now };
    const fields = await lessonLogFields(p.lesson_id);
    if (!fields) { lines.push(`${first}: lesson not found`); continue; }
    if (!mayWriteVoice(fields)) { lines.push(`${first}: not changed — you logged it by hand`); continue; }
    await patchLesson(p.lesson_id, voiceFields(note, log, source));
    await sb.from('lesson_packs').update({
      auto_log: logAfterNote(log, note), log_written_at: p.log_written_at ?? now,
      voice_note: stored, voice_at: now, confirmed_at: now, confirm_kind: source === 'voice' ? 'voice' : 'reply', reply_text: text.slice(0, 2000),
    }).eq('id', p.id);
    lines.push(noteSummary(first, note, log));
  }
  return NextResponse.json({ ok: true, packIds, text: ackText(lines, !!previous) });
}
