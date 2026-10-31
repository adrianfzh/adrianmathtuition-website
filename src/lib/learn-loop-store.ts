// 🔁 The learning loop's reads (SPEC-LEARN-LOOP.md): the topic's question types and the
// student's own loop answers. Shared by the page (first paint) and /api/portal/loop.
import { getSupabaseAdmin } from './supabase';
import { qbLevelsFor, bankScope } from './qb-levels';
import { loopLevelFor, loopProgress, type LoopTopic, type LoopType, type TypeProgress } from './learn-loop';

type Account = { id: string; level?: string | null; subjects?: string[] | null };

/** The bank level this student practises the topic at, or null when it is not theirs. */
export function studentLoopLevel(topic: LoopTopic, account: Account): string | null {
  return loopLevelFor(topic, qbLevelsFor(account.level ?? null, account.subjects ?? null).map(l => l.key));
}

/** The topic's question types (sub-skills every student may see), in no particular order. */
export async function loopTypes(topic: LoopTopic, level: string): Promise<LoopType[]> {
  const { data, error } = await getSupabaseAdmin().from('subgroups')
    .select('id, name, order_index, visibility')
    .eq('level', bankScope(level).level).eq('topic', topic.topic);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter(r => !r.visibility || r.visibility === 'all')
    .map(r => ({ id: Number(r.id), name: String(r.name), order: r.order_index == null ? null : Number(r.order_index) }));
}

/** Where this student stands on the topic, from their own 'portal-loop' answers. */
export async function loopState(topic: LoopTopic, level: string, account: Account): Promise<TypeProgress[]> {
  const sb = getSupabaseAdmin();
  const [types, { data: attempts, error }] = await Promise.all([
    loopTypes(topic, level),
    sb.from('student_attempts').select('question_id, marking_verdict, marking_json')
      .eq('user_id', account.id).eq('attempted_via', 'portal-loop')
      .order('attempted_at', { ascending: true }).limit(1000),
  ]);
  if (error) throw new Error(error.message);
  return loopProgress(topic.key, types, attempts ?? []);
}
