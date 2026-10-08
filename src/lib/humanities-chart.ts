// The geometry behind a Geography figure (SPEC-HUMANITIES.md §B figures, 7 Oct
// 2026). A figure is DRAWN FROM THE QUESTION'S OWN TABLE, so the picture and the
// numbers the reader is given cannot disagree. Pure: axis scale and tick values.
import type { DataTable } from './humanities-questions';

export type FigureKind = 'bar' | 'line' | 'climate';

/** A round top (and bottom) for an axis and the ticks between: 4 or 5 even steps. */
export function niceAxis(maxValue: number, minValue = 0, fromZero = true): { min: number; max: number; ticks: number[] } {
  // A bar graph starts at zero. A line graph may start near its lowest value, so close lines stay apart.
  const lo = fromZero ? Math.min(0, minValue) : minValue;
  const span = Math.max(maxValue - lo, 1e-9);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { min, max, ticks };
}

/** "8.1", "1,200", "−5" — a number the way a graph prints it. */
export function tickLabel(v: number): string {
  const s = Math.abs(v) >= 1000 ? Math.abs(v).toLocaleString('en-SG') : String(Number(Math.abs(v).toFixed(2)));
  return v < 0 ? `−${s}` : s;
}

export interface ChartSeries { name: string; values: number[] }
/** The table's first column as the categories and every other column as a series of numbers. Null when a cell is not a number. */
export function chartData(table: DataTable): { categories: string[]; series: ChartSeries[] } | null {
  const categories = table.rows.map(r => r[0]);
  const series: ChartSeries[] = [];
  for (let c = 1; c < table.columns.length; c++) {
    const values = table.rows.map(r => Number(String(r[c]).replace(/,/g, '')));
    if (values.some(v => !Number.isFinite(v))) return null;
    series.push({ name: table.columns[c], values });
  }
  return series.length ? { categories, series } : null;
}

/** Can this table be drawn as this figure? A climate graph is exactly temperature then rainfall. */
export function figureProblem(table: DataTable, kind: FigureKind): string | null {
  const d = chartData(table);
  if (!d) return 'a figure needs numbers in every column after the first';
  if (kind === 'bar' && d.series.length !== 1) return 'a bar graph draws one column of numbers';
  if (kind === 'line' && d.series.length > 2) return 'a line graph draws one or two columns of numbers';
  if (kind === 'climate' && (d.series.length !== 2 || !/temp/i.test(d.series[0].name) || !/rain/i.test(d.series[1].name))) return 'a climate graph is temperature, then rainfall';
  if (d.categories.length < 3 || d.categories.length > 12) return 'a figure draws 3 to 12 rows';
  return null;
}

// ── More figures from a question's own numbers (8 Oct 2026): pie charts, scatter graphs with a
// best-fit line, wind roses, and five kinds of map of the made-up Country X. Pure geometry. ──

export type MapKind = 'choropleth' | 'dots' | 'symbols' | 'flows' | 'isolines';
export type MoreFigureKind = 'pie' | 'scatter' | 'windrose' | MapKind;
export const MAP_KINDS: readonly MapKind[] = ['choropleth', 'dots', 'symbols', 'flows', 'isolines'];
export const isMapKind = (k: string): k is MapKind => (MAP_KINDS as readonly string[]).includes(k);
export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export type Pt = [number, number];
export interface MapRegion { name: string; points: Pt[] }

