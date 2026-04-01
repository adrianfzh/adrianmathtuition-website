'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmMensurationPage() {
  return (
    <FormulaPageLayout
      title="Mensuration (Area &amp; Volume)"
      subtitle="O-Level E Math"
      contentId="em-mensuration-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Area of Trapezium">
        <FormulaRow latex="\text{Area} = \tfrac{1}{2} \times \text{sum of } \parallel \text{ sides} \times h" />
      </FormulaSection>

      <FormulaSection title="Area of Parallelogram">
        <FormulaRow latex="\text{Area} = \text{base} \times h_{\perp}" />
      </FormulaSection>

      <FormulaSection title="Sphere">
        <FormulaRow latex="\text{Volume} = \dfrac{4}{3}\pi r^3" />
        <FormulaRow latex="\text{Surface area} = 4\pi r^2" />
      </FormulaSection>

      <FormulaSection title="Cone">
        <FormulaRow latex="\text{Volume} = \dfrac{1}{3}\pi r^2 h" />
        <FormulaRow latex="\text{Curved surface area} = \pi r l" />
      </FormulaSection>

      <FormulaSection title="Pyramid">
        <FormulaRow latex="\text{Volume} = \dfrac{1}{3} \times \text{base area} \times h" />
      </FormulaSection>

      <FormulaSection title="Cylinder">
        <FormulaRow latex="\text{Volume} = \pi r^2 h" />
        <FormulaRow latex="\text{Curved surface area} = 2\pi r h" />
      </FormulaSection>

      <FormulaSection title="Prism">
        <FormulaRow latex="\text{Volume} = \text{area of cross-section} \times h" />
        <FormulaRow latex="\text{Lateral surface area} = \text{perimeter of cross-section} \times h" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
