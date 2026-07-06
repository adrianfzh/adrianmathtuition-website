import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-render-secret');
  if (secret !== process.env.RENDER_MARKING_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      chatId, questionText, botAnswer, content,
      topic, level, identifiedSubgroupId, identifiedSubgroupName,
    } = body;
    if (!chatId || !content) {
      return new Response(JSON.stringify({ error: 'chatId and content required' }), { status: 400 });
    }
    const supa = createClient(
      process.env.SUPABASE_URL!,
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    );
    const { data, error } = await supa
      .from('explanations')
      .insert({
        chat_id: String(chatId),
        question_text: questionText ?? null,
        bot_answer: botAnswer ?? null,
        content,
        topic: topic ?? null,
        level: level ?? null,
        identified_subgroup_id: identifiedSubgroupId ?? null,
        identified_subgroup_name: identifiedSubgroupName ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return new Response(JSON.stringify({ id: data.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Insert failed' }),
      { status: 500 },
    );
  }
}
