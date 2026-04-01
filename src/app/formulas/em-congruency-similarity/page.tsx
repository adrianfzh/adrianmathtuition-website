'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

/* ── Nested similar triangles (share apex, scaled 2/3 from apex) ── */
function SimilarTrianglesSVG() {
  // Outer triangle: apex(160,15) BL(20,145) BR(300,145)
  // Inner (scale 2/3 from apex): apex stays (160,15)
  //   BL: apex + 2/3*(BL-apex) = (160,15)+2/3*(-140,130) = (160-93,15+87) = (67,102)
  //   BR: apex + 2/3*(BR-apex) = (160,15)+2/3*(140,130)  = (160+93,15+87) = (253,102)
  return (
    <svg
      viewBox="0 0 320 170"
      width="100%"
      style={{ maxWidth: 380, display: 'block', margin: '12px auto' }}
      aria-label="Two nested similar triangles with sides 2 and 3"
    >
      {/* Outer triangle — yellow (area B) */}
      <polygon points="160,15 20,145 300,145" fill="hsl(45,90%,93%)" stroke="#333" strokeWidth="1.8" />
      {/* Inner triangle — blue (area A), shares apex */}
      <polygon points="160,15 67,102 253,102" fill="hsl(220,40%,91%)" stroke="#333" strokeWidth="1.8" />
      {/* Area A label — centroid of inner ≈ (160, 73) */}
      <text x="160" y="73" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(220,55%,28%)">A</text>
      {/* Area B label — in outer yellow region */}
      <text x="48" y="132" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(38,60%,32%)">B</text>
      {/* Side length "2" on inner right side midpoint ≈ (206, 58) */}
      <text x="218" y="56" fontSize="14" fill="#333" fontWeight="600">2</text>
      {/* Side length "3" on outer right side midpoint ≈ (230, 80) */}
      <text x="248" y="82" fontSize="14" fill="#333" fontWeight="600">3</text>
    </svg>
  );
}

/* ── Triangle divided by cevian — same ⊥ height, bases 2 : 1 ── */
function SameHeightSVG() {
  // Apex (130,15), BL(20,140), BR(280,140)
  // Base total = 260, ratio 2:1 → left=173, division at x=20+173=193
  return (
    <svg
      viewBox="0 0 300 162"
      width="100%"
      style={{ maxWidth: 340, display: 'block', margin: '12px auto' }}
      aria-label="Triangle divided into two parts with bases 2 and 1"
    >
      {/* Left sub-triangle (A) — blue */}
      <polygon points="130,15 20,140 193,140" fill="hsl(220,40%,91%)" stroke="#333" strokeWidth="1.8" />
      {/* Right sub-triangle (B) — yellow */}
      <polygon points="130,15 193,140 280,140" fill="hsl(45,90%,93%)" stroke="#333" strokeWidth="1.8" />
      {/* Cevian */}
      <line x1="130" y1="15" x2="193" y2="140" stroke="#333" strokeWidth="1.5" />
      {/* Area labels — centroids */}
      <text x="111" y="100" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(220,55%,28%)">A</text>
      <text x="213" y="100" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="hsl(38,60%,32%)">B</text>
      {/* Base labels */}
      <text x="106" y="157" textAnchor="middle" fontSize="14" fill="#333" fontWeight="600">2</text>
      <text x="236" y="157" textAnchor="middle" fontSize="14" fill="#333" fontWeight="600">1</text>
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
      {/* Congruent triangles */}
      <FormulaSection title="Proof of Congruent Triangles">
        <FormulaNoteBox html={
          '<strong>Valid methods:</strong> SSS, SAS, ASA, AAS, RHS' +
          '<br><span style="color:hsl(0,65%,48%)">✗ ASS is not valid</span>'
        } />
      </FormulaSection>

      {/* Similar triangles */}
      <FormulaSection title="Proof of Similar Triangles">
        <FormulaNoteBox html={
          '<ol style="margin:0;padding-left:20px;line-height:1.9">' +
          '<li>All ratios of corresponding sides are equal.</li>' +
          '<li>Two ratios of sides + included angle are equal.</li>' +
          '<li>Two angles are equal (AA).</li>' +
          '</ol>'
        } />
      </FormulaSection>

      {/* Similar figures & solids */}
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

      {/* Similar triangles with diagram */}
      <FormulaSection title="Similar Triangles">
        <FormulaRow latex="\text{Ratio of area} = \left(\text{Ratio of length}\right)^2" />
        <SimilarTrianglesSVG />
        <FormulaNoteBox html={
          '<div style="text-align:center">' +
          '$\\dfrac{\\text{Area }A}{\\text{Area }B} = \\left(\\dfrac{2}{3}\\right)^2$' +
          '</div>'
        } />
      </FormulaSection>

      {/* Same height triangles */}
      <FormulaSection title="Triangles with the Same ⊥ Height">
        <FormulaRow latex="\text{Ratio of area} = \text{Ratio of bases}" />
        <SameHeightSVG />
        <FormulaNoteBox html={
          '<div style="text-align:center">' +
          '$\\dfrac{\\text{Area }A}{\\text{Area }B} = \\dfrac{2}{1}$' +
          '</div>'
        } />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
