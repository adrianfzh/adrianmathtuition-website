#!/usr/bin/env node
// Derive data/paper-blueprints.json — the living blueprint for the prelim-paper
// generator — from real school prelim papers captured in the Supabase question bank.
//
// The question bank stores individual questions WITH enough metadata (school, year,
// level, paper, question_number, marks, topics) to reconstruct the original papers.
// This script reconstructs them, classifies COMPLETE vs PARTIAL, mines the structure
// (mark-by-position curve, topic slots, co-occurrence rules, closers, outlier school
// styles, syllabus drift), and emits a machine-usable blueprint with preset overlays.
// Every number in the blueprint is recomputed from data on each run — nothing is
// hand-edited. Rerun after new papers are ingested:
//
//   node scripts/derive-paper-blueprints.mjs                       # dump if present, else live
//   node scripts/derive-paper-blueprints.mjs --from-dump data/prelim-rows.json
//   node scripts/derive-paper-blueprints.mjs --live --save-dump data/prelim-rows.json
//
// Live mode reads SUPABASE_URL + SUPABASE_SECRET_KEY (fallback SUPABASE_SERVICE_ROLE_KEY)
// from the environment or .env.local (parsed with dotenv, never grep — values are
// trimmed because stored Vercel values can carry a trailing newline; see CLAUDE.md).
//
// Dump format (data/prelim-rows.json): dictionary-compressed rows.
//   meta.row_format: schoolIdx|year|level(A|E)|paper|qn|marks|difficulty(S|A|C|'')|
//                    diagram(0|1)|n_parts(''=unknown, 0=no sub-parts)|topicIdx[;...]
//   windows[]: '~'-joined packed rows; meta.windows[] gives row ranges so a partial
//   (crashed) dump is detectable: windows.length / per-window counts vs meta.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP_DEFAULT = join(ROOT, 'data', 'prelim-rows.json');
const OUT_DEFAULT = join(ROOT, 'data', 'paper-blueprints.json');

// ---------------------------------------------------------------- CLI ----
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const FROM_DUMP = argOf('--from-dump');
const SAVE_DUMP = argOf('--save-dump');
const OUT = argOf('--out') ?? OUT_DEFAULT;
const LIVE = argv.includes('--live');

// ------------------------------------------------------------- helpers ----
const pct = (sorted, p) => {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best, bestN = -1;
  const med = [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const [x, n] of c) {
    // tie-break toward the median so a 50/50 split picks the central value
    if (n > bestN || (n === bestN && Math.abs(x - med) < Math.abs(best - med))) { best = x; bestN = n; }
  }
  return best;
};
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

// School-name canonicalization: the bank spells some schools 2-3 ways
// ("Victoria" / "Victoria School"). Generic normalization + a tiny alias map for
// cases the generic rule cannot safely decide (Tanjong Katong vs TK Girls are
// DIFFERENT schools, so "girls" is never stripped).
const SCHOOL_ALIASES = new Map([
  ['st josephs', 'st joseph'],            // St Joseph's Institution etc.
  ['chij st nicholas', 'chij st nicholas girls'], // same school, short spelling
]);
function canonSchool(name) {
  let k = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(high school|secondary school|institution|institute|school|high)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  for (const [from, to] of SCHOOL_ALIASES) if (k === from) k = to;
  return k;
}
const titleCaseCache = new Map(); // canonical key -> shortest display name seen

// ------------------------------------------------------- data ingestion ----
// Row shape used everywhere below:
// { school, year, level: 'AM'|'EM', paper: '1'|'2', qn, marks, difficulty,
//   diagram: bool, nParts: int|null (0 = single-part), topics: string[] }

