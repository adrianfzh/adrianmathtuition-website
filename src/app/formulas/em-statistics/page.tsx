'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmStatisticsPage() {
  return (
    <FormulaPageLayout
      title="Statistics"
      subtitle="O-Level E Math"
      contentId="em-statistics-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Measures">
        {/* Mean — label included in formula, left of the equals */}
        <FormulaRow latex="\text{Mean} = \bar{x} = \dfrac{\sum x}{n}" />

        {/* Standard deviation — aligned continuation on second line */}
        <FormulaRow latex="\begin{aligned}\text{Standard deviation} = \sigma &= \sqrt{\dfrac{\sum x^2}{n} - \left(\dfrac{\sum x}{n}\right)^2} \\ &= \sqrt{\dfrac{\sum(x - \bar{x})^2}{n}}\end{aligned}" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
