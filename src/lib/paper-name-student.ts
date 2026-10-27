// Whose paper is this? — read from the NAME Adrian gave it, at upload (27 Oct 2026).
//
// Adrian, 27 Oct 2026, asked whether his own uploads should go to the student
// by themselves whenever the paper name has their name in it: "yes set it up".
// Four of his papers that weekend ("kiara am tys 2023 p1", "lakshanya h2 math
// tys 2023 p1", …) were tagged by the 5-minute auto-tag sweep a minute BEFORE
// marking finished, but the marker had read the run while it was still
// untagged, so nothing released them. Tagging at upload removes the race.
//
// The rule (pure, tested):
//   1. the existing title rule first (lib/auto-tag.ts decideByName — the name
//      in front of the subject code, "gavin woon am tys 2024 p1"): one student
//      → that student; a name two students share → nobody (never a guess);
//   2. otherwise the name ANYWHERE in the title, as a whole word ("h2 tys
//      2023 p1 lakshanya"): the words of the title that are words of a roster
//      name, and exactly one student whose name holds ALL of them. "ian" never
//      matches inside "kian"; maths and exam words ("tan", "set", "paper") are
//      never read as names.
// Anything else → no student; the desk asks "who is this for?".
import { decideByName } from './auto-tag';
import type { RosterStudent } from './scan-inbox';

export type PaperNameMatch =
  | { kind: 'tag'; student: RosterStudent }
  | { kind: 'ask'; reason: 'ambiguous' | 'none'; candidates: RosterStudent[] };

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Words in a paper's title that are never a student's name, even when a roster name holds them. */
const NOT_A_NAME = new Set([
  // subjects + levels
  'math', 'maths', 'mathematics', 'amath', 'emath', 'add', 'additional', 'elementary', 'pure', 'physics', 'chemistry',
  'biology', 'science', 'combined', 'english', 'chinese', 'sec', 'jc1', 'jc2',
  // paper kinds
  'tys', 'gce', 'prelim', 'prelims', 'mock', 'mocks', 'practice', 'paper', 'papers', 'set', 'sets', 'specimen',
  'test', 'tests', 'quiz', 'worksheet', 'revision', 'topical', 'chapter', 'exam', 'exams', 'mye', 'eoy', 'promo',
  'promos', 'block', 'common', 'final', 'finals', 'again', 'question', 'questions', 'answers', 'mark', 'marked',
  'school', 'level', 'olevel', 'alevel', 'section', 'part', 'mid', 'year', 'end', 'term', 'the', 'and', 'for', 'with',
  // maths words that are also surnames or names
  'tan', 'sin', 'cos', 'log', 'logs', 'min', 'max', 'sum', 'mean', 'mode', 'range', 'area', 'rate', 'ratio', 'graph',
  'graphs', 'sets', 'set', 'vector', 'vectors', 'circle', 'circles', 'angle', 'angles', 'probability', 'statistics',
]);

const nameWords = (s: string) => norm(s).split(' ').filter(w => w.length >= 3 && /^[a-z]+$/.test(w) && !NOT_A_NAME.has(w));

export function studentFromPaperName(paperName: string | null | undefined, roster: RosterStudent[]): PaperNameMatch {
  const title = String(paperName || '').trim();
  if (!title || !roster.length) return { kind: 'ask', reason: 'none', candidates: [] };

  const byTitle = decideByName(title, roster);
  if (byTitle.kind === 'tag') return { kind: 'tag', student: byTitle.student };
  // The name in front of the subject code fits two students: the rest of the
  // title must not be allowed to pick one of them by accident.
  if (byTitle.kind === 'cover' && byTitle.reason === 'ambiguous') {
    return { kind: 'ask', reason: 'ambiguous', candidates: byTitle.candidates };
  }

  const rows = roster.map(r => ({ r, words: new Set(nameWords(r.name)) }));
  const titleWords = [...new Set(nameWords(title))];
  const hits = titleWords.filter(w => rows.some(x => x.words.has(w)));
  if (!hits.length) return { kind: 'ask', reason: 'none', candidates: [] };
  const holders = rows.filter(x => hits.every(w => x.words.has(w))).map(x => x.r);
  if (holders.length === 1) return { kind: 'tag', student: holders[0] };
  const anyHit = rows.filter(x => hits.some(w => x.words.has(w))).map(x => x.r);
  return { kind: 'ask', reason: 'ambiguous', candidates: holders.length ? holders : anyHit };
}
