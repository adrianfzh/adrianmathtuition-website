// Undo a bulk clean: pop gen_meta.figure_history.undo back onto the row.
// Exactly what the ↩ Undo button does, applied over a range of rows. The old
// bucket object was never deleted, so this restores the original pixels.
//   OFFSET=0 LIMIT=200 APPLY=1 npx tsx scripts/figure-maintenance/revert-clean.ts
import { createClient } from '@supabase/supabase-js';

const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT ?? 200);
const OFFSET = Number(process.env.OFFSET ?? 0);
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

(async () => {
  const { data } = await supa.from('questions')
    .select('id, image_url, figure_url, gen_meta, school, year, question_number')
    .is('deleted_at', null).eq('has_image', true).order('id').range(OFFSET, OFFSET + LIMIT - 1);
  let reverted = 0, none = 0, failed = 0;
  for (const r of (data ?? [])) {
    const gm = (r.gen_meta ?? {}) as Record<string, unknown>;
    const hist = (gm.figure_history ?? {}) as { undo?: { figure_url: string | null; image_url: string | null }[]; redo?: unknown[] };
    const undo = Array.isArray(hist.undo) ? hist.undo : [];
    if (!undo.length) { none++; continue; }
    // Only step back a CLEAN. A row whose last edit was a ♻️ Replace also has
    // undo history, and undoing that would throw away a figure someone chose
    // deliberately — not this script's business.
    const cleanedInto = Array.isArray(gm.figure_cleaned) ? (gm.figure_cleaned as string[]) : [];
    if (!cleanedInto.length) { none++; continue; }
    const target = undo[undo.length - 1];
    if (!APPLY) { reverted++; continue; }
    const upd = await supa.from('questions').update({
      figure_url: target.figure_url,
      image_url: target.image_url,
      gen_meta: {
        ...gm,
        figure_history: {
          undo: undo.slice(0, -1),
          redo: [...(Array.isArray(hist.redo) ? hist.redo : []), { figure_url: r.figure_url ?? null, image_url: r.image_url ?? null }].slice(-10),
        },
        // Drop the cleaned-marker for the object we are stepping off, so the
        // figure is eligible again once the guard is fixed.
        figure_cleaned: [],
      },
    }).eq('id', r.id);
    if (upd.error) { failed++; console.log('  fail', r.id, upd.error.message); } else reverted++;
  }
  console.log(`${APPLY ? 'REVERTED' : 'would revert'} ${reverted}   no history ${none}   failed ${failed}`);
})();
