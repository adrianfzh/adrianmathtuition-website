// Revert the cleans that made a figure WORSE.
//
// A white-point lift maps [BLACK_POINT, whitePoint] onto [0,255], which means
// it LIGHTENS everything above grey ~127 and only darkens what is below. That
// is right for a hazy page (the haze goes white) and right for ink dark enough
// to fall on the low side — but a fine graph-paper grid sits at 180-230, so the
// lift pushes it TOWARDS white. The grid on a graph is load-bearing: a student
// reads coordinates off it.
//
// So: measure each cleaned figure against the image it replaced, and step back
// any whose area tone FELL. Uses the same undo stack the ↩ button uses, so this
// is a repoint, not a restore — the old bucket object was never deleted.
//
//   npx tsx scripts/figure-maintenance/revert-lossy.ts          # report only
//   APPLY=1 npx tsx scripts/figure-maintenance/revert-lossy.ts  # revert
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const APPLY = process.env.APPLY === '1';
/** Area tone falling by more than this means the clean took something away. */
const LOSS = Number(process.env.LOSS ?? 0.05);
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const objOf = (v: string | null | undefined) => {
  if (!v) return null; const i = v.lastIndexOf('question_images/');
  return i < 0 ? null : v.slice(i + 16).split('?')[0];
};

async function areaTone(buf: Buffer) {
  const meta = await sharp(buf).metadata();
  const small = await sharp(buf).flatten({ background: '#fff' }).greyscale()
    .resize({ width: Math.max(8, Math.round((meta.width ?? 96) / 12)) })
    .raw().toBuffer({ resolveWithObject: true });
  let n = 0; for (const v of small.data) if (v <= 235) n++;
  return small.data.length ? n / small.data.length : 0;
}

(async () => {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 9000; from += 1000) {
    const { data } = await supa.from('questions')
      .select('id, image_url, figure_url, gen_meta, school, year, level, question_number')
      .is('deleted_at', null).eq('has_image', true).order('id').range(from, from + 999);
    if (!data?.length) break; rows.push(...(data as never[]));
  }
  const cleaned = rows.filter(r => {
    const gm = (r.gen_meta ?? {}) as Record<string, unknown>;
    return Array.isArray(gm.figure_cleaned) && (gm.figure_cleaned as string[]).length;
  });
  console.log(`${APPLY ? 'REVERTING' : 'DRY RUN'} over ${cleaned.length} cleaned figures (loss bar ${(LOSS*100).toFixed(0)}%)`);

  let kept = 0, reverted = 0, failed = 0;
  const worst: string[] = [];
  const work = async (r: Record<string, unknown>) => {
    const gm = r.gen_meta as Record<string, unknown>;
    const hist = (gm.figure_history as { undo?: { figure_url: string | null; image_url: string | null }[]; redo?: unknown[] }) ?? {};
    const undo = Array.isArray(hist.undo) ? hist.undo : [];
    if (!undo.length) { failed++; return; }
    const prev = undo[undo.length - 1];
    let cur: string | null = null;
    try { cur = objOf(JSON.parse(r.image_url as string)[0]); } catch { cur = objOf(r.figure_url as string); }
    let old: string | null = null;
    try { old = objOf(JSON.parse(prev.image_url ?? '')[0]); } catch { old = objOf(prev.figure_url); }
    if (!cur || !old) { failed++; return; }
    try {
      const [a, b] = await Promise.all([
        supa.storage.from('question_images').download(old),
        supa.storage.from('question_images').download(cur),
      ]);
      if (!a.data || !b.data) { failed++; return; }
      const before = await areaTone(Buffer.from(await a.data.arrayBuffer()));
      const after = await areaTone(Buffer.from(await b.data.arrayBuffer()));
      const delta = before ? (after - before) / before : 0;
      if (delta >= -LOSS) { kept++; return; }
      if (worst.length < 12) worst.push(`${(delta*100).toFixed(0)}%  ${r.school} ${r.year} ${r.level} Q${r.question_number}`);
      if (!APPLY) { reverted++; return; }
      const upd = await supa.from('questions').update({
        figure_url: prev.figure_url, image_url: prev.image_url,
        gen_meta: { ...gm, figure_history: { undo: undo.slice(0, -1), redo: [] }, figure_cleaned: [] },
      }).eq('id', r.id as string);
      if (upd.error) failed++; else reverted++;
    } catch { failed++; }
  };
  for (let i = 0; i < cleaned.length; i += 6) await Promise.all(cleaned.slice(i, i + 6).map(work));
  console.log(`\nkept (clean helped or held) ${kept}`);
  console.log(`${APPLY ? 'reverted' : 'would revert'} (clean lost ground) ${reverted}`);
  console.log(`unreadable ${failed}`);
  if (worst.length) console.log('\nsample of the reverted:\n  ' + worst.join('\n  '));
})();
