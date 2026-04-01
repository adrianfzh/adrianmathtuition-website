'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
  FormulaTable,
} from '@/components/FormulaPageLayout';

/* ─────────────────────────────────────────────────────────────────────────────
   Shared SVG infrastructure
   ViewBox: 300 × 175
   Origin:  (35, 90)   sx = 250/(2π) ≈ 39.79 px/rad   sy = 55 px/unit
   Key x:   π/2→97.5   π→160   3π/2→222.5   2π→285
   Key y:   +1→35      0→90    −1→145
───────────────────────────────────────────────────────────────────────────── */

interface TrigGraphProps {
  curvePaths: string[];
  asymptoteXs?: number[];
  showY1Ticks?: boolean;
  equationX: number;
  equationY: number;
  equationLabel: string; // e.g. "y = sin x"
}

function TrigGraphSVG({
  curvePaths,
  asymptoteXs = [],
  showY1Ticks = true,
  equationX,
  equationY,
  equationLabel,
}: TrigGraphProps) {
  return (
    <svg
      viewBox="0 0 300 175"
      width="100%"
      style={{ maxWidth: 304, display: 'block', margin: '4px auto 10px' }}
    >
      {/* ── Axes ── */}
      <line x1="25" y1="90" x2="290" y2="90" stroke="#333" strokeWidth="1.2" />
      <polygon points="286,86 293,90 286,94" fill="#333" />
      <line x1="35" y1="168" x2="35" y2="8" stroke="#333" strokeWidth="1.2" />
      <polygon points="31,13 35,6 39,13" fill="#333" />

      {/* ── Axis letter labels ── */}
      <text x="38" y="14" fontSize="13" fontStyle="italic" fill="#333">y</text>
      <text x="295" y="95" fontSize="13" fontStyle="italic" fill="#333">x</text>

      {/* ── Origin ── */}
      <text x="27" y="107" textAnchor="end" fontSize="12" fill="#333">0</text>

      {/* ── X-axis ticks ── */}
      {[97.5, 160, 222.5, 285].map(x => (
        <line key={x} x1={x} y1="86" x2={x} y2="94" stroke="#333" strokeWidth="1" />
      ))}

      {/* π/2 fraction */}
      <text x="97.5" y="102" textAnchor="middle" fontSize="11" fill="#333">π</text>
      <line x1="92" y1="105" x2="103" y2="105" stroke="#333" strokeWidth="0.8" />
      <text x="97.5" y="117" textAnchor="middle" fontSize="11" fill="#333">2</text>

      {/* π */}
      <text x="160" y="109" textAnchor="middle" fontSize="12" fill="#333">π</text>

      {/* 3π/2 fraction */}
      <text x="222.5" y="102" textAnchor="middle" fontSize="11" fill="#333">3π</text>
      <line x1="213" y1="105" x2="232" y2="105" stroke="#333" strokeWidth="0.8" />
      <text x="222.5" y="117" textAnchor="middle" fontSize="11" fill="#333">2</text>

      {/* 2π */}
      <text x="285" y="109" textAnchor="middle" fontSize="12" fill="#333">2π</text>

      {/* ── Y-axis ±1 ticks (sin / cos only) ── */}
      {showY1Ticks && (
        <>
          <line x1="30" y1="35" x2="40" y2="35" stroke="#333" strokeWidth="1" />
          <text x="27" y="39" textAnchor="end" fontSize="12" fill="#333">1</text>
          <line x1="30" y1="145" x2="40" y2="145" stroke="#333" strokeWidth="1" />
          <text x="27" y="149" textAnchor="end" fontSize="12" fill="#333">−1</text>
        </>
      )}

      {/* ── Dashed asymptotes ── */}
      {asymptoteXs.map(ax => (
        <line
          key={ax}
          x1={ax} y1="5" x2={ax} y2="168"
          stroke="#666" strokeWidth="1.1" strokeDasharray="5,3"
        />
      ))}

      {/* ── Curve(s) ── */}
      {curvePaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" />
      ))}

      {/* ── Equation label ── */}
      <text
        x={equationX} y={equationY}
        fontSize="14" fill="#333"
        fontFamily="serif" fontStyle="italic"
      >
        {equationLabel}
      </text>
    </svg>
  );
}

