// 🔀 Another way to solve this — the reads (SPEC-ANOTHER-WAY.md). Server only.
// One small query for a handful of question ids; only approved rows whose blind
// check passed come back (lib/alt-method.ts altView decides).
import { getSupabaseAdmin } from './supabase';
import { altView, type AltRow, type AltView } from './alt-method';

const COLS = 'question_id, main_method, alt_method, working, better, status, checks';

/**
 * question id → the student's view, for the ids that have an approved second method.
 * `preview` (Adrian's admin cookie, not viewing as a student): waiting rows that passed the check too.
 */
export async function altViewsFor(ids: string[], preview = false): Promise<Record<string, AltView>> {
  const want = [...new Set(ids.filter(Boolean))];
  if (!want.length) return {};
  const { data, error } = await getSupabaseAdmin().from('question_alt_methods')
    .select(COLS).in('question_id', want).in('status', preview ? ['approved', 'pending'] : ['approved']);
  if (error) return {};
  const out: Record<string, AltView> = {};
  for (const r of (data ?? []) as AltRow[]) {
    const v = altView(r, preview);
    if (v) out[r.question_id] = v;
  }
  return out;
}

export async function altViewFor(id: string, preview = false): Promise<AltView | null> {
  return (await altViewsFor([id], preview))[id] ?? null;
}
