'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

/* ── Shared SVG helpers ─────────────────────────────────────────────────── */

/** Axes with arrowhead polygons */
function Axes({ ox, oy }: { ox: number; oy: number }) {
  return (
    <>
      <line x1={10} y1={oy} x2={350} y2={oy} stroke="#334466" strokeWidth="1.5" />
      <polygon points={`350,${oy} 343,${oy - 4} 343,${oy + 4}`} fill="#334466" />
      <line x1={ox} y1={225} x2={ox} y2={10} stroke="#334466" strokeWidth="1.5" />
      <polygon points={`${ox},10 ${ox - 4},17 ${ox + 4},17`} fill="#334466" />
      <text x={354} y={oy + 4} fontSize={13} fill="#334466" fontFamily="serif" fontStyle="italic">x</text>
      <text x={ox + 4} y={8} fontSize={13} fill="#334466" fontFamily="serif" fontStyle="italic">y</text>
    </>
  );
}

/* ── Exponential graph ──────────────────────────────────────────────────── */
function ExpGraph() {
  // ViewBox 360×230, origin (150, 115), scale 35px/unit
  const navy = '#1b2a4a';
  const blue = '#5b7bb3';

  return (
    <svg
      viewBox="0 0 360 230"
      width="100%"
      style={{ maxWidth: 420, display: 'block', margin: '12px auto' }}
      aria-label="Exponential graphs showing y=eˣ, y=e⁻ˣ, y=-eˣ, y=-e⁻ˣ"
    >
      <Axes ox={150} oy={115} />

      {/* y = eˣ — navy solid, rises steeply upper-right */}
      <path
        d="M 10,114 C 70,113 115,105 150,80 C 165,63 179,27 183,12"
        fill="none" stroke={navy} strokeWidth="2.2"
      />

      {/* y = e⁻ˣ — blue dashed, mirror across y-axis */}
      <path
        d="M 290,114 C 230,113 185,105 150,80 C 135,63 121,27 117,12"
        fill="none" stroke={blue} strokeWidth="2.2" strokeDasharray="7,4"
      />

      {/* y = −eˣ — navy solid, mirror below x-axis */}
      <path
        d="M 10,116 C 70,117 115,125 150,150 C 165,167 179,203 183,218"
        fill="none" stroke={navy} strokeWidth="2.2"
      />

      {/* y = −e⁻ˣ — blue dashed */}
      <path
        d="M 290,116 C 230,117 185,125 150,150 C 135,167 121,203 117,218"
        fill="none" stroke={blue} strokeWidth="2.2" strokeDasharray="7,4"
      />

      {/* y-intercept dots at (0,1) and (0,−1) */}
      <circle cx={150} cy={80} r={2.5} fill="#334466" />
      <circle cx={150} cy={150} r={2.5} fill="#334466" />
      <text x={142} y={83} fontSize={10} fill="#334466" textAnchor="end">1</text>
      <text x={142} y={153} fontSize={10} fill="#334466" textAnchor="end">−1</text>

      {/* Curve labels — top-right: y=eˣ */}
      <text x={186} y={14} fontSize={11} fill={navy} fontFamily="Georgia,serif">
        {'y = e'}<tspan dy={-4} fontSize={9}>x</tspan>
      </text>
      {/* top-left: y=e⁻ˣ */}
      <text x={114} y={14} fontSize={11} fill={blue} fontFamily="Georgia,serif" textAnchor="end">
        {'y = e'}<tspan dy={-4} fontSize={9}>{'−x'}</tspan>
      </text>
      {/* bottom-right: y=−eˣ */}
      <text x={186} y={226} fontSize={11} fill={navy} fontFamily="Georgia,serif">
        {'y = −e'}<tspan dy={-4} fontSize={9}>x</tspan>
      </text>
      {/* bottom-left: y=−e⁻ˣ */}
      <text x={114} y={226} fontSize={11} fill={blue} fontFamily="Georgia,serif" textAnchor="end">
        {'y = −e'}<tspan dy={-4} fontSize={9}>{'−x'}</tspan>
      </text>
    </svg>
  );
}

