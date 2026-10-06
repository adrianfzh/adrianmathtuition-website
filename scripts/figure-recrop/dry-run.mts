// Dry run of the science figure re-crop (docs/HANDOFF-SCIENCE-RECROP.md, 7 Oct 2026).
// Reads only: fetches each flagged figure, asks the judge for the boxes that hold the
// drawing(s), cuts, takes a second look, runs the five-point fitness check on the new
// picture — and writes NOTHING to either database or to the bucket. Everything lands in
// an output folder with an index.html for Adrian to look at.
//
//   npx tsx scripts/figure-recrop/dry-run.mts <paths.json> <outDir> [concurrency]
//
// paths.json = ["chem_…png", …] (science `figure_flags.path` values).
//
// STAGE mode (7 Oct 2026, Adrian: "yes run the rest … can i see the diagrams first before
// release?"): `RECROP_STAGE=<batch name>` and `ALL` in place of paths.json. It takes every
// held `foreign · cosmetic` science flag whose note says the crop holds the question, that
// is not yet in `figure_recrops`, and for each one stores the new picture in the bucket
// BESIDE the original (`<name>__rc1.png`) and writes one `figure_recrops` row. It still
// changes no question, no flag and no existing object — release is a separate step, his
// (the ✂️ Re-crops lane on /admin/figures-bank). Resumable: a figure with a row is skipped.
//   RECROP_STAGE=recrop-2026-10-07 npx tsx scripts/figure-recrop/dry-run.mts ALL <outDir> 3
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { judgeView } from '../../src/lib/figure-blemish';
import {
  recropPrompt, parseRecropVerdict, toPx, snapOutward, pad, planCrop, keptShare,
  recropVerifyPrompt, parseRecropCheck, outcomeOf, type PxBox, type CropPlan,
} from '../../src/lib/figure-recrop';

config({ path: path.resolve(process.cwd(), '.env.local') });
const env = (k: string) => (process.env[k] || '').trim();
const MODEL = env('FIGURE_JUDGE_MODEL') || 'claude-opus-5-5';
const [, , listFile, outDir, conc = '3'] = process.argv;
const STAGE = env('RECROP_STAGE');
const LIMIT = Number(env('RECROP_LIMIT')) || 0;
if (!listFile || !outDir) { console.error('usage: dry-run.mts <paths.json> <outDir> [concurrency]'); process.exit(2); }

const sci = createClient(env('SUPABASE_URL_SCIENCE'), env('SUPABASE_SERVICE_KEY_SCIENCE'));
const maths = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'));
const ai = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
let spentIn = 0, spentOut = 0;

async function ask(prompt: string, images: Buffer[]): Promise<string> {
  const content: Anthropic.MessageParam['content'] = [
    ...images.map((b) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: b.toString('base64') } })),
    { type: 'text' as const, text: prompt },
  ];
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await ai.messages.create({ model: MODEL, max_tokens: 2500, messages: [{ role: 'user', content }] });
      spentIn += r.usage.input_tokens; spentOut += r.usage.output_tokens;
      return r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
    }
  }
}

const imgUrl = (p: string) => `${env('SUPABASE_URL_SCIENCE').replace(/\/+$/, '')}/storage/v1/object/public/question_images/${encodeURIComponent(p.replace(/^question_images\//, ''))}`;
/** The picture small enough to send: at most 1568 px on the long side, PNG. */
const forModel = (b: Buffer) => sharp(b).flatten({ background: '#fff' }).resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).png().toBuffer();

async function cut(src: Buffer, plan: CropPlan): Promise<Buffer> {
  const parts = await Promise.all(plan.regions.map((r) => sharp(src).flatten({ background: '#fff' })
    .extract({ left: r.x0, top: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 }).png().toBuffer()));
  if (parts.length === 1) return parts[0];
  const metas = await Promise.all(parts.map((p) => sharp(p).metadata()));
  const gap = 18, W = Math.max(...metas.map((m) => m.width!)), H = metas.reduce((a, m) => a + m.height!, 0) + gap * (parts.length - 1);
  let y = 0;
  const layers = parts.map((p, i) => { const l = { input: p, left: 0, top: y }; y += metas[i].height! + gap; return l; });
  return sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } }).composite(layers).png().toBuffer();
}

