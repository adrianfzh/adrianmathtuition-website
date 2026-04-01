'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow, FormulaNoteBox } from '@/components/FormulaPageLayout';

export default function EmInterestPage() {
  return (
    <FormulaPageLayout
      title="Simple &amp; Compound Interest"
      subtitle="O-Level E Math"
      contentId="em-interest-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Simple Interest">
        <FormulaRow latex="I = \dfrac{PRT}{100}" />
        <FormulaNoteBox html="where $P$ = principal, $R$ = rate (%), $T$ = time (years)" />
      </FormulaSection>

      <FormulaSection title="Compound Interest">
        <FormulaRow latex="A = P\left(1 + \dfrac{r}{100}\right)^n" />
        <FormulaNoteBox html="where $P$ = principal, $r$ = rate (%), $n$ = number of compounding periods" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
