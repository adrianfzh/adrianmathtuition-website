'use client';

import FormulaPageLayout, { FormulaSection } from '@/components/FormulaPageLayout';

export default function EmSetsPage() {
  return (
    <FormulaPageLayout
      title="Sets"
      subtitle="O-Level E Math"
      contentId="em-sets-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Sets">
        <p style={{ textAlign: 'center', color: 'hsl(220,10%,56%)', fontStyle: 'italic', padding: '32px 0' }}>
          Content coming soon.
        </p>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
