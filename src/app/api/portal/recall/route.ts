// POST /api/portal/recall — the Socratic "recall companion".
//
// A student says "I forgot how to find the remainder" weeks after a lesson.
// This bot is grounded ONLY in Adrian's KB (kb_entries): its first reply nudges
// the student to attempt recall with ONE leading question; once they've had a go
// (right or wrong), it reveals the core explanation in Adrian's phrasing and
// points to the relevant learning units.
//
// Auth: portal student session (level/subject-scoped) OR admin Bearer/session
// (Adrian's testing — all subjects, no rate limit). Rate limit: 30 messages/day
// per student, counted on the recall_messages ledger table.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { studentTitle, learnSubjectsForLevel, ALL_LEARN_SUBJECTS } from '@/lib/learn';
import type { UnitKind } from '@/lib/learn-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-opus-4-8';
const MAX_TURNS = 10;
const MAX_CHARS = 500;
const DAILY_CAP = 30;
const KB_LIMIT = 8;
const KB_CHARS = 600;
const MAX_UNITS = 3;

type InMsg = { role: 'user' | 'assistant'; content: string };
type UnitLink = { id: string; title: string; kind: UnitKind };

// English stopwords + topic-label noise that must not drive a topic match on
// their own (e.g. "Trigonometry (Equations)" → tokens trigonometry, equations).
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'how', 'what', 'why', 'when', 'find',
  'i', 'a', 'to', 'of', 'do', 'my', 'is', 'it', 'this', 'that', 'you', 'me',
  'forgot', 'forget', 'remember', 'recall', 'help', 'about', 'can', 'again',
]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length > 2 && !STOP.has(w));
}

