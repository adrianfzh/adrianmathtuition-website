// TI-84-faithful expression engine for the /calculator home screen.
//
// Input is the on-screen display string built from button presses, using the
// same glyphs the calculator shows: × ÷ − ^ ( ) , π e √( sin( cos( tan(
// sin⁻¹( cos⁻¹( tan⁻¹( log( ln( 10^( e^( Ans, the postfix ² and ⁻¹, the EE
// exponent E, and uppercase variables A–Z, θ, X.
//
// Grammar (low → high precedence), with implicit multiplication:
//   expr   = term (('+' | '−') term)*
//   term   = unary (('×' | '÷') unary | <implicit> unary)*
//   unary  = ('−' | '+') unary | power
//   power  = postfix ('^' unary)?            // ^ right-assoc; binds tighter than unary minus on its left  (−3² = −9)
//   postfix= atom ('²' | '⁻¹')*
//   atom   = number | π | e | Ans | VAR | func '(' expr ')'? | '(' expr ')'?
// Missing close-parens are auto-closed at end of input, like the TI.

export type AngleMode = 'RAD' | 'DEG';
export interface EvalCtx { angle: AngleMode; ans: number; vars: Record<string, number>; }
export type EvalResult = { ok: true; value: number; display: string } | { ok: false; error: string };

// ── tokenizer ────────────────────────────────────────────────────────────────
type TokType = 'num' | 'const' | 'ans' | 'var' | 'func' | 'lp' | 'rp' | 'comma'
  | 'plus' | 'minus' | 'mul' | 'div' | 'pow' | 'sq' | 'inv';
interface Tok { t: TokType; v?: number | string; }

// Longest names first so "sin⁻¹" matches before "sin".
const FUNCS = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sin', 'cos', 'tan', 'log', 'ln', '√'];
const FUNC_MAP: Record<string, string> = {
  'sin⁻¹': 'asin', 'cos⁻¹': 'acos', 'tan⁻¹': 'atan',
  sin: 'sin', cos: 'cos', tan: 'tan', log: 'log10', ln: 'ln', '√': 'sqrt',
};

class CalcError extends Error {}

function tokenize(src: string): Tok[] {
  const s = src;
  const toks: Tok[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }

    // number (with optional E exponent, sign via − or -)
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
    // Ans
    if (s.startsWith('Ans', i)) { toks.push({ t: 'ans' }); i += 3; continue; }
    // functions (longest first)
    let matched = false;
    for (const f of FUNCS) {
      if (s.startsWith(f, i)) { toks.push({ t: 'func', v: FUNC_MAP[f] }); i += f.length; matched = true; break; }
    }
    if (matched) continue;
    // constants
    if (c === 'π') { toks.push({ t: 'const', v: Math.PI }); i++; continue; }
    if (c === 'e') { toks.push({ t: 'const', v: Math.E }); i++; continue; }
    // postfix inverse ⁻¹
    if (s.startsWith('⁻¹', i)) { toks.push({ t: 'inv' }); i += 2; continue; }
    if (c === '²') { toks.push({ t: 'sq' }); i++; continue; }
    // variables: uppercase A–Z, θ, X
    if ((c >= 'A' && c <= 'Z') || c === 'θ') { toks.push({ t: 'var', v: c }); i++; continue; }
    // operators / punctuation
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

// ── parser + evaluator ───────────────────────────────────────────────────────
class Parser {
  private p = 0;
  private toks: Tok[];
  private ctx: EvalCtx;
  constructor(toks: Tok[], ctx: EvalCtx) { this.toks = toks; this.ctx = ctx; }

  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok { return this.toks[this.p++]; }

  parse(): number {
    const v = this.expr();
    if (this.p < this.toks.length) throw new CalcError('SYNTAX');
    return v;
  }

  private startsFactor(t?: Tok): boolean {
    return !!t && (t.t === 'num' || t.t === 'const' || t.t === 'ans' || t.t === 'var'
      || t.t === 'func' || t.t === 'lp');
  }

  private expr(): number {
    let v = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'plus') { this.next(); v += this.term(); }
      else if (t?.t === 'minus') { this.next(); v -= this.term(); }
      else break;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'mul') { this.next(); v *= this.unary(); }
      else if (t?.t === 'div') { const d = (this.next(), this.unary()); v /= d; }
      else if (this.startsFactor(t)) { v *= this.unary(); }       // implicit multiply: 2π, 2(3), 2sin(…)
      else break;
    }
    return v;
  }

  private unary(): number {
    const t = this.peek();
    if (t?.t === 'minus') { this.next(); return -this.unary(); }
    if (t?.t === 'plus') { this.next(); return this.unary(); }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    if (this.peek()?.t === 'pow') { this.next(); return Math.pow(base, this.unary()); }
    return base;
  }

  private postfix(): number {
    let v = this.atom();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'sq') { this.next(); v = v * v; }
      else if (t?.t === 'inv') { this.next(); v = 1 / v; }
      else break;
    }
    return v;
  }

  private atom(): number {
    const t = this.next();
    if (!t) throw new CalcError('SYNTAX');
    switch (t.t) {
      case 'num': case 'const': return t.v as number;
      case 'ans': return this.ctx.ans;
      case 'var': return this.ctx.vars[t.v as string] ?? 0;
      case 'lp': { const v = this.expr(); if (this.peek()?.t === 'rp') this.next(); return v; }
      case 'func': {
        let arg: number;
        if (this.peek()?.t === 'lp') { this.next(); arg = this.expr(); if (this.peek()?.t === 'rp') this.next(); }
        else arg = this.power();
        return this.applyFunc(t.v as string, arg);
      }
      default: throw new CalcError('SYNTAX');
    }
  }

  private applyFunc(name: string, x: number): number {
    const toRad = (d: number) => this.ctx.angle === 'DEG' ? (d * Math.PI / 180) : d;
    const fromRad = (r: number) => this.ctx.angle === 'DEG' ? (r * 180 / Math.PI) : r;
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
}

// ── TI-style number formatting (NORMAL FLOAT) ─────────────────────────────────
export function formatTI(x: number): string {
  if (Number.isNaN(x)) return 'NONREAL ANS';
  if (!isFinite(x)) return 'DIVIDE BY 0';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  let out: string;
  if (ax >= 1e10 || ax < 1e-3) {
    // scientific: up to 9 decimal places on the mantissa, trimmed
    let m = x.toExponential(9);
    const [mant, exp] = m.split('e');
    let mt = mant.replace(/0+$/, '').replace(/\.$/, '');
    const e = parseInt(exp, 10);
    out = `${mt}E${e}`;
  } else {
    // up to 10 significant digits, trim trailing zeros
    out = parseFloat(x.toPrecision(10)).toString();
  }
  // TI drops the leading 0 before a decimal point: 0.5 → .5, -0.5 → -.5
  out = out.replace(/^(-?)0\./, '$1.');
  return out;
}

// ── public entry point ────────────────────────────────────────────────────────
export function evaluate(input: string, ctx: EvalCtx): EvalResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'SYNTAX' };
  try {
    const toks = tokenize(trimmed);
    if (!toks.length) return { ok: false, error: 'SYNTAX' };
    const value = new Parser(toks, ctx).parse();
    if (Number.isNaN(value)) return { ok: false, error: 'NONREAL ANS' };
    if (!isFinite(value)) return { ok: false, error: 'DIVIDE BY 0' };
    return { ok: true, value, display: formatTI(value) };
  } catch (e) {
    return { ok: false, error: e instanceof CalcError ? e.message : 'SYNTAX' };
  }
}
