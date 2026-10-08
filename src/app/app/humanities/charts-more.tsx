// More Geography figures drawn from a question's own table (SPEC-HUMANITIES.md §B,
// 8 Oct 2026): a pie chart, a scatter graph with its best-fit line, a wind rose, and
// five kinds of map of the made-up Country X — shaded (choropleth), dot, proportional
// symbol, flow line and isoline. Pure SVG, no script. The reader is given the numbers.
import type { DataTable } from '@/lib/humanities-questions';
import {
  chartData, niceAxis, tickLabel, bestFit, pieSlices, centroid, dotsIn, dotValue, shadeClasses, classOf, isolines, isolineLevels, pointInPolygon,
  type MoreFigureKind, type MapRegion, type Pt,
} from '@/lib/humanities-chart';
import countryJson from '../../../../data/humanities/geography/country-x.json';

const COUNTRY = countryJson as unknown as { scaleKm: number; scalePx: number; regions: MapRegion[] };
export const COUNTRY_X_REGIONS: string[] = COUNTRY.regions.map(r => r.name);

const NAVY = '#1e2a4a', SEA = '#dbeaf3', LAND = '#f1e6cf', GRID = '#e7e2d6', RED = '#b4472e';
const PIE = ['#d6a253', '#2c6e8f', '#b4472e', '#7fa66a', '#8a8f9c', '#c9a0c4'];
const SHADES = ['#f6e3c5', '#e9bf86', '#d28f4a', '#a8571f'];
const HALO = { stroke: '#fff', strokeWidth: 2.4, paintOrder: 'stroke' as const };
const poly = (pts: Pt[]) => pts.map(p => p.join(',')).join(' ');
const num = (s: string) => Number(String(s).replace(/,/g, ''));

function Frame({ caption, children, legend }: { caption: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <figure className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <figcaption className="text-sm font-bold text-navy">{caption}</figcaption>
      {children}
      {legend}
    </figure>
  );
}

