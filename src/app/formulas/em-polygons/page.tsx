'use client';

import FormulaPageLayout, { FormulaSection } from '@/components/FormulaPageLayout';

export default function EmPolygonsPage() {
  return (
    <FormulaPageLayout
      title="Polygons"
      subtitle="O-Level E Math"
      contentId="em-polygons-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Polygons">
        <p style={{ textAlign: 'center', color: 'hsl(220,10%,56%)', fontStyle: 'italic', padding: '32px 0' }}>
          Content coming soon.
        </p>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
