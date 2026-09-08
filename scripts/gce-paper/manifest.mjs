#!/usr/bin/env node
// Print an audit manifest for an assembled paper JSON: one row per slot —
// topic(s), marks, the moderator's style score, whether the blind solve agreed,
// the nearest real GCE question by word-trigram overlap, the figure flag and the
// real questions shown to the author as style anchors.
// Usage: node scripts/gce-paper/manifest.mjs <paper.json> [--md]
import { readFileSync } from 'node:fs';
const [file, ...flags] = process.argv.slice(2);
const md = flags.includes('--md');
const paper = JSON.parse(readFileSync(file, 'utf8'));
const strip = (ref) => String(ref ?? '').replace(/^GCE /, '');
const rows = paper.questions.map((s) => {
  const q = s.question ?? s.draft;
  const g = s.gates ?? {};
  const v = s.verdict ?? {};
  const b = s.blind ?? {};
  const why = [];
  if (!q) why.push('no draft');
  if (q && !g.pass) why.push(`gates: ${(g.problems ?? []).join('; ') || 'failed'}`);
  if (b.solvable === false) why.push('blind: unsolvable');
  if (v.all_agree === false) why.push('blind ≠ key');
  if (v.too_close_to) why.push(`too close to ${strip(v.too_close_to)}`);
  if (v.score != null && Number(v.score) < 4) why.push(`style ${v.score}/5`);
  if (!s.accepted && !why.length) why.push(v.score == null ? 'no verdict' : 'not accepted');
  return {
    q: `Q${s.pos}`, topics: q ? q.topics.join(' + ') : s.topic, marks: s.target,
    style: v.score != null ? `${v.score}/5` : '—',
    blind: v.all_agree === true ? 'agrees' : v.all_agree === false ? 'DISAGREES' : b.solvable != null ? (b.solvable ? 'solved' : 'unsolvable') : '—',
    nearest: g.novelty ? `${strip(g.novelty.nearest)} (${g.novelty.jaccard})` : '—',
    status: s.accepted ? 'accepted' : `LEFT OUT — ${why.join(', ')}`,
    figure: q?.needs_figure ? 'yes' : '',
    anchors: (s.exemplars ?? []).map((e) => strip(e.ref)).join(', '),
  };
});
const cols = ['q', 'topics', 'marks', 'style', 'blind', 'nearest', 'figure', 'status', 'anchors'];
const head = ['Qn', 'Topic(s)', 'Marks', 'Style', 'Blind solve', 'Nearest real Q (overlap)', 'Fig', 'Status', 'Style anchors shown'];
if (md) {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${cols.map((c) => String(r[c] ?? '')).join(' | ')} |`);
} else {
  console.log(head.join('\t'));
  for (const r of rows) console.log(cols.map((c) => r[c]).join('\t'));
}
const ok = rows.filter((r) => r.status === 'accepted');
const m = paper.models ?? {};
console.log(`\n${ok.length}/${rows.length} questions · ${ok.reduce((a, r) => a + r.marks, 0)}/${paper.total} marks · author ${m.author} · blind solver ${m.solver} · moderator ${m.moderator} · prompt ${paper.prompt_version}`);
