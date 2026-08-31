// Bulk white-point clean over the question bank's stem figures.
//
// Every figure goes through the SAME `cleanScan` the ✨ Clean button runs and
// writes the SAME gen_meta.figure_history entry, so anything this touches can
// be reverted one figure at a time from /admin/questions — or wholesale from
// the history, since the old bucket object is never deleted.
//
//   LIMIT=200 npx tsx scripts/figure-maintenance/bulk-clean.ts          # dry run
//   LIMIT=200 APPLY=1 npx tsx scripts/figure-maintenance/bulk-clean.ts  # write
//
// OFFSET pages through the bank so a run can be resumed. Figures already
// cleaned are skipped by their gen_meta.figure_cleaned entry, so re-running is
// safe and idempotent.
import { createClient } from '@supabase/supabase-js';
import { cleanScan } from '../../src/lib/figure-clean';
import { randomUUID } from 'crypto';

const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT ?? 200);
const OFFSET = Number(process.env.OFFSET ?? 0);
const CONC = Number(process.env.CONC ?? 6);
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

type Row = { id: string; image_url: string | null; figure_url: string | null; gen_meta: unknown;
             school: string | null; year: number | null; level: string | null; question_number: string | null };

const stemPath = (r: Row): string | null => {
  if (typeof r.figure_url === 'string' && r.figure_url.includes('question_images/')) {
    return r.figure_url.slice(r.figure_url.lastIndexOf('question_images/'));
  }
  try {
    const a = JSON.parse(r.image_url ?? '');
    if (Array.isArray(a) && typeof a[0] === 'string') return a[0];
  } catch { /* not JSON */ }
  return null;
};

let cleaned = 0, skipped = 0, failed = 0, inB = 0, outB = 0, protectedCount = 0;
const failures: string[] = [];

async function one(r: Row) {
  const path = stemPath(r);
  if (!path) { skipped++; return; }
  const objName = path.replace(/^question_images\//, '');
  const gm = (r.gen_meta && typeof r.gen_meta === 'object' ? r.gen_meta : {}) as Record<string, unknown>;
  // Ruled out by hand: a figure whose pale fill the page finder cannot tell
  // from haze (see the note in @/lib/figure-clean).
  if (gm.figure_no_clean === true) { skipped++; return; }
  const already = Array.isArray(gm.figure_cleaned) ? (gm.figure_cleaned as string[]) : [];
  if (already.includes(objName)) { skipped++; return; }        // idempotent
  try {
    const dl = await supa.storage.from('question_images').download(objName);
    if (dl.error || !dl.data) { failed++; failures.push(`${r.id} download`); return; }
    const src = Buffer.from(await dl.data.arrayBuffer());
    const res = await cleanScan(src);
    if (!res.ok) { skipped++; if (res.reason === 'area-tone') protectedCount++; return; }
    inB += src.length; outB += res.out.length; cleaned++;
    if (!APPLY) return;

    const name = `${randomUUID()}.png`;
    const up = await supa.storage.from('question_images').upload(name, res.out, { contentType: 'image/png' });
    if (up.error) { failed++; failures.push(`${r.id} upload: ${up.error.message}`); cleaned--; return; }

    // Re-read immediately before writing: the row may have moved since the page
    // was fetched, and a stale snapshot would put the WRONG image in the undo
    // stack — the one thing that must never be wrong here.
    const { data: cur } = await supa.from('questions')
      .select('figure_url, image_url, gen_meta').eq('id', r.id).single();
    if (!cur) { failed++; failures.push(`${r.id} vanished`); cleaned--; return; }
    const curPath = stemPath({ ...r, ...cur } as Row);
    if (curPath !== path) { skipped++; cleaned--; return; }     // changed under us — leave it

    const g = (cur.gen_meta && typeof cur.gen_meta === 'object' ? cur.gen_meta : {}) as Record<string, unknown>;
    const h = (g.figure_history ?? {}) as { undo?: unknown[]; redo?: unknown[] };
    const patch: Record<string, unknown> = {};
    if (typeof cur.figure_url === 'string' && cur.figure_url.includes(objName)) patch.figure_url =
      `${process.env.SUPABASE_URL}/storage/v1/object/public/question_images/${name}`;
    else patch.image_url = JSON.stringify([`question_images/${name}`]);
    const upd = await supa.from('questions').update({
      ...patch,
      gen_meta: {
        ...g,
        figure_history: {
          undo: [...(Array.isArray(h.undo) ? h.undo : []), { figure_url: cur.figure_url ?? null, image_url: cur.image_url ?? null }].slice(-10),
          redo: [],
        },
        figure_cleaned: [...(Array.isArray(g.figure_cleaned) ? g.figure_cleaned as string[] : []), name].slice(-40),
      },
    }).eq('id', r.id);
    if (upd.error) { failed++; failures.push(`${r.id} update: ${upd.error.message}`); cleaned--; }
  } catch (e) { failed++; failures.push(`${r.id} ${(e as Error).message}`); }
}

(async () => {
  const { data } = await supa.from('questions')
    .select('id, image_url, figure_url, gen_meta, school, year, level, question_number')
    .is('deleted_at', null).eq('has_image', true).order('id').range(OFFSET, OFFSET + LIMIT - 1);
  const rows = (data ?? []) as Row[];
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} over rows ${OFFSET}..${OFFSET + rows.length - 1}  (concurrency ${CONC})`);
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += CONC) await Promise.all(rows.slice(i, i + CONC).map(one));
  const secs = (Date.now() - t0) / 1000;
  console.log(`\ncleaned ${cleaned}   left alone ${skipped} (of which ${protectedCount} protected: grey fill or photo)   failed ${failed}   in ${secs.toFixed(0)}s`);
  if (inB) console.log(`bytes ${(inB/1024/1024).toFixed(1)}MB -> ${(outB/1024/1024).toFixed(1)}MB (${((outB/inB-1)*100).toFixed(0)}%)`);
  if (failures.length) console.log('failures:\n  ' + failures.slice(0, 10).join('\n  '));
  console.log(`next: OFFSET=${OFFSET + rows.length}`);
})();
