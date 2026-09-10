// /api/portal/notebook/saves — 💾 Save an answer into My Notebook
// (SPEC-NOTEBOOK-V2 §1, 11 Sep 2026). Session-scoped; every read and write is
// filtered by the student's portal identity, and the table has RLS on with no
// policies (service key only).
//
//   POST   { messageId, chatId }  the assistant chat_messages row + the chat
//          token the browser holds for that conversation. The token must match
//          the conversation's chat_key — the same anti-spoof rule the bot's
//          feedback endpoint uses — so nobody can save someone else's chat.
//          The question is the user message just before it; topic + skill come
//          from the nearest ask_skills row for this student (the bot files every
//          linked ask, ~10 s after the answer). Saving twice returns the same row.
//   PATCH  { id, title }           rename the card (the skill tag stays).
//   DELETE { id }                  remove it.
// Behind Settings → "Save answers to my notebook" (prefs.save_answers): off → 403.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { saveAnswersOn } from '@/lib/portal-prefs';
import {
  MAX_SAVES_PER_STUDENT, SKILL_MATCH_WINDOW_MS, cleanTitle, nearestAskSkill, saveTitleFrom, type SaveRow,
} from '@/lib/notebook-saves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, kind, source, question_text, answer_text, image_url, title, topic, skill, created_at';

async function who() {
  const account = await sessionAccount().catch(() => null);
  if (!account) return null;
  return { account, identity: portalIdentity(account) };
}

export async function POST(req: NextRequest) {
  const me = await who();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!saveAnswersOn(me.account.prefs)) return NextResponse.json({ error: 'Saving answers is off — turn it on in Settings' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { messageId?: unknown; chatId?: unknown };
  const messageId = typeof body.messageId === 'number' ? body.messageId : Number(body.messageId);
  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  if (!Number.isInteger(messageId) || messageId <= 0 || !chatId) return NextResponse.json({ error: 'messageId and chatId are required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: msg } = await svc.from('chat_messages').select('id, conversation_id, role, content, created_at').eq('id', messageId).maybeSingle();
  if (!msg || msg.role !== 'assistant' || !msg.content) return NextResponse.json({ error: 'That answer is not available to save' }, { status: 404 });
  const { data: conv } = await svc.from('chat_conversations').select('id, chat_key').eq('id', msg.conversation_id).maybeSingle();
  if (!conv || String(conv.chat_key) !== chatId) return NextResponse.json({ error: 'That answer is not yours to save' }, { status: 403 });

  // Already saved? Same row back — a second tap is not a second card.
  const { data: existing } = await svc.from('notebook_saves').select(COLUMNS)
    .eq('airtable_student_id', me.identity).eq('kind', 'ask').eq('source', String(messageId)).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, save: existing, already: true });

  const { count } = await svc.from('notebook_saves').select('id', { count: 'exact', head: true }).eq('airtable_student_id', me.identity);
  if ((count ?? 0) >= MAX_SAVES_PER_STUDENT) return NextResponse.json({ error: 'Notebook is full — delete some saved answers first' }, { status: 400 });

  // The question: the student's message just before this answer in the same conversation.
  const { data: prev } = await svc.from('chat_messages').select('content, image_url')
    .eq('conversation_id', msg.conversation_id).eq('role', 'user').lt('id', messageId).order('id', { ascending: false }).limit(1).maybeSingle();

  // Topic + skill: the ask the bot filed nearest to this answer's time.
  const at = String(msg.created_at);
  const lo = new Date(Date.parse(at) - SKILL_MATCH_WINDOW_MS).toISOString();
  const hi = new Date(Date.parse(at) + SKILL_MATCH_WINDOW_MS).toISOString();
  const { data: asks } = await svc.from('ask_skills').select('topic, skill, asked_at')
    .eq('airtable_student_id', me.identity).gte('asked_at', lo).lte('asked_at', hi);
  const hit = nearestAskSkill((asks ?? []) as { topic: string; skill: string | null; asked_at: string }[], at);

  const row = {
    airtable_student_id: me.identity,
    kind: 'ask',
    source: String(messageId),
    question_text: prev?.content ? String(prev.content).slice(0, 4000) : null,
    answer_text: String(msg.content).slice(0, 20000),
    image_url: prev?.image_url ? String(prev.image_url) : null,
    title: saveTitleFrom(prev?.content ? String(prev.content) : null, String(msg.content)),
    topic: hit?.topic ?? null,
    skill: hit?.skill ?? null,
  };
  const { data: saved, error } = await svc.from('notebook_saves').insert(row).select(COLUMNS).single<SaveRow>();
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await svc.from('notebook_saves').select(COLUMNS)
        .eq('airtable_student_id', me.identity).eq('kind', 'ask').eq('source', String(messageId)).maybeSingle();
      if (again) return NextResponse.json({ ok: true, save: again, already: true });
    }
    return NextResponse.json({ error: 'Could not save it' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, save: saved });
}

export async function PATCH(req: NextRequest) {
  const me = await who();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; title?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const title = cleanTitle(body.title);
  if (!id || !title) return NextResponse.json({ error: 'id and a title are required' }, { status: 400 });
  const svc = createServiceClient();
  const { data, error } = await svc.from('notebook_saves').update({ title }).eq('id', id).eq('airtable_student_id', me.identity).select(COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not rename it' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, save: data });
}

export async function DELETE(req: NextRequest) {
  const me = await who();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from('notebook_saves').delete().eq('id', id).eq('airtable_student_id', me.identity);
  if (error) return NextResponse.json({ error: 'Could not delete it' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
