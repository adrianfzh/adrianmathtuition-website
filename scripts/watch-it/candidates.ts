// ▶ Watch it — step 1: pull the questions a clip could be written for.
//
//   npx tsx scripts/watch-it/candidates.ts            → scripts/watch-it/work/source.json + batches
//
// The same pool a student practises from (lib/science-bank eligible + the
// practice check, MCQ only) for the two first topics, then a CHEAP rule drops
// what a clip cannot add to: a solution with no arithmetic in it (recall, a
// statement question). The agents make the final call per question (a spec or
// a skip with the reason) — this only saves them reading the obvious ones.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scienceImageBase, withScienceImageUrls } from '../../src/lib/science-images';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const ROOT = path.resolve(__dirname, '../..');
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.local')));
const URL = String(env.SUPABASE_URL_SCIENCE).trim();
const KEY = String(env.SUPABASE_SERVICE_KEY_SCIENCE).trim();
const WORK = path.join(__dirname, 'work');
const MCQ = '^\\s*([A-Da-d]\\s*$|[*][*][(]?[A-D][)]?[*][*])';

export const TOPICS: Record<string, { file: string; subject: string }> = {
  Kinematics: { file: 'kinematics', subject: 'physics' },
  'Chemical Calculations': { file: 'chemical-calculations', subject: 'chemistry' },
};

/** Arithmetic in the solution: at least `n` "= number" results. */
const computations = (s: string) => (s.match(/=\s*\$?\s*-?\d/g) ?? []).length + (s.match(/\d\s*(?:\\times|×|x|\/|÷)\s*\d/g) ?? []).length;

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const source: Record<string, unknown> = {};
  for (const [topic, meta] of Object.entries(TOPICS)) {
    const rows: Record<string, unknown>[] = [];
    for (let off = 0; ; off += 1000) {
      const q = `${URL}/rest/v1/questions?select=id,subject,level,school,practice_hidden,practice_checked_at,question_text,answer,solution,topics,has_image,image_url,images,image_watermark_status,quarantined,ai_generated,verified,not_in_syllabus`
        + `&subject=eq.${meta.subject}&topics=cs.${encodeURIComponent(`{"${topic}"}`)}&answer=match.${encodeURIComponent(MCQ)}&order=id&offset=${off}&limit=1000`;
      const r = await fetch(q, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
      rows.push(...j);
      if (j.length < 1000) break;
    }
    const base = scienceImageBase(URL);
    const pool = rows.filter(q => !q.quarantined && q.not_in_syllabus !== true && String(q.school ?? '').toUpperCase() !== 'GCE'
      && q.practice_hidden !== true && q.practice_checked_at && !(q.ai_generated && !q.verified)
      && !(q.has_image && q.image_watermark_status !== 'clean') && String(q.question_text ?? '').trim());
    const cands = pool.filter(q => computations(String(q.solution ?? '')) >= (topic === 'Kinematics' ? 1 : 2));
    console.log(`${topic}: ${rows.length} MCQ rows, ${pool.length} in the practice pool, ${cands.length} candidates`);
    const slim = cands.map(q => {
      const w = withScienceImageUrls(q, base) as Record<string, unknown>;
      return { id: q.id, topic, level: q.level, answer: q.answer, question_text: q.question_text, solution: q.solution, image: q.has_image ? (w.image_url ?? null) : null };
    });
    for (const q of slim) source[q.id as string] = q;
    // batches of 30 for the authoring agents
    for (let i = 0, b = 0; i < slim.length; i += 30, b++) {
      fs.writeFileSync(path.join(WORK, `${meta.file}-batch${String(b).padStart(2, '0')}.json`), JSON.stringify(slim.slice(i, i + 30), null, 1));
    }
    fs.writeFileSync(path.join(WORK, `${meta.file}-pool.json`), JSON.stringify({ pool: pool.length, candidates: cands.length }));
  }
  fs.writeFileSync(path.join(WORK, 'source.json'), JSON.stringify(source));
}
main().catch(e => { console.error(e); process.exit(1); });
