// Polynomials with whole-number or simple-fraction coefficients — just enough
// algebra to mark a typed expansion at once (SPEC-SELF-LEARNING.md §4). `lib/notebook.checkTypedAnswer`
// grades an expression answer 'unclear' (no symbolic equivalence); a revision
// step needs right or wrong on the spot, with no model call. Pure.

/** One term: a coefficient and its letters, e.g. −2x²y = { coef: -2, vars: { x: 2, y: 1 } }. */
export interface Term { coef: number; vars: Record<string, number> }
/** A polynomial in canonical form: key (e.g. "x^2*y", "" for a constant) → term. Zero terms are dropped. */
export type Poly = Map<string, Term>;

const MAX_POWER = 8;
/** Coefficients are plain numbers; a fraction is held as its value and two of them are "the same" within this. */
const EPS = 1e-9;

/** A coefficient as a fraction in lowest terms — 0.75 → [3, 4], 2 → [2, 1]. Null when it is not a simple one. */
export function toFraction(x: number): [number, number] | null {
  for (let d = 1; d <= 720; d++) {
    const n = x * d;
    if (Math.abs(n - Math.round(n)) < EPS * d) return [Math.round(n), d];
  }
  return null;
}

export function termKey(vars: Record<string, number>): string {
  return Object.keys(vars).filter(v => vars[v] > 0).sort().map(v => (vars[v] === 1 ? v : `${v}^${vars[v]}`)).join('*');
}

export function polyOf(terms: Term[]): Poly {
  const p: Poly = new Map();
  for (const t of terms) {
    const key = termKey(t.vars);
    const had = p.get(key);
    const coef = (had ? had.coef : 0) + t.coef;
    if (Math.abs(coef) < EPS) p.delete(key);
    else p.set(key, { coef, vars: cleanVars(t.vars) });
  }
  return p;
}

function cleanVars(vars: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of Object.keys(vars).sort()) if (vars[v] > 0) out[v] = vars[v];
  return out;
}

export function mulTerm(a: Term, b: Term): Term {
  const vars: Record<string, number> = { ...a.vars };
  for (const v of Object.keys(b.vars)) vars[v] = (vars[v] || 0) + b.vars[v];
  return { coef: a.coef * b.coef, vars: cleanVars(vars) };
}

export function termsOf(p: Poly): Term[] { return sortTerms([...p.values()]); }
export function add(a: Poly, b: Poly): Poly { return polyOf([...a.values(), ...b.values()]); }
export function scale(a: Poly, k: number): Poly { return polyOf([...a.values()].map(t => ({ coef: t.coef * k, vars: t.vars }))); }
export function sub(a: Poly, b: Poly): Poly { return add(a, scale(b, -1)); }
export function mul(a: Poly, b: Poly): Poly {
  const out: Term[] = [];
  for (const x of a.values()) for (const y of b.values()) out.push(mulTerm(x, y));
  return polyOf(out);
}
export function equal(a: Poly, b: Poly): boolean { return sub(a, b).size === 0; }

function degree(t: Term): number { return Object.values(t.vars).reduce((s, n) => s + n, 0); }

/** Reading order: highest degree first, then by the letters (x²  before xy before y²). */
export function sortTerms(terms: Term[]): Term[] {
  return [...terms].sort((a, b) => {
    const d = degree(b) - degree(a);
    if (d) return d;
    const letters = [...new Set([...Object.keys(a.vars), ...Object.keys(b.vars)])].sort();
    for (const v of letters) {
      const e = (b.vars[v] || 0) - (a.vars[v] || 0);
      if (e) return e;
    }
    return 0;
  });
}

// ── Parsing what a student types ─────────────────────────────────────────────

const SUPER: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Typed text → plain tokens: "x² − 2x" → "x^2-2x". */
export function normaliseTyped(raw: string): string {
  return String(raw ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => '^' + [...m].map(c => SUPER[c]).join(''))
    .replace(/[−–—‒]/g, '-')
    .replace(/[×·∙⋅]/g, '*')
    .replace(/[÷∕⁄]/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, '');
}

export interface Parsed {
  poly: Poly;
  /** The terms in the order typed, when the text is a plain sum with no brackets; otherwise null. */
  flat: Term[] | null;
  hasBrackets: boolean;
}

/**
 * Parse a typed expression: integers, single letters, + − ×, brackets, powers
 * (x^2 or x²), and writing things side by side to multiply (2x, 3(x+1),
 * (x+1)(x−2)). Returns null when it cannot be read — never guesses.
 */
