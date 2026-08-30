#!/usr/bin/env node
// scripts/fix-image-placement.mjs — put each bank figure on the part it illustrates.
//
// The extractor was never told that parts can carry figures, so every crop went
// into the question-level `image_url` array in page order. For a single-figure
// question that is right. For 776 questions it is not: GCE 2022 EM P2 Q5 prints
// (b)'s three cones above part (a), and Q7 prints (c)'s shaded pyramid at the
// top. Every renderer already honours part-level slots — only the data is flat.
//
// This reads each figure and asks which part it belongs to, then writes
//   parts[i].image_url        (prints immediately BEFORE that part's text)
//   parts[i].image_url_after  (prints immediately AFTER it)
// leaving on the stem only the figures that genuinely illustrate the stem.
//
//   node scripts/fix-image-placement.mjs                      # dry run, 10 questions
//   node scripts/fix-image-placement.mjs --paper "GCE 2022 EM 2" --apply
//   node scripts/fix-image-placement.mjs --empty-stem --limit 350 --apply
//   node scripts/fix-image-placement.mjs --revert <batch>
//
// Every applied change is logged to question_image_placement_log with the exact
// before-state, so --revert puts the whole batch back with one statement.
//
// SAFETY: a figure is only moved when the model is confident AND the target part
// exists. Anything unsure is left exactly as it is and printed as "skipped" —
// a diagram in the wrong place is a nuisance, a diagram silently attached to the
// wrong part is a lie about which question it belongs to.
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
const MODEL = process.env.PLACEMENT_MODEL || 'claude-sonnet-5';
const BUCKET = `${env.SUPABASE_URL}/storage/v1/object/public/question_images/`;

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};
const APPLY = argv.includes('--apply');
const LIMIT = Number(flag('limit', 10)) || 10;
const PAPER = flag('paper');                 // "GCE 2022 EM 2"
const EMPTY_STEM_ONLY = argv.includes('--empty-stem');
const REVERT = flag('revert');
const BATCH = flag('batch', `place-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`);

// ── revert ──────────────────────────────────────────────────────────────────
if (REVERT) {
  const { data: rows, error } = await sb.from('question_image_placement_log')
    .select('question_id, before_image_url, before_parts').eq('batch', REVERT);
  if (error) { console.error(error.message); process.exit(1); }
  if (!rows.length) { console.log(`no rows logged for batch "${REVERT}"`); process.exit(0); }
  for (const r of rows) {
    await sb.from('questions')
      .update({ image_url: r.before_image_url, parts: r.before_parts })
      .eq('id', r.question_id);
  }
  await sb.from('question_image_placement_log').delete().eq('batch', REVERT);
  console.log(`reverted ${rows.length} question(s) from batch ${REVERT}`);
  process.exit(0);
}

// ── select the work ─────────────────────────────────────────────────────────
const stemImages = (raw) => {
  const s = (raw || '').trim();
  if (!s || s === '[]') return [];
  try {
    const parsed = s.startsWith('[') ? JSON.parse(s) : s;
    return (Array.isArray(parsed) ? parsed : [parsed])
      .map(e => (typeof e === 'string' ? { url: e, pos: 'after' } : e))
      .filter(e => e && typeof e.url === 'string');
  } catch { return []; }
};

// "2+ images" cannot be expressed as a filter on a TEXT column holding JSON, so
// the multi-image test happens here — which means paging until we have enough
// targets rather than scanning one window. Without this the script silently
// looked at the first 48 rows and reported "2 questions" out of 776.
const wanted = (r) => {
  const imgs = stemImages(r.image_url);
  if (imgs.length < 2) return false;
  const parts = Array.isArray(r.parts) ? r.parts : [];
  if (!parts.length) return false;
  if (parts.some(p => p?.image_url || p?.image_url_after)) return false;   // already placed
  if (EMPTY_STEM_ONLY && (r.question_text || '').trim()) return false;
  return true;
};
const targets = [];
const PAGE = 1000;
for (let from = 0; targets.length < LIMIT; from += PAGE) {
  let q = sb.from('questions')
    .select('id, school, level, year, paper, question_number, question_text, parts, image_url')
    .is('deleted_at', null)
    .like('image_url', '[%')
    .order('id')
    .range(from, from + PAGE - 1);
  if (PAPER) {
    const [school, year, level, paper] = String(PAPER).split(/\s+/);
    q = q.eq('school', school).eq('year', Number(year)).eq('level', level).eq('paper', paper);
  }
  const { data: page, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }
  if (!page?.length) break;
  for (const r of page) if (wanted(r) && targets.length < LIMIT) targets.push(r);
  if (page.length < PAGE) break;
}

console.log(`${targets.length} question(s) to look at · model ${MODEL} · ${APPLY ? `APPLYING (batch ${BATCH})` : 'dry run'}\n`);

// ── ask which part each figure belongs to ───────────────────────────────────
const SYSTEM = `You are placing exam-paper figures onto the question part each one illustrates.

You get a question's stem text, its parts, and the cropped figures IN THE ORDER
they appear on the printed page. For each figure say where it belongs.

Decide from what the figure DEPICTS and what the text SAYS about it:
- part text naming the object ("A, B and C are similar cones", "a pyramid is cut
  from the cuboid as shown", "the diagram shows the cross-section") → that part
- the stem describing the object every part then asks about → stem
- a figure the student writes ON (an axis grid, a blank table, a Venn outline)
  belongs to the part that tells them to draw

Return ONLY JSON:
{"placements":[{"image":0,"target":"stem"|"part","part_index":0,
  "confidence":"high"|"low","why":"<12 words>"}]}

- part_index is 0-based into the parts array given to you; omit it for "stem".
- confidence "low" whenever you are guessing — a wrong part is worse than the
  status quo, and low-confidence placements are discarded, not applied.

You are NOT asked whether the figure prints above or below the part's text.
Exam papers state the situation and then show the diagram, so a part's figure
always prints after that part's text, and the script places it there. Two runs
of this once disagreed on that one detail for the same question; deciding it
here instead of per-question keeps 350 questions consistent.`;

