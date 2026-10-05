// 🎚 Practice difficulty — the FULL estimate set (5 Oct 2026): every CHECKED, servable science
// MCQ in the open topics (SCIENCE_PRACTICE_OPEN_TOPICS = the pure pools,
// SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS = the Combined Science pools) → out/all.json.
// Rows flagged as broken (SKIP) are left out until fixed. Read-only.
//   npx tsx scripts/practice-difficulty/draw-all.mts
import dotenv from 'dotenv'; import fs from 'fs'; import path from 'path';
const env = dotenv.parse(fs.readFileSync('.env.local')); for (const k of Object.keys(env)) process.env[k] = env[k].trim();
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
// Flagged 5 Oct 2026 by the sample read: solution contradicts the key / empty solutions / a stem slip.
export const SKIP_PREFIXES = ['6dfbaa74', 'c3abf1b3', 'dad0ddc0'];
const SKIP_TEXT = [/Winkler method/i];
const COLS = 'id, subject, level, school, practice_hidden, practice_checked_at, question_text, parts, answer, solution, solution_images, topics, difficulty, total_marks, has_image, image_url, images, quarantined, ai_generated, verified, image_watermark_status, not_in_syllabus';

(async () => {
  const { SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS } = await import('../../src/lib/portal-beta');
  const { getScienceClient, scienceEligible, toPayload } = await import('../../src/lib/science-bank');
  const { mcqKey, sciencePoolLevels } = await import('../../src/lib/science-levels');
  const sb = getScienceClient();
  const seen = new Set<string>(); const out: any[] = []; const skipped: string[] = [];
  for (const [combined, lists] of [[false, SCIENCE_PRACTICE_OPEN_TOPICS], [true, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS]] as const) {
    for (const [levelKey, topics] of Object.entries(lists)) {
      const levels = sciencePoolLevels(levelKey, combined);
      for (const topic of topics) {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('questions').select(COLS).in('level', levels).contains('topics', [topic]).not('practice_checked_at', 'is', null).range(from, from + 999);
          if (error) throw error; rows.push(...(data || [])); if (!data || data.length < 1000) break;
        }
        const ok = rows.filter(q => mcqKey(q.answer) && scienceEligible(q, { checkedOnly: true, levelKey, combined }));
        let n = 0;
        for (const q of ok) {
          if (SKIP_PREFIXES.some(p => q.id.startsWith(p)) || SKIP_TEXT.some(r => r.test(q.question_text || ''))) { skipped.push(q.id); continue; }
          if (seen.has(q.id)) continue; seen.add(q.id); n++;
          const pay = toPayload(q);
          out.push({ id: q.id, levelKey, combined, topic, subject: q.subject, oldLabel: q.difficulty || 'Standard', key: mcqKey(q.answer), markdown: pay.markdown, solution: q.solution, hasImage: !!q.has_image });
        }
        console.log(`${combined ? 'CS ' : ''}${levelKey} ${topic}: ${ok.length} checked servable → ${n} new`);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(out, null, 1));
  console.log('total', out.length, 'skipped', [...new Set(skipped)].length);
})();