export function parseExpr(raw: string): Parsed | null {
  const s = normaliseTyped(raw);
  if (!s || s.length > 120) return null;
  let i = 0;
  let ok = true;
  const hasBrackets = s.includes('(');

  const startsFactor = (c: string | undefined) => !!c && (/[0-9a-zA-Z(]/.test(c));

  function atom(): Poly {
    const c = s[i];
    if (c === '(') {
      i++;
      const inner = expr();
      if (s[i] !== ')') { ok = false; return new Map(); }
      i++;
      return inner;
    }
    if (c && /[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      i = j;
      if (!Number.isSafeInteger(n)) { ok = false; return new Map(); }
      return polyOf([{ coef: n, vars: {} }]);
    }
    if (c && /[a-zA-Z]/.test(c)) {
      i++;
      return polyOf([{ coef: 1, vars: { [c]: 1 } }]);
    }
    ok = false;
    return new Map();
  }

  function power(): Poly {
    const base = atom();
    if (!ok) return base;
    if (s[i] === '^') {
      i++;
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      if (j === i || !Number.isInteger(n) || n > MAX_POWER) { ok = false; return base; }
      i = j;
      let out: Poly = polyOf([{ coef: 1, vars: {} }]);
      for (let k = 0; k < n; k++) out = mul(out, base);
      return out;
    }
    return base;
  }

  function unary(): Poly {
    if (s[i] === '-') { i++; return scale(unary(), -1); }
    if (s[i] === '+') { i++; return unary(); }
    return power();
  }

  function term(): Poly {
    let out = unary();
    while (ok && i < s.length) {
      if (s[i] === '*') { i++; out = mul(out, unary()); }
      else if (s[i] === '/') {
        // A fraction: only a number may go underneath — 3/4x is three-quarters of x.
        i++;
        const under = power();
        const k = under.size === 1 ? under.get('')?.coef : undefined;
        if (!ok || !k) { ok = false; return out; }
        out = scale(out, 1 / k);
      }
      else if (startsFactor(s[i])) out = mul(out, power());
      else break;
    }
    return out;
  }

  const pieces: Poly[] = [];
  function expr(): Poly {
    const top = pieces.length === 0 && depth === 0;
    depth++;
    let out = term();
    if (top) pieces.push(out);
    while (ok && i < s.length && (s[i] === '+' || s[i] === '-')) {
      const neg = s[i] === '-';
      i++;
      const t = term();
      const signed = neg ? scale(t, -1) : t;
      if (top) pieces.push(signed);
      out = add(out, signed);
    }
    depth--;
    return out;
  }
  let depth = 0;

  const poly = expr();
  if (!ok || i !== s.length) return null;

  let flat: Term[] | null = null;
  if (!hasBrackets && pieces.every(p => p.size <= 1)) {
    flat = pieces.filter(p => p.size === 1).map(p => [...p.values()][0]);
  }
  return { poly, flat, hasBrackets };
}

/** A plain sum with no like terms left to collect (x² − 2x + 3x is not; x² + x is). */
export function isCollected(p: Parsed): boolean {
  if (!p.flat) return false;
  const seen = new Set<string>();
  for (const t of p.flat) {
    const k = termKey(t.vars);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

// ── Writing a polynomial out ─────────────────────────────────────────────────

function varsTex(vars: Record<string, number>): string {
  return Object.keys(vars).sort().map(v => (vars[v] === 1 ? v : `${v}^{${vars[v]}}`)).join('');
}

/** One term without its sign: 2x^{2}, x, 6. */
export function termBodyTex(t: Term): string {
  const v = varsTex(t.vars);
  const f = toFraction(Math.abs(t.coef));
  const n = !f ? String(Math.abs(t.coef)) : f[1] === 1 ? String(f[0]) : `\\frac{${f[0]}}{${f[1]}}`;
  if (!v) return n;
  return (n === '1' ? '' : n) + v;
}

/** A term as it stands alone: −2x, 3, x^{2}. */
export function termTex(t: Term): string { return (t.coef < 0 ? '-' : '') + termBodyTex(t); }

/** A term inside a product, bracketed when negative: (−2). */
export function termTexBracketed(t: Term): string { return t.coef < 0 ? `(${termTex(t)})` : termTex(t); }

/** Terms joined in the order given: x^{2} - 2x + 3x - 6. */
export function sumTex(terms: Term[]): string {
  const live = terms.filter(t => t.coef !== 0);
  if (!live.length) return '0';
  return live.map((t, idx) => (idx === 0 ? termTex(t) : `${t.coef < 0 ? '-' : '+'} ${termBodyTex(t)}`)).join(' ');
}

/** A polynomial in reading order. */
export function polyTex(p: Poly): string { return sumTex(termsOf(p)); }
