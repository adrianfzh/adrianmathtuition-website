import { describe, it, expect } from 'vitest';
import {
  normaliseDiagnosis, readDiagnosis, themesFromDiagnosis, questionLabel, MAX_SKILLS,
  type Diagnosis,
} from './sheet-diagnosis';
import { analyse, type LostPart } from './paper-analysis';
import { chooseThemes } from './front-page-html';

// What the worker sends in the `done` payload, in the sheet's order.
const WORKER = [
  { title: 'Master Finding Area Using Integration', marks: 6, questions: ['Q11(a)', 'Q20'], why: 'Area under a curve is $\\int y\\,dx$, not the shoelace on two points.', tier: 'teach' },
  { title: 'Carrying A Constant Through A Derivative', marks: 4, questions: ['Q7'], why: 'The 2.4 in $2.4V^{-1}$ survives differentiation.', tier: 'teach' },
  { title: 'Sign Slip When Dividing By A Negative', marks: 2, questions: ['Q3'], why: 'Both terms flip, not just the first.', tier: 'show' },
  { title: 'Trigonometric Identities', marks: 3, questions: ['Q15(b)'], why: 'Worth a look if you have time.', tier: 'optional' },
];
const CTX = { sheetJobId: 'job-1', at: '2026-09-02T09:00:00.000Z' };

describe('normaliseDiagnosis — accepts', () => {
  it('a well-formed worker array, stamped with the job and time', () => {
    const d = normaliseDiagnosis(WORKER, CTX)!;
    expect(d).toBeTruthy();
    expect(d.sheetJobId).toBe('job-1');
    expect(d.at).toBe(CTX.at);
    expect(d.skills.map(s => s.title)).toEqual(WORKER.map(s => s.title));
    expect(d.skills[0]).toEqual({
      title: 'Master Finding Area Using Integration', marks: 6, questions: ['Q11(a)', 'Q20'],
      why: 'Area under a curve is $\\int y\\,dx$, not the shoelace on two points.', tier: 'teach',
    });
  });

  it('the stored { at, sheetJobId, skills } object, keeping its own stamp', () => {
    const stored = normaliseDiagnosis(WORKER, CTX)!;
    const again = normaliseDiagnosis(stored)!;
    expect(again).toEqual(stored);
  });

  it('numeric strings for marks — curl payloads are hand-typed', () => {
    const d = normaliseDiagnosis([{ title: 'A', marks: '5', questions: [], why: '', tier: 'teach' }], CTX)!;
    expect(d.skills[0].marks).toBe(5);
  });

  it('an unknown or missing tier as the core (teach)', () => {
    const d = normaliseDiagnosis([
      { title: 'A', marks: 1, questions: [], why: '' },
      { title: 'B', marks: 1, questions: [], why: '', tier: 'drill' },
    ], CTX)!;
    expect(d.skills.map(s => s.tier)).toEqual(['teach', 'teach']);
  });

  it('tidies question labels to the form the cover matches on', () => {
    expect(questionLabel('11(a)')).toBe('Q11(a)');
    expect(questionLabel('q20')).toBe('Q20');
    expect(questionLabel(' Q 7 ')).toBe('Q7');
    expect(questionLabel('(b)')).toBe('(b)');       // no digit — left as written
    expect(questionLabel('')).toBe('');
    const d = normaliseDiagnosis([{ title: 'A', marks: 1, questions: ['11(a)', '', null, 'q20'], why: '', tier: 'teach' }], CTX)!;
    expect(d.skills[0].questions).toEqual(['Q11(a)', 'Q20']);
  });
});

describe('normaliseDiagnosis — rejects', () => {
  it('nothing usable at all', () => {
    expect(normaliseDiagnosis(undefined, CTX)).toBeNull();
    expect(normaliseDiagnosis(null, CTX)).toBeNull();
    expect(normaliseDiagnosis('six marks on area', CTX)).toBeNull();
    expect(normaliseDiagnosis({ wave: ['area'] }, CTX)).toBeNull();
    expect(normaliseDiagnosis([], CTX)).toBeNull();
    expect(normaliseDiagnosis({ skills: [] }, CTX)).toBeNull();
  });

  it('a skill with no title or no numeric marks — and only that skill', () => {
    const d = normaliseDiagnosis([
      { title: '', marks: 3, questions: ['Q1'], why: 'x', tier: 'teach' },
      { title: 'No marks', questions: ['Q2'], why: 'x', tier: 'teach' },
      { title: 'Null marks', marks: null, questions: ['Q2'], why: 'x', tier: 'teach' },
      { title: 'Negative', marks: -1, questions: ['Q2'], why: 'x', tier: 'teach' },
      { title: 'Kept', marks: 2, questions: ['Q3'], why: 'x', tier: 'teach' },
      'not an object',
    ], CTX)!;
    expect(d.skills.map(s => s.title)).toEqual(['Kept']);
    expect(normaliseDiagnosis([{ title: '', marks: 3 }], CTX)).toBeNull();
  });

  it('caps the count and the lengths', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `S${i}`, marks: 1, questions: [], why: '', tier: 'teach' }));
    expect(normaliseDiagnosis(many, CTX)!.skills.length).toBe(MAX_SKILLS);
    const d = normaliseDiagnosis([{ title: 'x'.repeat(500), marks: 9999, questions: [], why: 'y'.repeat(1000), tier: 'teach' }], CTX)!;
    expect(d.skills[0].title.length).toBe(120);
    expect(d.skills[0].why.length).toBe(300);
    expect(d.skills[0].marks).toBe(200);
  });
});

