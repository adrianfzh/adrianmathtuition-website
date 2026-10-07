// A Geography figure drawn from the question's own table (SPEC-HUMANITIES.md §B
// figures): a bar graph, a line graph, or a climate graph. Every value is
// printed on the graph, so a phone-sized figure can still be read exactly.
// A climate graph is drawn as two panels on one month axis — the temperature
// line above, the rainfall bars below — so the numbers never sit on each other.
// Pure SVG, no script.
import type { DataTable } from '@/lib/humanities-questions';
import { chartData, niceAxis, tickLabel, type FigureKind } from '@/lib/humanities-chart';

const W = 340, L = 40, R = 14;
const NAVY = '#1e2a4a', BAR = '#d6a253', LINE = '#b4472e', LINE2 = '#2c6e8f', GRID = '#e7e2d6';
const HALO = { stroke: '#fff', strokeWidth: 2.5, paintOrder: 'stroke' as const };

interface Axis { min: number; max: number; ticks: number[] }
interface Panel { top: number; height: number; axis: Axis }
const yOf = (p: Panel) => (v: number) => p.top + p.height - ((v - p.axis.min) / (p.axis.max - p.axis.min)) * p.height;

export function DataChart({ table, kind }: { table: DataTable; kind: FigureKind }) {
  const d = chartData(table);
  if (!d) return null;
  const n = d.categories.length;
  const pw = W - L - R, band = pw / n;
  const cx = (i: number) => L + band * (i + 0.5);
  const fs = n > 8 ? 8 : 9.5;
  const all = (ss: { values: number[] }[]) => ss.flatMap(s => s.values);

  // The panels: one, or — for a climate graph — the temperature above the rainfall.
  const climate = kind === 'climate';
  const linePanel: Panel | null = climate
    ? { top: 18, height: 62, axis: niceAxis(Math.max(...d.series[0].values), Math.min(...d.series[0].values), false) }
    : kind === 'line' ? { top: 18, height: 178, axis: niceAxis(Math.max(...all(d.series)), Math.min(...all(d.series)), false) } : null;
  const barPanel: Panel | null = climate
    ? { top: 112, height: 120, axis: niceAxis(Math.max(...d.series[1].values)) }
    : kind === 'bar' ? { top: 18, height: 178, axis: niceAxis(Math.max(...d.series[0].values), Math.min(...d.series[0].values)) } : null;
  const bottom = (barPanel ?? linePanel)!;
  const H = bottom.top + bottom.height + 44;
  const lines = climate ? [d.series[0]] : kind === 'line' ? d.series : [];
  const bars = climate ? d.series[1] : kind === 'bar' ? d.series[0] : null;
  // Two lines: at each point the higher one is numbered above, the lower one below — so crossing lines stay readable.
  const two = lines.length === 2;

  const frame = (p: Panel, colour: string) => {
    const y = yOf(p);
    const base = y(Math.max(p.axis.min, Math.min(0, p.axis.max)));
    return (
      <g>
        {p.axis.ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 5} y={y(t) + 3.5} textAnchor="end" fontSize={9.5} fill={colour}>{tickLabel(t)}</text>
          </g>
        ))}
        <line x1={L} x2={L} y1={p.top} y2={p.top + p.height} stroke={NAVY} strokeWidth={1} />
        <line x1={L} x2={W - R} y1={p.axis.min < 0 ? base : p.top + p.height} y2={p.axis.min < 0 ? base : p.top + p.height} stroke={NAVY} strokeWidth={1} />
      </g>
    );
  };

  return (
    <figure className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <figcaption className="text-sm font-bold text-navy">{table.caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label={table.caption}>
        {linePanel && frame(linePanel, climate ? LINE : NAVY)}
        {barPanel && frame(barPanel, NAVY)}
        {climate && <text x={L} y={linePanel!.top - 7} fontSize={9.5} fontWeight={600} fill={LINE}>{d.series[0].name}</text>}
        {climate && <text x={L} y={barPanel!.top - 7} fontSize={9.5} fontWeight={600} fill={NAVY}>{d.series[1].name}</text>}
        {bars && barPanel && bars.values.map((v, i) => {
          const y = yOf(barPanel);
          const y0 = y(Math.max(0, barPanel.axis.min)), y1 = y(v);
          return (
            <g key={i}>
              <rect x={cx(i) - band * 0.32} y={Math.min(y0, y1)} width={band * 0.64} height={Math.abs(y0 - y1)} fill={BAR} />
              <text x={cx(i)} y={Math.min(y0, y1) - 3} textAnchor="middle" fontSize={fs} fill={NAVY}>{tickLabel(v)}</text>
            </g>
          );
        })}
        {linePanel && lines.map((s, k) => {
          const y = yOf(linePanel);
          const colour = k ? LINE2 : LINE;
          return (
            <g key={s.name}>
              <polyline points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={colour} strokeWidth={2} />
              {s.values.map((v, i) => {
                // Keep the number off the line: under a dip, beside a steep rise or fall, above a peak.
                const prev = s.values[i - 1] ?? v, next = s.values[i + 1] ?? v;
                const steep = Math.abs(y(prev) - y(v)) > 14 || Math.abs(y(next) - y(v)) > 14;
                const falling = steep && prev > v && next < v, rising = steep && prev < v && next > v;
                const other = two ? lines[1 - k].values[i] : 0;
                const below = two ? v < other || (v === other && k === 1) : (v < prev && v <= next) || (v <= prev && v < next);
                const dx = two ? 0 : falling ? 5 : rising ? -5 : 0;
                return (
                  <g key={i}>
                    <circle cx={cx(i)} cy={y(v)} r={2.6} fill={colour} />
                    <text x={cx(i) + dx} y={y(v) + (below ? 12 : -6)} textAnchor={dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}
                      fontSize={fs} fontWeight={600} fill={colour} {...HALO}>{tickLabel(v)}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {d.categories.map((c, i) => (
          <text key={i} x={cx(i)} y={bottom.top + bottom.height + 13} textAnchor="middle" fontSize={fs} fill={NAVY}>{c}</text>
        ))}
        <text x={L + pw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={NAVY}>{table.columns[0]}</text>
      </svg>
      {!climate && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-700">
          {d.series.map((s, k) => (
            <li key={s.name}>
              <span className={`inline-block w-3 align-middle mr-1.5 ${kind === 'bar' ? 'h-3' : 'h-[2px]'}`} style={{ background: kind === 'bar' ? BAR : k ? LINE2 : LINE }} />{s.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
