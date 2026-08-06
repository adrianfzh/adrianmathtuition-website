import { describe, expect, it } from 'vitest';
import {
  approvedSections,
  countByKind,
  groupIntoSections,
  hasApprovedUnits,
  leadToBullets,
  readingMinutes,
  sanitiseFigure,
  simplifyTitle,
  stripKindPrefix,
  toUnit,
  unitFigures,
  wrongIndex,
  type NotesUnit,
  type UnitRow,
} from './notes-units';
import type { AutopsyPayload } from './learn-types';

const row = (over: Partial<UnitRow> = {}): UnitRow => ({
  id: 'u1',
  topic: 'Binomial Theorem',
  kind: 'core',
  title: 'The general term',
  unit_order: 112.01,
  status: 'approved',
  payload: { summary_md: 'x' },
  ...over,
});

const unit = (order: number, over: Partial<NotesUnit> = {}): NotesUnit => ({
  id: `u${order}`,
  kind: 'core',
  title: `Unit ${order}`,
  question: null,
  order,
  draft: false,
  flagged: false,
  reviewNote: null,
  payload: {},
  ...over,
});

describe('toUnit', () => {
  it('shapes a row', () => {
    expect(toUnit(row())).toEqual({
      id: 'u1',
      kind: 'core',
      title: 'The general term',
      question: null,
      order: 112.01,
      draft: false,
      flagged: false,
      reviewNote: null,
      payload: { summary_md: 'x' },
    });
  });

  it("reads Adrian's review note out of the payload", () => {
    expect(
      toUnit(row({ payload: { review_note: 'tip on step 2 is wrong' } }))?.reviewNote,
    ).toBe('tip on step 2 is wrong');
    expect(toUnit(row({ payload: { review_note: '  ' } }))?.reviewNote).toBeNull();
  });

  it('flags anything not approved as a draft', () => {
    expect(toUnit(row({ status: 'pending' }))?.draft).toBe(true);
    expect(toUnit(row({ status: null }))?.draft).toBe(true);
  });

  it('marks a rejected row as flagged (and still draft)', () => {
    const u = toUnit(row({ status: 'rejected' }));
    expect(u?.flagged).toBe(true);
    expect(u?.draft).toBe(true);
  });

  it('reads a question-form title out of the payload', () => {
    expect(
      toUnit(row({ payload: { title_q: 'How do I find a specific term?' } }))?.question,
    ).toBe('How do I find a specific term?');
    expect(toUnit(row({ payload: { title_q: '  ' } }))?.question).toBeNull();
    expect(toUnit(row({ payload: { title_q: 7 } }))?.question).toBeNull();
  });

  it('drops a kind with no block component', () => {
    expect(toUnit(row({ kind: 'recap' }))).toBeNull();
  });

  it('drops a payload the renderer could not read', () => {
    expect(toUnit(row({ payload: null }))).toBeNull();
    expect(toUnit(row({ payload: 'summary' }))).toBeNull();
    expect(toUnit(row({ payload: [1, 2] }))).toBeNull();
  });

  it('survives a null unit_order', () => {
    expect(toUnit(row({ unit_order: null }))?.order).toBe(0);
  });
});

