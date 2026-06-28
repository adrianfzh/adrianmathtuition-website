// Numeric routines behind the TI-84 CALC menu (zero, min/max, intersect,
// dy/dx, ∫). Each takes a real function F: (x) => y. Pure + node-testable.

export type F = (x: number) => number;

const FINE = 1e-10;

/** Bisection on a bracket where f(a), f(b) have opposite signs. */
function bisect(f: F, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (!isFinite(fm)) return m;
    if (Math.abs(fm) < FINE || (b - a) / 2 < FINE) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

/** All sign-change brackets of f across [a,b], sampled at `n` points. */
function brackets(f: F, a: number, b: number, n = 400): [number, number][] {
  const out: [number, number][] = [];
  let px = a, pf = f(a);
  for (let i = 1; i <= n; i++) {
    const x = a + (i / n) * (b - a);
    const fx = f(x);
    if (isFinite(pf) && isFinite(fx) && pf !== 0 && Math.sign(fx) !== Math.sign(pf)) out.push([px, x]);
    px = x; pf = fx;
  }
  return out;
}

/** Root of f on [a,b], the one nearest `near` if several (TI: nearest the guess). */
export function findZero(f: F, a: number, b: number, near?: number): number {
  if (a > b) [a, b] = [b, a];
  const roots = brackets(f, a, b).map(([l, r]) => bisect(f, l, r));
  if (!roots.length) return NaN;
  const ref = near ?? (a + b) / 2;
  return roots.reduce((best, r) => Math.abs(r - ref) < Math.abs(best - ref) ? r : best, roots[0]);
}

/** Local extremum of f on [a,b] via coarse sample + golden-section refine. */
export function findExtremum(f: F, a: number, b: number, kind: 'min' | 'max'): { x: number; y: number } {
  if (a > b) [a, b] = [b, a];
  const g: F = kind === 'min' ? f : (x) => -f(x);
  // coarse scan for the lowest g
  const N = 400; let bi = 0, bv = Infinity, bx = a;
  for (let i = 0; i <= N; i++) { const x = a + (i / N) * (b - a); const v = g(x); if (isFinite(v) && v < bv) { bv = v; bx = x; bi = i; } }
  // golden-section in the neighbouring bracket
  let lo = a + (Math.max(0, bi - 1) / N) * (b - a);
  let hi = a + (Math.min(N, bi + 1) / N) * (b - a);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
  for (let i = 0; i < 100; i++) {
    if (g(c) < g(d)) { hi = d; } else { lo = c; }
    c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
    if (hi - lo < FINE) break;
  }
  const x = (lo + hi) / 2;
  return { x, y: f(x) };
}

/** Intersection of f and g on [a,b], nearest `near`. */
export function findIntersect(f: F, g: F, a: number, b: number, near?: number): { x: number; y: number } {
  const h: F = (x) => f(x) - g(x);
  const x = findZero(h, a, b, near);
  return { x, y: f(x) };
}

/** Numerical derivative (symmetric central difference). */
export function derivative(f: F, x: number): number {
  const h = 1e-5 * (1 + Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

/** Numerical definite integral via composite Simpson's rule. */
export function integral(f: F, a: number, b: number): number {
  if (a === b) return 0;
  const sign = a < b ? 1 : -1; if (a > b) [a, b] = [b, a];
  const n = 1000; const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return sign * s * h / 3;
}