async function boxed(src: Buffer, w: number, h: number, keep: PxBox[], drop: PxBox[]): Promise<Buffer> {
  const sw = Math.max(3, Math.round(Math.min(w, h) / 220));
  const rect = (b: PxBox, c: string, fill: string) => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="${fill}" stroke="${c}" stroke-width="${sw}"/>`;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${drop.map((b) => rect(b, '#dc2626', 'rgba(220,38,38,0.10)')).join('')}${keep.map((b) => rect(b, '#16a34a', 'none')).join('')}</svg>`;
  return sharp(src).flatten({ background: '#fff' }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
}

const FITNESS_WORDS = ['ok', 'unsure', 'incomplete', 'illegible', 'foreign', 'wrong-kind', 'watermark', 'mismatch', 'missing-object', 'wrong-figure', 'answer-leak'];
function fitnessPrompt(law: string, stem: string, answer: string): string {
  return [
    'You are the figure-fitness judge for a question bank. The rules are below, verbatim from the bank\'s law.',
    'Judge the ONE image you are shown against the typed question it belongs to. You do not have the source page,',
    'so judge what can be judged from the image and the question: (a) it belongs to this question, (b) it is whole',
    'and carries nothing foreign, (c) it does not hand over the answer, (d) it is legible, (e) it carries no watermark.',
    'Note: this picture was deliberately cut to the drawing only — the question number and sentences are typed',
    'beside it in the app, so their ABSENCE is correct and is not "incomplete".',
    '', '--- LAW ---', law.slice(0, 9000), '--- END LAW ---', '',
    'The typed question:', stem.slice(0, 1200), answer ? `The answer on file: ${answer.slice(0, 200)}` : '', '',
    `Answer with JSON only: {"verdict":"<one of ${FITNESS_WORDS.join(' | ')}>","severity":"<blocks-answering | cosmetic | none>","reason":"<one sentence>"}`,
  ].join('\n');
}

type Row = { path: string; question_id: string; note: string | null };
async function one(f: Row, law: string) {
  const slug = f.path.replace(/\.png$/i, '');
  const dir = path.join(outDir, slug); fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, unknown> = { path: f.path, qid: f.question_id, note: f.note };
  try {
    const { data: q } = await sci.from('questions').select('subject, school, year, paper, question_number, question_text, answer, image_url').eq('id', f.question_id).maybeSingle();
    const stem = String(q?.question_text ?? '');
    out.source = [q?.school, q?.year, q?.paper ? `P${q.paper}` : '', q?.question_number ? `Q${q.question_number}` : ''].filter(Boolean).join(' · ');
    out.subject = q?.subject; out.stem = stem.slice(0, 400);
    const res = await fetch(imgUrl(f.path)); if (!res.ok) throw new Error(`fetch ${res.status}`);
    const src = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: '#fff' }).png().toBuffer();
    const meta = await sharp(src).metadata(); const w = meta.width!, h = meta.height!;
    out.size = [w, h];
    fs.writeFileSync(path.join(dir, 'orig.png'), src);
    const grid = await forModel(await judgeView(src));
    const grey = await sharp(src).greyscale().raw().toBuffer();
    let verdict = parseRecropVerdict(await ask(recropPrompt(stem, f.note), [grid]));
    // an answer that is not JSON is a transient miss, not a refusal: ask once more
    if (verdict.refuse && /no JSON|did not parse/.test(verdict.refuse)) verdict = parseRecropVerdict(await ask(recropPrompt(stem, f.note), [grid]));
    let check = null, share: number | null = null, plan: CropPlan | null = null, sliced = false, crop: Buffer | null = null;
    // One correction: a first cut that lost a label (or kept a sentence) goes back to the judge
    // with what the second look found, and is cut and checked once more. Never a third time.
    for (let attempt = 0; attempt < 2; attempt++) {
      sliced = false;
      const keepPx = verdict.keep.map((k) => { const s = snapOutward(grey, w, h, toPx(k.box, w, h)); sliced ||= s.sliced; return pad(s.box, w, h); });
      const dropPx = verdict.drop.map((d) => toPx(d, w, h));
      fs.writeFileSync(path.join(dir, 'boxed.png'), await boxed(src, w, h, keepPx, dropPx));
      plan = verdict.schoolMark || verdict.refuse ? null : planCrop(keepPx, dropPx);
      if (!plan) break;
      share = keptShare(plan, w, h);
      crop = await cut(src, plan);
      fs.writeFileSync(path.join(dir, 'new.png'), crop);
      check = parseRecropCheck(await ask(recropVerifyPrompt(stem), [await forModel(src), await forModel(crop)]));
      if (check.ok || attempt === 1) break;
      out.firstTry = check.note;
      const again = parseRecropVerdict(await ask(`${recropPrompt(stem, f.note)}\n\nA FIRST CUT was made from these boxes and checked against the original:\n${JSON.stringify({ keep: verdict.keep.map((k) => ({ what: k.what, box: [k.box.x0, k.box.y0, k.box.x1, k.box.y1] })) })}\nThe check found — ${check.note}.\nGive corrected boxes: widen a box until every label, axis title, arrow and caption named as lost is inside it with a clear margin, and pull an edge in (or add a drop box) to leave out anything named as still in.`, [grid]));
      if (again.refuse || again.schoolMark || !again.keep.length) break;
      verdict = again;
    }
    out.judge = verdict; out.plan = plan?.mode ?? null; out.sliced = sliced;
    if (plan && crop && check) {
      out.keptShare = Math.round((share ?? 0) * 100) / 100;
      out.check = check;
      const o = outcomeOf(verdict, check, share);
      if (o.outcome === 'recrop') {
        const m = (await ask(fitnessPrompt(law, stem, String(q?.answer ?? '')), [await forModel(crop)])).match(/\{[\s\S]*\}/);
        try { out.fitness = m ? JSON.parse(m[0]) : { verdict: 'unsure', reason: 'no JSON' }; } catch { out.fitness = { verdict: 'unsure', reason: 'JSON did not parse' }; }
      }
    }
    const o = outcomeOf(verdict, check, share);
    out.outcome = o.outcome; out.why = o.why;
    const fit = out.fitness as { verdict?: string } | undefined;
    out.final = o.outcome !== 'recrop' ? o.outcome : fit?.verdict === 'ok' ? 'would-release' : `held-by-fitness (${fit?.verdict ?? '?'})`;
  } catch (e) {
    out.outcome = 'error'; out.final = 'error'; out.why = (e as Error).message;
  }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
  if (STAGE) {
    let newPath: string | null = null;
    const made = path.join(dir, 'new.png');
    if (out.outcome === 'recrop' && fs.existsSync(made)) {
      newPath = `${slug}__rc1.png`;
      const up = await sci.storage.from('question_images').upload(newPath, fs.readFileSync(made), { contentType: 'image/png', upsert: true });
      if (up.error) { out.outcome = 'error'; out.final = 'error'; out.why = `upload: ${up.error.message}`; newPath = null; }
    }
    const judge = out.judge as { furniture?: string[] } | undefined;
    const ins = await sci.from('figure_recrops').upsert({
      path: f.path, question_id: f.question_id, new_path: newPath, outcome: String(out.outcome), final: String(out.final),
      why: String(out.why ?? '').slice(0, 1500), fitness: out.fitness ?? null, plan: (out.plan as string) ?? null,
      kept_share: (out.keptShare as number) ?? null, furniture: judge?.furniture ?? null, batch: STAGE,
    });
    if (ins.error) console.error('stage row failed', f.path, ins.error.message);
  }
  console.log(String(out.final).padEnd(34), f.path);
  return out;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