/* ──────────────────────── sin graph ──────────────────────── */
// Bezier derivation (oy=90, sy=55, quarter-period h=62.5, CP offset=20.83):
//   slope at zero-crossings = −sy/sx = −1.382
//   CP symmetry: each quarter uses (offset, ±slope×offset) as control handles
const SIN_PATH =
  'M 35,90 C 55.8,61.2 76.7,35 97.5,35 ' +
  'C 118.3,35 139.2,61.2 160,90 ' +
  'C 180.8,118.8 201.7,145 222.5,145 ' +
  'C 243.3,145 264.2,118.8 285,90';

/* ──────────────────────── cos graph ──────────────────────── */
const COS_PATH =
  'M 35,35 C 55.8,35 76.7,61.2 97.5,90 ' +
  'C 118.3,118.8 139.2,145 160,145 ' +
  'C 180.8,145 201.7,118.8 222.5,90 ' +
  'C 243.3,61.2 264.2,35 285,35';

/* ──────────────────────── tan graph ──────────────────────── */
// Clips at SVG y=5 (math y≈+1.55) and y=168 (math y≈−1.42)
// Segment 1: t=0 → just before π/2
const TAN_PATH_1 = 'M 35,90 C 48.2,71.8 61.3,66.7 74.5,5';
// Segment 2: just after π/2 → just before 3π/2 (passes through (160,90) at t=π)
const TAN_PATH_2 =
  'M 121.3,168 C 134.2,114.4 147.1,107.8 160,90 ' +
  'C 173.2,71.8 186.3,66.7 199.5,5';
// Segment 3: just after 3π/2 → 2π
const TAN_PATH_3 = 'M 246.3,168 C 259.2,114.4 272.1,107.8 285,90';

/* ══════════════════════════════════════════════════════════════════════════════
   Page
══════════════════════════════════════════════════════════════════════════════ */

