// TI-84-faithful expression engine for the calculator.
//
// Input is the on-screen display string built from button presses, using the
// same glyphs the calculator shows: × ÷ − ^ ( ) , π e √( sin( cos( tan(
// sin⁻¹( cos⁻¹( tan⁻¹( log( ln( 10^( e^( Ans, the postfix ² and ⁻¹, the EE
// exponent E, and uppercase variables A–Z, θ, X.
//
// The parser compiles to an AST of closures (EvalNode) so a graphed function
// can be evaluated hundreds of times per redraw without re-tokenizing.
//
// Grammar (low → high precedence), with implicit multiplication:
//   expr   = term (('+' | '−') term)*
//   term   = unary (('×' | '÷') unary | <implicit> unary)*
//   unary  = ('−' | '+') unary | power
//   power  = postfix ('^' unary)?            // ^ right-assoc; binds tighter than unary minus on its left  (−3² = −9)
//   postfix= atom ('²' | '⁻¹')*
//   atom   = number | π | e | Ans | VAR | func '(' expr ')'? | '(' expr ')'?

export type AngleMode = 'RAD' | 'DEG';
export interface EvalCtx { angle: AngleMode; ans: number; vars: Record<string, number>; }
export type EvalNode = (ctx: EvalCtx) => number;
export type EvalResult = { ok: true; value: number; display: string } | { ok: false; error: string };
export type CompileResult = { ok: true; fn: EvalNode } | { ok: false; error: string };

// ── tokenizer ────────────────────────────────────────────────────────────────
type TokType = 'num' | 'const' | 'ans' | 'var' | 'func' | 'lp' | 'rp' | 'comma'
  | 'plus' | 'minus' | 'mul' | 'div' | 'pow' | 'sq' | 'inv';
interface Tok { t: TokType; v?: number | string; }

import { normalcdf, normalpdf, invNorm, binompdf, binomcdf, poissonpdf, poissoncdf } from './stats';

const FUNCS = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'normalcdf', 'normalpdf', 'invNorm', 'binompdf', 'binomcdf', 'poissonpdf', 'poissoncdf', 'sin', 'cos', 'tan', 'log', 'ln', '√'];
const FUNC_MAP: Record<string, string> = {
  'sin⁻¹': 'asin', 'cos⁻¹': 'acos', 'tan⁻¹': 'atan',
  sin: 'sin', cos: 'cos', tan: 'tan', log: 'log10', ln: 'ln', '√': 'sqrt',
  normalcdf: 'normalcdf', normalpdf: 'normalpdf', invNorm: 'invNorm',
  binompdf: 'binompdf', binomcdf: 'binomcdf', poissonpdf: 'poissonpdf', poissoncdf: 'poissoncdf',
};

// Multi-argument (statistical) functions with optional-arg defaults.
const MULTI: Record<string, { min: number; max: number; fn: (a: number[]) => number }> = {
  normalpdf: { min: 1, max: 3, fn: (a) => normalpdf(a[0], a[1] ?? 0, a[2] ?? 1) },
  normalcdf: { min: 2, max: 4, fn: (a) => normalcdf(a[0], a[1], a[2] ?? 0, a[3] ?? 1) },
  invNorm: { min: 1, max: 3, fn: (a) => invNorm(a[0], a[1] ?? 0, a[2] ?? 1) },
  binompdf: { min: 3, max: 3, fn: (a) => binompdf(a[0], a[1], a[2]) },
  binomcdf: { min: 3, max: 3, fn: (a) => binomcdf(a[0], a[1], a[2]) },
  poissonpdf: { min: 2, max: 2, fn: (a) => poissonpdf(a[0], a[1]) },
  poissoncdf: { min: 2, max: 2, fn: (a) => poissoncdf(a[0], a[1]) },
};