async function fetchImage(url) {
  const r = await fetch(url.startsWith('http') ? url : BUCKET + url.replace(/^question_images\//, ''));
  if (!r.ok) throw new Error(`image ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get('content-type') || 'image/png';
  return { data: buf.toString('base64'), media_type: type.split(';')[0] };
}

function describe(row) {
  const parts = (Array.isArray(row.parts) ? row.parts : []).map((p, i) =>
    `  [${i}] (${p.label ?? ''}) ${String(p.text || '').replace(/\s+/g, ' ').slice(0, 300)}`);
  return `Question ${row.school} ${row.year} ${row.level} P${row.paper} Q${row.question_number}\n`
    + `STEM: ${(row.question_text || '(none)').replace(/\s+/g, ' ').slice(0, 500)}\n`
    + `PARTS:\n${parts.join('\n') || '  (none)'}`;
}

let moved = 0, skipped = 0, failed = 0;
for (const row of targets) {
  const imgs = stemImages(row.image_url);
  const parts = Array.isArray(row.parts) ? row.parts.map(p => ({ ...p })) : [];
  const label = `${row.school} ${row.year} ${row.level} P${row.paper} Q${row.question_number}`;
  try {
    const content = [{ type: 'text', text: describe(row) }];
    for (let i = 0; i < imgs.length; i++) {
      content.push({ type: 'text', text: `Figure ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', ...(await fetchImage(imgs[i].url)) } });
    }
    const res = await anthropic.messages.create({
      model: MODEL, max_tokens: 1000, system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    const text = res.content.find(c => c.type === 'text')?.text || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const placements = Array.isArray(json.placements) ? json.placements : [];

    // Apply only a COMPLETE, confident, in-range answer. A partial one would
    // leave a question half-moved, which is harder to reason about than either
    // end state.
    const usable = placements.length === imgs.length && placements.every(p =>
      p.confidence === 'high' &&
      (p.target === 'stem' || (p.target === 'part' && Number.isInteger(p.part_index) &&
                               p.part_index >= 0 && p.part_index < parts.length)));
    if (!usable) {
      skipped++;
      console.log(`⊘ ${label} — not confident enough (${placements.map(p => p.confidence).join(',') || 'no answer'})`);
      continue;
    }

    // TWO figures onto one part is real — Pierce 2021 EM_NA P2 Q12 has a
    // cumulative-frequency curve printed twice for part (a). A part holds at
    // most two (before the text and after it); a third would have to overwrite
    // one, so the whole question is left alone instead. Losing a figure is the
    // one outcome worse than a misplaced figure.
    const perPart = new Map();
    for (const p of placements) if (p.target === 'part') {
      perPart.set(p.part_index, (perPart.get(p.part_index) || 0) + 1);
    }
    if ([...perPart.values()].some(n => n > 2)) {
      skipped++;
      console.log(`⊘ ${label} — 3+ figures on one part, needs your eye`);
      continue;
    }

    const keepOnStem = [];
    const notes = [];
    const used = new Map();
    placements.forEach((p, i) => {
      const img = imgs[p.image ?? i];
      if (!img) return;
      if (p.target === 'stem') { keepOnStem.push(img); notes.push(`fig${i}→stem`); return; }
      const part = parts[p.part_index];
      const nth = (used.get(p.part_index) || 0);
      used.set(p.part_index, nth + 1);
      // One figure prints below the part's text — the printed convention, fixed
      // in the system prompt so a batch stays consistent. A second one has to go
      // above it, which is also how the paper reads when a diagram is repeated.
      if (nth === 0) part.image_url_after = img.url; else part.image_url = img.url;
      notes.push(`fig${i}→(${part.label ?? p.part_index})`);
    });

    // Nothing may vanish. Count the figures the question will render after the
    // rewrite and refuse the whole change if it is not what we started with.
    const after = keepOnStem.length
      + parts.reduce((n, p) => n + (p.image_url ? 1 : 0) + (p.image_url_after ? 1 : 0), 0);
    if (after !== imgs.length) {
      failed++;
      console.log(`✗ ${label} — would render ${after} of ${imgs.length} figures; refused`);
      continue;
    }
    if (!notes.some(n => n.includes('→('))) { skipped++; console.log(`⊘ ${label} — model kept everything on the stem`); continue; }

    const afterImageUrl = keepOnStem.length ? JSON.stringify(keepOnStem.map(r => (r.pos === 'before' ? r : r.url))) : '[]';
    console.log(`✓ ${label} — ${notes.join(', ')}`);
    placements.forEach((p, i) => console.log(`    fig${i}: ${p.why}`));

    if (APPLY) {
      await sb.from('question_image_placement_log').insert({
        question_id: row.id, batch: BATCH, model: MODEL,
        before_image_url: row.image_url, before_parts: row.parts,
        after_image_url: afterImageUrl, after_parts: parts, reasoning: json,
      });
      const { error: upErr } = await sb.from('questions')
        .update({ image_url: afterImageUrl, parts }).eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
    }
    moved++;
  } catch (e) {
    failed++;
    console.log(`✗ ${label} — ${e.message}`);
  }
}

console.log(`\n${moved} placed · ${skipped} left alone · ${failed} failed`);
if (APPLY && moved) console.log(`revert with:  node scripts/fix-image-placement.mjs --revert ${BATCH}`);