/** The least-squares line through the points: y = slope·x + intercept. */
export function bestFit(points: Pt[]): { slope: number; intercept: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n, my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/** Each slice of a pie as start and end angles (radians, clockwise from the top) and its share. */
export function pieSlices(values: number[]): { start: number; end: number; share: number }[] {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return values.map(v => { const start = at; at += (v / total) * Math.PI * 2; return { start, end: at, share: v / total }; });
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The middle of a region (the average of its corners — good enough for these compact shapes). */
export function centroid(poly: Pt[]): Pt {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

/** `n` points inside a region, the same every time (a small seeded generator), kept a little off the border and off each other. */
export function dotsIn(poly: Pt[], n: number, seed = 1): Pt[] {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const c = centroid(poly);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out: Pt[] = [];
  for (let tries = 0, gap = 6; out.length < n && tries < n * 400; tries++) {
    if (tries && tries % (n * 60) === 0) gap = Math.max(2.5, gap - 1);
    const p: Pt = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    // Pull the point slightly towards the middle so no dot sits on a border.
    const q: Pt = [p[0] + (c[0] - p[0]) * 0.12, p[1] + (c[1] - p[1]) * 0.12];
    if (pointInPolygon(q, poly) && out.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) >= gap)) out.push(q);
  }
  return out;
}

/** What one dot stands for, so the fullest region has roughly 30 dots: the round number (1, 2, 5, 10, 20, 50 …) nearest to max ÷ 30. */
export function dotValue(max: number): number {
  const raw = Math.max(max / 30, 1e-9);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map(m => m * mag).sort((x, y) => Math.abs(x - raw) - Math.abs(y - raw))[0];
  return Math.max(1, nice);
}

/** Four equal classes for a shaded (choropleth) map: their lower bounds, on round numbers. */
export function shadeClasses(values: number[]): number[] {
  const a = niceAxis(Math.max(...values), Math.min(...values), false);
  const step = (a.max - a.min) / 4;
  return [0, 1, 2, 3].map(i => Number((a.min + i * step).toFixed(6)));
}
export const classOf = (v: number, bounds: number[]): number => Math.max(0, bounds.filter(b => v >= b).length - 1);

/**
 * Lines of equal value (isolines) across a w × h drawing, from values known at a few places.
 * Each level is traced by marching squares; the result is short straight pieces per level.
 */
/** The levels to draw: round numbers strictly between the lowest and highest value, at least four where the data allows. */
export function isolineLevels(values: number[]): number[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const a = niceAxis(hi, lo, false);
  let step = a.ticks[1] - a.ticks[0];
  if ((hi - lo) / step < 4) step /= 2;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) if (v > lo) out.push(Number(v.toFixed(6)));
  return out;
}
export function isolines(places: { at: Pt; value: number }[], levels: number[], w: number, h: number, cell = 4): { level: number; segments: [Pt, Pt][] }[] {
  // The field: the best-fitting slope across the map (so the lines run smoothly), plus the
  // distance-weighted leftovers, so the field still equals each place's own value at that place.
  const n = places.length;
  const mx = places.reduce((t, p) => t + p.at[0], 0) / n, my = places.reduce((t, p) => t + p.at[1], 0) / n, mv = places.reduce((t, p) => t + p.value, 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxv = 0, syv = 0;
  for (const p of places) { const dx = p.at[0] - mx, dy = p.at[1] - my, dv = p.value - mv; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxv += dx * dv; syv += dy * dv; }
  const det = sxx * syy - sxy * sxy || 1;
  const bx = (sxv * syy - syv * sxy) / det, by = (syv * sxx - sxv * sxy) / det;
  const plane = (x: number, y: number) => mv + bx * (x - mx) + by * (y - my);
  const left = places.map(p => ({ at: p.at, r: p.value - plane(p.at[0], p.at[1]) }));
  const f = (x: number, y: number) => {
    let num = 0, den = 0;
    for (const p of left) { const d2 = (p.at[0] - x) ** 2 + (p.at[1] - y) ** 2; if (d2 < 1e-6) return plane(x, y) + p.r; const wgt = 1 / d2; num += wgt * p.r; den += wgt; }
    return plane(x, y) + num / den;
  };
  const nx = Math.floor(w / cell), ny = Math.floor(h / cell);
  const grid = Array.from({ length: ny + 1 }, (_, j) => Array.from({ length: nx + 1 }, (_, i) => f(i * cell, j * cell)));
  const lerp = (a: number, b: number, lv: number) => (lv - a) / (b - a);
  return levels.map(level => {
    const segments: [Pt, Pt][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const [tl, tr, br, bl] = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      const x = i * cell, y = j * cell;
      const cut: Pt[] = [];
      if ((tl < level) !== (tr < level)) cut.push([x + lerp(tl, tr, level) * cell, y]);
      if ((tr < level) !== (br < level)) cut.push([x + cell, y + lerp(tr, br, level) * cell]);
      if ((bl < level) !== (br < level)) cut.push([x + lerp(bl, br, level) * cell, y + cell]);
      if ((tl < level) !== (bl < level)) cut.push([x, y + lerp(tl, bl, level) * cell]);
      if (cut.length >= 2) segments.push([cut[0], cut[1]]);
      if (cut.length === 4) segments.push([cut[2], cut[3]]);
    }
    return { level, segments };
  });
}

/** Can this table be drawn as this figure? */
export function moreFigureProblem(table: DataTable, kind: MoreFigureKind, regionNames: string[]): string | null {
  const d = chartData(table);
  if (kind === 'flows') {
    if (table.columns.length !== 3) return 'a flow line map has three columns: from, to, and a number';
    if (table.rows.some(r => !regionNames.includes(r[0]) || !regionNames.includes(r[1]) || !Number.isFinite(Number(String(r[2]).replace(/,/g, ''))))) return 'a flow line map names two regions of Country X and a number on every row';
    return table.rows.length >= 2 && table.rows.length <= 6 ? null : 'a flow line map draws 2 to 6 flows';
  }
  if (!d) return 'a figure needs numbers in every column after the first';
  if (kind === 'pie') return d.series.length === 1 && d.categories.length >= 2 && d.categories.length <= 6 && d.series[0].values.every(v => v > 0) ? null : 'a pie chart draws one column of 2 to 6 positive numbers';
  if (kind === 'scatter') return d.series.length === 2 && d.categories.length >= 5 && d.categories.length <= 14 ? null : 'a scatter graph draws two columns of numbers for 5 to 14 places';
  if (kind === 'windrose') return d.series.length === 1 && d.categories.join() === WIND_DIRECTIONS.join() ? null : 'a wind rose has one number for each of N, NE, E, SE, S, SW, W, NW, in that order';
  if (d.series.length !== 1) return 'a map draws one column of numbers';
  if (d.categories.length !== regionNames.length || d.categories.some(c => !regionNames.includes(c))) return `a map of Country X has one row for each region: ${regionNames.join(', ')}`;
  return null;
}
