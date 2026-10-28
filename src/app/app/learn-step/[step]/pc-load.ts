// Server side of a P&C learn step: each question's working (lib/pc-learn), its picture
// (the bot's pc_arrange figure, fail-soft), and the hint / watch-out lines from the
// teaching-knowledge layer (teaching_knowledge(), never the tables) with the step's
// own copy as the fallback.
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadTeachingKnowledge } from '@/lib/teaching-knowledge';
import { methodLines, workedOf, type PcWorked } from '@/lib/pc-learn';
import { pcPictures } from '@/lib/pc-picture';
import { pcAllQuestions, type PcQuestion, type PcStep } from '@/lib/pc-steps';

export interface PcQuestionData { q: PcQuestion; worked: PcWorked; picture: string | null }
export interface PcStepData {
  step: Omit<PcStep, 'example' | 'tryOne' | 'sets'>;
  example: PcQuestionData;
  tryOne: PcQuestionData;
  sets: PcQuestionData[][];
  hints: string[];
  watchOut: string | null;
}

const P_AND_C = ['Permutations and Combinations'];

async function knowledgeLines(step: PcStep): Promise<{ hints: string[]; watchOut: string | null }> {
  let method: string | null = null, pitfall: string | null = null;
  try {
    const admin = getSupabaseAdmin();
    const levels = [...new Set([step.method.level, step.pitfall?.level ?? step.method.level])];
    const ks = await Promise.all(levels.map(level => loadTeachingKnowledge(admin, { level, topics: P_AND_C, context: step.method.questionType, methods: 30, pitfalls: 30 })));
    for (const k of ks) {
      method ??= k.methods.find(m => m.question_type === step.method.questionType)?.method ?? null;
      const p = step.pitfall ? k.pitfalls.find(x => x.context === step.pitfall!.context) : null;
      if (p && !pitfall) pitfall = [p.why_wrong, p.corrective_cue].filter(Boolean).join(' ');
    }
  } catch { /* fail-soft: the step's own copy */ }
  return { hints: methodLines(method ?? step.method.fallback), watchOut: pitfall ?? step.pitfall?.fallback ?? null };
}

const memo = new Map<string, { at: number; data: PcStepData }>();

export async function loadPcStep(step: PcStep): Promise<PcStepData> {
  const had = memo.get(step.slug);
  if (had && Date.now() - had.at < 10 * 60_000) return had.data;
  const qs = pcAllQuestions(step);
  const worked = qs.map(q => {
    const w = workedOf(q);
    if (!w) throw new Error(`P&C step ${step.slug}: "${q.prompt}" has no checked working`);
    return w;
  });
  const [pictures, k] = await Promise.all([pcPictures(worked.map(w => w.picture)), knowledgeLines(step)]);
  const data: PcQuestionData[] = qs.map((q, i) => ({ q, worked: worked[i], picture: pictures[i] }));
  const { example: _e, tryOne: _t, sets: _s, ...rest } = step;
  let i = 2;
  const out: PcStepData = {
    step: rest, example: data[0], tryOne: data[1],
    sets: step.sets.map(s => s.map(() => data[i++])),
    hints: k.hints, watchOut: k.watchOut,
  };
  // Keep it only when every picture came back (a bot hiccup is retried on the next visit).
  if (pictures.every((p, j) => p || !worked[j].picture)) memo.set(step.slug, { at: Date.now(), data: out });
  return out;
}
