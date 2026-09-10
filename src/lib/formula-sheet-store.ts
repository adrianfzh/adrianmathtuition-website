// Server half of the formula sheet (lib/formula-sheet.ts is the pure half):
// one teaching-knowledge call per level key — the ONE accessor over
// `formula_ref` (CLAUDE.md §Teaching-knowledge layer; this surface is on its
// consumer list). Never throws; a level with no shelf gives no lines.
import { getSupabaseAdmin } from './supabase';
import { loadTeachingKnowledge, type KnowledgeFormula } from './teaching-knowledge';
import { formulaAreasFor, type TopicSeen } from './formula-sheet';

/** How many lines a level may contribute — formula_ref is small; this is a ceiling, not a page size. */
const FORMULAE_PER_LEVEL = 80;

export async function loadFormulaeByLevel(levelKeys: readonly string[], topics: readonly TopicSeen[]): Promise<Record<string, KnowledgeFormula[]>> {
  const out: Record<string, KnowledgeFormula[]> = {};
  if (!levelKeys.length || !topics.length) return out;
  // formula_ref files by area, so the RPC gets the areas the student's topics
  // draw from (plus the topic names themselves — the RPC's own LIKE match
  // catches 'Trigonometry' → 'Trig' either way).
  const areas = [...new Set(topics.flatMap(t => formulaAreasFor(t.topic)))];
  const names = topics.map(t => t.topic);
  const admin = getSupabaseAdmin();
  await Promise.all(levelKeys.map(async key => {
    const k = await loadTeachingKnowledge(admin, { level: key, topics: [...areas, ...names], methods: 0, pitfalls: 0, formulae: FORMULAE_PER_LEVEL });
    if (k.formulae.length) out[key] = k.formulae;
  }));
  return out;
}
