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
      <FormulaSection title="Trigonometry Formulae">
        <FormulaRow latex="a^2 = b^2 + c^2" annotation="Pythagoras' Theorem" />
        <FormulaRow latex="\dfrac{\sin A}{a} = \dfrac{\sin B}{b}" annotation="Sine Rule" />
        <FormulaRow latex="a^2 = b^2 + c^2 - 2bc\cos A" annotation="Cosine Rule" />
        <FormulaRow latex="\text{Area} = \dfrac{1}{2}ab\sin C" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