function rowsFromDump(path) {
  const dump = JSON.parse(readFileSync(path, 'utf8'));
  const { meta, schools, topics, windows } = dump;
  if (windows.length !== meta.windows.length) {
    throw new Error(`dump is PARTIAL: ${windows.length}/${meta.windows.length} windows present`);
  }
  const rows = [];
  const RE = /^(\d+)\|(\d{4})\|(A|E)\|(1|2)\|(\d+)\|(\d+)\|(S|A|C|)\|(0|1)\|(\d*)\|((\d+)(;\d+)*)?$/;
  windows.forEach((w, wi) => {
    const packed = w.split('~');
    const [a, b] = meta.windows[wi].rows;
    if (packed.length !== b - a + 1) throw new Error(`dump window ${wi}: ${packed.length} rows, expected ${b - a + 1}`);
    for (const r of packed) {
      const m = RE.exec(r);
      if (!m) throw new Error(`malformed dump row: ${r}`);
      rows.push({
        school: schools[+m[1]],
        year: +m[2],
        level: m[3] === 'A' ? 'AM' : 'EM',
        paper: m[4],
        qn: +m[5],
        marks: +m[6],
        difficulty: m[7] === 'S' ? 'Standard' : m[7] === 'A' ? 'Advanced' : m[7] === 'C' ? 'Challenging' : null,
        diagram: m[8] === '1',
        nParts: m[9] === '' ? null : +m[9],
        topics: m[10] ? m[10].split(';').map((t) => topics[+t]) : [],
      });
    }
  });
  if (rows.length !== meta.expected_total_rows) {
    throw new Error(`dump row count ${rows.length} != expected ${meta.expected_total_rows}`);
  }
  return rows;
}

function loadEnv() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return process.env;
  }
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) return process.env;
  const require = createRequire(import.meta.url);
  let parsed;
  try {
    parsed = require('dotenv').parse(readFileSync(envPath, 'utf8'));
  } catch {
    // minimal dotenv-compatible fallback (dotenv is only a transitive dep)
    parsed = {};
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("([^"]*)"|'([^']*)'|[^#]*)/.exec(line);
      if (m) parsed[m[1]] = (m[3] ?? m[4] ?? m[2] ?? '').trim();
    }
  }
  return { ...parsed, ...process.env };
}

async function rowsFromLive() {
  const env = loadEnv();
  const url = (env.SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error('live mode needs SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in env or .env.local');
  }
  const cols = 'school,year,level,paper,question_number,total_marks,topics,difficulty,image_url,figure_url,question_image_url,images,parts';
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${url}/rest/v1/questions?select=${cols}&exam_type=eq.Prelim&deleted_at=is.null&level=in.(AM,EM)&order=id.asc&limit=1000&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    for (const q of page) {
      rows.push({
        school: q.school,
        year: q.year,
        level: q.level,
        paper: q.paper,
        qn: parseInt(q.question_number, 10),
        marks: q.total_marks,
        difficulty: q.difficulty ?? null,
        diagram: Boolean(
          (q.image_url && q.image_url !== '') || (q.figure_url && q.figure_url !== '') ||
          (q.question_image_url && q.question_image_url !== '') ||
          (Array.isArray(q.images) && q.images.length > 0),
        ),
        nParts: Array.isArray(q.parts) ? q.parts.length : null,
        topics: q.topics ?? [],
      });
    }
    if (page.length < 1000) break;
  }
  return rows;
}

function saveDump(rows, path) {
  const schools = [...new Set(rows.map((r) => r.school))].sort();
  const topics = [...new Set(rows.flatMap((r) => r.topics))].sort();
  const sIdx = new Map(schools.map((s, i) => [s, i]));
  const tIdx = new Map(topics.map((t, i) => [t, i]));
  const sorted = [...rows].sort((a, b) =>
    a.school.localeCompare(b.school) || a.year - b.year || a.level.localeCompare(b.level) ||
    a.paper.localeCompare(b.paper) || a.qn - b.qn);
  const packed = sorted.map((r) =>
    `${sIdx.get(r.school)}|${r.year}|${r.level === 'AM' ? 'A' : 'E'}|${r.paper}|${r.qn}|${r.marks}|` +
    `${r.difficulty ? r.difficulty[0] : ''}|${r.diagram ? 1 : 0}|${r.nParts ?? ''}|` +
    `${r.topics.map((t) => tIdx.get(t)).join(';')}`);
  const windows = [], ranges = [];
  for (let i = 0; i < packed.length; i += 1500) {
    windows.push(packed.slice(i, i + 1500).join('~'));
    ranges.push({ rows: [i + 1, Math.min(i + 1500, packed.length)] });
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    meta: {
      source: "supabase questions table: exam_type='Prelim', level IN ('AM','EM'), deleted_at IS NULL",
      fetched_at: new Date().toISOString().slice(0, 10),
      expected_total_rows: packed.length,
      row_format: "schoolIdx|year|level(A=AM,E=EM)|paper(1|2)|question_number|total_marks|difficulty(S|A|C|empty=null)|diagram(0|1)|n_parts(int, empty=null, 0=no sub-parts)|topicIdx[;topicIdx...]",
      diagram_def: 'image_url/figure_url/question_image_url non-empty OR images jsonb array non-empty',
      row_order: 'school, year, level, paper, question_number::int, id',
      row_sep: '~',
      windows: ranges,
    },
    schools, topics, windows,
  }));
  console.log(`saved dump: ${path} (${packed.length} rows)`);
}

