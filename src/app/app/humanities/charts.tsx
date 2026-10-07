// A Geography figure drawn from the question's own table (SPEC-HUMANITIES.md §B
// figures): a bar graph, a line graph, or a climate graph (rainfall bars +
// a temperature line). Every value is printed on the graph, so a phone-sized
// figure can still be read exactly. Pure SVG, no script.
import type { DataTable } from '@/lib/humanities-questions';
import { chartData, niceAxis, tickLabel, type FigureKind } from '@/lib/humanities-chart';

const W = 340, H = 240, L = 40, R = 14, T = 16, B = 44;
const NAVY = '#1e2a4a', BAR = '#d6a253', LINE = '#b4472e', LINE2 = '#2c6e8f', GRID = '#e7e2d6';

export function DataChart({ table, kind }: { table: DataTable; kind: FigureKind }) {
  const d = chartData(table);
  if (!d) return null;
  const n = d.categories.length;
  const climate = kind === 'climate';
  const right = climate ? 40 : R;
  const pw = W - L - right, ph = H - T - B;
  const band = pw / n;
  const cx = (i: number) => L + band * (i + 0.5);
  // The left axis: the bars (or the lines). A climate graph's right axis is the temperature.
  const leftSeries = climate ? [d.series[1]] : d.series;
  const la = niceAxis(Math.max(...leftSeries.flatMap(s => s.values)), Math.min(...leftSeries.flatMap(s => s.values)));
  const ly = (v: number) => T + ph - ((v - la.min) / (la.max - la.min)) * ph;
  const ra = climate ? niceAxis(Math.max(...d.series[0].values), Math.min(...d.series[0].values)) : null;
  const ry = (v: number) => T + ph - ((v - ra!.min) / (ra!.max - ra!.min)) * ph;
  const small = n > 8;
  const lines = kind === 'line' ? d.series.map((s, k) => ({ s, y: ly, colour: k ? LINE2 : LINE })) : climate ? [{ s: d.series[0], y: ry, colour: LINE }] : [];
  const bars = kind === 'bar' ? d.series[0] : climate ? d.series[1] : null;

  return (
    <figure className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <figcaption className="text-sm font-bold text-navy">{table.caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label={table.caption}>
        {la.ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - right} y1={ly(t)} y2={ly(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 5} y={ly(t) + 3.5} textAnchor="end" fontSize={9.5} fill={NAVY}>{tickLabel(t)}</text>
          </g>
        ))}
        {ra && ra.ticks.map(t => <text key={t} x={W - right + 5} y={ry(t) + 3.5} fontSize={9.5} fill={LINE}>{tickLabel(t)}</text>)}
        <line x1={L} x2={L} y1={T} y2={T + ph} stroke={NAVY} strokeWidth={1} />
        <line x1={L} x2={W - right} y1={ly(Math.max(0, la.min))} y2={ly(Math.max(0, la.min))} stroke={NAVY} strokeWidth={1} />
        {bars && bars.values.map((v, i) => {
          const y0 = ly(Math.max(0, la.min)), y1 = ly(v);
          return (
            <g key={i}>
              <rect x={cx(i) - band * 0.32} y={Math.min(y0, y1)} width={band * 0.64} height={Math.abs(y0 - y1)} fill={BAR} />
              <text x={cx(i)} y={Math.min(y0, y1) - 3} textAnchor="middle" fontSize={small ? 8 : 9.5} fill={NAVY}>{tickLabel(v)}</text>
            </g>
          );
        })}
        {lines.map(({ s, y, colour }, k) => (
          <g key={s.name}>
            <polyline points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={colour} strokeWidth={2} />
            {s.values.map((v, i) => {
              // Keep the number off the line: under a dip, beside a steep rise or fall, above a peak.
              const prev = s.values[i - 1] ?? v, next = s.values[i + 1] ?? v;
              const dip = v < prev && v <= next || v <= prev && v < next;
              const falling = prev > v && next < v, rising = prev < v && next > v;
              const below = k ? !(v > prev && v >= next) : dip;
              const dx = falling ? 5 : rising ? -5 : 0;
              return (
                <g key={i}>
                  <circle cx={cx(i)} cy={y(v)} r={2.6} fill={colour} />
                  <text x={cx(i) + dx} y={y(v) + (below ? 12 : -6)} textAnchor={falling ? 'start' : rising ? 'end' : 'middle'}
                    fontSize={small ? 8 : 9.5} fontWeight={600} fill={colour} stroke="#fff" strokeWidth={2.5} paintOrder="stroke">{tickLabel(v)}</text>
                </g>
              );
            })}
          </g>
        ))}
        {d.categories.map((c, i) => (
          <text key={i} x={cx(i)} y={T + ph + 13} textAnchor="middle" fontSize={small ? 8 : 9.5} fill={NAVY}>{c}</text>
        ))}
        <text x={L + pw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={NAVY}>{table.columns[0]}</text>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-700">
        {climate ? (
          <>
            <li><span className="inline-block w-3 h-3 align-[-1px] mr-1.5" style={{ background: BAR }} />{d.series[1].name} (bars, left)</li>
            <li><span className="inline-block w-3 h-[2px] align-middle mr-1.5" style={{ background: LINE }} />{d.series[0].name} (line, right)</li>
          </>
        ) : d.series.map((s, k) => (
          <li key={s.name}>
            <span className={`inline-block w-3 align-middle mr-1.5 ${kind === 'bar' ? 'h-3' : 'h-[2px]'}`} style={{ background: kind === 'bar' ? BAR : k ? LINE2 : LINE }} />{s.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