function Pie({ table }: { table: DataTable }) {
  const d = chartData(table)!;
  const values = d.series[0].values;
  const R = 78, cx = 110, cy = 96;
  const at = (a: number, r: number): Pt => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
  return (
    <Frame caption={table.caption} legend={
      <ul className="mt-1 space-y-0.5 text-[13px] text-gray-800">
        {d.categories.map((c, i) => (
          <li key={c}><span className="inline-block w-3 h-3 align-[-1px] mr-1.5 rounded-sm" style={{ background: PIE[i % PIE.length] }} />{c}: <b>{tickLabel(values[i])}</b></li>
        ))}
      </ul>}>
      <svg viewBox="0 0 220 192" className="w-full max-w-[280px] h-auto mt-2 mx-auto" role="img" aria-label={table.caption}>
        {pieSlices(values).map((s, i) => {
          const [x0, y0] = at(s.start, R), [x1, y1] = at(s.end, R), [lx, ly] = at((s.start + s.end) / 2, R * 0.62);
          return (
            <g key={i}>
              <path d={`M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${s.end - s.start > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`} fill={PIE[i % PIE.length]} stroke="#fff" strokeWidth={1.5} />
              {s.share >= 0.06 && <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{Math.round(s.share * 100)}%</text>}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

function Scatter({ table }: { table: DataTable }) {
  const d = chartData(table)!;
  const xs = d.series[0].values, ys = d.series[1].values;
  const W = 340, H = 236, L = 44, R = 14, T = 12, B = 44;
  const ax = niceAxis(Math.max(...xs), Math.min(...xs), false), ay = niceAxis(Math.max(...ys), Math.min(...ys), false);
  const X = (v: number) => L + ((v - ax.min) / (ax.max - ax.min)) * (W - L - R);
  const Y = (v: number) => T + (H - T - B) - ((v - ay.min) / (ay.max - ay.min)) * (H - T - B);
  const fit = bestFit(xs.map((x, i): Pt => [x, ys[i]]));
  // The best-fit line is drawn only across the points, and kept inside the graph.
  const [xa, xb] = [Math.min(...xs), Math.max(...xs)];
  const clampY = (v: number) => Math.min(ay.max, Math.max(ay.min, v));
  return (
    <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-700"><span className="inline-block w-4 h-[2px] align-middle mr-1.5" style={{ background: RED }} />Line of best fit</p>}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label={table.caption}>
        {ay.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke={GRID} /><text x={L - 5} y={Y(t) + 3.5} textAnchor="end" fontSize={9.5} fill={NAVY}>{tickLabel(t)}</text></g>)}
        {ax.ticks.map(t => <g key={t}><line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke={GRID} /><text x={X(t)} y={H - B + 13} textAnchor="middle" fontSize={9.5} fill={NAVY}>{tickLabel(t)}</text></g>)}
        <line x1={L} x2={L} y1={T} y2={H - B} stroke={NAVY} /><line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={NAVY} />
        <line x1={X(xa)} y1={Y(clampY(fit.slope * xa + fit.intercept))} x2={X(xb)} y2={Y(clampY(fit.slope * xb + fit.intercept))} stroke={RED} strokeWidth={1.8} />
        {xs.map((x, i) => <circle key={i} cx={X(x)} cy={Y(ys[i])} r={3.4} fill={NAVY} />)}
        <text x={L + (W - L - R) / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={NAVY}>{table.columns[1]}</text>
        <text x={11} y={T + (H - T - B) / 2} textAnchor="middle" fontSize={10} fill={NAVY} transform={`rotate(-90 11 ${T + (H - T - B) / 2})`}>{table.columns[2]}</text>
      </svg>
    </Frame>
  );
}

function WindRose({ table }: { table: DataTable }) {
  const d = chartData(table)!;
  const values = d.series[0].values;
  const cx = 130, cy = 122, R = 78;
  const a = niceAxis(Math.max(...values));
  const len = (v: number) => (v / a.max) * R;
  const dir = (i: number): Pt => [Math.sin((i * Math.PI) / 4), -Math.cos((i * Math.PI) / 4)];
  return (
    <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-700">Each bar points to where the wind blows FROM. Its length shows: {table.columns[1]}.</p>}>
      <svg viewBox="0 0 260 244" className="w-full max-w-[320px] h-auto mt-2 mx-auto" role="img" aria-label={table.caption}>
        {a.ticks.filter(t => t > 0).map(t => (
          <g key={t}><circle cx={cx} cy={cy} r={len(t)} fill="none" stroke={GRID} /><text x={cx + 3} y={cy - len(t) + 9} fontSize={8} fill="#6b7280">{tickLabel(t)}</text></g>
        ))}
        {values.map((v, i) => {
          const [ux, uy] = dir(i), l = len(v);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={cx + ux * l} y2={cy + uy * l} stroke="#2c6e8f" strokeWidth={9} strokeLinecap="butt" />
              <text x={cx + ux * Math.max(l + 9, 30)} y={cy + uy * Math.max(l + 9, 30) + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={NAVY} {...HALO}>{tickLabel(v)}</text>
              <text x={cx + ux * (R + 26)} y={cy + uy * (R + 26) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={NAVY}>{d.categories[i]}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={2.5} fill={NAVY} />
      </svg>
    </Frame>
  );
}

/** The outline of Country X with its seven regions, a north arrow and a scale bar; `fill` colours a region. */
function Country({ fill, names = true, children }: { fill?: (name: string) => string; names?: boolean; children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 340 222" className="w-full h-auto mt-2" role="img">
      <defs>
        <clipPath id="cx-land">{COUNTRY.regions.map(r => <polygon key={r.name} points={poly(r.points)} />)}</clipPath>
        <marker id="cx-ah" viewBox="0 0 10 10" refX={8} refY={5} markerUnits="userSpaceOnUse" markerWidth={11} markerHeight={11} orient="auto"><path d="M0,0L10,5L0,10z" fill={RED} /></marker>
      </defs>
      <rect width={340} height={222} fill={SEA} />
      {COUNTRY.regions.map(r => <polygon key={r.name} points={poly(r.points)} fill={fill ? fill(r.name) : LAND} stroke={NAVY} strokeWidth={1} strokeLinejoin="round" />)}
      {children}
      {names && COUNTRY.regions.map(r => { const [x, y] = centroid(r.points); return <text key={r.name} x={x} y={y - 9} textAnchor="middle" fontSize={10} fontWeight={600} fill={NAVY} {...HALO}>{r.name}</text>; })}
      <g transform="translate(316 26)"><path d="M0,-14 L5,4 L0,0 L-5,4 Z" fill={NAVY} /><text x={0} y={16} textAnchor="middle" fontSize={10} fontWeight={700} fill={NAVY}>N</text></g>
      <g transform="translate(14 208)"><line x1={0} x2={COUNTRY.scalePx} y1={0} y2={0} stroke={NAVY} strokeWidth={1.5} /><line x1={0} x2={0} y1={-3} y2={3} stroke={NAVY} /><line x1={COUNTRY.scalePx} x2={COUNTRY.scalePx} y1={-3} y2={3} stroke={NAVY} /><text x={COUNTRY.scalePx / 2} y={-5} textAnchor="middle" fontSize={8.5} fill={NAVY}>{COUNTRY.scaleKm} km</text></g>
    </svg>
  );
}

function CountryMap({ table, kind }: { table: DataTable; kind: 'choropleth' | 'dots' | 'symbols' | 'flows' | 'isolines' }) {
  const region = (name: string) => COUNTRY.regions.find(r => r.name === name)!;
  const what = table.columns[table.columns.length - 1];

  if (kind === 'flows') {
    const flows = table.rows.map(r => ({ from: centroid(region(r[0]).points), to: centroid(region(r[1]).points), v: num(r[2]) }));
    const max = Math.max(...flows.map(f => f.v));
    return (
      <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-700">A thicker arrow means a bigger number. {what} is printed on each arrow.</p>}>
        <Country names={false}>
          {flows.map((f, i) => {
            // Start a little out from the source's middle and stop short of the target's, so the arrowhead is clear;
            // shift sideways so a flow and its return flow sit side by side.
            const dx = f.to[0] - f.from[0], dy = f.to[1] - f.from[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
            const a: Pt = [f.from[0] + ux * 4 - uy * 5, f.from[1] + uy * 4 + ux * 5], b: Pt = [f.to[0] - ux * 20 - uy * 5, f.to[1] - uy * 20 + ux * 5];
            const lab: Pt = [a[0] + (b[0] - a[0]) * 0.3 - uy * 9, a[1] + (b[1] - a[1]) * 0.3 + ux * 9];
            return (
              <g key={i}>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={RED} strokeOpacity={0.9} strokeWidth={1.5 + (f.v / max) * 5} markerEnd="url(#cx-ah)" />
                <text x={lab[0]} y={lab[1] + 3} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={NAVY} {...HALO}>{tickLabel(f.v)}</text>
              </g>
            );
          })}
          {COUNTRY.regions.map(r => {
            // The names sit away from the middle of the island, where the arrows meet.
            const [x, y] = centroid(r.points), ox = x - 168, oy = y - 108, o = Math.hypot(ox, oy) || 1;
            return <text key={r.name} x={x + (ox / o) * 16} y={y + (oy / o) * 16 + (o < 12 ? 30 : 3)} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={NAVY} {...HALO}>{r.name}</text>;
          })}
        </Country>
      </Frame>
    );
  }

  const d = chartData(table)!;
  const value = (name: string) => d.series[0].values[d.categories.indexOf(name)];
  const values = d.series[0].values;

  if (kind === 'choropleth') {
    const bounds = shadeClasses(values), step = bounds[1] - bounds[0];
    return (
      <Frame caption={table.caption} legend={
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-800">
          {bounds.map((b, i) => <li key={b}><span className="inline-block w-3.5 h-3.5 align-[-2px] mr-1 border border-black/20" style={{ background: SHADES[i] }} />{tickLabel(b)} to {i === 3 ? tickLabel(b + step) : `under ${tickLabel(b + step)}`}</li>)}
          <li className="w-full text-gray-600">{what}</li>
        </ul>}>
        <Country fill={n => SHADES[classOf(value(n), bounds)]} />
      </Frame>
    );
  }
  if (kind === 'dots') {
    const per = dotValue(Math.max(...values));
    return (
      <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-800"><span className="inline-block w-2 h-2 rounded-full align-middle mr-1.5" style={{ background: NAVY }} />1 dot = {tickLabel(per)} ({what})</p>}>
        <Country names={false}>
          {COUNTRY.regions.map((r, k) => dotsIn(r.points, Math.round(value(r.name) / per), k + 1).map((p, i) => <circle key={`${k}-${i}`} cx={p[0]} cy={p[1]} r={1.7} fill={NAVY} />))}
          {COUNTRY.regions.map(r => { const [x, y] = centroid(r.points); return <text key={r.name} x={x} y={y + 3} textAnchor="middle" fontSize={10} fontWeight={700} fill={NAVY} {...HALO}>{r.name}</text>; })}
        </Country>
      </Frame>
    );
  }
  if (kind === 'symbols') {
    const max = Math.max(...values);
    return (
      <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-700">A bigger circle means a bigger number. {what} is printed in each circle.</p>}>
        <Country names={false}>
          {COUNTRY.regions.map(r => {
            const [x, y] = centroid(r.points), v = value(r.name), rad = 5 + Math.sqrt(v / max) * 15;
            return (
              <g key={r.name}>
                <circle cx={x} cy={y} r={rad} fill="#2c6e8f" fillOpacity={0.75} stroke={NAVY} strokeWidth={0.8} />
                <text x={x} y={y + 3.2} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff">{tickLabel(v)}</text>
                <text x={x} y={y + rad + 10} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={NAVY} {...HALO}>{r.name}</text>
              </g>
            );
          })}
        </Country>
      </Frame>
    );
  }
  // Isolines: lines of equal value, from the value at the middle of each region.
  const places = COUNTRY.regions.map(r => ({ at: centroid(r.points), value: value(r.name) }));
  const levels = isolineLevels(values);
  const lines = isolines(places, levels, 340, 200);
  return (
    <Frame caption={table.caption} legend={<p className="mt-1 text-[12px] text-gray-700">Each line joins places with the same value. {what} is printed at each dot and on each line.</p>}>
      <Country names={false}>
        <g clipPath="url(#cx-land)">
          {lines.map(l => l.segments.map((s, i) => <line key={`${l.level}-${i}`} x1={s[0][0]} y1={s[0][1]} x2={s[1][0]} y2={s[1][1]} stroke={RED} strokeWidth={1.3} />))}
        </g>
        {COUNTRY.regions.map(r => { const [x, y] = centroid(r.points); return <g key={r.name}><circle cx={x} cy={y} r={2.2} fill={NAVY} /><text x={x} y={y - 5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={NAVY} {...HALO}>{r.name} {tickLabel(value(r.name))}</text></g>; })}
        {lines.map((l, li) => {
          // Print the level once near the bottom of the line, on two alternating rows so neighbours do not touch.
          const inside = l.segments.map(sg => sg[0]).filter(q => COUNTRY.regions.some(r => pointInPolygon(q, r.points)) && q[1] > 14);
          const row = li % 2 ? 166 : 181;
          const p = inside.sort((u, v) => Math.abs(u[1] - row) - Math.abs(v[1] - row))[0];
          return p ? <text key={l.level} x={p[0]} y={p[1] + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={RED} {...HALO}>{tickLabel(l.level)}</text> : null;
        })}
      </Country>
    </Frame>
  );
}
export function MoreChart({ table, kind }: { table: DataTable; kind: MoreFigureKind }) {
  if (kind === 'pie') return <Pie table={table} />;
  if (kind === 'scatter') return <Scatter table={table} />;
  if (kind === 'windrose') return <WindRose table={table} />;
  return <CountryMap table={table} kind={kind} />;
}
