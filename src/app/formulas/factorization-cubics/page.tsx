'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
} from '@/components/FormulaPageLayout';

export default function FactorizationCubicsPage() {
  return (
    <FormulaPageLayout
      title="Factorization of Cubics"
      subtitle="O-Level A Math"
      contentId="cubics-content"
    >
      <FormulaSection title="Sum and Difference of Cubes">
        <FormulaRow latex="a^3 + b^3 = (a + b)(a^2 - ab + b^2)" />
        <FormulaRow latex="a^3 - b^3 = (a - b)(a^2 + ab + b^2)" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