// -------------------------------------------------- Step 2: reconstruct ----
function reconstructPapers(rows) {
  const groups = new Map(); // canonKey -> {school(display), year, level, paper, questions[]}
  for (const r of rows) {
    const ck = canonSchool(r.school);
    const prev = titleCaseCache.get(ck);
    if (!prev || r.school.length < prev.length) titleCaseCache.set(ck, r.school);
    const key = `${ck}::${r.year}::${r.level}::${r.paper}`;
    if (!groups.has(key)) groups.set(key, { ck, year: r.year, level: r.level, paper: r.paper, questions: [] });
    groups.get(key).questions.push(r);
  }

  const papers = [];
  for (const g of groups.values()) {
    g.school = titleCaseCache.get(g.ck);
    g.questions.sort((a, b) => a.qn - b.qn);
    // dedupe exact re-captures (same qn + same marks); conflicting marks => unusable structure
    const byQn = new Map();
    let dupConflict = false;
    for (const q of g.questions) {
      if (byQn.has(q.qn)) { if (byQn.get(q.qn).marks !== q.marks) dupConflict = true; }
      else byQn.set(q.qn, q);
    }
    g.questions = [...byQn.values()];
    const n = g.questions.length;
    const contiguous = n > 0 && g.questions[0].qn === 1 && g.questions[n - 1].qn === n;
    g.total = g.questions.reduce((s, q) => s + q.marks, 0);
    g.n = n;
    g.contiguous = contiguous && !dupConflict;
    papers.push(g);
  }

  // plausible totals are DERIVED: totals reached by >=3 contiguous papers of that (level,paper)
  const plausible = new Map(); // 'AM-1' -> Set(totals)
  for (const [lp, list] of groupBy(papers.filter((p) => p.contiguous && p.n >= 8 && p.n <= 30), (p) => `${p.level}-${p.paper}`)) {
    const c = new Map();
    for (const p of list) c.set(p.total, (c.get(p.total) ?? 0) + 1);
    plausible.set(lp, new Set([...c.entries()].filter(([, n]) => n >= 3).map(([t]) => t)));
  }
  for (const p of papers) {
    p.status = p.contiguous && p.n >= 8 && p.n <= 30 && plausible.get(`${p.level}-${p.paper}`)?.has(p.total)
      ? 'COMPLETE' : 'PARTIAL';
  }
  return papers;
}
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// ------------------------------------------- Step 3 + 4: analyse & emit ----
const PAPER_KEYS = ['AM-P1', 'AM-P2', 'EM-P1', 'EM-P2'];
const lpOf = (p) => `${p.level}-P${p.paper}`;

const CALC_TOPICS = (t) => /^(Differentiation|Integration|Kinematics)/.test(t);
const STATS_TOPICS = (t) => /^(Statistics|Probability)$/.test(t);

