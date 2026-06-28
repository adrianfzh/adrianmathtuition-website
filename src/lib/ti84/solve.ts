// Equation solvers behind TI-84 PlySmlt2 and Casio Equation mode:
// polynomial roots (quadratic, cubic) and simultaneous linear systems (2×2, 3×3).
// Pure + node-testable.

export interface Root { re: number; im: number; }

const clean = (x: number) => Math.abs(x) < 1e-12 ? 0 : x;

// a x^2 + b x + c = 0  →  up to 2 roots (real or complex conjugate pair)
export function quadratic(a: number, b: number, c: number): Root[] {
  if (a === 0) return b === 0 ? [] : [{ re: clean(-c / b), im: 0 }];
  const disc = b * b - 4 * a * c;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [{ re: clean((-b + s) / (2 * a)), im: 0 }, { re: clean((-b - s) / (2 * a)), im: 0 }];
  }
  const re = clean(-b / (2 * a)), im = clean(Math.sqrt(-disc) / (2 * a));
  return [{ re, im }, { re, im: -im }];
}

// a x^3 + b x^2 + c x + d = 0  →  3 roots (find one real root, deflate, solve quadratic)
export function cubic(a: number, b: number, c: number, d: number): Root[] {
  if (a === 0) return quadratic(b, c, d);
  const f = (x: number) => ((a * x + b) * x + c) * x + d;
  const df = (x: number) => (3 * a * x + 2 * b) * x + c;
  // Newton from the inflection point (cubics always have ≥1 real root).
  let x = -b / (3 * a);
  for (let i = 0; i < 200; i++) {
    const fx = f(x); if (Math.abs(fx) < 1e-13) break;
    const d1 = df(x); if (d1 === 0) { x += 1; continue; }
    const nx = x - fx / d1; if (Math.abs(nx - x) < 1e-15) { x = nx; break; } x = nx;
  }
  const r = clean(x);
  // deflate: a x^2 + (b + a r) x + (c + r(b + a r))
  const A = a, B = b + a * r, C = c + r * (b + a * r);
  return [{ re: r, im: 0 }, ...quadratic(A, B, C)];
}

// a1 x + b1 y = c1 ; a2 x + b2 y = c2
export function linear2(a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): { x: number; y: number } | null {
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return null;
  return { x: clean((c1 * b2 - c2 * b1) / det), y: clean((a1 * c2 - a2 * c1) / det) };
}

const det3 = (m: number[][]) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

// rows: [[a,b,c,d], …] for a x + b y + c z = d  (Cramer's rule)
export function linear3(rows: number[][]): { x: number; y: number; z: number } | null {
  const M = rows.map((r) => [r[0], r[1], r[2]]);
  const D = det3(M);
  if (Math.abs(D) < 1e-12) return null;
  const sub = (i: number) => M.map((r, ri) => r.map((v, ci) => ci === i ? rows[ri][3] : v));
  return { x: clean(det3(sub(0)) / D), y: clean(det3(sub(1)) / D), z: clean(det3(sub(2)) / D) };
}

// Format a root for display: real → number; complex → "a+bi" / "a−bi".
export function formatRoot(r: Root): string {
  const fmt = (n: number) => { const s = parseFloat(n.toPrecision(10)).toString(); return s.replace(/^(-?)0\./, '$1.'); };
  if (Math.abs(r.im) < 1e-12) return fmt(r.re);
  const im = Math.abs(r.im);
  const sign = r.im < 0 ? '−' : '+';
  const imPart = im === 1 ? 'i' : `${fmt(im)}i`;
  return `${fmt(r.re)}${sign}${imPart}`;
}
