'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

/* ── Shared axis component ─────────────────────────────────────────────── */
function Axes({ ox, oy, w = 320, h = 240 }: { ox: number; oy: number; w?: number; h?: number }) {
  return (
    <>
      {/* x-axis */}
      <line x1={12} y1={oy} x2={w - 8} y2={oy} stroke="#222" strokeWidth="1.8" />
      <polygon points={`${w - 8},${oy} ${w - 16},${oy - 5} ${w - 16},${oy + 5}`} fill="#222" />
      {/* y-axis */}
      <line x1={ox} y1={h - 10} x2={ox} y2={12} stroke="#222" strokeWidth="1.8" />
      <polygon points={`${ox},12 ${ox - 5},20 ${ox + 5},20`} fill="#222" />
      {/* labels */}
      <text x={w - 6} y={oy + 14} fontSize={14} fill="#222" fontFamily="serif" fontStyle="italic">x</text>
      <text x={ox + 6} y={10} fontSize={14} fill="#222" fontFamily="serif" fontStyle="italic">y</text>
    </>
  );
}

/* ── Exponential graph ─────────────────────────────────────────────────── */
// Matches reference: solid=eˣ, dashed=e⁻ˣ and −eˣ, dash-dot=−e⁻ˣ
// All black. ViewBox 320×240, origin (130,120), scale 34px/unit.
function ExpGraph() {
  const DASH = '8,5';
  const DASHDOT = '8,4,2,4';

  return (
    <svg
      viewBox="0 0 320 240"
      width="100%"
      style={{ maxWidth: 400, display: 'block', margin: '8px auto' }}
      aria-label="Exponential graphs"
    >
      <Axes ox={130} oy={120} w={320} h={240} />

      {/* y = eˣ — solid, rises steeply upper-right, passes through (0,1)=(130,86) */}
      <path
        d="M 12,119 C 55,118 95,112 130,86 C 150,70 162,36 166,14"
        fill="none" stroke="#222" strokeWidth="2"
      />

      {/* y = e⁻ˣ — dashed, falls from upper-left, mirror of eˣ */}
      <path
        d="M 248,119 C 205,118 165,112 130,86 C 110,70 98,36 94,14"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASH}
      />

      {/* y = −eˣ — dashed, mirror of eˣ below x-axis */}
      <path
        d="M 12,121 C 55,122 95,128 130,154 C 150,170 162,204 166,226"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASH}
      />

      {/* y = −e⁻ˣ — dash-dot, lower-left */}
      <path
        d="M 248,121 C 205,122 165,128 130,154 C 110,170 98,204 94,226"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASHDOT}
      />

      {/* (0,1) and (0,−1) dots */}
      <circle cx={130} cy={86} r={2.5} fill="#222" />
      <circle cx={130} cy={154} r={2.5} fill="#222" />

      {/* Curve labels */}
      <text x={93} y={13} fontSize={11} fill="#222" fontFamily="serif" textAnchor="end">
        y = e<tspan dy={-4} fontSize={9}>{'−x'}</tspan>
      </text>
      <text x={169} y={13} fontSize={11} fill="#222" fontFamily="serif">
        y = e<tspan dy={-4} fontSize={9}>x</tspan>
      </text>
      <text x={93} y={229} fontSize={11} fill="#222" fontFamily="serif" textAnchor="end">
        y = −e<tspan dy={-4} fontSize={9}>{'−x'}</tspan>
      </text>
      <text x={169} y={229} fontSize={11} fill="#222" fontFamily="serif">
        y = −e<tspan dy={-4} fontSize={9}>x</tspan>
      </text>
    </svg>
  );
}

/* ── Logarithmic graph ─────────────────────────────────────────────────── */
// Matches reference: solid=lnx, dashed=ln(-x) and −lnx, dash-dot=−ln(-x)
// ViewBox 320×240, origin (130,120), scale 34px/unit.
function LogGraph() {
  const DASH = '8,5';
  const DASHDOT = '8,4,2,4';

  return (
    <svg
      viewBox="0 0 320 240"
      width="100%"
      style={{ maxWidth: 400, display: 'block', margin: '8px auto' }}
      aria-label="Logarithmic graphs"
    >
      <Axes ox={130} oy={120} w={320} h={240} />

      {/* y = ln x — solid. At x=1→SVG(164,120); rises slowly right, falls steeply near x=0 */}
      <path
        d="M 132,228 C 133,200 138,172 150,144 C 158,126 163,121 164,120 C 192,104 248,80 308,62"
        fill="none" stroke="#222" strokeWidth="2"
      />

      {/* y = ln(−x) — dashed. Mirror of lnx across y-axis */}
      <path
        d="M 128,228 C 127,200 122,172 110,144 C 102,126 97,121 96,120 C 68,104 22,80 12,74"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASH}
      />

      {/* y = −ln x — dashed. Mirror of lnx across x-axis */}
      <path
        d="M 132,12 C 133,40 138,68 150,96 C 158,114 163,119 164,120 C 192,136 248,160 308,178"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASH}
      />

      {/* y = −ln(−x) — dash-dot. Mirror across both axes */}
      <path
        d="M 128,12 C 127,40 122,68 110,96 C 102,114 97,119 96,120 C 68,136 22,160 12,166"
        fill="none" stroke="#222" strokeWidth="2" strokeDasharray={DASHDOT}
      />

      {/* x-intercept dots at (1,0)=(164,120) and (−1,0)=(96,120) */}
      <circle cx={164} cy={120} r={2.5} fill="#222" />
      <circle cx={96} cy={120} r={2.5} fill="#222" />

      {/* Curve labels */}
      <text x={16} y={70} fontSize={11} fill="#222" fontFamily="serif">y = ln(−x)</text>
      <text x={270} y={60} fontSize={11} fill="#222" fontFamily="serif">y = ln x</text>
      <text x={16} y={169} fontSize={11} fill="#222" fontFamily="serif">y = −ln(−x)</text>
      <text x={262} y={182} fontSize={11} fill="#222" fontFamily="serif">y = −ln x</text>
    </svg>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ExpLogGraphsPage() {
  return (
    <FormulaPageLayout
      title="Exponential &amp; Logarithmic Graphs"
      subtitle="O-Level A Math"
      contentId="exp-log-content"
    >
      <FormulaSection title="Exponential Graphs" subtitle="4 basic shapes:">
        <ExpGraph />
      </FormulaSection>

      <FormulaSection title="Logarithmic Graphs" subtitle="4 basic shapes:">
        <LogGraph />
        <FormulaNoteBox html="<strong>Asymptote of $y = \ln(ax - b)$:</strong><br>Set argument to zero: $ax - b = 0 \implies x = \dfrac{b}{a}$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