describe('groupIntoSections', () => {
  it('opens a section at each core and hangs the rest off it', () => {
    const sections = groupIntoSections([
      unit(112.01, { kind: 'core', title: 'What it is' }),
      unit(112.02, { kind: 'example' }),
      unit(112.03, { kind: 'autopsy' }),
      unit(112.04, { kind: 'core', title: 'The general term' }),
      unit(112.05, { kind: 'try' }),
    ]);
    expect(sections.map(s => s.title)).toEqual(['What it is', 'The general term']);
    expect(sections[0].lead?.title).toBe('What it is');
    expect(sections[0].units.map(u => u.kind)).toEqual(['example', 'autopsy']);
    expect(sections[1].units.map(u => u.kind)).toEqual(['try']);
  });

  it('sorts before splitting, so the source order cannot leak in', () => {
    const sections = groupIntoSections([
      unit(112.03, { kind: 'example', title: 'B' }),
      unit(112.01, { kind: 'core', title: 'First' }),
      unit(112.02, { kind: 'example', title: 'A' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].units.map(u => u.title)).toEqual(['A', 'B']);
  });

  it('gives units before the first core a section of their own', () => {
    const sections = groupIntoSections([
      unit(112.01, { kind: 'example', title: 'Orphan' }),
      unit(112.02, { kind: 'core', title: 'Idea' }),
    ]);
    expect(sections.map(s => s.title)).toEqual(['Start here', 'Idea']);
    expect(sections[0].lead).toBeNull();
    expect(sections[0].units.map(u => u.title)).toEqual(['Orphan']);
  });

  it('keeps anchors unique when two cores share a title', () => {
    const sections = groupIntoSections([
      unit(1, { kind: 'core', title: 'Recap' }),
      unit(2, { kind: 'core', title: 'Recap' }),
    ]);
    expect(sections[0].id).toBe('unit-recap');
    expect(sections[1].id).toBe('unit-recap-2');
  });

  it('returns nothing for no units', () => {
    expect(groupIntoSections([])).toEqual([]);
  });
});

describe('countByKind', () => {
  it('counts every kind, including the ones with none', () => {
    expect(
      countByKind([
        unit(1, { kind: 'core' }),
        unit(2, { kind: 'core' }),
        unit(3, { kind: 'autopsy' }),
      ]),
    ).toEqual({ core: 2, example: 0, check: 0, autopsy: 1, try: 0 });
  });
});

describe('sanitiseFigure', () => {
  it('passes a plain svg through', () => {
    const svg = '<svg viewBox="0 0 10 10"><circle r="4"/></svg>';
    expect(sanitiseFigure(svg)).toBe(svg);
  });

  it('strips scripts and event handlers', () => {
    const out = sanitiseFigure(
      `<svg onload="steal()"><script>steal()</script><rect onclick='go()'/></svg>`,
    );
    expect(out).not.toMatch(/script|onload|onclick/i);
    expect(out).toContain('<rect');
  });

  it('refuses anything that is not an svg element', () => {
    expect(sanitiseFigure('<img src=x onerror=go()>')).toBeNull();
    expect(sanitiseFigure('<div><svg/></div>')).toBeNull();
    expect(sanitiseFigure(undefined)).toBeNull();
    expect(sanitiseFigure('')).toBeNull();
  });

  it('allows leading whitespace, as authored payloads carry', () => {
    expect(sanitiseFigure('\n  <svg><g/></svg>')).toContain('<svg>');
  });
});

describe('wrongIndex', () => {
  const autopsy = (over: Partial<AutopsyPayload>): AutopsyPayload => ({
    problem_md: 'p',
    working: ['a', 'b', 'c'],
    wrong_line: 2,
    why_md: 'w',
    fix_md: 'f',
    ...over,
  });

  it('converts the 1-based line to an index', () => {
    expect(wrongIndex(autopsy({}))).toBe(1);
    expect(wrongIndex(autopsy({ wrong_line: 1 }))).toBe(0);
    expect(wrongIndex(autopsy({ wrong_line: 3 }))).toBe(2);
  });

  it('marks nothing when the line points outside the working', () => {
    // Off-by-one here would tint the wrong step rose and teach the wrong error.
    expect(wrongIndex(autopsy({ wrong_line: 0 }))).toBe(-1);
    expect(wrongIndex(autopsy({ wrong_line: 4 }))).toBe(-1);
    expect(wrongIndex(autopsy({ wrong_line: undefined as never }))).toBe(-1);
    expect(wrongIndex(autopsy({ working: undefined as never }))).toBe(-1);
  });
});

describe('stripKindPrefix', () => {
  it('drops a kind label the title repeats', () => {
    expect(
      stripKindPrefix('Spot the error: the copy-pasted calculator lines', 'autopsy'),
    ).toBe('The copy-pasted calculator lines');
    expect(stripKindPrefix('Spot the error — −3432x⁸?', 'autopsy')).toBe('−3432x⁸?');
  });

  it("keeps Adrian's own numbering, which is not the kind label", () => {
    expect(stripKindPrefix('Practice 1a: expand (3+2x)⁴', 'check')).toBe(
      'Practice 1a: expand (3+2x)⁴',
    );
    expect(stripKindPrefix('Example 2a: first three terms', 'example')).toBe(
      'Example 2a: first three terms',
    );
  });

  it('leaves a title that is only the label', () => {
    expect(stripKindPrefix('Spot the error', 'autopsy')).toBe('Spot the error');
    expect(stripKindPrefix('Spot the error: ', 'autopsy')).toBe('Spot the error: ');
  });
});

describe('simplifyTitle', () => {
  it("drops Adrian's worksheet numbering, keeps the description", () => {
    expect(simplifyTitle('Practice 1a Q1: read centre and radius', 'try')).toBe(
      'Read centre and radius',
    );
    expect(simplifyTitle('Practice 3a Q5: bisector, circle, range of k, reflection', 'try')).toBe(
      'Bisector, circle, range of k, reflection',
    );
    expect(simplifyTitle('5b Q2–Q3: estimation and a proof', 'try')).toBe(
      'Estimation and a proof',
    );
    expect(simplifyTitle('Challenge Q1: two tangents meeting above the centre', 'try')).toBe(
      'Two tangents meeting above the centre',
    );
    expect(simplifyTitle('Assignment: six exam-style questions', 'try')).toBe(
      'Six exam-style questions',
    );
  });

  it('leaves descriptive titles alone', () => {
    expect(simplifyTitle('Read the centre and radius: (x−3)² + (y+5)² = 36', 'example')).toBe(
      'Read the centre and radius: (x−3)² + (y+5)² = 36',
    );
    expect(simplifyTitle('Diameter parallel to 2x + y + 5 = 0', 'example')).toBe(
      'Diameter parallel to 2x + y + 5 = 0',
    );
  });

  it('returns empty for a title that was only numbering', () => {
    expect(simplifyTitle('Practice 2 Q1', 'try')).toBe('');
  });
});

describe('section titles', () => {
  it('prefers the question-form title for a section heading', () => {
    const sections = groupIntoSections([
      unit(1, { kind: 'core', title: 'The general term T(r+1)', question: 'How do I find a specific term?' }),
      unit(2, { kind: 'core', title: 'The ratio workflow' }),
    ]);
    expect(sections.map(s => s.title)).toEqual([
      'How do I find a specific term?',
      'The ratio workflow',
    ]);
  });
});

describe('approvedSections', () => {
  const built = () =>
    groupIntoSections([
      unit(1, { kind: 'core', title: 'A' }),
      unit(2, { kind: 'example', draft: true }),
      unit(3, { kind: 'try' }),
      unit(4, { kind: 'core', title: 'B', draft: true }),
      unit(5, { kind: 'example', draft: true, flagged: true }),
      unit(6, { kind: 'core', title: 'C', draft: true }),
      unit(7, { kind: 'check' }),
    ]);

  it('keeps approved units only', () => {
    const out = approvedSections(built());
    // Section A: approved lead + one approved try; the draft example is gone.
    expect(out[0].lead?.title).toBe('A');
    expect(out[0].units.map(u => u.kind)).toEqual(['try']);
  });

  it('drops a section with nothing approved, keeps one with approved work under a draft lead', () => {
    const out = approvedSections(built());
    // B: draft lead + flagged example → gone. C: draft lead but approved check → stays, without its lead.
    expect(out.map(s => s.title)).toEqual(['A', 'C']);
    expect(out[1].lead).toBeNull();
    expect(out[1].units.map(u => u.kind)).toEqual(['check']);
  });

  it('never shows a flagged unit to a student', () => {
    const out = approvedSections(built());
    expect(out.flatMap(s => s.units).some(u => u.flagged)).toBe(false);
  });
});

describe('hasApprovedUnits', () => {
  it('is false while everything is pending, true once anything is approved', () => {
    const pendingOnly = groupIntoSections([
      unit(1, { kind: 'core', draft: true }),
      unit(2, { kind: 'example', draft: true }),
    ]);
    expect(hasApprovedUnits(pendingOnly)).toBe(false);
    const one = groupIntoSections([
      unit(1, { kind: 'core', draft: true }),
      unit(2, { kind: 'example' }),
    ]);
    expect(hasApprovedUnits(one)).toBe(true);
  });
});

describe('readingMinutes', () => {
  it('scales coarsely with the section size, floored at 2', () => {
    const small = groupIntoSections([unit(1, { kind: 'core' })]);
    expect(readingMinutes(small[0])).toBe(2);
    const five = groupIntoSections([
      unit(1, { kind: 'core' }),
      unit(2, { kind: 'example' }),
      unit(3, { kind: 'example' }),
      unit(4, { kind: 'check' }),
      unit(5, { kind: 'try' }),
    ]);
    expect(readingMinutes(five[0])).toBe(3);
  });
});

describe('unitFigures', () => {
  const fig = (over = {}) => ({
    url: 'https://x.supabase.co/storage/v1/object/public/notes-figures/circles/01.png',
    alt: 'a circle',
    slot: 'problem',
    ...over,
  });

  it('returns figures for the asked slot only', () => {
    const payload = { figures: [fig(), fig({ slot: 'solution' })] };
    expect(unitFigures(payload, 'problem')).toHaveLength(1);
    expect(unitFigures(payload, 'solution')).toHaveLength(1);
    expect(unitFigures(payload, 'lead')).toHaveLength(0);
  });

  it('defaults a missing slot to problem and a missing alt to empty', () => {
    const [f] = unitFigures({ figures: [{ url: fig().url }] }, 'problem');
    expect(f.alt).toBe('');
  });

  it('drops non-https urls and malformed entries', () => {
    const payload = {
      figures: [fig({ url: 'http://x.co/a.png' }), 'junk', null, { alt: 'no url' }],
    };
    expect(unitFigures(payload, 'problem')).toHaveLength(0);
  });

  it('survives payloads without figures', () => {
    expect(unitFigures({}, 'problem')).toEqual([]);
    expect(unitFigures(null, 'problem')).toEqual([]);
    expect(unitFigures({ figures: 'nope' }, 'problem')).toEqual([]);
  });
});

describe('leadToBullets', () => {
  it('splits multi-sentence prose into one bullet per sentence', () => {
    expect(leadToBullets('Use the general term. Solve for r, then substitute back.')).toBe(
      '- Use the general term.\n- Solve for r, then substitute back.',
    );
  });

  it('never splits inside inline math, and restores it intact', () => {
    const md = 'Identify $n$, $a$ and $b$. The power $2.5$ stays whole.';
    expect(leadToBullets(md)).toBe(
      '- Identify $n$, $a$ and $b$.\n- The power $2.5$ stays whole.',
    );
  });

  it('does not invent bullets from digits in the prose', () => {
    // The mask sentinel must not collide with a real " 4 " in a sentence.
    const md = 'Row 4 gives $x^2$. Row 5 gives $x^3$.';
    expect(leadToBullets(md)).toBe('- Row 4 gives $x^2$.\n- Row 5 gives $x^3$.');
  });

  it('folds paragraphs into one list', () => {
    expect(leadToBullets('First idea here.\n\nSecond idea here.')).toBe(
      '- First idea here.\n- Second idea here.',
    );
  });

  it('leaves single sentences, lists, tables and display math alone', () => {
    expect(leadToBullets('Just the one sentence.')).toBeNull();
    expect(leadToBullets('- already\n- a list')).toBeNull();
    expect(leadToBullets('Look: $$x^2$$. Then more. And more.')).toBeNull();
    expect(leadToBullets('| a | b |\n|---|---|. More. And more.')).toBeNull();
    expect(leadToBullets('')).toBeNull();
  });
});