describe('order — the sheet’s, with Optional at the back', () => {
  it('keeps the sheet order and moves an optional skill that came early to the end', () => {
    const d = normaliseDiagnosis([WORKER[3], WORKER[0], WORKER[2], WORKER[1]], CTX)!;
    expect(d.skills.map(s => s.title)).toEqual([WORKER[0].title, WORKER[2].title, WORKER[1].title, WORKER[3].title]);
  });
});

describe('readDiagnosis', () => {
  it('reads the stored object off result_json and nothing else', () => {
    const stored = normaliseDiagnosis(WORKER, CTX)!;
    expect(readDiagnosis({ results: [], diagnosis: stored })).toEqual(stored);
  });

  it('is null when absent or junk — the caller falls back to the classifier', () => {
    expect(readDiagnosis(undefined)).toBeNull();
    expect(readDiagnosis(null)).toBeNull();
    expect(readDiagnosis({ results: [] })).toBeNull();
    expect(readDiagnosis({ diagnosis: 'yes' })).toBeNull();
    expect(readDiagnosis({ diagnosis: { skills: 'nope' } })).toBeNull();
    expect(readDiagnosis({ diagnosis: { skills: [{ title: '' }] } })).toBeNull();
  });
});

describe('themesFromDiagnosis — the cover built from the sheet', () => {
  const d = normaliseDiagnosis(WORKER, CTX) as Diagnosis;

  it('one theme per skill, in the sheet’s order, single-paper fields', () => {
    const themes = themesFromDiagnosis(d, 'AM 2021 P1');
    expect(themes.map(t => t.title)).toEqual(WORKER.map(s => s.title));
    for (const t of themes) {
      expect(t.papers).toBe(1);
      expect(t.live).toBe(true);
      expect(t.latestMarks).toBe(t.marks);
    }
    expect(themes[0].marks).toBe(6);
    expect(themes[0].examples).toEqual([{ paperName: 'AM 2021 P1', question: 'Q11(a)', why: WORKER[0].why }]);
    expect(themes[0].questions).toEqual(['Q11(a)', 'Q20']);
    expect(themes.map(t => t.tier)).toEqual(['teach', 'teach', 'show', 'optional']);
  });

  it('a skill with no questions still carries its note as the evidence line', () => {
    const one = normaliseDiagnosis([{ title: 'Leaving Parts Blank', marks: 9, questions: [], why: 'Write the first move.', tier: 'teach' }], CTX)!;
    expect(themesFromDiagnosis(one)[0].examples).toEqual([{ paperName: 'this paper', question: '', why: 'Write the first move.' }]);
  });

  it('show-tier skills never take a top-three slot from something to learn', () => {
    const top = chooseThemes(themesFromDiagnosis(d));
    expect(top.map(t => t.tier)).toEqual(['teach', 'teach', 'optional']);
    expect(top.find(t => t.tier === 'show')).toBeUndefined();
  });

  it('…unless the sheet has nothing else', () => {
    const slipsOnly = normaliseDiagnosis([WORKER[2]], CTX)!;
    const top = chooseThemes(themesFromDiagnosis(slipsOnly));
    expect(top.map(t => t.title)).toEqual([WORKER[2].title]);
  });

  it('optional comes last even when it cost more than a core skill', () => {
    const dd = normaliseDiagnosis([
      { title: 'Optional Big', marks: 8, questions: ['Q1'], why: 'x', tier: 'optional' },
      { title: 'Core Small', marks: 1, questions: ['Q2'], why: 'x', tier: 'teach' },
    ], CTX)!;
    expect(chooseThemes(themesFromDiagnosis(dd)).map(t => t.title)).toEqual(['Core Small', 'Optional Big']);
  });
});

describe('fallback — no diagnosis means the keyword classifier, exactly as before', () => {
  const part = (over: Partial<LostPart> = {}): LostPart => ({
    paperId: 'run-1', paperName: 'p', createdAt: '2026-09-01', question: '5', label: '(a)',
    lost: 3, max: 3, blank: false, why: 'Volume of a half cylinder is ½πr²h', ...over,
  });
  const pick = (resultJson: unknown, parts: LostPart[]) => {
    const d = readDiagnosis(resultJson);
    return d ? themesFromDiagnosis(d) : analyse(parts, 'run-1');
  };

  it('uses the classifier when the run carries no diagnosis', () => {
    const themes = pick({ results: [] }, [part()]);
    expect(themes[0].key).toBe('shape');
    expect(themes[0].tier).toBeUndefined();
  });

  it('uses the sheet when it does — even though the classifier would have said something else', () => {
    const stored = normaliseDiagnosis(WORKER, CTX)!;
    const themes = pick({ results: [], diagnosis: stored }, [part()]);
    expect(themes[0].title).toBe(WORKER[0].title);
    expect(themes[0].key).toBe('sheet-1');
  });
});
