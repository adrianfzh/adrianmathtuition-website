// The geometry behind a Geography figure (SPEC-HUMANITIES.md §B figures, 7 Oct
// 2026). A figure is DRAWN FROM THE QUESTION'S OWN TABLE, so the picture and the
// numbers the reader is given cannot disagree. Pure: axis scale and tick values.
import type { DataTable } from './humanities-questions';

export type FigureKind = 'bar' | 'line' | 'climate';

/** A round top for an axis and the ticks up to it: 0 … top in 4 or 5 even steps. */
export function niceAxis(maxValue: number, minValue = 0): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(0, minValue);
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