class CalcError extends Error {}

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let num = '';
      while (i < s.length && (isDigit(s[i]) || s[i] === '.')) num += s[i++];
      if (s[i] === 'E') {
        num += 'e'; i++;
        if (s[i] === '−' || s[i] === '-') { num += '-'; i++; }
        else if (s[i] === '+') { num += '+'; i++; }
        if (!isDigit(s[i])) throw new CalcError('SYNTAX');
        while (i < s.length && isDigit(s[i])) num += s[i++];
      }
      const val = Number(num);
      if (!isFinite(val)) throw new CalcError('SYNTAX');
      toks.push({ t: 'num', v: val });
      continue;
    }
    if (s.startsWith('Ans', i)) { toks.push({ t: 'ans' }); i += 3; continue; }
    let matched = false;
    for (const f of FUNCS) {
      if (s.startsWith(f, i)) { toks.push({ t: 'func', v: FUNC_MAP[f] }); i += f.length; matched = true; break; }
    }
    if (matched) continue;
    if (c === 'π') { toks.push({ t: 'const', v: Math.PI }); i++; continue; }
    if (c === 'e') { toks.push({ t: 'const', v: Math.E }); i++; continue; }
    if (s.startsWith('⁻¹', i)) { toks.push({ t: 'inv' }); i += 2; continue; }
    if (c === '²') { toks.push({ t: 'sq' }); i++; continue; }
    if ((c >= 'A' && c <= 'Z') || c === 'θ') { toks.push({ t: 'var', v: c }); i++; continue; }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if (c === '^') { toks.push({ t: 'pow' }); i++; continue; }
    if (c === '+') { toks.push({ t: 'plus' }); i++; continue; }
    if (c === '−' || c === '-') { toks.push({ t: 'minus' }); i++; continue; }
    if (c === '×' || c === '*') { toks.push({ t: 'mul' }); i++; continue; }
    if (c === '÷' || c === '/') { toks.push({ t: 'div' }); i++; continue; }
    throw new CalcError('SYNTAX');
  }
  return toks;
}

function dispatch(name: string, vals: number[], angle: AngleMode): number {
  const m = MULTI[name];
  if (m) { if (vals.length < m.min || vals.length > m.max) throw new CalcError('ARGUMENT'); return m.fn(vals); }
  if (vals.length !== 1) throw new CalcError('ARGUMENT');
  return applyFunc(name, vals[0], angle);
}

function applyFunc(name: string, x: number, angle: AngleMode): number {
  const toRad = (d: number) => angle === 'DEG' ? (d * Math.PI / 180) : d;
  const fromRad = (r: number) => angle === 'DEG' ? (r * 180 / Math.PI) : r;
  switch (name) {
    case 'sin': return Math.sin(toRad(x));
    case 'cos': return Math.cos(toRad(x));
    case 'tan': return Math.tan(toRad(x));
    case 'asin': return fromRad(Math.asin(x));
    case 'acos': return fromRad(Math.acos(x));
    case 'atan': return fromRad(Math.atan(x));
    case 'log10': return Math.log10(x);
    case 'ln': return Math.log(x);
    case 'sqrt': return Math.sqrt(x);
    default: throw new CalcError('SYNTAX');
  }
}

// ── parser → AST of closures ──────────────────────────────────────────────────
class Parser {
  private p = 0;
  private toks: Tok[];
  constructor(toks: Tok[]) { this.toks = toks; }
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok { return this.toks[this.p++]; }

  parse(): EvalNode {
    const node = this.expr();
    if (this.p < this.toks.length) throw new CalcError('SYNTAX');
    return node;
  }

  private startsFactor(t?: Tok): boolean {
    return !!t && (t.t === 'num' || t.t === 'const' || t.t === 'ans' || t.t === 'var' || t.t === 'func' || t.t === 'lp');
  }

