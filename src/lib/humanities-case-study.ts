// What makes a Social Studies case study fit to list (SPEC-HUMANITIES.md §A1,
// 7 Oct 2026). Pure: the unit test runs it over every case study in the bank,
// and scripts/humanities-bench/check-set.ts runs it over a draft before it is
// added. It checks the SHAPE and that every quotation in a seeded answer is in
// the sources word for word — whether an answer sits at its level is the
// bench's job, not this file's.
import { levelsMax, SS_THEMES, type HumanitiesSet } from './humanities-questions';

const words = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);
/** Apostrophes inside words (resident's, don't) are not quotation marks. */
const plain = (t: string): string => t.replace(/[‘’]/g, "'").replace(/(\w)'(s|t|re|ve|d|ll|m)\b/g, '$1$2').replace(/\s+/g, ' ');

/** The single-quoted pieces of an answer. */
export function quotedPieces(answer: string): string[] {
  return [...plain(answer).matchAll(/'([^']+)'/g)].map(m => m[1].trim()).filter(Boolean);
}

const Q14_MARKS = [5, 6, 7];
const Q14_SKILLS = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose'];
// Never on a student page (CLAUDE.md): the tutor's name, a model's name.
const BANNED = /\b(adrian|claude|opus|sonnet|haiku|gemini|chatgpt|ai model)\b/i;

/** Every problem with one case study; an empty list = fit to list. */
export function caseStudyProblems(set: HumanitiesSet): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${set.id}: ${m}`);
  if (!/^s\d{2,}$/.test(set.id)) bad('id is not sNN');
  if (!set.theme || !SS_THEMES.includes(set.theme)) bad('theme missing or unknown');
  if (!set.title || words(set.title) > 9) bad('title missing or over 9 words');
  if (!set.issue?.trim().endsWith('?')) bad('issue is not a question');
  const bg = set.background ?? '';
  if (words(bg) < 50 || words(bg) > 160) bad(`background is ${words(bg)} words (50–160)`);
  if (!/study the sources/i.test(bg)) bad('background does not end with the "Study the sources to find out …" line');

  const letters = 'ABCDEF'.slice(0, set.sources.length).split('');
  if (set.sources.length < 5 || set.sources.length > 6) bad(`${set.sources.length} sources (5 or 6)`);
  if (set.sources.map(s => s.id).join('') !== letters.join('')) bad('sources are not lettered A, B, C … in order');
  for (const s of set.sources) {
    if (words(s.provenance) < 5) bad(`Source ${s.id}: provenance too thin`);
    if (words(s.text) < 25 || words(s.text) > 130) bad(`Source ${s.id}: ${words(s.text)} words (25–130)`);
    if (/['‘’"“”]/.test(plain(s.text))) bad(`Source ${s.id}: has quotation marks inside it — a seeded answer cannot quote it cleanly`);
  }

  const qs = set.questions;
  if (qs.length !== 5) { bad(`${qs.length} questions (5)`); return out; }
  qs.forEach((q, i) => { if (q.id !== `${set.id}-q${i + 1}`) bad(`question ${i + 1} id is ${q.id}`); });
  const last = qs[4];
  if (last.skill !== 'how_far' || last.marks !== 10) bad('question 5 is not the 10-mark "how far" question');
  if (last.sources.join('') !== letters.join('')) bad('question 5 does not use every source');
  if (!/^['‘].+['’]\s/.test(last.question)) bad('question 5 does not open with the statement in quotation marks');
  const first4 = qs.slice(0, 4);
  if (first4.reduce((n, q) => n + (q.marks ?? 0), 0) !== 25) bad('questions 1–4 do not add up to 25 marks');
  for (const q of first4) {
    if (!Q14_SKILLS.includes(q.skill)) bad(`${q.id}: skill ${q.skill} is not a question 1–4 skill`);
    if (!Q14_MARKS.includes(q.marks ?? 0)) bad(`${q.id}: ${q.marks} marks (5, 6 or 7)`);
    if (q.skill === 'comparison' && q.sources.length !== 2) bad(`${q.id}: a comparison names two sources`);
    // "Does Source D prove Source C wrong?" is a reliability question that names two.
    if (q.skill === 'reliability' && q.sources.length > 2) bad(`${q.id}: names ${q.sources.length} sources (1 or 2)`);
    if (q.skill !== 'comparison' && q.skill !== 'reliability' && q.sources.length !== 1) bad(`${q.id}: names ${q.sources.length} sources (1)`);
  }
  if (new Set(first4.map(q => q.skill)).size < 3) bad('questions 1–4 test fewer than three skills');
  const named = new Set(first4.flatMap(q => q.sources));
  if (set.sources.filter(s => !named.has(s.id)).length > 1) bad('more than one source is named by no question 1–4');

  const hay = plain(set.sources.map(s => `${s.provenance} ${s.text}`).join(' '));
  for (const q of qs) {
    for (const id of q.sources) if (!letters.includes(id)) bad(`${q.id}: names Source ${id}, which the set does not have`);
    if (!q.question.trim().endsWith('.') && !q.question.trim().endsWith('?')) bad(`${q.id}: the question has no full stop`);
    const max = levelsMax(q.skill);
    const levels = (q.seeded ?? []).map(s => s.level).sort();
    if (levels.join() !== Array.from({ length: max }, (_, i) => i + 1).join()) { bad(`${q.id}: seeded answers at levels ${levels.join()} (need 1–${max})`); continue; }
    let before = 0;
    for (const s of [...q.seeded!].sort((a, b) => a.level - b.level)) {
      const where = `${q.id} L${s.level}`;
      if (words(s.text) > 330) bad(`${where}: ${words(s.text)} words (330 at most)`);
      if (words(s.text) <= before && s.level > 2) bad(`${where}: no longer than the level below`);
      before = words(s.text);
      for (const piece of quotedPieces(s.text)) if (!hay.includes(piece)) bad(`${where}: quotes '${piece}', which is not in the sources`);
      if (s.level >= (q.skill === 'inference' ? 3 : 2) && quotedPieces(s.text).length === 0) bad(`${where}: no quotation`);
    }
  }
  const everything = JSON.stringify(set);
  if (BANNED.test(everything)) bad('names the tutor or a model');
  if (/[—]/.test(set.sources.map(s => s.text).join(' '))) bad('a source uses a long dash — write it the way a person would');
  return out;
}
