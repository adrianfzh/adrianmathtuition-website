// POST /api/admin/worksheet-chat — "Make something for <student>" on the Next
// lesson card (5 Oct 2026). Adrian types what he wants; a short model call
// reads it into a request (lib/worksheet-chat, every topic checked against the
// course's list), the sheet is drawn from the bank through the /ws worksheet
// route (answers at the back), and the result is STORED on the student
// (student_materials, source 'chat') so the profile lists it and the next
// suggestion knows they got it. Admin only.
//
// Body: { student: 'recXXX', request: '10 questions on sine rule, harder ones' }
// → { ok, material, ask } | { ok:false, error }
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { anthropicText } from '@/lib/claude-models';

// A short reading call; Sonnet 5 like the other unswitched small sites (claude-models.test.ts lists the approved Sonnet 5.5 ones).
const READ_MODEL = 'claude-sonnet-5';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { loadStudent, makeSheet } from '@/lib/next-lesson-store';
import { worksheetLevel } from '@/lib/stuck-send';
import { SUBJECT_LABEL } from '@/lib/stuck-topics';
import { buildChatPrompt, parseChatReply, plainChatAsk } from '@/lib/worksheet-chat';
import type { Subject } from '@/lib/teaching-order';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const SKILL_LEVEL: Record<string, string> = { AM: 'AM', EM: 'EM', JC2: 'JC', S1: 'S1', S2: 'S2' };

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { student?: string; request?: string };
  const request = String(body.request ?? '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(body.student ?? '')) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  if (request.length < 3) return NextResponse.json({ error: 'Say what you want on the sheet.' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const student = await loadStudent(body.student!);
  if (!student) return NextResponse.json({ error: 'no such student' }, { status: 404 });

  const subjects: Subject[] = student.subjects.length ? student.subjects : ['EM'];
  const courses = await Promise.all(subjects.map(async (subject) => {
    const level = worksheetLevel(subject, student.level);
    const topics = getTopicsForPaperLevel(level).flatMap((c) => c.topics);
    const { data } = await sb.from('subgroups').select('topic, name, order_index').eq('level', SKILL_LEVEL[level] ?? level).order('order_index');
    const skills: Record<string, string[]> = {};
    for (const r of (data ?? []) as { topic: string; name: string }[]) (skills[r.topic] ??= []).push(r.name);
    return { subject, level, topics: [...new Set(topics)], skills };
  }));

  let ask = null as ReturnType<typeof parseChatReply> | null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: READ_MODEL, max_tokens: 1200,
        messages: [{ role: 'user', content: buildChatPrompt(request, student, courses) }],
      });
      ask = parseChatReply(anthropicText(msg), courses);
    } catch (e) {
      console.error('[worksheet-chat] model failed', (e as Error).message);
    }
  }
  if (!ask || ('error' in ask && !/topic|maths|list/i.test(ask.error))) ask = plainChatAsk(request, courses);
  if ('error' in ask) return NextResponse.json({ ok: false, error: ask.error }, { status: 422 });

  const course = courses.find((c) => c.subject === ask.subject)!;
  const r = await makeSheet(sb, {
    level: course.level, topics: ask.topics, skills: ask.skills, count: ask.count,
    band: ask.band, title: ask.title, studentId: student.id,
  });
  const { data: material, error } = await sb.from('student_materials').insert({
    airtable_student_id: student.id,
    title: `${SUBJECT_LABEL[ask.subject]}: ${ask.title}`,
    topic: ask.topics.length === 1 ? ask.topics[0] : ask.topics.join(', '),
    label: ask.title, level: course.level, kind: 'chat', source: 'chat',
    file_url: r.ok ? r.url : null, question_ids: r.ok ? r.questionIds : [],
    status: r.ok ? 'ready' : 'failed', error: r.ok ? null : r.error, request,
    meta: { subject: ask.subject, topics: ask.topics, skills: ask.skills, count: r.ok ? r.count : 0, band: ask.band },
  }).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, material, ask }, { status: 502 });
  return NextResponse.json({ ok: true, material, ask });
}
