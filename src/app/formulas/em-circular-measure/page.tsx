'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow } from '@/components/FormulaPageLayout';

export default function EmCircularMeasurePage() {
  return (
    <FormulaPageLayout
      title="Circular Measure"
      subtitle="O-Level E Math"
      contentId="em-circular-measure-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Area of a Sector">
        <FormulaRow latex="\begin{aligned}\text{Area of sector} &= \dfrac{\theta}{360^\circ} \times \pi r^2 && \textcolor{gray}{(\theta \text{ in degrees})} \\ &= \dfrac{\theta}{2\pi} \times \pi r^2 && \textcolor{gray}{(\theta \text{ in radians})} \\ &= \dfrac{1}{2}r^2\theta && \textcolor{gray}{(\theta \text{ in radians})}\end{aligned}" />
      </FormulaSection>

      <FormulaSection title="Arc Length of a Sector">
        <FormulaRow latex="\begin{aligned}\text{Arc length} &= \dfrac{\theta}{360^\circ} \times 2\pi r && \textcolor{gray}{(\theta \text{ in degrees})} \\ &= \dfrac{\theta}{2\pi} \times 2\pi r && \textcolor{gray}{(\theta \text{ in radians})} \\ &= r\theta && \textcolor{gray}{(\theta \text{ in radians})}\end{aligned}" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
