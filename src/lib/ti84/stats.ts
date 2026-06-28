// Statistics + distributions behind the TI-84 STAT and DISTR menus (H2-relevant).
// Pure + node-testable.

// ── Lanczos log-gamma (stable factorials/combinations) ──
const G = 7;
const C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = C[0];
  for (let i = 1; i < G + 2; i++) x += C[i] / (z + i);
  const t = z + G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const logComb = (n: number, k: number) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

// ── Normal ──
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
// Hart's algorithm — standard normal CDF accurate to ~1e-15.
export function normCdfStd(x: number): number {
  const z = Math.abs(x); let c = 0;
  if (z <= 37) {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-02 * z + 0.700383064443688;
      b = b * z + 6.37396220353165; b = b * z + 33.912866078383; b = b * z + 112.079291497871; b = b * z + 221.213596169931; b = b * z + 220.206867912376;
      let d = 8.83883476483184e-02 * z + 1.75566716318264; d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674; d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
      c = e * b / d;
    } else {
      let f = z + 0.65; f = z + 4 / f; f = z + 3 / f; f = z + 2 / f; f = z + 1 / f;
      c = e / (2.506628274631 * f);
    }
  }
  return x <= 0 ? c : 1 - c;
}
export function normalpdf(x: number, mu = 0, sd = 1): number {
  return Math.exp(-((x - mu) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
}
export function normalcdf(lo: number, hi: number, mu = 0, sd = 1): number {
  return normCdfStd((hi - mu) / sd) - normCdfStd((lo - mu) / sd);
}
// Acklam's inverse normal CDF (|err| < 1.2e-9)
export function invNorm(p: number, mu = 0, sd = 1): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425; let z: number;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  // one Halley step against the high-precision CDF → full double precision
  const e = normCdfStd(z) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(z * z / 2);
  z = z - u / (1 + z * u / 2);
  return mu + sd * z;
}

// ── Binomial / Poisson ──
export function binompdf(n: number, p: number, k: number): number {
  k = Math.round(k); n = Math.round(n);
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logComb(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
export function binomcdf(n: number, p: number, k: number): number {
  let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += binompdf(n, p, i); return Math.min(1, s);
}
export function poissonpdf(mu: number, k: number): number {
  k = Math.round(k); if (k < 0) return 0; if (mu < 0) return NaN;
  if (mu === 0) return k === 0 ? 1 : 0;
  return Math.exp(-mu + k * Math.log(mu) - logGamma(k + 1));
}
export function poissoncdf(mu: number, k: number): number {
  let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += poissonpdf(mu, i); return Math.min(1, s);
}

// ── Descriptive stats ──
export interface OneVar { n: number; mean: number; sumx: number; sumx2: number; Sx: number; sigmax: number; min: number; q1: number; med: number; q3: number; max: number; }
const median = (a: number[]): number => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

export function oneVarStats(data: number[]): OneVar | null {
  const n = data.length; if (!n) return null;
  const s = [...data].sort((x, y) => x - y);
  const sumx = s.reduce((a, b) => a + b, 0);
  const sumx2 = s.reduce((a, b) => a + b * b, 0);
  const mean = sumx / n;
  const varP = sumx2 / n - mean * mean;
  const sigmax = Math.sqrt(Math.max(0, varP));
  const Sx = n > 1 ? Math.sqrt(Math.max(0, (sumx2 - n * mean * mean) / (n - 1))) : 0;
  const mid = Math.floor(n / 2);
  const lower = s.slice(0, mid);
  const upper = n % 2 ? s.slice(mid + 1) : s.slice(mid);
  return { n, mean, sumx, sumx2, Sx, sigmax, min: s[0], q1: lower.length ? median(lower) : s[0], med: median(s), q3: upper.length ? median(upper) : s[n - 1], max: s[n - 1] };
}

export interface TwoVar { n: number; xbar: number; ybar: number; sumx: number; sumy: number; sumx2: number; sumy2: number; sumxy: number; Sx: number; Sy: number; }
export interface LinReg { a: number; b: number; r: number; r2: number; }

export function twoVarStats(xs: number[], ys: number[]): { two: TwoVar; reg: LinReg } | null {
  const n = Math.min(xs.length, ys.length); if (n < 2) return null;
  let sumx = 0, sumy = 0, sumx2 = 0, sumy2 = 0, sumxy = 0;
  for (let i = 0; i < n; i++) { sumx += xs[i]; sumy += ys[i]; sumx2 += xs[i] * xs[i]; sumy2 += ys[i] * ys[i]; sumxy += xs[i] * ys[i]; }
  const xbar = sumx / n, ybar = sumy / n;
  const Sxx = sumx2 - n * xbar * xbar, Syy = sumy2 - n * ybar * ybar, Sxy = sumxy - n * xbar * ybar;
  const a = Sxy / Sxx;          // slope (LinReg ax+b)
  const b = ybar - a * xbar;    // intercept
  const r = Sxy / Math.sqrt(Sxx * Syy);
  const two: TwoVar = { n, xbar, ybar, sumx, sumy, sumx2, sumy2, sumxy, Sx: Math.sqrt(Sxx / (n - 1)), Sy: Math.sqrt(Syy / (n - 1)) };
  return { two, reg: { a, b, r, r2: r * r } };
}
