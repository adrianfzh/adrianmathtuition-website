import { describe, expect, it } from 'vitest';
import { buildFormulaSheet, formulaAreasFor, formulaPageFor, levelKeyForTopic, topicsMet, viaLine } from './formula-sheet';
import type { StreamItem } from './notebook-stream';

const item = (id: string, kind: StreamItem['kind'], topic: string | null, extra: Partial<StreamItem> = {}): StreamItem => ({
  id, kind, title: id, subtitle: '', at: '2026-09-01T00:00:00Z', haystack: id, topic, ...extra,
});
const live = (id: string, topic: string, title: string, subject = 'A Math'): StreamItem =>
  item(id, 'mistake', topic, { title, subject, mistake: { id, state: 'dark', live: true, seen: 2, cameBack: false, where: 'Q7 · Prelim P1', practice: [] } });

describe('topicsMet', () => {
  it('collects each topic once with how it was met, newest first', () => {
    const t = topicsMet([
      live('m1', 'Trigonometry (R-Formula)', 'R-formula sign slip'),
      item('s1', 'saved', 'Logarithms', { at: '2026-09-10T00:00:00Z' }),
      item('n1', 'photo', 'Logarithms', { at: '2026-09-05T00:00:00Z' }),
      item('p1', 'adrian', 'Vectors'),
      item('x', 'saved', null),
    ]);
    expect(t.map(x => x.topic)).toEqual(['Logarithms', 'Trigonometry (R-Formula)']);
    expect(t[0].via).toEqual(['ask', 'photo']);
    expect(t[0].at).toBe('2026-09-10T00:00:00Z');
    expect(t[1].subject).toBe('A Math');
  });
});

describe('formulaAreasFor + formulaPageFor', () => {
  it('maps canonical topics to formula_ref areas', () => {
    expect(formulaAreasFor('Trigonometry (R-Formula)')).toEqual(['Trig']);
    expect(formulaAreasFor('Logarithms')).toEqual(['Indices/Logs']);
    expect(formulaAreasFor('Integration (Area)')).toEqual(['Calculus']);
    expect(formulaAreasFor('Direct proportion')).toEqual([]);
  });
  it('finds the formula page per level family, or none', () => {
    expect(formulaPageFor('Logarithms', 'AM')).toEqual({ href: '/formulas/logarithms', title: 'Logarithms' });
    expect(formulaPageFor('Trigonometry', 'S3_EM')).toEqual({ href: '/formulas/em-trigonometry', title: 'Trigonometry' });
    expect(formulaPageFor('Integration (Techniques)', 'JC2')?.href).toBe('/formulas/jc-integration');
    expect(formulaPageFor('Direct proportion', 'EM')).toBeNull();
    expect(formulaPageFor('Logarithms', 'PHY')).toBeNull();
  });
});

describe('levelKeyForTopic', () => {
  it("uses the paper's subject first, then the canonical list, then the first key", () => {
    expect(levelKeyForTopic('Trigonometry', 'E Math', ['AM', 'EM'])).toBe('EM');
    expect(levelKeyForTopic('Logarithms', null, ['EM', 'AM'])).toBe('AM');
    expect(levelKeyForTopic('Something new', null, ['EM', 'AM'])).toBe('EM');
    expect(levelKeyForTopic('Logarithms', null, [])).toBeNull();
  });
});

describe('buildFormulaSheet', () => {
  const formulaeByLevel = {
    AM: [
      { area: 'Trig', result: 'R-formula', statement: 'a sin x + b cos x = R sin(x + α)', given_status: 'memorise' },
      { area: 'Trig', result: 'Double angle', statement: 'sin 2A = 2 sin A cos A', given_status: 'given' },
      { area: 'Indices/Logs', result: 'Change of base', statement: 'log_a b = lg b / lg a', given_status: 'memorise' },
    ],
  };
  const topics = topicsMet([live('m1', 'Trigonometry (R-Formula)', 'R-formula: wrong quadrant for α'), item('s1', 'saved', 'Logarithms'), item('n1', 'photo', 'Vectors')]);
  const sheet = buildFormulaSheet({ topics, levelKeys: ['AM', 'EM'], formulaeByLevel, liveMistakes: [live('m1', 'Trigonometry (R-Formula)', 'R-formula: wrong quadrant for α')] });

  it('gives each met topic its lines, its page and its marks', () => {
    const trig = sheet.find(s => s.topic.startsWith('Trig'))!;
    expect(trig.formulae.map(f => f.result)).toEqual(['R-formula', 'Double angle']);
    expect(trig.formulae[0].misapplied).toEqual({ title: 'R-formula: wrong quadrant for α', where: 'Q7 · Prelim P1' });
    expect(trig.formulae[1].misapplied).toBeNull();
    expect(trig.watch).toBeNull();   // the mistake was claimed by a line
    expect(trig.page?.href).toBe('/formulas/trigo');
  });
  it('keeps a topic with no formula_ref lines — the page link is still worth having', () => {
    const logs = sheet.find(s => s.topic === 'Logarithms')!;
    expect(logs.formulae.map(f => f.result)).toEqual(['Change of base']);
    // Vectors is not an A Math topic in the canonical list, so it files under the student's E Math key — and gets that family's page.
    const vec = sheet.find(s => s.topic === 'Vectors')!;
    expect(vec.formulae).toEqual([]);
    expect(vec.levelKey).toBe('EM');
    expect(vec.page).toEqual({ href: '/formulas/em-vectors', title: 'Vectors' });
  });
  it('marks the topic when a live mistake does not name a formula', () => {
    const s = buildFormulaSheet({
      topics: topicsMet([live('m2', 'Logarithms', 'Marks lost in Logarithms')]), levelKeys: ['AM'], formulaeByLevel,
      liveMistakes: [live('m2', 'Logarithms', 'Marks lost in Logarithms')],
    });
    expect(s[0].watch).toEqual({ title: 'Marks lost in Logarithms', where: 'Q7 · Prelim P1' });
    expect(s[0].formulae[0].misapplied).toBeNull();
  });
  it('speaks the sightings', () => {
    expect(viaLine(['paper', 'ask'])).toBe('Seen in a marked paper · an ask');
  });
});
