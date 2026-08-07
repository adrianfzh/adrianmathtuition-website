#!/usr/bin/env node
// Prep-verify for a /notes topic before Adrian reads it (notes-content-style-guide).
//
//   node scripts/notes-prep-check.mjs "Surds"            checks only
//   node scripts/notes-prep-check.mjs "Surds" --measure  + KaTeX overflow at card width
//
// Checks, per the style guide's "verification habits":
//   · every math string ($…$, $$…$$, step.math, working[]) parses in the site's KaTeX
//   · no \qquad-joined display math (cards must stack cases instead)
//   · no doubled backslashes (the E'' SQL-write hazard)
//   · jargon grep (smiley/frown/sad face/secant/∑) outside sanctioned asides
//   · every core has a question-form title_q
//   · --measure: reflex-card display math fits a 300px card (needs local Chrome)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(`${ROOT}/package.json`);
const katex = req('katex');
const { createClient } = req('@supabase/supabase-js');
const { parse } = req('dotenv');

const topic = process.argv[2];
if (!topic) {
  console.error('usage: node scripts/notes-prep-check.mjs "<Topic>" [--measure] [--subject AM]');
  process.exit(2);
}
const MEASURE = process.argv.includes('--measure');
const subject = process.argv.includes('--subject')
  ? process.argv[process.argv.indexOf('--subject') + 1]
  : 'AM';

const env = parse(readFileSync(`${ROOT}/.env.local`, 'utf8'));
const supa = createClient(
  (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
  (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
);

const { data: units, error: e1 } = await supa
  .from('learning_units')
  .select('*')
  .eq('subject', subject)
  .eq('topic', topic)
  .order('unit_order');
if (e1) throw e1;
const { data: cards, error: e2 } = await supa
  .from('content_snippets')
  .select('id, card_title, content')
  .eq('level', subject)
  .eq('topic', topic)
  .eq('content_kind', 'recall_card');
if (e2) throw e2;
if (units.length === 0) {
  console.error(`no learning_units for ${subject}/${topic}`);
  process.exit(2);
}

let failures = 0;
const fail = msg => {
  failures += 1;
  console.log(`✗ ${msg}`);
};

// ── Collect math ─────────────────────────────────────────────────────────────
const segs = [];
const fromMd = (md, src) => {
  if (typeof md !== 'string') return;
  const rest = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    segs.push({ src, tex, display: true });
    return ' ';
  });
  rest.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    segs.push({ src, tex, display: false });
    return ' ';
  });
};
const MD_FIELDS = [
  'summary_md', 'formula_md', 'remember_md', 'problem_md', 'answer_md',
  'note_md', 'why_md', 'fix_md', 'prompt_md',
];
for (const u of units) {
  const p = u.payload ?? {};
  const at = `unit ${u.unit_order} (${u.kind})`;
  for (const f of MD_FIELDS) fromMd(p[f], `${at} ${f}`);
  (p.steps ?? []).forEach((s, i) => {
    if (s.math) segs.push({ src: `${at} step${i + 1}.math`, tex: s.math, display: true });
    fromMd(s.label, `${at} step${i + 1}.label`);
    fromMd(s.annotation_md, `${at} step${i + 1}.cue`);
    fromMd(s.more_md, `${at} step${i + 1}.more`);
  });
  (p.working ?? []).forEach((w, i) => fromMd(w, `${at} working${i + 1}`));
  (p.options ?? []).forEach((o, i) => {
    fromMd(o.label_md, `${at} opt${i + 1}`);
    fromMd(o.feedback_md, `${at} opt${i + 1}.why`);
  });
}
for (const c of cards) fromMd(c.content, `card "${c.card_title}"`);

// ── KaTeX parse ──────────────────────────────────────────────────────────────
const rendered = [];
for (const s of segs) {
  try {
    rendered.push({
      ...s,
      html: katex.renderToString(s.tex, { displayMode: s.display, throwOnError: true, strict: 'ignore' }),
    });
  } catch (err) {
    fail(`KaTeX at ${s.src}: ${err.message.split('\n')[0]}\n    ${s.tex.slice(0, 100)}`);
  }
}

