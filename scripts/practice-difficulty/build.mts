// 🎚 Practice difficulty — combine the SAMPLE (5 Oct 2026): work score (out/work-*.json, the
// plan-billed Opus read) + test solve (out/test-solve.json, Haiku 4.5 twice) → Core / Exam /
// Challenge by lib/practice-difficulty estimateLevel; writes the rows to the science project's
// practice_difficulty as source 'estimate-sample' (never read by the serving path), and builds
// out/sample.html for Adrian to scan on a phone.
//   npx tsx scripts/practice-difficulty/build.mts [--no-write]
import dotenv from 'dotenv'; import fs from 'fs'; import path from 'path';
const env = dotenv.parse(fs.readFileSync('.env.local')); for (const k of Object.keys(env)) process.env[k] = env[k].trim();
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));

(async () => {
  const { estimateLevel, testSolveOf, DIFFICULTY_LABEL } = await import('../../src/lib/practice-difficulty');
  const sample: any[] = read('sample.json');
  const solve = new Map<string, any>(read('test-solve.json').results.map((r: any) => [r.id, r]));
  const work = new Map<string, any>([...read('work-CHEM.json'), ...read('work-PHY.json'), ...read('work-BIO.json')].map((w: any) => [w.id, w]));
  const rows = sample.map(q => {
    const w = work.get(q.id); const s = solve.get(q.id);
    if (!w) throw new Error(`no work score for ${q.id}`);
    const ts = testSolveOf(s?.tries ?? []);
    const level = estimateLevel(w.work, ts);
    const solveWords = ts === 'wrong' ? 'the test solver got it wrong both times' : ts === 'split' ? 'the test solver got it right once in two' : ts === 'right' ? 'the test solver got it right' : 'no test solve';
    return { ...q, work: w, ts, letters: s?.letters ?? [], level, reason: (s => s.charAt(0).toUpperCase() + s.slice(1))(`${String(w.reason).replace(/\.$/, '')}; ${solveWords}`) };
  });

  if (!process.argv.includes('--no-write')) {
    const { getScienceClient } = await import('../../src/lib/science-bank');
    const up = rows.map(r => ({
      question_id: r.id, level: r.level, source: 'estimate-sample', attempts: 0, wrong: 0, wrong_share: null,
      work_score: r.work.work, test_solve: r.ts, reason: r.reason,
      detail: { steps: r.work.steps, ideas: r.work.ideas, traps: r.work.traps, solver: 'claude-haiku-4-5-20251001', letters: r.letters, oldLabel: r.oldLabel, sample: '2026-10-05' },
      updated_at: new Date().toISOString(),
    }));
    const { error } = await getScienceClient().from('practice_difficulty').upsert(up, { onConflict: 'question_id' });
    if (error) throw error;
    console.log('wrote', up.length, 'estimate-sample rows');
  }

  // ── the page ──
  const LEVELS = ['core', 'exam', 'challenge'] as const;
  const TOPICS = [...new Set(rows.map(r => r.topic))];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const count = (f: (r: any) => boolean) => rows.filter(f).length;
  const levelTable = `<table><tr><th>Topic</th>${LEVELS.map(l => `<th>${DIFFICULTY_LABEL[l]}</th>`).join('')}</tr>${TOPICS.map(t => `<tr><td>${t}</td>${LEVELS.map(l => `<td>${count(r => r.topic === t && r.level === l)}</td>`).join('')}</tr>`).join('')}<tr class="tot"><td>All</td>${LEVELS.map(l => `<td>${count(r => r.level === l)}</td>`).join('')}</tr></table>`;
  const OLD = ['Standard', 'Advanced'];
  const oldOf = (r: any) => (['Advanced', 'Challenging'].includes(r.oldLabel) ? 'Advanced' : 'Standard');
  const compTable = `<table><tr><th>Old label</th>${LEVELS.map(l => `<th>${DIFFICULTY_LABEL[l]}</th>`).join('')}</tr>${OLD.map(o => `<tr><td>${o}</td>${LEVELS.map(l => `<td>${count(r => oldOf(r) === o && r.level === l)}</td>`).join('')}</tr>`).join('')}</table>`;
  const solveRow = `<table><tr><th>Test solver</th>${LEVELS.map(l => `<th>${DIFFICULTY_LABEL[l]}</th>`).join('')}</tr>${(['right', 'split', 'wrong'] as const).map(s => `<tr><td>${{ right: 'Right both times', split: 'Right once', wrong: 'Wrong both times' }[s]}</td>${LEVELS.map(l => `<td>${count(r => r.ts === s && r.level === l)}</td>`).join('')}</tr>`).join('')}</table>`;

  // examples: per level up to 5, spread across topics, deterministic
  const examples = (l: string) => {
    const pool = rows.filter(r => r.level === l); const out: any[] = [];
    for (let i = 0; out.length < 5 && i < 10; i++) for (const t of TOPICS) { const c = pool.filter(r => r.topic === t)[i]; if (c && out.length < 5) out.push(c); }
    return out;
  };
  const card = (r: any) => `<div class="card"><div class="meta"><span class="pill ${r.level}">${DIFFICULTY_LABEL[r.level as 'core']}</span> <span class="topic">${r.topic}</span> <span class="old">was ${oldOf(r)}</span></div>
<div class="why">${esc(r.reason)}</div>
<div class="q md">${esc(r.markdown)}</div>
<div class="ans">Answer: <b>${r.key}</b> · test solver said ${r.letters.map((x: string | null) => x ?? '–').join(', ')} · work ${r.work.work}/5</div></div>`;
  const sections = LEVELS.map(l => `<h2><span class="pill ${l}">${DIFFICULTY_LABEL[l]}</span> ${count(r => r.level === l)} of ${rows.length}</h2>${examples(l).map(card).join('\n')}`).join('\n');
  const all = TOPICS.map(t => `<details><summary>All ${count(r => r.topic === t)} — ${t}</summary><table class="list"><tr><th>New</th><th>Was</th><th>Why</th></tr>${rows.filter(r => r.topic === t).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)).map(r => `<tr><td><span class="pill ${r.level}">${DIFFICULTY_LABEL[r.level as 'core']}</span></td><td>${oldOf(r)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</table></details>`).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Science Practice Levels</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--mut:#6b6b66;--card:#fff;--line:#e4e2db;--core:#2f7d4f;--exam:#b07a12;--chal:#b03a2e}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--fg:#ecebe6;--mut:#a3a29c;--card:#22221f;--line:#3a3934}}
:root[data-theme="dark"]{--bg:#161615;--fg:#ecebe6;--mut:#a3a29c;--card:#22221f;--line:#3a3934}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}h1{font-size:22px;margin:4px 0 6px}h2{font-size:18px;margin:28px 0 10px;display:flex;gap:8px;align-items:center}
p.lead{color:var(--mut);margin:0 0 14px}
table{border-collapse:collapse;width:100%;margin:6px 0 14px;font-size:14px}th,td{border-bottom:1px solid var(--line);padding:6px 6px;text-align:left;vertical-align:top}td:not(:first-child),th:not(:first-child){text-align:center}
table.list td:last-child{text-align:left}tr.tot td{font-weight:600}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;color:#fff;font-size:13px;font-weight:600}.pill.core{background:var(--core)}.pill.exam{background:var(--exam)}.pill.challenge{background:var(--chal)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 12px;overflow-wrap:anywhere}
.meta{font-size:13px;color:var(--mut);display:flex;gap:8px;flex-wrap:wrap;align-items:center}.why{font-weight:600;margin:6px 0 8px}
.q img{max-width:100%;height:auto;background:#fff;border-radius:6px}.q p{margin:6px 0}.q table{font-size:13px}.q{overflow-x:auto}
.ans{font-size:13px;color:var(--mut);margin-top:6px;border-top:1px dashed var(--line);padding-top:6px}
details{margin:8px 0}summary{cursor:pointer;font-weight:600}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:10px 0}
</style></head><body><main>
<h1>Science practice: Core · Exam · Challenge</h1>
<p class="lead">A sample of ${rows.length} checked questions (${TOPICS.map(t => `${count(r => r.topic === t)} ${t}`).join(', ')}). Each one was read once for how much work it needs (1–5), and a small fast model answered it twice with no working. Nothing a student sees has changed.</p>
<div class="box"><b>How a level is set.</b> Work 1–2 → Core, 3 → Exam, 4–5 → Challenge. If the test solver got it wrong both times, one step harder. A work-4 question it got right both times → Exam. Once 20 students have tried a question, their results take over: under 25% wrong Core, 25–55% Exam, over 55% Challenge.</div>
<h2>Per topic</h2>${levelTable}
<h2>Against the old labels</h2>${compTable}
<h2>What the test solver did</h2>${solveRow}
${sections}
<h2>Every question in the sample</h2>${all}
</main>
<script>
document.querySelectorAll('.md').forEach(function(el){var src=el.textContent;el.innerHTML=marked.parse(src);});
renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false}],throwOnError:false});
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, 'sample.html'), html);
  console.log('page', path.join(OUT, 'sample.html'));
  for (const t of TOPICS) console.log(t, LEVELS.map(l => `${l} ${count(r => r.topic === t && r.level === l)}`).join(' · '));
  console.log('old vs new', OLD.map(o => `${o}: ${LEVELS.map(l => count(r => oldOf(r) === o && r.level === l)).join('/')}`).join('  '));
})();
