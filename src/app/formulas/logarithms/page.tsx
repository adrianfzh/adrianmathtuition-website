'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function LogarithmsPage() {
  return (
    <FormulaPageLayout
      title="Logarithms"
      subtitle="O-Level A Math"
      contentId="log-content"
    >
      <FormulaSection title="Laws of Logarithms">
        <FormulaRow latex="\log_a xy = \log_a x + \log_a y" />
        <FormulaRow latex="\log_a \dfrac{x}{y} = \log_a x - \log_a y" />
        <FormulaRow latex="\log_a x^r = r \log_a x" />
        <FormulaRow latex="\log_a 1 = 0" />
        <FormulaRow latex="\log_a a = 1" />
      </FormulaSection>

      <FormulaSection title="Change of Base">
        <FormulaRow latex="\log_a b = \dfrac{\log_c b}{\log_c a}" />
        <FormulaRow latex="\log_a b = \dfrac{1}{\log_b a}" />
        <FormulaNoteBox html="Common special cases: $\log_{10}$ (common log) and $\ln = \log_e$ (natural log)" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
