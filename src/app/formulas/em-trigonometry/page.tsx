'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmTrigonometryPage() {
  return (
    <FormulaPageLayout
      title="Trigonometry"
      subtitle="O-Level E Math"
      contentId="em-trigo-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Pythagoras' Theorem">
        <FormulaRow latex="a^2 = b^2 + c^2" />
      </FormulaSection>

      <FormulaSection title="Sine Rule">
        <FormulaRow latex="\dfrac{\sin A}{a} = \dfrac{\sin B}{b}" />
      </FormulaSection>

      <FormulaSection title="Cosine Rule">
        <FormulaRow latex="a^2 = b^2 + c^2 - 2bc\cos A" />
      </FormulaSection>

      <FormulaSection title="Area of Triangle">
        <FormulaRow latex="\text{Area} = \dfrac{1}{2}ab\sin C" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
