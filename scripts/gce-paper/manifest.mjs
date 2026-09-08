#!/usr/bin/env node
// Print an audit manifest for a generated paper JSON: one row per question —
// topic(s), marks, the real GCE questions shown as style anchors, the blind-solve
// verdict, the moderator's style score and the nearest real question by
// word-trigram overlap. Usage: node scripts/gce-paper/manifest.mjs <paper.json> [--md]
import { readFileSync } from 'node:fs';
const [file, ...flags] = process.argv.slice(2);
const md = flags.includes('--md');
const paper = JSON.parse(readFileSync(file, 'utf8'));
const rows = paper.questions.map((s) => {
  const g = s.gates ?? {};
  const q = s.question;
  const solve = g.solve_revised ?? g.solve_1 ?? g.solve_0 ?? {};
  const anchors = (g.exemplars ?? []).map((e) => e.ref.replace('GCE ', '')).join(', ');
  const verify = !q ? 'FAILED' : `${solve.agree ? 'blind solve agrees' : 'DISAGREE'}${g.repaired ? ' (after repair)' : ''}${g.judge?.revised ? ', revised for style' : ''}`;
  return {
    q: `Q${s.pos}`, topics: q ? q.topics.join(' + ') : s.topic, marks: s.target,
    style: g.judge?.score != null ? `${g.judge.score}/5` : '—',
    nearest: g.novelty ? `${g.novelty.nearest.replace('GCE ', '')} (${g.novelty.jaccard})` : '—',
    verify, anchors, attempts: (s.failed_attempts?.length ?? 0) + (q ? 1 : 0), figure: q?.needs_figure ? 'yes' : '',
  };
});
const cols = ['q', 'topics', 'marks', 'style', 'verify', 'nearest', 'attempts', 'figure', 'anchors'];
const head = ['Qn', 'Topic(s)', 'Marks', 'Style', 'Verification', 'Nearest real Q (overlap)', 'Tries', 'Fig', 'Style anchors shown'];
if (md) {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${cols.map((c) => String(r[c] ?? '')).join(' | ')} |`);
} else {
  console.log(head.join('\t'));
  for (const r of rows) console.log(cols.map((c) => r[c]).join('\t'));
}
const ok = rows.filter((r) => r.verify !== 'FAILED');
console.log(`\n${ok.length}/${rows.length} questions · ${ok.reduce((a, r) => a + r.marks, 0)} marks · models ${paper.models.author} (author) / ${paper.models.solver} (blind solver) / ${paper.models.judge} (moderator) · prompt ${paper.prompt_version}`);
