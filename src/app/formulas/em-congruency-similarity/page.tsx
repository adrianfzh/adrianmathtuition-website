'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

/* ── Two side-by-side similar triangles (a and b sides) ── */
function SimilarTrianglesSVG() {
  // Both triangles share the same height:base ratio (1:1) — geometrically similar
  // Left  (area A, side a): apex(65,20) BL(18,110) BR(108,110) — base 90, height 90
  // Right (area B, side b): apex(242,10) BL(174,145) BR(309,145) — base 135, height 135 (1.5× scale)
  return (
    <svg
      viewBox="0 0 340 165"
      width="100%"
      style={{ maxWidth: 400, display: 'block', margin: '12px auto' }}
      aria-label="Two similar triangles with sides a and b"
    >
      {/* Left triangle — blue (area A) */}
      <polygon points="65,20 18,110 108,110" fill="hsl(220,40%,91%)" stroke="#333" strokeWidth="1.8" />
      {/* Right triangle — yellow (area B) */}
      <polygon points="242,10 174,145 309,145" fill="hsl(45,90%,93%)" stroke="#333" strokeWidth="1.8" />

      {/* Area labels — centroids */}
      {/* Left centroid: ((65+18+108)/3, (20+110+110)/3) ≈ (64, 80) */}
      <text x="64" y="80" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(220,55%,28%)">A</text>
      {/* Right centroid: ((242+174+309)/3, (10+145+145)/3) ≈ (242, 100) */}
      <text x="242" y="100" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(38,60%,32%)">B</text>

      {/* Side labels on right edge of each triangle */}
      {/* Left right-side midpoint: ((65+108)/2, (20+110)/2) = (86.5, 65) */}
      <text x="93" y="62" fontSize="14" fill="#333" fontWeight="600" fontStyle="italic">a</text>
      {/* Right right-side midpoint: ((242+309)/2, (10+145)/2) = (275.5, 77.5) */}
      <text x="281" y="74" fontSize="14" fill="#333" fontWeight="600" fontStyle="italic">b</text>
    </svg>
  );
}

/* ── Triangle divided by cevian — same ⊥ height, bases a : b ── */
function SameHeightSVG() {
  // Apex (130,15), BL(18,140), BR(278,140), total base = 260
  // Split 2:1 → left = 173, division at x = 18+173 = 191
  return (
    <svg
      viewBox="0 0 300 158"
      width="100%"
      style={{ maxWidth: 340, display: 'block', margin: '12px auto' }}
      aria-label="Triangle divided into two parts with bases a and b"
    >
      {/* Left sub-triangle (A) — blue */}
      <polygon points="130,15 18,140 191,140" fill="hsl(220,40%,91%)" stroke="#333" strokeWidth="1.8" />
      {/* Right sub-triangle (B) — yellow */}
      <polygon points="130,15 191,140 278,140" fill="hsl(45,90%,93%)" stroke="#333" strokeWidth="1.8" />
      {/* Cevian */}
      <line x1="130" y1="15" x2="191" y2="140" stroke="#333" strokeWidth="1.5" />

      {/* Area labels — centroids */}
      {/* Left: ((130+18+191)/3, (15+140+140)/3) = (113, 98) */}
      <text x="108" y="99" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(220,55%,28%)">A</text>
      {/* Right: ((130+191+278)/3, (15+140+140)/3) = (200, 98) */}
      <text x="204" y="99" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(38,60%,32%)">B</text>

      {/* Base labels */}
      {/* Left base center: (18+191)/2 = 104.5 */}
      <text x="104" y="155" textAnchor="middle" fontSize="14" fill="#333" fontWeight="600" fontStyle="italic">a</text>
      {/* Right base center: (191+278)/2 = 234.5 */}
      <text x="234" y="155" textAnchor="middle" fontSize="14" fill="#333" fontWeight="600" fontStyle="italic">b</text>
    </svg>
  );
}

/* ── Page ── */
export default function EmCongruencySimilarityPage() {
  return (
    <FormulaPageLayout
      title="Congruency &amp; Similarity"
      subtitle="O-Level E Math"
      contentId="em-congruency-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Proof of Congruent Triangles">
        <FormulaNoteBox html={
          '<strong>Valid methods:</strong> SSS, SAS, ASA, AAS, RHS' +
          '<br><span style="color:hsl(0,65%,48%)">✗ ASS is not valid</span>'
        } />
      </FormulaSection>

      <FormulaSection title="Proof of Similar Triangles">
        <FormulaNoteBox html={
          '<ul style="margin:0;padding-left:20px;line-height:1.9">' +
          '<li>All ratios of corresponding sides are equal.</li>' +
          '<li>Two ratios of sides + included angle are equal.</li>' +
          '<li>Two angles are equal (AA).</li>' +
          '</ul>'
        } />
      </FormulaSection>

      <FormulaSection title="Similar Figures &amp; Solids">
        <FormulaRow
          latex="\dfrac{A_1}{A_2} = \left(\dfrac{l_1}{l_2}\right)^2"
          annotation="Similar figures — area ratio"
        />
        <FormulaRow
          latex="\dfrac{V_1}{V_2} = \left(\dfrac{l_1}{l_2}\right)^3"
          annotation="Similar solids — volume ratio"
        />
      </FormulaSection>

      <FormulaSection title="Similar Triangles">
        <FormulaRow latex="\text{Ratio of area} = \left(\text{Ratio of length}\right)^2" />
        <SimilarTrianglesSVG />
        <FormulaNoteBox html={
          '<div style="text-align:center">' +
          '$\\dfrac{\\text{Area }A}{\\text{Area }B} = \\left(\\dfrac{a}{b}\\right)^2$' +
          '</div>'
        } />
      </FormulaSection>

      <FormulaSection title="Triangles with the Same ⊥ Height">
        <FormulaRow latex="\text{Ratio of area} = \text{Ratio of bases}" />
        <SameHeightSVG />
        <FormulaNoteBox html={
          '<div style="text-align:center">' +
          '$\\dfrac{\\text{Area }A}{\\text{Area }B} = \\dfrac{a}{b}$' +
          '</div>'
        } />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
