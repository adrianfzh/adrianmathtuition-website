import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { MF26, MF27, allTex, splitQquad } from './mf-lists';

// Every formula on /formulas/mf27 and /formulas/mf26 is rendered at build time; a
// string KaTeX cannot parse must fail here, not show red source on a public page.
describe('MF formula lists', () => {
  for (const list of [MF27, MF26]) {
    it(`${list.code}: every formula renders`, () => {
      const tex = allTex(list);
      expect(tex.length).toBeGreaterThan(40);
      for (const s of tex) {
        expect(() => katex.renderToString(s, { displayMode: true, throwOnError: true }), s).not.toThrow();
      }
    });

    it(`${list.code}: section ids are unique (they are page anchors)`, () => {
      const ids = list.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it('MF27 has the sections MF26 lacked, and drops the factor formulae from the list itself', () => {
    const ids27 = MF27.sections.map(s => s.id);
    expect(ids27).toContain('mathematical-results');
    expect(ids27).toContain('applications-of-definite-integrals');
    expect(ids27).not.toContain('statistical-tables');
    const trig27 = MF27.sections.find(s => s.id === 'trigonometry')!;
    const onList = trig27.blocks.flatMap(b => (b.kind === 'formulas' ? b.items.map(i => i.tex) : []));
    expect(onList.some(t => t.includes('\\sin P + \\sin Q'))).toBe(false);
    expect(trig27.memorise!.some(i => i.tex.includes('\\sin P + \\sin Q'))).toBe(true);
  });

  it('splitQquad stacks top-level results and leaves braced ones alone', () => {
    expect(splitQquad('a = 1, \\qquad b = 2')).toEqual(['a = 1', 'b = 2']);
    expect(splitQquad('x^{a \\qquad b}')).toEqual(['x^{a \\qquad b}']);
    for (const s of allTex(MF27)) for (const part of splitQquad(s)) {
      expect(() => katex.renderToString(part, { displayMode: true, throwOnError: true }), part).not.toThrow();
    }
  });
});
