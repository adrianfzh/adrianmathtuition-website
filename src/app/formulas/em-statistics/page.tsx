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
        <FormulaRow latex="\bar{x} = \dfrac{\sum x}{n}" annotation="Mean" />
        <FormulaRow latex="\sigma = \sqrt{\dfrac{\sum x^2}{n} - \left(\dfrac{\sum x}{n}\right)^2} = \sqrt{\dfrac{\sum(x - \bar{x})^2}{n}}" annotation="Standard deviation" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
