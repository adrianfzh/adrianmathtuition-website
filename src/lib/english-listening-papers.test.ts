import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { blindMisses, blindPrompt, nextPaper, nextPaperId, paperOfPart, paperProblems, papersWanted, wantedWithinLimits, weakPaper, reviewFailures, reviewPrompt, REVIEW_ITEMS, sgUnlisted, sharedRuns, wordList, type ListeningPaper } from './english-listening-papers';
import { listeningProblems, publicListening, type ListeningSet } from './english-listening';
import { LISTENING_SETS } from './english-speaking-data';

// The pilot's four sets, dressed as a paper: Section A 6 + 7 + 9, Section B 8.
function pilotPaper(level: ListeningPaper['level'] = 'standard'): ListeningPaper {
  const parts = ['ls01', 'ls02', 'ls03', 'ls04'].map((id, i) => {
    const s = structuredClone(LISTENING_SETS.find(x => x.id === id)!) as ListeningSet;
    s.id = `lp001-${i + 1}`;
    return s;
  });
  // the pilot's conversation is between Priya and "Wei Jie" — a name the voice has not been taught
  for (const s of parts) {
    s.intro = s.intro.replace(/Wei Jie/g, 'Daniel');
    s.names = s.names && { ...s.names, ...(s.names.b === 'Wei Jie' ? { b: 'Daniel' } : {}) };
    for (const l of s.script) l.text = l.text.replace(/Wei Jie/g, 'Daniel');
    for (const q of s.questions) { q.text = q.text.replace(/Wei Jie/g, 'Daniel'); q.why = q.why.replace(/Wei Jie/g, 'Daniel'); }
  }
  return { id: 'lp001', level, parts };
}
const dict = fs.existsSync('/usr/share/dict/words') ? wordList(fs.readFileSync('/usr/share/dict/words', 'utf8')) : undefined;

describe('a whole paper', () => {
  it('the pilot, as a Standard paper, passes every check', () => {
    expect(paperProblems(pilotPaper(), { dict })).toEqual([]);
  });
  it('needs four parts, Section A 22 marks and Section B 8', () => {
    const p = pilotPaper();
    p.parts = p.parts.slice(0, 3);
    expect(paperProblems(p, { dict })).toContain('four parts: three in Section A, one in Section B');
  });
  it('a part is named after its paper', () => {
    const p = pilotPaper();
    p.parts[1].id = 'lp002-2';
    expect(paperProblems(p, { dict }).join('\n')).toMatch(/part 2: id is lp001-2/);
    expect(paperOfPart('lp001-4')).toBe('lp001');
    expect(paperOfPart('ls01')).toBeNull();
  });
  it('Easier has no traps; Harder has one a part and six in all', () => {
    const e = pilotPaper('easier');
    e.parts[1].questions[3].trap = 'boring';
    expect(paperProblems(e, { dict }).join('\n')).toMatch(/Easier says every answer plainly/);
    const h = pilotPaper('harder');
    expect(paperProblems(h, { dict }).join('\n')).toMatch(/change their mind at least once/);
    expect(paperProblems(h, { dict })).toContain('Harder has at least six traps in the paper');
  });
  it('a trap must be said, and is never an accepted answer', () => {
    const p = pilotPaper();
    p.parts[3].questions[0].trap = 'twelve';
    expect(listeningProblems(p.parts[3]).join('\n')).toMatch(/trap "twelve" is not said/);
    p.parts[3].questions[0].trap = 'ten';
    expect(listeningProblems(p.parts[3]).join('\n')).toMatch(/the trap is an accepted answer/);
    p.parts[3].questions[0].trap = 'eight';
    expect(listeningProblems(p.parts[3])).toEqual([]);
  });
  it('the page never gets a trap', () => {
    const p = pilotPaper();
    p.parts[3].questions[0].trap = 'eight';
    expect(JSON.stringify(publicListening(p.parts[3]))).not.toContain('trap');
  });
});

describe('Singapore words the voice has not been taught', () => {
  it('a listed place is fine; an unlisted one is flagged', () => {
    expect(sgUnlisted('We met at Tampines and walked to Bukit Timah.', dict)).toEqual([]);
    expect(sgUnlisted('We met at Sentosa after lunch.', dict)).toEqual(['Sentosa']);
  });
  it('flags a local food word in small letters unless it is listed', () => {
    expect(sgUnlisted('We had kaya toast and kopi.', dict)).toEqual([]);
    expect(sgUnlisted('We had chendol after the walk.', dict)).toEqual(['chendol']);
  });
  it('a name the voice says right, a short acronym and a sentence opener are fine', () => {
    expect(sgUnlisted('Then Priya took the MRT to Orchard Road. Finally, Mrs Tan said yes.', dict)).toEqual([]);
    expect(sgUnlisted("They're late. Don't worry. We'll wait. Wouldn't you?", dict)).toEqual([]);
  });
  it('a name not in either list is flagged', () => {
    expect(sgUnlisted('Priya called Wei Jie on Monday.', dict)).toEqual(['Jie', 'Wei']);
  });
});

