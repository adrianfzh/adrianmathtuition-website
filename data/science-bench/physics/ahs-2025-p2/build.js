// Writes seed-NN/plan.json + truth.json from paper.json + plans.src.js. Run: node build.js
const fs = require('fs'), path = require('path');
const paper = require('./paper.json'); const { clean, seeds } = require('./plans.src.js');
for (const s of seeds) {
  const parts = [];
  for (const q of paper.questions) for (const p of q.parts) {
    if (p.header) continue;
    const key = q.question + p.label, o = s.over[key], c = clean[key];
    if (!c) throw new Error('no clean answer for ' + key);
    parts.push({ question: q.question, label: p.label, max: p.max, answer: o ? o.a : c.a, defect: o ? o.d : 'CLEAN', truth: o ? o.t : p.max, why: o ? o.why : 'fully correct' });
  }
  for (const k of Object.keys(s.over)) if (!parts.some(p => p.question + p.label === k)) throw new Error('unknown part ' + k);
  const dir = path.join(__dirname, `seed-${String(s.seed).padStart(2, '0')}`); fs.mkdirSync(dir, { recursive: true });
  const plan = { subject: paper.subject, paperKey: paper.paperKey, grade: s.grade, seed: s.seed, runs: {}, parts };
  const prev = fs.existsSync(path.join(dir, 'plan.json')) ? require(path.join(dir, 'plan.json')) : null; if (prev) plan.runs = prev.runs || {};
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  const truth = { run_id: null, subject: paper.subject, source: 'seeded', label: `seeded · ${s.grade} · seed ${s.seed}`,
    questions: parts.map(p => ({ question: p.question, label: p.label, awarded: p.truth, max: p.max, note: p.defect })) };
  fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify(truth, null, 1));
  console.log(`seed ${s.seed} (${s.grade}): truth ${parts.reduce((a, p) => a + p.truth, 0)}/${parts.reduce((a, p) => a + p.max, 0)}, ${parts.filter(p => p.defect !== 'CLEAN').length} seeded parts`);
}