/* ── Logarithmic graph ──────────────────────────────────────────────────── */
function LogGraph() {
  // Same coordinate system: origin (150, 115), scale 35px/unit
  const navy = '#1b2a4a';
  const blue = '#5b7bb3';

  return (
    <svg
      viewBox="0 0 360 230"
      width="100%"
      style={{ maxWidth: 420, display: 'block', margin: '12px auto' }}
      aria-label="Logarithmic graphs showing y=ln x, y=ln(-x), y=-ln x, y=-ln(-x)"
    >
      <Axes ox={150} oy={115} />

      {/* y = ln(x) — navy solid: starts near x=0⁺ bottom, crosses (1,0), rises slowly right */}
      {/* At x=0.07→SVG(152,216); x=1→SVG(185,115); x=5.5→SVG(342,58) */}
      <path
        d="M 152,216 C 153,192 158,167 170,138 C 179,120 184,116 185,115 C 215,98 270,74 342,56"
        fill="none" stroke={navy} strokeWidth="2.2"
      />

      {/* y = ln(−x) — blue dashed: mirror across y-axis */}
      <path
        d="M 148,216 C 147,192 142,167 130,138 C 121,120 116,116 115,115 C 85,98 30,74 18,56"
        fill="none" stroke={blue} strokeWidth="2.2" strokeDasharray="7,4"
      />

      {/* y = −ln(x) — navy solid: mirror across x-axis */}
      <path
        d="M 152,14 C 153,38 158,63 170,92 C 179,110 184,114 185,115 C 215,132 270,156 342,174"
        fill="none" stroke={navy} strokeWidth="2.2"
      />

      {/* y = −ln(−x) — blue dashed */}
      <path
        d="M 148,14 C 147,38 142,63 130,92 C 121,110 116,114 115,115 C 85,132 30,156 18,174"
        fill="none" stroke={blue} strokeWidth="2.2" strokeDasharray="7,4"
      />

      {/* x-intercept dots at (1,0) and (−1,0) */}
      <circle cx={185} cy={115} r={2.5} fill="#334466" />
      <circle cx={115} cy={115} r={2.5} fill="#334466" />
      <text x={185} y={127} fontSize={10} fill="#334466" textAnchor="middle">1</text>
      <text x={115} y={127} fontSize={10} fill="#334466" textAnchor="middle">−1</text>

      {/* Curve labels */}
      {/* top-right: y = ln x */}
      <text x={345} y={54} fontSize={11} fill={navy} fontFamily="Georgia,serif">y = ln x</text>
      {/* top-left: y = ln(−x) */}
      <text x={15} y={54} fontSize={11} fill={blue} fontFamily="Georgia,serif" textAnchor="end">{'y = ln(−x)'}</text>
      {/* bottom-right: y = −ln x */}
      <text x={345} y={176} fontSize={11} fill={navy} fontFamily="Georgia,serif">{'y = −ln x'}</text>
      {/* bottom-left: y = −ln(−x) */}
      <text x={15} y={176} fontSize={11} fill={blue} fontFamily="Georgia,serif" textAnchor="end">{'y = −ln(−x)'}</text>
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
      {/* Exponential graphs */}
      <FormulaSection title="Exponential Graphs" subtitle="4 basic shapes:">
        <ExpGraph />
      </FormulaSection>

      {/* Logarithmic graphs */}
      <FormulaSection title="Logarithmic Graphs" subtitle="4 basic shapes:">
        <LogGraph />
        <FormulaNoteBox html="<strong>Asymptote of $y = \ln(ax - b)$:</strong><br>Set argument to zero: $ax - b = 0 \implies x = \dfrac{b}{a}$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