// ── Structure + text checks ──────────────────────────────────────────────────
const walk = (v, path, visit) => {
  if (typeof v === 'string') visit(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, visit));
  else if (v && typeof v === 'object')
    Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`, visit));
};
const everyString = visit => {
  units.forEach(u => walk(u.payload, `unit ${u.unit_order}`, visit));
  cards.forEach(c => visit(c.content ?? '', `card "${c.card_title}"`));
};

everyString((s, at) => {
  if (/\\qquad/.test(s)) fail(`\\qquad at ${at} — stack cases with gathered/aligned instead`);
  // E''-style doubling doubles every backslash, so a macro preceded by an EVEN
  // run of backslashes is broken; an odd run is a row-break (\\) plus a macro.
  for (const m of s.matchAll(/(\\+)(sqrt|frac|tfrac|begin|end|times|text|qquad)/g)) {
    if (m[1].length % 2 === 0) {
      fail(`doubled backslash at ${at}`);
      break;
    }
  }
  const open = (s.match(/\\begin\{(aligned|gathered)\}/g) ?? []).length;
  const close = (s.match(/\\end\{(aligned|gathered)\}/g) ?? []).length;
  if (open !== close) fail(`unbalanced aligned/gathered at ${at}`);
  // Informal parabola wording is allowed exactly once per topic, as a memory
  // aid carrying its own caveat — the words "memory aid" in the same string
  // are the sanction marker; anything else is a failure.
  if (/smiley|frown|sad face|smile/i.test(s) && !/memory aid/i.test(s))
    fail(`informal parabola wording at ${at} (sanctioned memory-aid asides only)`);
  if (/\\sum/.test(s) && subject !== 'H2') fail(`∑ notation at ${at} — sec students haven't met it`);
});

for (const u of units.filter(u => u.kind === 'core')) {
  const q = u.payload?.title_q;
  if (typeof q !== 'string' || !q.trim())
    fail(`core ${u.unit_order} "${u.title}" has no title_q (question-form heading)`);
  else if (/\$/.test(q))
    fail(`core ${u.unit_order} title_q contains $…$ — headings do NOT render KaTeX`);
}

console.log(
  `${subject}/${topic}: ${units.length} units (${units.filter(u => u.kind !== 'check').length} on /notes), ` +
  `${cards.length} reflex cards, ${segs.length} math segments`,
);

// ── Optional: card-width overflow via local Chrome ───────────────────────────
if (MEASURE) {
  const displays = rendered.filter(r => r.display);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const tmp = `/tmp/notes-prep-check-${Date.now()}.html`;
  writeFileSync(
    tmp,
    `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${ROOT}/node_modules/katex/dist/katex.min.css">
<style>.card{width:300px;border:1px solid #ccc;padding:12px;margin:6px;display:inline-block;vertical-align:top}.card p{font-size:11px;color:#555;margin:0 0 6px}</style>
${displays.map(r => `<div class="card"><p>${esc(r.src)}</p>${r.html}</div>`).join('\n')}`,
  );
  const puppeteer = req('puppeteer-core');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
  const page = await browser.newPage();
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle0' });
  const over = await page.evaluate(() =>
    [...document.querySelectorAll('.card')]
      .map(c => ({
        src: c.querySelector('p').textContent,
        w: (c.querySelector('.katex-display > .katex') ?? c.querySelector('.katex'))?.scrollWidth ?? 0,
        max: c.clientWidth - 24,
      }))
      .filter(x => x.w > x.max),
  );
  await browser.close();
  // Cards must fit; unit-column math may scroll by design — report both, fail cards.
  for (const o of over) {
    if (o.src.startsWith('card')) fail(`card overflow: ${o.src} (${o.w}px)`);
    else console.log(`  note: ${o.src} is ${o.w}px — fine in the lesson column, scrolls on phones`);
  }
}

console.log(failures === 0 ? '✓ all prep checks passed' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
