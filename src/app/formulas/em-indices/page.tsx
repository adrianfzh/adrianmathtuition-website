'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmIndicesPage() {
  return (
    <FormulaPageLayout
      title="Indices"
      subtitle="O-Level E Math"
      contentId="em-indices-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Laws of Indices">
        <FormulaRow latex="a^m \times a^n = a^{m+n}" />
        <FormulaRow latex="a^m \div a^n = a^{m-n}" />
        <FormulaRow latex="(a^m)^n = a^{mn}" />
        <FormulaRow latex="a^m \times b^m = (a \times b)^m" />
        <FormulaRow latex="a^m \div b^m = (a \div b)^m" />
        <FormulaRow latex="a^0 = 1" />
        <FormulaRow latex="a^{-m} = \dfrac{1}{a^m}" />
        <FormulaRow latex="\left(\dfrac{a}{b}\right)^{-n} = \left(\dfrac{b}{a}\right)^n = \dfrac{b^n}{a^n}" />
        <FormulaRow latex="a^{\frac{m}{n}} = \left(\sqrt[n]{a}\right)^m" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
