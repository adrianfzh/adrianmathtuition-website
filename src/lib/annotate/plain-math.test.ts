import { describe, it, expect } from 'vitest';
import { plainMathToTex, splitPlainMath, plainMathToDollar } from './plain-math';

const joined = (s: string) => splitPlainMath(s).map((p) => (p.math ? `[${p.text}]` : p.text)).join('');

describe('plain question text → maths', () => {
  it('turns sequence terms into subscripts', () => {
    expect(plainMathToTex('u(n+1) = 2u(n) - 5')).toBe('u_{n+1} = 2u_{n} - 5');
    expect(plainMathToTex('v4 = 2v3')).toBe('v_{4} = 2v_{3}');
    expect(plainMathToTex('u1 = p')).toBe('u_{1} = p');
  });

  it('keeps powers, surds and functions', () => {
    expect(plainMathToTex('H² = 225 - 15a')).toBe('H^{2} = 225 - 15a');
    expect(plainMathToTex('x^(n-1) + √(2x)')).toBe('x^{n-1} + \\sqrt{2x}');
    expect(plainMathToTex('sin θ × 2')).toBe('\\sin  \\theta  \\times  2');
  });

  it('typesets only the maths in a sentence (Adrian\'s Q2 and Q3, 2 Nov 2026)', () => {
    expect(joined('(a) u1 = p, u(n+1) = 2u(n) - 5. (i) Describe the behaviour when (A) p = 7, (B) p = 5.'))
      .toBe('(a) [u1 = p], [u(n+1) = 2u(n) - 5]. (i) Describe the behaviour when (A) [p = 7], (B) [p = 5].');
    expect(joined('(i) Show that H² = 225 - 15a.')).toBe('(i) Show that [H² = 225 - 15a].');
    expect(joined('Net of a square-based pyramid cut from a 30 cm square: base a cm'))
      .toBe('Net of a square-based pyramid cut from a 30 cm square: base a cm');
  });

  it("typesets every power and the short letters beside an operator (Adrian's Q2, 2 Nov 2026)", () => {
    expect(plainMathToTex('x³y⁵')).toBe('x^{3}y^{5}');
    expect(plainMathToTex('x¹⁰')).toBe('x^{10}');
    expect(joined('= x³y⁵. Find the tangent at (1, 1) in the form ax + by = c, a, b, c integers.'))
      .toBe('[= x³y⁵]. Find the tangent at (1, 1) in the form [ax + by = c], a, b, c integers.');
    expect(joined('Go to the shop by bus.')).toBe('Go to the shop by bus.');
  });

  it('never typesets plain prose', () => {
    expect(joined('Find the maximum possible volume of the pyramid.')).toBe('Find the maximum possible volume of the pyramid.');
  });
});

describe('plainMathToDollar', () => {
  it('wraps the maths runs for a page that typesets $…$', () => {
    expect(plainMathToDollar('(i) Show that H² = 225 - 15a.')).toBe('(i) Show that $H^{2} = 225 - 15a$.');
    expect(plainMathToDollar('costs $5 each')).toBe('costs \\$5 each');
  });
});