// Score a candidate topic name against the conversation text: full-name
// substring is a strong hit; otherwise count how many of the topic's own words
// appear (case-insensitive keyword overlap).
function scoreTopic(topic: string, convoText: string, convoTokens: Set<string>): number {
  const t = topic.toLowerCase();
  let score = 0;
  if (convoText.includes(t)) score += 10;
  const tw = tokens(topic);
  for (const w of tw) if (convoTokens.has(w)) score += 1;
  return score;
}

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });
  }

  // Sanitise: last MAX_TURNS turns, valid roles, clamp length, drop empties.
  const messages: InMsg[] = rawMessages
    .slice(-MAX_TURNS)
    .map((m: unknown) => {
      const mm = m as { role?: unknown; content?: unknown };
      const role = mm.role === 'assistant' ? 'assistant' : 'user';
      const content = String(mm.content ?? '').slice(0, MAX_CHARS).trim();
      return { role, content } as InMsg;
    })
    .filter((m: InMsg) => m.content.length > 0);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from the student' }, { status: 400 });
  }

  const isStudent = caller.kind === 'student';
  const subjects = isStudent ? learnSubjectsForLevel(caller.account.level) : [...ALL_LEARN_SUBJECTS];
  const supabase = getSupabaseAdmin();

  // Rate limit (students only — admin is Adrian testing).
  if (isStudent) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('recall_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.account.id)
      .gte('created_at', dayAgo);
    if ((count || 0) >= DAILY_CAP) {
      return NextResponse.json(
        { error: `Daily limit reached (${DAILY_CAP} messages). Back tomorrow!` },
        { status: 429 },
      );
    }
  }

  // (1) Candidate topics: DISTINCT approved learning_units topics for the
  // caller's subjects, augmented with kb_entries topics (learning_units is
  // sparse today — the KB is where the notes actually live). Match each against
  // the conversation text via substring + keyword overlap.
  const [luRes, kbTopicRes] = await Promise.all([
    supabase.from('learning_units').select('subject, topic').eq('status', 'approved').in('subject', subjects),
    supabase.from('kb_entries').select('subject, topic').eq('status', 'approved').in('subject', subjects),
  ]);

  const candidates = new Map<string, { subject: string; topic: string }>();
  for (const r of [...(luRes.data || []), ...(kbTopicRes.data || [])] as { subject: string; topic: string }[]) {
    if (r?.topic) candidates.set(`${r.subject}|${r.topic}`, { subject: r.subject, topic: r.topic });
  }

  const convoText = messages.map(m => m.content).join(' \n ').toLowerCase();
  const convoTokens = new Set(tokens(convoText));
  const matched = [...candidates.values()]
    .map(c => ({ ...c, score: scoreTopic(c.topic, convoText, convoTokens) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const topMatched = matched.slice(0, 3);
  const primary = matched[0] || null;

  // (2) Retrieve up to KB_LIMIT kb_entries for the matched topics, most
  // important first, and the primary topic's approved learning_units for links.
  let excerpts: { title: string; content: string }[] = [];
  let units: UnitLink[] = [];
  if (topMatched.length) {
    const topicNames = [...new Set(topMatched.map(t => t.topic))];
    const [kbRes, unitRes] = await Promise.all([
      supabase
        .from('kb_entries')
        .select('title, content, importance')
        .eq('status', 'approved')
        .neq('is_current', false)
        .in('subject', subjects)
        .in('topic', topicNames)
        .order('importance', { ascending: false })
        .limit(KB_LIMIT),
      primary
        ? supabase
            .from('learning_units')
            .select('id, kind, title, unit_order')
            .eq('status', 'approved')
            .eq('subject', primary.subject)
            .eq('topic', primary.topic)
            .order('unit_order')
        : Promise.resolve({ data: [] as { id: string; kind: string; title: string }[] }),
    ]);

    excerpts = (kbRes.data || []).map(r => ({
      title: String(r.title || '').slice(0, 120),
      content: String(r.content || '').slice(0, KB_CHARS),
    }));
    units = ((unitRes.data || []) as { id: string; kind: string; title: string }[])
      .slice(0, MAX_UNITS)
      .map(u => ({ id: u.id, kind: u.kind as UnitKind, title: studentTitle(u.kind, u.title) }));
  }

  // (3) Build the grounded, Socratic system prompt.
  const excerptBlock = excerpts.length
    ? excerpts.map((e, i) => `[Note ${i + 1}] ${e.title}\n${e.content}`).join('\n\n')
    : '(No matching class notes found for this question.)';
  const unitList = units.length
    ? units.map(u => `- ${u.title}`).join('\n')
    : '(none)';

  const system = `You are Adrian's recall tutor for his maths students. You help a student who is trying to remember something Adrian taught them.

Use ONLY the provided notes excerpts below. If they don't cover the student's question, say we haven't covered this in class notes yet and suggest asking Adrian directly — do NOT answer from outside knowledge.

Socratic method:
- If the student has NOT yet attempted to recall the idea in this conversation, reply with ONE short leading question that nudges them toward the answer. Do NOT reveal the answer, method, or formula yet.
- Once the student has attempted it (whether right or wrong), gently correct or confirm using Adrian's exact phrasing and methods from the excerpts. Keep the reveal under 120 words.

Formatting: write maths in KaTeX using $...$ for inline and $$...$$ for display. Be warm and brief.

--- ADRIAN'S CLASS NOTES (the ONLY source you may use) ---
${excerptBlock}
--- END NOTES ---

Relevant learning units the student can revisit (already shown to them as tappable links — do not paste URLs):
${unitList}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let reply = '';
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      thinking: { type: 'adaptive' },
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    reply = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')
      .trim();
  } catch {
    return NextResponse.json({ error: 'The tutor is unavailable right now — try again in a moment.' }, { status: 502 });
  }
  if (!reply) reply = "I'm not sure how to help with that — try rephrasing, or ask Adrian.";

  // Record one row per student POST for the daily cap.
  if (isStudent) {
    await supabase.from('recall_messages').insert({ user_id: caller.account.id });
  }

  return NextResponse.json({ reply, units });
}
