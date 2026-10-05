// 🎚 What a student would see: per open topic (pure + Combined pools), servable questions at each
// level (practice_difficulty, results or estimate) and the levels the choice offers (≥ 30).
//   npx tsx scripts/practice-difficulty/level-report.mts
import dotenv from 'dotenv'; import fs from 'fs';
const env = dotenv.parse(fs.readFileSync('.env.local')); for (const k of Object.keys(env)) process.env[k] = env[k].trim();
(async () => {
  const { SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS } = await import('../../src/lib/portal-beta');
  const { scienceLevelCounts } = await import('../../src/lib/science-bank');
  const { levelsOffered } = await import('../../src/lib/science-practice');
  for (const [combined, lists] of [[false, SCIENCE_PRACTICE_OPEN_TOPICS], [true, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS]] as const)
    for (const [lvl, topics] of Object.entries(lists)) for (const t of topics) {
      const c = await scienceLevelCounts(lvl, t, { combined, checkedOnly: true });
      const off = levelsOffered(c);
      console.log(`${combined ? 'Combined ' : ''}${lvl} | ${t} | Core ${c.core} · Exam ${c.exam} · Challenge ${c.challenge} | offered: ${off.length ? off.join(', ') + ' + Mixed' : 'Mixed only'}`);
    }
})();
