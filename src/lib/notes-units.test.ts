import { describe, expect, it } from 'vitest';
import {
  countByKind,
  groupIntoSections,
  sanitiseFigure,
  stripKindPrefix,
  toUnit,
  unitsEnabledFor,
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
  order,
  draft: false,
  payload: {},
  ...over,
});

describe('toUnit', () => {
  it('shapes a row', () => {
    expect(toUnit(row())).toEqual({
      id: 'u1',
      kind: 'core',
      title: 'The general term',
      order: 112.01,
      draft: false,
      payload: { summary_md: 'x' },
    });
  });

  it('flags anything not approved as a draft', () => {
    // Every Binomial Theorem unit is `pending` today — an approved-only filter
    // would render the pilot page empty.
    expect(toUnit(row({ status: 'pending' }))?.draft).toBe(true);
    expect(toUnit(row({ status: null }))?.draft).toBe(true);
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

describe('unitsEnabledFor', () => {
  it('is on for the pilot topic only', () => {
    expect(unitsEnabledFor('Binomial Theorem')).toBe(true);
    expect(unitsEnabledFor('Differentiation')).toBe(false);
  });
});
