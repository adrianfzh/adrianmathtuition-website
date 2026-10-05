// 🎚 Practice difficulty — write the ESTIMATE (5 Oct 2026): work scores (out/work-*.json, Opus
// on the plan) + test solves (out/ts-NN-a|b.json, two model "haiku" Agent spawns on the plan;
// the sample's 86 from out/test-solve.json, the API run of the sample — two tries, letter only;
// the rest ONE try by a plan-billed haiku Agent with brief working, out/solve.json) → lib/practice-difficulty estimateLevel → the
// science project's practice_difficulty, source 'estimate'. Never over a 'results' row; a
// question a reader flagged as broken gets no level (it stays in Mixed only).
//   npx tsx scripts/practice-difficulty/combine.mts [--dry]
import dotenv from 'dotenv'; import fs from 'fs'; import path from 'path';
const env = dotenv.parse(fs.readFileSync('.env.local')); for (const k of Object.keys(env)) process.env[k] = env[k].trim();
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));

(async () => {
  const { estimateLevel, testSolveOf } = await import('../../src/lib/practice-difficulty');
  const { getScienceClient } = await import('../../src/lib/science-bank');
  const all: any[] = read('all.json');
  const files = fs.readdirSync(OUT);
  const work = new Map<string, any>();
  for (const f of files.filter(f => /^work-(wb-\d+|CHEM|PHY|BIO)\.json$/.test(f))) for (const w of read(f)) work.set(w.id, w);
  const letters = new Map<string, (string | null)[]>();
  for (const r of read('test-solve.json').results) letters.set(r.id, r.letters);
  // the plan test solve: out/solve.json { <first 8 of id>: { <agent>: letter } } (scratchpad collect.sh)
  if (files.includes('solve.json')) {
    const byRef = new Map(all.map(q => [String(q.id).slice(0, 8), q.id]));
    for (const [ref, v] of Object.entries(read('solve.json') as Record<string, Record<string, string>>)) {
      const id = byRef.get(ref); if (!id || letters.has(id)) continue;
      letters.set(id, Object.values(v));
    }
  }
  const sb = getScienceClient();
  const results = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('practice_difficulty').select('question_id').eq('source', 'results').range(from, from + 999);
    if (error) throw error; for (const r of data ?? []) results.add(r.question_id); if (!data || data.length < 1000) break;
  }
  const rows: any[] = []; const missing = { work: 0, solve: 0 }; const broken: string[] = [];
  const tally: Record<string, Record<string, number>> = {};
  for (const q of all) {
    const w = work.get(q.id); const ls = (letters.get(q.id) ?? []).slice(0, 2);
    if (!w) { missing.work++; continue; }
    if (!ls.length) missing.solve++;
    if (w.broken) { broken.push(`${q.id} (${w.broken})`); continue; }
    if (results.has(q.id)) continue;
    const ts = testSolveOf(ls.map(L => (L ? L === q.key : null)));
    const level = estimateLevel(w.work, ts);
    const solveWords = ts === 'wrong' ? 'the test solver got it wrong both times' : ts === 'split' ? 'the test solver got it right once in two' : ts === 'right' ? 'the test solver got it right' : 'no test solve';
    const reason = `${String(w.reason).replace(/\.$/, '')}; ${solveWords}`;
    rows.push({ question_id: q.id, level, source: 'estimate', attempts: 0, wrong: 0, wrong_share: null, work_score: w.work, test_solve: ts, reason: reason.charAt(0).toUpperCase() + reason.slice(1),
      detail: { steps: w.steps, ideas: w.ideas, traps: w.traps, letters: ls, oldLabel: q.oldLabel, estimated: '2026-10-05' }, updated_at: new Date().toISOString() });
    const k = `${q.combined ? 'CS ' : ''}${q.levelKey} ${q.topic}`;
    tally[k] = tally[k] ?? { core: 0, exam: 0, challenge: 0 }; tally[k][level]++;
  }
  console.log('rows', rows.length, 'missing', missing, 'broken', broken.length, 'results kept', results.size);
  for (const [k, v] of Object.entries(tally)) console.log(`${k}: Core ${v.core} · Exam ${v.exam} · Challenge ${v.challenge}`);
  if (broken.length) console.log('broken:\n ' + broken.join('\n '));
  if (process.argv.includes('--dry')) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('practice_difficulty').upsert(rows.slice(i, i + 500), { onConflict: 'question_id' });
    if (error) throw error;
  }
  console.log('written', rows.length);
})();