  private expr(): EvalNode {
    let node = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'plus') { this.next(); const l = node, r = this.term(); node = (c) => l(c) + r(c); }
      else if (t?.t === 'minus') { this.next(); const l = node, r = this.term(); node = (c) => l(c) - r(c); }
      else break;
    }
    return node;
  }

  private term(): EvalNode {
    let node = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'mul') { this.next(); const l = node, r = this.unary(); node = (c) => l(c) * r(c); }
      else if (t?.t === 'div') { this.next(); const l = node, r = this.unary(); node = (c) => l(c) / r(c); }
      else if (this.startsFactor(t)) { const l = node, r = this.unary(); node = (c) => l(c) * r(c); }
      else break;
    }
    return node;
  }

  private unary(): EvalNode {
    const t = this.peek();
    if (t?.t === 'minus') { this.next(); const n = this.unary(); return (c) => -n(c); }
    if (t?.t === 'plus') { this.next(); return this.unary(); }
    return this.power();
  }

  private power(): EvalNode {
    const base = this.postfix();
    if (this.peek()?.t === 'pow') { this.next(); const exp = this.unary(); return (c) => Math.pow(base(c), exp(c)); }
    return base;
  }

  private postfix(): EvalNode {
    let node = this.atom();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'sq') { this.next(); const b = node; node = (c) => { const v = b(c); return v * v; }; }
      else if (t?.t === 'inv') { this.next(); const b = node; node = (c) => 1 / b(c); }
      else break;
    }
    return node;
  }

  private atom(): EvalNode {
    const t = this.next();
    if (!t) throw new CalcError('SYNTAX');
    switch (t.t) {
      case 'num': case 'const': { const v = t.v as number; return () => v; }
      case 'ans': return (c) => c.ans;
      case 'var': { const name = t.v as string; return (c) => c.vars[name] ?? 0; }
      case 'lp': { const n = this.expr(); if (this.peek()?.t === 'rp') this.next(); return n; }
      case 'func': {
        const name = t.v as string;
        const args: EvalNode[] = [];
        if (this.peek()?.t === 'lp') {
          this.next();
          if (this.peek()?.t !== 'rp') {
            args.push(this.expr());
            while (this.peek()?.t === 'comma') { this.next(); args.push(this.expr()); }
          }
          if (this.peek()?.t === 'rp') this.next();
        } else {
          args.push(this.power());
        }
        return (c) => dispatch(name, args.map((a) => a(c)), c.angle);
      }
      default: throw new CalcError('SYNTAX');
    }
  }
}

// ── TI-style number formatting (NORMAL FLOAT) ─────────────────────────────────
export function formatTI(x: number): string {
  if (Number.isNaN(x)) return 'NONREAL ANS';
  if (!isFinite(x)) return 'DIVIDE BY 0';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  let out: string;
  if (ax >= 1e10 || ax < 1e-3) {
    const m = x.toExponential(9);
    const [mant, exp] = m.split('e');
    const mt = mant.replace(/0+$/, '').replace(/\.$/, '');
    out = `${mt}E${parseInt(exp, 10)}`;
  } else {
    out = parseFloat(x.toPrecision(10)).toString();
  }
  return out.replace(/^(-?)0\./, '$1.');
}

// ── public API ────────────────────────────────────────────────────────────────
export function compile(input: string): CompileResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'SYNTAX' };
  try {
    const toks = tokenize(trimmed);
    if (!toks.length) return { ok: false, error: 'SYNTAX' };
    return { ok: true, fn: new Parser(toks).parse() };
  } catch (e) {
    return { ok: false, error: e instanceof CalcError ? e.message : 'SYNTAX' };
  }
}

export function evaluate(input: string, ctx: EvalCtx): EvalResult {
  const c = compile(input);
  if (!c.ok) return c;
  let value: number;
  try { value = c.fn(ctx); } catch (e) { return { ok: false, error: e instanceof CalcError ? e.message : 'SYNTAX' }; }
  if (Number.isNaN(value)) return { ok: false, error: 'NONREAL ANS' };
  if (!isFinite(value)) return { ok: false, error: 'DIVIDE BY 0' };
  return { ok: true, value, display: formatTI(value) };
}
