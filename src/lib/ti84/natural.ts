// Natural ("textbook") display parser for the Casio calculator.
// Converts the linear input string (the same glyphs the engine evaluates) into a
// 2D render tree: stacked fractions, raised exponents, radicals with an overline,
// and function calls. Lenient — handles incomplete input mid-typing.
//
// Limitation: a fraction from "/" binds the adjacent factor on each side (e.g.
// 1/2, π/6, (a+b)/c). A multi-term numerator needs parentheses — there is no
// fraction-template state in a flat string.

export type DNode =
  | { t: 'txt'; v: string }
  | { t: 'frac'; num: DNode[]; den: DNode[] }
  | { t: 'pow'; base: DNode[]; exp: DNode[] }
  | { t: 'sqrt'; inner: DNode[] }
  | { t: 'grp'; inner: DNode[] }
  | { t: 'fn'; name: string; inner: DNode[] };

const FUNCS = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'normalcdf', 'normalpdf', 'invNorm', 'binompdf', 'binomcdf', 'poissonpdf', 'poissoncdf', 'nPr', 'nCr', 'abs', 'sin', 'cos', 'tan', 'log', 'ln'];
const EMPTY: DNode = { t: 'txt', v: '' };

export function parseNatural(s: string): DNode[] {
  let i = 0;

  function parseSeq(stopAtParen: boolean): DNode[] {
    const seq: DNode[] = [];
    while (i < s.length) {
      const c = s[i];
      if (stopAtParen && c === ')') break;
      if (c === ' ') { i++; continue; }
      if (c === '/') { i++; const num = seq.pop() ?? EMPTY; const den = parseFactor() ?? EMPTY; seq.push({ t: 'frac', num: [num], den: [den] }); continue; }
      if ('+−×÷*,'.includes(c)) { seq.push({ t: 'txt', v: c }); i++; continue; }
      const f = parseFactor();
      if (f) seq.push(f); else { seq.push({ t: 'txt', v: c }); i++; }
    }
    return seq;
  }

  function parseFactor(): DNode | null {
    while (s[i] === ' ') i++;
    if (i >= s.length) return null;
    let node: DNode;
    const c = s[i];
    if (s.startsWith('√(', i)) { i += 2; const inner = parseSeq(true); if (s[i] === ')') i++; node = { t: 'sqrt', inner }; }
    else if (s.startsWith('∛(', i)) { i += 2; const inner = parseSeq(true); if (s[i] === ')') i++; node = { t: 'fn', name: '∛', inner }; }
    else {
      let fnMatched = false;
      for (const fn of FUNCS) {
        if (s.startsWith(fn + '(', i)) { i += fn.length + 1; const inner = parseSeq(true); if (s[i] === ')') i++; node = { t: 'fn', name: fn, inner }; fnMatched = true; break; }
      }
      if (!fnMatched) {
        if (c === '(') { i++; const inner = parseSeq(true); if (s[i] === ')') i++; node = { t: 'grp', inner }; }
        else if (s.startsWith('Ans', i)) { i += 3; node = { t: 'txt', v: 'Ans' }; }
        else if ((c >= '0' && c <= '9') || c === '.') {
          let n = '';
          while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) n += s[i++];
          if (s[i] === 'E') { n += 'E'; i++; if (s[i] === '−' || s[i] === '-') { n += '-'; i++; } while (i < s.length && s[i] >= '0' && s[i] <= '9') n += s[i++]; }
          node = { t: 'txt', v: n };
        } else { node = { t: 'txt', v: c }; i++; }
      } else { node = node!; }
    }
    // trailing postfixes bind to this factor
    for (;;) {
      if (s[i] === '²') { i++; node = { t: 'pow', base: [node], exp: [{ t: 'txt', v: '2' }] }; }
      else if (s[i] === '³') { i++; node = { t: 'pow', base: [node], exp: [{ t: 'txt', v: '3' }] }; }
      else if (s.startsWith('⁻¹', i)) { i += 2; node = { t: 'pow', base: [node], exp: [{ t: 'txt', v: '−1' }] }; }
      else if (s[i] === '^') { i++; const exp = parseFactor() ?? EMPTY; node = { t: 'pow', base: [node], exp: [exp] }; }
      else break;
    }
    return node;
  }

  return parseSeq(false);
}

// Compact textual form of a tree (used for unit tests / debugging).
export function debugNatural(nodes: DNode[]): string {
  return nodes.map((n) => {
    switch (n.t) {
      case 'txt': return n.v;
      case 'frac': return `(${debugNatural(n.num)}/${debugNatural(n.den)})`;
      case 'pow': return `${debugNatural(n.base)}^[${debugNatural(n.exp)}]`;
      case 'sqrt': return `√[${debugNatural(n.inner)}]`;
      case 'grp': return `(${debugNatural(n.inner)})`;
      case 'fn': return `${n.name}(${debugNatural(n.inner)})`;
    }
  }).join('');
}
