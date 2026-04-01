'use client';

import FormulaPageLayout, { FormulaSection } from '@/components/FormulaPageLayout';

export default function EmCircularMeasurePage() {
  return (
    <FormulaPageLayout
      title="Circular Measure"
      subtitle="O-Level E Math"
      contentId="em-circular-measure-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Circular Measure">
        <p style={{ textAlign: 'center', color: 'hsl(220,10%,56%)', fontStyle: 'italic', padding: '32px 0' }}>
          Content coming soon.
        </p>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