export default function TrigoFormulasPage() {
  return (
    <FormulaPageLayout
      title="Trigonometry"
      subtitle="O-Level A Math"
      contentId="trigo-content"
    >
      {/* Special Ratios */}
      <FormulaSection title="Special Ratios">
        <FormulaTable
          headers={['30^\\circ', '45^\\circ', '60^\\circ']}
          rows={[
            { label: '\\sin', cells: ['\\dfrac{1}{2}', '\\dfrac{1}{\\sqrt{2}}', '\\dfrac{\\sqrt{3}}{2}'] },
            { label: '\\cos', cells: ['\\dfrac{\\sqrt{3}}{2}', '\\dfrac{1}{\\sqrt{2}}', '\\dfrac{1}{2}'] },
            { label: '\\tan', cells: ['\\dfrac{1}{\\sqrt{3}}', '1', '\\sqrt{3}'] },
          ]}
        />
      </FormulaSection>

      {/* Pythagorean Identities */}
      <FormulaSection title="Pythagorean Identities">
        <FormulaRow latex="\sin^2\theta + \cos^2\theta = 1" />
        <FormulaRow latex="1 + \tan^2\theta = \sec^2\theta" />
        <FormulaRow latex="1 + \cot^2\theta = \csc^2\theta" />
        <FormulaRow latex="\cos^2\theta = 1 - \sin^2\theta" />
      </FormulaSection>

      {/* Double Angle Formulae */}
      <FormulaSection title="Double Angle Formulae">
        <FormulaRow latex="\sin 2A = 2\sin A \cos A" />
        <FormulaRow latex="\cos 2A = \cos^2 A - \sin^2 A" />
        <FormulaRow latex="\cos 2A = 2\cos^2 A - 1 \implies \cos^2 A = \dfrac{1 + \cos 2A}{2}" />
        <FormulaRow latex="\cos 2A = 1 - 2\sin^2 A \implies \sin^2 A = \dfrac{1 - \cos 2A}{2}" />
        <FormulaRow latex="\tan 2A = \dfrac{2\tan A}{1 - \tan^2 A}" />
      </FormulaSection>

      {/* Other Ways To Use Double Angle Formula */}
      <FormulaSection title="Other Ways To Use Double Angle Formula">
        <FormulaRow latex="\sin 4\theta = 2\sin 2\theta\,\cos 2\theta" />
        <FormulaNoteBox html="<div style='text-align:center'>$4\theta = 2 \times (2\theta)$, angle is doubled</div>" />
      </FormulaSection>

      {/* Half-Angle Formulae */}
      <FormulaSection title="Half-Angle Formulae">
        <FormulaRow latex="\sin\theta = 2\sin\dfrac{\theta}{2}\cos\dfrac{\theta}{2}" />
        <FormulaRow latex="\begin{aligned} \cos A &= \cos^2\!\dfrac{A}{2} - \sin^2\!\dfrac{A}{2} \\[6pt] &= 2\cos^2\!\dfrac{A}{2} - 1 \\[6pt] &= 1 - 2\sin^2\!\dfrac{A}{2} \end{aligned}" />
        <FormulaRow latex="\tan A = \dfrac{2\tan\dfrac{A}{2}}{1 - \tan^2\dfrac{A}{2}}" />
      </FormulaSection>

      {/* Addition Formulae */}
      <FormulaSection title="Addition Formulae">
        <FormulaRow latex="\sin(A \pm B) = \sin A \cos B \pm \cos A \sin B" />
        <FormulaRow latex="\cos(A \pm B) = \cos A \cos B \mp \sin A \sin B" />
        <FormulaRow latex="\tan(A \pm B) = \dfrac{\tan A \pm \tan B}{1 \mp \tan A \tan B}" />
        <FormulaNoteBox html="Can be applied to find e.g. $\sin 3x = \sin(2x + x)$" />
      </FormulaSection>

      {/* R-Formula */}
      <FormulaSection title="R-Formula">
        <FormulaRow latex="a\sin\theta \pm b\cos\theta = R\sin(\theta \pm \alpha)" />
        <FormulaRow latex="a\cos\theta \pm b\sin\theta = R\cos(\theta \mp \alpha)" />
        <FormulaNoteBox html="where $R = \sqrt{a^2 + b^2}$ and $\tan\alpha = \dfrac{b}{a}$, with $a,\,b > 0$" />
      </FormulaSection>

      {/* ── Trigonometric Graphs ── */}

      <FormulaSection title="Sine Graph">
        <TrigGraphSVG
          curvePaths={[SIN_PATH]}
          showY1Ticks
          equationX={172}
          equationY={50}
          equationLabel="y = sin x"
        />
        <FormulaNoteBox html={
          '<strong>Amplitude:</strong> 1 &emsp; <strong>Period:</strong> 360° or 2π<br>' +
          '<strong>Principal range:</strong> −90° ≤ <em>x</em> ≤ 90°'
        } />
      </FormulaSection>

      <FormulaSection title="Cosine Graph">
        <TrigGraphSVG
          curvePaths={[COS_PATH]}
          showY1Ticks
          equationX={60}
          equationY={53}
          equationLabel="y = cos x"
        />
        <FormulaNoteBox html={
          '<strong>Amplitude:</strong> 1 &emsp; <strong>Period:</strong> 360° or 2π<br>' +
          '<strong>Principal range:</strong> 0° ≤ <em>x</em> ≤ 180°'
        } />
      </FormulaSection>

      <FormulaSection title="Tangent Graph">
        <TrigGraphSVG
          curvePaths={[TAN_PATH_1, TAN_PATH_2, TAN_PATH_3]}
          asymptoteXs={[97.5, 222.5]}
          showY1Ticks={false}
          equationX={158}
          equationY={53}
          equationLabel="y = tan x"
        />
        <FormulaNoteBox html={
          '<strong>Period:</strong> 180° or π &emsp; (no amplitude)<br>' +
          '<strong>Principal range:</strong> −90° &lt; <em>x</em> &lt; 90°'
        } />
      </FormulaSection>

      <FormulaSection title="Drawing Trigonometric Graphs">
        <FormulaRow latex="y = a \sin bx + c" />
        <FormulaRow latex="y = a \cos bx + c" />
        <FormulaRow latex="y = a \tan bx + c" />
        <FormulaNoteBox html={
          '<em>a</em> = amplitude<br>' +
          '<em>b</em> = no. of cycles in 360° or 2π<br>' +
          '<em>c</em> = no. of units to shift the graph up/down'
        } />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