describe('our own words', () => {
  it('finds an 8-word run shared with another paper', () => {
    const p = pilotPaper();
    const other = 'and then I said that it rains almost every afternoon then if it pours we go home';
    expect(sharedRuns(p, [other]).length).toBeGreaterThan(0);
    expect(sharedRuns(p, ['a completely different talk about birds and their nests in the trees'])).toEqual([]);
  });
});

describe('the blind reader', () => {
  it('the key itself agrees with the key', () => {
    const p = pilotPaper();
    const blind = Object.fromEntries(p.parts.map(s => [s.id, Object.fromEntries(s.questions.map(q => [q.n, q.type === 'fill' ? q.accept[0] : q.answer]))]));
    expect(blindMisses(p, blind)).toEqual([]);
    blind['lp001-2']['5'] = 'B';
    expect(blindMisses(p, blind)).toEqual(['lp001-2 Q5: blind reader said "B — $15", key "A — $12"']);
  });
  it('the reader is given no key, no reasons and no traps', () => {
    const p = pilotPaper();
    p.parts[3].questions[0].trap = 'eight';
    const prompt = blindPrompt(p);
    expect(prompt).toContain('WHAT IS SAID');
    expect(prompt).not.toContain(p.parts[1].questions[0].why);
    expect(prompt).not.toMatch(/trap/i);
  });
});

describe('which paper comes next', () => {
  it('the oldest one not started', () => {
    expect(nextPaper(['lp001', 'lp004', 'lp007'], new Set(['lp001']))).toBe('lp004');
    expect(nextPaper(['lp001'], new Set(['lp001']))).toBeNull();
  });
  it('keeps three ready, and makes one more when the keenest student has two left', () => {
    expect(papersWanted(0, [])).toBe(3);
    expect(papersWanted(2, [])).toBe(1);
    expect(papersWanted(5, [4, 3])).toBe(0);
    expect(papersWanted(5, [9, 2])).toBe(1);
    expect(papersWanted(5, [0])).toBe(1);
  });
  it('the month\'s cap, and one a day for the student who asked for it', () => {
    expect(wantedWithinLimits(3, { madeThisMonth: 29, keenestMadeToday: 0, byKeenest: false })).toBe(1);
    expect(wantedWithinLimits(1, { madeThisMonth: 4, keenestMadeToday: 1, byKeenest: true })).toBe(0);
    expect(wantedWithinLimits(1, { madeThisMonth: 4, keenestMadeToday: 0, byKeenest: true })).toBe(1);
  });
  it('numbers papers after every one used', () => {
    expect(nextPaperId([])).toBe('lp001');
    expect(nextPaperId(['lp001', 'lp009', 'lp003'])).toBe('lp010');
  });
});

describe('retiring a weak paper', () => {
  const q = (right: number, tries: number) => ({ right, tries });
  it('a question nearly everyone gets wrong', () => {
    expect(weakPaper({ level: 'standard', started: 10, finished: 9, parts: [{ id: 'lp001-2', tries: 10, perQuestion: { '1': q(9, 10), '5': q(1, 10) } }] })).toMatch(/lp001-2 Q5: 1 of 10 right/);
  });
  it('waits for enough tries', () => {
    expect(weakPaper({ level: 'standard', started: 3, finished: 1, parts: [{ id: 'lp001-2', tries: 3, perQuestion: { '5': q(0, 3) } }] })).toBeNull();
  });
  it('a Harder paper everyone gets fully right', () => {
    expect(weakPaper({ level: 'harder', started: 9, finished: 9, parts: [{ id: 'lp002-1', tries: 9, perQuestion: { '1': q(9, 9), '2': q(9, 9) } }] })).toMatch(/too easy/);
    expect(weakPaper({ level: 'standard', started: 9, finished: 9, parts: [{ id: 'lp002-1', tries: 9, perQuestion: { '1': q(9, 9), '2': q(9, 9) } }] })).toBeNull();
  });
  it('a paper students often leave halfway', () => {
    expect(weakPaper({ level: 'easier', started: 10, finished: 3, parts: [] })).toBe('7 of 10 students stopped halfway');
  });
});

describe('the reviewer', () => {
  it('keeps a paper only when every item passes', () => {
    const all = Object.fromEntries(REVIEW_ITEMS.map(i => [i.key, { pass: true, note: 'fine' }]));
    expect(reviewFailures({ items: all })).toEqual([]);
    expect(reviewFailures({ items: { ...all, 'one-answer': { pass: false, note: 'Q3 could be B or C' } } })).toEqual(['one-answer: Q3 could be B or C']);
    expect(reviewFailures({ items: { 'real-task': { pass: true } } })).toHaveLength(REVIEW_ITEMS.length - 1);
    expect(reviewFailures('nonsense')).toEqual(['the reviewer gave no checklist']);
  });
  it('is given the level, the key and the taught words', () => {
    const prompt = reviewPrompt(pilotPaper('harder'));
    expect(prompt).toContain('Level: HARDER');
    expect(prompt).toContain('"answer"');
    expect(prompt).toContain('Tampines');
  });
});
