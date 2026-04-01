'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmPolygonsPage() {
  return (
    <FormulaPageLayout
      title="Polygons"
      subtitle="O-Level E Math"
      contentId="em-polygons-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="For All Polygons">
        <FormulaRow latex="\text{Sum of interior angles} = (n-2) \times 180^\circ" />
        <FormulaRow latex="\text{Sum of exterior angles} = 360^\circ" />
      </FormulaSection>

      <FormulaSection title="For Regular Polygons">
        <FormulaRow latex="1 \text{ interior angle} = \dfrac{(n-2) \times 180^\circ}{n}" />
        <FormulaRow latex="1 \text{ exterior angle} = \dfrac{360^\circ}{n}" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
