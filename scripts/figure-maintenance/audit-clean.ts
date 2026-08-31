// Audit a bulk clean: for every figure that was cleaned, compare it against
// the image it replaced and rank by how much INK IT LOST.
//
// The failure mode a clean can have is exactly one thing — a grey region going
// white (a shaded area, a photograph, a halftone). Lines and text getting
// crisper is the clean working. So "ink share fell a lot" IS the defect, and it
// can be measured instead of eyeballed: 1,043 figures become a worklist of ten.
//
//   npx tsx scripts/figure-maintenance/audit-clean.ts            # rank all
//   TOP=30 npx tsx scripts/figure-maintenance/audit-clean.ts     # worst 30
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { writeFileSync } from 'fs';

const TOP = Number(process.env.TOP ?? 25);
const OUT = process.env.SCRATCH ?? '.';
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const objOf = (v: string | null | undefined) => {
  if (!v) return null; const i = v.lastIndexOf('question_images/');
  return i < 0 ? null : v.slice(i + 16).split('?')[0];
};

/** Ink share, and the same measured at 1/12 scale — a fill survives shrinking,
 *  a thin line does not, so a big drop in the SMALL number means area was lost. */
async function ink(buf: Buffer) {
  const meta = await sharp(buf).metadata();
  const big = await sharp(buf).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const small = await sharp(buf).flatten({ background: '#fff' }).greyscale()
    .resize({ width: Math.max(8, Math.round((meta.width ?? 96) / 12)) }).raw().toBuffer({ resolveWithObject: true });
  const share = (d: Uint8Array | Buffer, lo: number, hi: number) => {
    let n = 0; for (const v of d) if (v >= lo && v <= hi) n++; return d.length ? n / d.length : 0;
  };
  return { full: share(big.data, 0, 235), small: share(small.data, 0, 235) };
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
  console.log(`auditing ${cleaned.length} cleaned figures…`);

  type Hit = { label: string; id: string; dFull: number; dSmall: number; before: string; after: string };
  const hits: Hit[] = [];
  let done = 0, failed = 0;
  const work = async (r: Record<string, unknown>) => {
    const gm = r.gen_meta as Record<string, unknown>;
    const hist = (gm.figure_history as { undo?: { image_url?: string; figure_url?: string }[] })?.undo ?? [];
    const prev = hist[hist.length - 1];
    let cur: string | null = null;
    try { cur = objOf(JSON.parse(r.image_url as string)[0]); } catch { cur = objOf(r.figure_url as string); }
    let old: string | null = null;
    try { old = objOf(JSON.parse(prev?.image_url ?? '')[0]); } catch { old = objOf(prev?.figure_url); }
    if (!cur || !old) { failed++; return; }
    try {
      const [a, b] = await Promise.all([
        supa.storage.from('question_images').download(old),
        supa.storage.from('question_images').download(cur),
      ]);
      if (!a.data || !b.data) { failed++; return; }
      const before = await ink(Buffer.from(await a.data.arrayBuffer()));
      const after = await ink(Buffer.from(await b.data.arrayBuffer()));
      hits.push({
        label: `${r.school ?? '?'} ${r.year ?? ''} ${r.level ?? ''} Q${r.question_number ?? '?'}`,
        id: r.id as string,
        dFull: before.full ? (after.full - before.full) / before.full : 0,
        dSmall: before.small ? (after.small - before.small) / before.small : 0,
        before: old, after: cur,
      });
    } catch { failed++; }
    if (++done % 100 === 0) console.log(`  ${done}/${cleaned.length}`);
  };
  for (let i = 0; i < cleaned.length; i += 6) await Promise.all(cleaned.slice(i, i + 6).map(work));

  // Area lost is what matters, so rank on the SMALL-scale drop.
  hits.sort((x, y) => x.dSmall - y.dSmall);
  const bad = hits.filter(h => h.dSmall < -0.10);
  console.log(`\nmeasured ${hits.length}   unreadable ${failed}`);
  console.log(`lost >10% of their area tone: ${bad.length}`);
  console.log(`\nworst ${Math.min(TOP, hits.length)}:`);
  for (const h of hits.slice(0, TOP)) {
    console.log(`  ${(h.dSmall * 100).toFixed(0).padStart(5)}% area  ${(h.dFull * 100).toFixed(0).padStart(5)}% ink   ${h.label}`);
  }
  writeFileSync(`${OUT}/clean-audit.json`, JSON.stringify(hits.slice(0, 60), null, 1));
  console.log(`\nfull ranking for the worst 60 written to ${OUT}/clean-audit.json`);
})();