function html(results: Record<string, unknown>[]): string {
  const colour = (f: string) => (f === 'would-release' ? '#15803d' : f.startsWith('refused-school') ? '#7c3aed' : f.startsWith('refused') ? '#6b7280' : '#b45309');
  const cards = results.map((r, i) => {
    const slug = String(r.path).replace(/\.png$/i, ''); const hasNew = fs.existsSync(path.join(outDir, slug, 'new.png'));
    const fit = r.fitness as { verdict?: string; reason?: string } | undefined; const judge = r.judge as { schoolMark?: string | null; furniture?: string[] } | undefined;
    return `<div class="card"><div class="h"><b>${i + 1}. ${esc(r.source)}</b> <span class="tag" style="background:${colour(String(r.final))}">${esc(r.final)}</span></div>
<div class="row"><div><div class="cap">Before (green = kept, red = dropped)</div><img src="${slug}/boxed.png"></div>
<div><div class="cap">After</div>${hasNew ? `<img src="${slug}/new.png">` : '<div class="none">no new picture</div>'}</div></div>
<div class="why">${esc(r.why)}${fit ? ` · fitness: <b>${esc(fit.verdict)}</b> — ${esc(fit.reason)}` : ''}${judge?.furniture?.length ? ` · page furniture cut away: ${esc(judge.furniture.join('; '))}` : ''}</div></div>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Science re-crop dry run</title><style>
body{font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;margin:16px;background:#f3f4f6;color:#111827}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:0 0 14px;break-inside:avoid}
.h{margin-bottom:8px}.tag{color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;margin-left:6px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.row img{max-width:100%;max-height:420px;border:1px solid #e5e7eb}
.cap{font-size:12px;color:#6b7280;margin-bottom:4px}.none{color:#9ca3af;border:1px dashed #d1d5db;padding:40px;text-align:center}
.why{font-size:12.5px;color:#374151;margin-top:8px}</style>${cards}`;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let paths: string[]; let flags: Row[] | null;
  if (listFile === 'ALL') {
    if (!STAGE) throw new Error('ALL needs RECROP_STAGE=<batch>');
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sci.from('figure_flags').select('path, question_id, note').eq('kind', 'question').eq('status', 'held').order('path').range(from, from + 999);
      if (error) throw new Error(error.message);
      all.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    const done = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sci.from('figure_recrops').select('path').order('path').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) done.add(r.path as string);
      if (!data || data.length < 1000) break;
    }
    // the crop holds the question: cosmetic · foreign, not yet decided by Adrian, and the note says what is inside the frame
    flags = all.filter((f) => { const n = String(f.note ?? ''); return !n.startsWith('Adrian:') && /· cosmetic · foreign ·/i.test(n) && /(question number|prose|stem|options|whole question)/i.test(n) && !done.has(f.path); });
    if (LIMIT) flags = flags.slice(0, LIMIT);
    paths = flags.map((f) => f.path);
    console.log(`stage ${STAGE}: ${paths.length} to do, ${done.size} already staged`);
  } else {
    paths = JSON.parse(fs.readFileSync(listFile, 'utf8'));
    const got = await sci.from('figure_flags').select('path, question_id, note').in('path', paths).eq('kind', 'question');
    if (got.error) throw new Error(got.error.message);
    flags = got.data as Row[];
  }
  const { data: lawRow } = await maths.from('extraction_worker_prompt').select('prompt_text').eq('id', 'exam-extraction').maybeSingle();
  const full = String(lawRow?.prompt_text ?? ''); const i = full.indexOf('\n## Figure fitness');
  if (i < 0) throw new Error('law row has no "## Figure fitness" section');
  const rest = full.slice(i + 1); const j = rest.indexOf('\n## ', 5); const law = j > 0 ? rest.slice(0, j) : rest;
  const rows = paths.map((p) => (flags ?? []).find((f) => f.path === p)).filter((f): f is Row => !!f);
  const results: Record<string, unknown>[] = new Array(rows.length);
  let k = 0;
  await Promise.all(Array.from({ length: Number(conc) || 3 }, async () => { while (k < rows.length) { const idx = k++; results[idx] = await one(rows[idx], law); } }));
  // the sheet covers every figure in the folder, so a second run over a few of them refreshes the whole
  const everything = fs.readdirSync(outDir).map((d) => path.join(outDir, d, 'result.json')).filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>).sort((a, b) => String(a.path).localeCompare(String(b.path)));
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(everything, null, 2));
  fs.writeFileSync(path.join(outDir, 'index.html'), html(everything));
  const tally: Record<string, number> = {}; for (const r of results) tally[String(r.final).replace(/ \(.*/, '')] = (tally[String(r.final).replace(/ \(.*/, '')] ?? 0) + 1;
  console.log('\n', JSON.stringify(tally), `· tokens in ${spentIn} out ${spentOut} · model ${MODEL}`);
})();