function derive(rows) {
  const papers = reconstructPapers(rows);
  const complete = papers.filter((p) => p.status === 'COMPLETE');
  const report = [];
  const say = (s) => { report.push(s); console.log(s); };

  say('== Recovered papers ==');
  for (const key of PAPER_KEYS) {
    const all = papers.filter((p) => lpOf(p) === key);
    const comp = all.filter((p) => p.status === 'COMPLETE');
    say(`${key}: ${comp.length} COMPLETE / ${all.length} groups (partials keep feeding topic stats)`);
  }

  const blueprint = {
    derived_at: new Date().toISOString().slice(0, 10),
    source: {
      papers_complete: Object.fromEntries(PAPER_KEYS.map((k) => [k, complete.filter((p) => lpOf(p) === k).length])),
      prelim_rows: rows.length,
    },
    papers: {},
    presets: {},
  };

  const outliersByKey = {};

  for (const key of PAPER_KEYS) {
    const comp = complete.filter((p) => lpOf(p) === key);
    if (comp.length === 0) continue;
    say(`\n== ${key} ==`);

    // ---- year drift + base selection (prefer post-2023 syllabus papers)
    const post = comp.filter((p) => p.year >= 2023);
    const pre = comp.filter((p) => p.year < 2023);
    const base = post.length >= 15 ? post : comp;
    const totals = base.map((p) => p.total).sort((a, b) => a - b);
    const canonicalTotal = mode(base.map((p) => p.total));
    const ns = base.map((p) => p.n);
    const typN = mode(ns);
    say(`base = ${base.length} papers (${post.length >= 15 ? 'year>=2023' : 'all years'}); ` +
      `totals mode=${canonicalTotal} range=[${totals[0]},${totals[totals.length - 1]}]; ` +
      `Q-count mode=${typN} range=[${Math.min(...ns)},${Math.max(...ns)}]`);
    if (pre.length >= 3 && post.length >= 3) {
      const preT = mode(pre.map((p) => p.total)), preN = mode(pre.map((p) => p.n));
      say(`drift: pre-2023 mode total=${preT} Q=${preN}  ->  post-2023 mode total=${mode(post.map((p) => p.total))} Q=${mode(post.map((p) => p.n))}`);
    }

    // ---- mark-by-position (terciles over normalized position)
    const terciles = [[], [], []];
    for (const p of base) {
      p.questions.forEach((q, i) => {
        const pos = p.n === 1 ? 0 : i / (p.n - 1);
        terciles[Math.min(2, Math.floor(pos * 3))].push(q.marks);
      });
    }
    say('mark-by-position (opener/middle/closer tercile): ' + terciles.map((t) => {
      const s = t.sort((a, b) => a - b);
      return `p25=${pct(s, 25)} p50=${pct(s, 50)} p75=${pct(s, 75)}`;
    }).join(' | '));

    // ---- topic presence over complete papers
    const n = comp.length;
    const presence = new Map();
    for (const p of comp) {
      for (const t of new Set(p.questions.flatMap((q) => q.topics))) {
        presence.set(t, (presence.get(t) ?? 0) + 1);
      }
    }
    const basePresence = new Map();
    for (const p of base) {
      for (const t of new Set(p.questions.flatMap((q) => q.topics))) {
        basePresence.set(t, (basePresence.get(t) ?? 0) + 1);
      }
    }
    const mustAppear = [...basePresence.entries()].filter(([, k]) => k / base.length >= 0.8).map(([t]) => t).sort();
    const common = [...basePresence.entries()].filter(([, k]) => k / base.length >= 0.4 && k / base.length < 0.8).map(([t]) => t).sort();
    say(`must-appear (>=80% of ${base.length} base papers): ${mustAppear.join(', ')}`);
    say(`common (40-80%): ${common.join(', ')}`);

    // ---- topic position affinity + closers
    const posSum = new Map(), posN = new Map(), closers = new Map();
    for (const p of base) {
      p.questions.forEach((q, i) => {
        const pos = p.n === 1 ? 0 : i / (p.n - 1);
        for (const t of q.topics) {
          posSum.set(t, (posSum.get(t) ?? 0) + pos);
          posN.set(t, (posN.get(t) ?? 0) + 1);
        }
        if (i >= p.n - 2) for (const t of q.topics) closers.set(t, (closers.get(t) ?? 0) + 1);
      });
    }
    const affinity = [...posN.entries()].filter(([, c]) => c >= 5)
      .map(([t, c]) => [t, posSum.get(t) / c]).sort((a, b) => a[1] - b[1]);
    say('openers (lowest mean position): ' + affinity.slice(0, 5).map(([t, a]) => `${t}=${round2(a)}`).join(', '));
    say('closer-topics (highest mean position): ' + affinity.slice(-5).map(([t, a]) => `${t}=${round2(a)}`).join(', '));
    const closerDist = [...closers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    say(`final-2-questions topic counts (over ${base.length} papers): ` + closerDist.map(([t, c]) => `${t}:${c}`).join(', '));

    // ---- co-occurrence rules (all complete papers of this key, support >= 8)
    const neverTogether = [], alwaysTogether = [];
    const topicsHere = [...presence.keys()].sort();
    for (let i = 0; i < topicsHere.length; i++) {
      for (let j = i + 1; j < topicsHere.length; j++) {
        const A = topicsHere[i], B = topicsHere[j];
        const kA = presence.get(A), kB = presence.get(B);
        let together = 0;
        for (const p of comp) {
          const set = new Set(p.questions.flatMap((q) => q.topics));
          if (set.has(A) && set.has(B)) together++;
        }
        const either = kA + kB - together;
        if (together === 0 && kA / n >= 0.4 && kB / n >= 0.4 && Math.min(kA, kB) >= 8) {
          neverTogether.push([A, B, kA, kB]);
        }
        if (either >= 8 && together / either >= 0.9) alwaysTogether.push([A, B, together, either]);
      }
    }
    if (neverTogether.length) say('never-together (both common, 0 co-papers): ' + neverTogether.map(([a, b, ka, kb]) => `${a}(${ka})+${b}(${kb})`).join('; '));
    if (alwaysTogether.length) say('together>=90% of papers-with-either: ' + alwaysTogether.map(([a, b, t, e]) => `${a}+${b} ${t}/${e}`).join('; '));

    // ---- slots: map every base-paper question onto 1..typN normalized positions
    const slotSamples = Array.from({ length: typN }, () => ({ marks: [], topics: new Map(), parts: [], diagrams: [] }));
    for (const p of base) {
      p.questions.forEach((q, i) => {
        const s = p.n === 1 ? 0 : Math.round((i / (p.n - 1)) * (typN - 1));
        const slot = slotSamples[s];
        slot.marks.push(q.marks);
        slot.diagrams.push(q.diagram ? 1 : 0);
        if (q.nParts !== null) slot.parts.push(Math.max(1, q.nParts));
        for (const t of q.topics) slot.topics.set(t, (slot.topics.get(t) ?? 0) + 1);
      });
    }
    const rawMeans = slotSamples.map((s) => mean(s.marks));
    const scale = canonicalTotal / rawMeans.reduce((a, b) => a + b, 0);
    // largest-remainder round so slot typicals sum exactly to the canonical total
    const scaled = rawMeans.map((m) => m * scale);
    const typs = scaled.map(Math.floor);
    let deficit = canonicalTotal - typs.reduce((a, b) => a + b, 0);
    const rema = scaled.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < deficit; i++) typs[rema[i][1]]++;

    const slots = slotSamples.map((s, i) => {
      const sorted = [...s.marks].sort((a, b) => a - b);
      const totalT = [...s.topics.values()].reduce((a, b) => a + b, 0);
      let pool = [...s.topics.entries()].map(([t, c]) => [t, c / totalT])
        .sort((a, b) => b[1] - a[1]).filter(([, w], idx) => idx < 8 && w >= 0.03);
      const wSum = pool.reduce((a, [, w]) => a + w, 0);
      pool = pool.map(([t, w]) => ({ topic: t, weight: round3(w / wSum) }));
      const drift = round3(1 - pool.reduce((a, p) => a + p.weight, 0));
      if (pool.length) pool[0].weight = round3(pool[0].weight + drift);
      const partsSorted = [...s.parts].sort((a, b) => a - b);
      return {
        pos: i + 1,
        marks: [Math.round(pct(sorted, 10)), Math.round(pct(sorted, 90))],
        typ: typs[i],
        topic_pool: pool,
        parts: partsSorted.length ? [Math.round(pct(partsSorted, 25)), Math.round(pct(partsSorted, 75))] : null,
        diagram_rate: round2(mean(s.diagrams)),
        samples: s.marks.length,
      };
    });

    // guarantee every must-appear topic exists in some pool (re-inject if the
    // top-8 cap squeezed it out of all slots)
    for (const t of mustAppear) {
      if (slots.some((sl) => sl.topic_pool.some((p) => p.topic === t))) continue;
      let bi = 0, bc = -1;
      slotSamples.forEach((s, i) => { const c = s.topics.get(t) ?? 0; if (c > bc) { bc = c; bi = i; } });
      const sl = slots[bi];
      sl.topic_pool.push({ topic: t, weight: 0.03 });
      const ws = sl.topic_pool.reduce((a, p) => a + p.weight, 0);
      sl.topic_pool = sl.topic_pool.map((p) => ({ topic: p.topic, weight: round3(p.weight / ws) }));
      const d = round3(1 - sl.topic_pool.reduce((a, p) => a + p.weight, 0));
      sl.topic_pool[0].weight = round3(sl.topic_pool[0].weight + d);
    }

    // merge adjacent interchangeable middle slots into position ranges
    const merged = [];
    const cosine = (a, b) => {
      const keys = new Set([...a.map((p) => p.topic), ...b.map((p) => p.topic)]);
      let dot = 0, na = 0, nb = 0;
      for (const k of keys) {
        const wa = a.find((p) => p.topic === k)?.weight ?? 0;
        const wb = b.find((p) => p.topic === k)?.weight ?? 0;
        dot += wa * wb; na += wa * wa; nb += wb * wb;
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    };
    for (const sl of slots) {
      const prev = merged[merged.length - 1];
      const pos = sl.pos;
      const isEdge = pos <= 2 || pos >= typN - 1;
      if (prev && !isEdge && !prev.edge &&
        prev.marks[0] === sl.marks[0] && prev.marks[1] === sl.marks[1] &&
        cosine(prev.topic_pool, sl.topic_pool) >= 0.85) {
        // fold into range slot
        prev.posEnd = pos;
        prev.span += 1;
        for (const p of sl.topic_pool) {
          const e = prev.topic_pool.find((x) => x.topic === p.topic);
          if (e) e.weight += p.weight; else prev.topic_pool.push({ ...p });
        }
        prev.typSum += sl.typ;
        prev.samples += sl.samples;
        prev.diagram_rate = round2((prev.diagram_rate * (prev.span - 1) + sl.diagram_rate) / prev.span);
        if (sl.parts && prev.parts) {
          prev.parts = [Math.min(prev.parts[0], sl.parts[0]), Math.max(prev.parts[1], sl.parts[1])];
        }
      } else {
        merged.push({ ...sl, posStart: pos, posEnd: pos, span: 1, typSum: sl.typ, edge: isEdge });
      }
    }
    const slotsOut = merged.map((m) => {
      let pool = m.topic_pool;
      const ws = pool.reduce((a, p) => a + p.weight, 0);
      pool = pool.map((p) => ({ topic: p.topic, weight: round3(p.weight / ws) })).sort((a, b) => b.weight - a.weight);
      const d = round3(1 - pool.reduce((a, p) => a + p.weight, 0));
      pool[0].weight = round3(pool[0].weight + d);
      return {
        pos: m.posStart === m.posEnd ? m.posStart : `${m.posStart}-${m.posEnd}`,
        marks: m.marks,
        typ: Math.round(m.typSum / m.span),
        topic_pool: pool,
        ...(m.parts ? { parts: m.parts } : {}),
        diagram_rate: m.diagram_rate,
      };
    });

    // min distinct topics per paper (base)
    const minDistinct = Math.min(...base.map((p) => new Set(p.questions.flatMap((q) => q.topics)).size));

    blueprint.papers[key] = {
      total_marks: canonicalTotal,
      question_count: [Math.min(...ns), typN, Math.max(...ns)],
      slots: slotsOut,
      must_appear: mustAppear,
      rules: {
        never_together: neverTogether.map(([a, b]) => [a, b]),
        min_distinct_topics: minDistinct,
      },
    };

    // ---- parts-by-position summary for the report
    say('parts p25-p75 by slot: ' + slots.map((s) => `${s.pos}:${s.parts ? s.parts.join('-') : '?'}`).join(' '));

    // ---- school style outliers (schools with >=2 complete papers of this key)
    const cohortShare = new Map();
    let cohortMarks = 0;
    for (const p of comp) {
      for (const q of p.questions) {
        cohortMarks += q.marks;
        for (const t of q.topics) cohortShare.set(t, (cohortShare.get(t) ?? 0) + q.marks / q.topics.length);
      }
    }
    for (const t of cohortShare.keys()) cohortShare.set(t, cohortShare.get(t) / cohortMarks);
    const bySchool = groupBy(comp, (p) => p.school);
    const outliers = [];
    for (const [school, list] of bySchool) {
      if (list.length < 2) continue;
      const share = new Map();
      let tot = 0;
      for (const p of list) for (const q of p.questions) {
        tot += q.marks;
        for (const t of q.topics) share.set(t, (share.get(t) ?? 0) + q.marks / q.topics.length);
      }
      let dist = 0, topDelta = null;
      for (const t of new Set([...cohortShare.keys(), ...share.keys()])) {
        const d = (share.get(t) ?? 0) / tot - (cohortShare.get(t) ?? 0);
        dist += Math.abs(d);
        if (!topDelta || d > topDelta[1]) topDelta = [t, d];
      }
      const perPaper = mode(list.map((p) => p.total));
      outliers.push({ school, nPapers: list.length, dist: round3(dist), topTopic: topDelta[0], topDeltaMarks: round2(topDelta[1] * perPaper) });
    }
    outliers.sort((a, b) => b.dist - a.dist);
    outliersByKey[key] = outliers;
    say('style outliers: ' + outliers.slice(0, 3).map((o) =>
      `${o.school} (${o.nPapers} papers, L1=${o.dist}, +${o.topDeltaMarks}mk ${o.topTopic})`).join('; '));

    // ---- topic drift pre/post 2023 (report only)
    if (pre.length >= 3 && post.length >= 3) {
      const shareOf = (list) => {
        const m = new Map(); let tot = 0;
        for (const p of list) for (const q of p.questions) {
          tot += q.marks;
          for (const t of q.topics) m.set(t, (m.get(t) ?? 0) + q.marks / q.topics.length);
        }
        for (const t of m.keys()) m.set(t, m.get(t) / tot);
        return m;
      };
      const a = shareOf(pre), b = shareOf(post);
      const deltas = [...new Set([...a.keys(), ...b.keys()])]
        .map((t) => [t, (b.get(t) ?? 0) - (a.get(t) ?? 0)]).sort((x, y) => y[1] - x[1]);
      say('drift topics (share post-pre): up ' + deltas.slice(0, 3).map(([t, d]) => `${t}+${round3(d)}`).join(', ') +
        ' | down ' + deltas.slice(-3).map(([t, d]) => `${t}${round3(d)}`).join(', '));
    }
  }

  // ---- diagram rate by topic (all prelim rows, per level) — report only
  say('\n== diagram rate by topic (all prelim rows) ==');
  for (const level of ['AM', 'EM']) {
    const byTopic = new Map();
    for (const r of rows) {
      if (r.level !== level) continue;
      for (const t of r.topics) {
        const e = byTopic.get(t) ?? [0, 0];
        e[0] += r.diagram ? 1 : 0; e[1] += 1;
        byTopic.set(t, e);
      }
    }
    const rates = [...byTopic.entries()].filter(([, [, n]]) => n >= 30)
      .map(([t, [d, n]]) => [t, d / n]).sort((a, b) => b[1] - a[1]);
    say(`${level} highest: ` + rates.slice(0, 5).map(([t, r]) => `${t}=${round2(r)}`).join(', ') +
      ' | lowest: ' + rates.slice(-3).map(([t, r]) => `${t}=${round2(r)}`).join(', '));
  }

  // -------------------------------------------------------- presets ----
  const presets = {
    standard: { description: 'Balanced empirical shape — the base blueprint as-is.', overlay: {} },
  };

  // top-school-hard: pooled topic mix of the most style-deviant multi-paper schools
  const hardSchools = [...new Set(
    PAPER_KEYS.flatMap((k) => (outliersByKey[k] ?? []).slice(0, 2).map((o) => o.school)),
  )].slice(0, 4);
  const hardMult = {};
  for (const key of PAPER_KEYS) {
    for (const o of (outliersByKey[key] ?? []).slice(0, 2)) {
      hardMult[o.topTopic] = Math.min(2, round2((hardMult[o.topTopic] ?? 1) + 0.3));
    }
  }
  presets['top-school-hard'] = {
    description: `Harder set: upper mark band per slot, topic mix leaning toward the most style-deviant schools (${hardSchools.join(', ')}).`,
    overlay: { mark_band: 'upper', school_style: hardSchools, topic_weight_multipliers: hardMult },
  };

  // calculus-forward AM-P2 + stats-forward EM-P2: multiplier = top-quartile share / overall share
  const groupPreset = (key, name, testFn, label) => {
    const comp = complete.filter((p) => lpOf(p) === key);
    if (comp.length < 8) return;
    const shareOf = (p) => {
      let g = 0, tot = 0;
      for (const q of p.questions) {
        tot += q.marks;
        if (q.topics.some(testFn)) g += q.marks;
      }
      return g / tot;
    };
    const shares = comp.map(shareOf).sort((a, b) => a - b);
    const med = pct(shares, 50), p75 = pct(shares, 75);
    const mult = round2(Math.min(2, p75 / (med || 1)));
    const topicsInGroup = [...new Set(comp.flatMap((p) => p.questions.flatMap((q) => q.topics)))].filter(testFn).sort();
    presets[name] = {
      description: `${label} ${key}: modelled on the top-quartile papers — ${label.toLowerCase()} share ${round2(med * 100)}% median vs ${round2(p75 * 100)}% at p75.`,
      applies_to: [key],
      overlay: { topic_weight_multipliers: Object.fromEntries(topicsInGroup.map((t) => [t, mult])) },
    };
    say(`preset ${name}: share median=${round2(med)} p75=${round2(p75)} mult=${mult}`);
  };
  say('');
  groupPreset('AM-P2', 'calculus-forward-am-p2', CALC_TOPICS, 'Calculus-forward');
  groupPreset('EM-P2', 'stats-forward-em-p2', STATS_TOPICS, 'Stats-forward');

  // vintage preset if pre-2023 totals differed (old 80/100 syllabus formats)
  const vintageTotals = {};
  for (const key of PAPER_KEYS) {
    const pre = complete.filter((p) => lpOf(p) === key && p.year < 2023);
    if (pre.length >= 3) {
      const t = mode(pre.map((p) => p.total));
      if (blueprint.papers[key] && t !== blueprint.papers[key].total_marks) {
        vintageTotals[key] = { total_marks: t, question_count_typ: mode(pre.map((p) => p.n)) };
      }
    }
  }
  if (Object.keys(vintageTotals).length) {
    presets['vintage-pre2023'] = {
      description: 'Old-syllabus paper shape (pre-2023 totals/question counts) for students practising legacy sets.',
      overlay: { totals: vintageTotals },
    };
  }

  blueprint.presets = presets;
  return { blueprint, papers, report };
}

// ------------------------------------------------------ sanity checks ----
function sanityCheck(bp) {
  const errs = [];
  for (const [key, paper] of Object.entries(bp.papers)) {
    let typSum = 0;
    for (const slot of paper.slots) {
      const span = typeof slot.pos === 'string' ? slot.pos.split('-').map(Number).reduce((a, b) => b - a + 1) : 1;
      typSum += slot.typ * span;
      const w = slot.topic_pool.reduce((a, p) => a + p.weight, 0);
      if (Math.abs(w - 1) > 0.005) errs.push(`${key} slot ${slot.pos}: weights sum ${w}`);
      if (slot.marks[0] > slot.marks[1]) errs.push(`${key} slot ${slot.pos}: bad mark range`);
    }
    if (Math.abs(typSum - paper.total_marks) > 4) {
      errs.push(`${key}: slot typicals sum ${typSum} vs total ${paper.total_marks} (>±4)`);
    }
    const poolTopics = new Set(paper.slots.flatMap((s) => s.topic_pool.map((p) => p.topic)));
    for (const t of paper.must_appear) {
      if (!poolTopics.has(t)) errs.push(`${key}: must-appear "${t}" missing from every slot pool`);
    }
  }
  if (errs.length) {
    console.error('SANITY CHECK FAILED:\n' + errs.join('\n'));
    process.exit(1);
  }
  console.log('sanity checks passed: weights sum to 1, typicals within ±4 of totals, must-appear topics all present in pools');
}

// ---------------------------------------------------------------- main ----
async function main() {
  let rows;
  if (FROM_DUMP || (!LIVE && existsSync(DUMP_DEFAULT))) {
    const path = FROM_DUMP ?? DUMP_DEFAULT;
    console.log(`reading dump: ${path}`);
    rows = rowsFromDump(path);
  } else {
    console.log('live mode: fetching prelim rows from Supabase…');
    rows = await rowsFromLive();
    console.log(`fetched ${rows.length} rows`);
    if (SAVE_DUMP) saveDump(rows, SAVE_DUMP);
  }
  const { blueprint } = derive(rows);
  sanityCheck(blueprint);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(blueprint, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
