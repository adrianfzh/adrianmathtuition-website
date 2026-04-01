'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
} from '@/components/FormulaPageLayout';

export default function IndicesPage() {
  return (
    <FormulaPageLayout
      title="Indices (Laws of Exponents)"
      subtitle="O-Level A Math"
      contentId="indices-content"
    >
      <FormulaSection title="Laws of Indices">
        <FormulaRow latex="a^m \times a^n = a^{m+n}" />
        <FormulaRow latex="a^m \div a^n = a^{m-n}" />
        <FormulaRow latex="(a^m)^n = a^{mn}" />
        <FormulaRow latex="a^m \times b^m = (ab)^m" />
        <FormulaRow latex="a^m \div b^m = \left(\dfrac{a}{b}\right)^m" />
        <FormulaRow latex="a^0 = 1 \qquad (a \neq 0)" />
        <FormulaRow latex="a^{-m} = \dfrac{1}{a^m}" />
        <FormulaRow latex="\left(\dfrac{a}{b}\right)^{-n} = \left(\dfrac{b}{a}\right)^n = \dfrac{b^n}{a^n}" />
        <FormulaRow latex="a^{\frac{m}{n}} = \left(\sqrt[n]{a}\right)^m = \sqrt[n]{a^m}" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
