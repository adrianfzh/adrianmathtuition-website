// 🎚 Practice difficulty — step 1 of the SAMPLE (5 Oct 2026): draw a spread of checked,
// servable science MCQs per topic (old Standard / Advanced both represented) into
// out/sample.json for the work-score read and the test solve. Read-only.
//   npx tsx scripts/practice-difficulty/sample.mts
import dotenv from 'dotenv'; import fs from 'fs'; import path from 'path';
const env = dotenv.parse(fs.readFileSync('.env.local')); for (const k of Object.keys(env)) process.env[k] = env[k].trim();
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });

const PLAN = [
  { levelKey: 'CHEM', topic: 'Chemical Calculations', n: 40, advanced: 12 },
  { levelKey: 'PHY', topic: 'Kinematics', n: 30, advanced: 2 },
  { levelKey: 'BIO', topic: 'Nutrition in Humans', n: 20, advanced: 3 },
];
const COLS = 'id, subject, level, school, practice_hidden, practice_checked_at, question_text, parts, answer, solution, solution_images, topics, difficulty, total_marks, has_image, image_url, images, quarantined, ai_generated, verified, image_watermark_status, not_in_syllabus, skill';

// deterministic shuffle so a rerun draws the same sample
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
function shuffle<T>(a: T[], r: () => number): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

(async () => {
  const { getScienceClient, scienceEligible, toPayload } = await import('../../src/lib/science-bank');
  const { mcqKey, sciencePoolLevels } = await import('../../src/lib/science-levels');
  const sb = getScienceClient();
  const out: unknown[] = [];
  for (const p of PLAN) {
    const levels = sciencePoolLevels(p.levelKey, false);
    const { data, error } = await sb.from('questions').select(COLS).in('level', levels).contains('topics', [p.topic]).not('practice_checked_at', 'is', null).limit(1000);
    if (error) throw error;
    const ok = (data || []).filter((q: any) => mcqKey(q.answer) && scienceEligible(q, { checkedOnly: true, levelKey: p.levelKey }));
    const adv = ok.filter((q: any) => ['Advanced', 'Challenging'].includes(q.difficulty));
    const std = ok.filter((q: any) => !['Advanced', 'Challenging'].includes(q.difficulty));
    const r = rng(20261005);
    const pick = [...shuffle(adv, r).slice(0, p.advanced), ...shuffle(std, r).slice(0, p.n - Math.min(p.advanced, adv.length))];
    console.log(`${p.topic}: eligible ${ok.length} (adv ${adv.length}) → sample ${pick.length}`);
    for (const q of pick as any[]) {
      const pay = toPayload(q);
      out.push({ id: q.id, levelKey: p.levelKey, topic: p.topic, subject: q.subject, oldLabel: q.difficulty || 'Standard', skill: q.skill ?? null, key: mcqKey(q.answer), markdown: pay.markdown, questionText: q.question_text, solution: q.solution, hasImage: !!q.has_image });
    }
  }
  fs.writeFileSync(path.join(OUT, 'sample.json'), JSON.stringify(out, null, 1));
  console.log('wrote', out.length);
})();
