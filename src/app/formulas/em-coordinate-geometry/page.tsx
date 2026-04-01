'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow, FormulaNoteBox } from '@/components/FormulaPageLayout';

export default function EmCoordinateGeometryPage() {
  return (
    <FormulaPageLayout
      title="Coordinate Geometry"
      subtitle="O-Level E Math"
      contentId="em-coord-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Linear Graphs">
        <FormulaRow latex="y = mx + c" annotation="Equation of slanted lines" />
        <FormulaRow latex="x = a" annotation="Equation of vertical lines" />
        <FormulaRow latex="y = a" annotation="Equation of horizontal lines" />
      </FormulaSection>

      <FormulaSection title="Quadratic Graphs">
        <FormulaRow latex="y = ax^2 + bx + c" annotation="Standard form" />
        <FormulaRow latex="y = a(x - \alpha)(x - \beta) \quad \Rightarrow \quad x\text{-intercepts: } \alpha,\; \beta" annotation="Factorized form" />
        <FormulaRow latex="y = a(x - h)^2 + k \quad \Rightarrow \quad \text{turning point } (h,\; k)" annotation="Completed square form" />
      </FormulaSection>

      <FormulaSection title="Coordinate Geometry Formulae">
        <FormulaRow latex="\text{Distance} = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}" />
        <FormulaRow latex="\text{Gradient} = \dfrac{y_1 - y_2}{x_1 - x_2}" />
        <FormulaRow latex="\text{Equation of line: } y = mx + c" />
        <FormulaRow latex="\text{Parallel lines} \iff \text{gradients are equal}" />
        <FormulaNoteBox html={
          'Find $x$-intercept: sub $y = 0$<br>' +
          'Find $y$-intercept: sub $x = 0$<br>' +
          'Find intersection: solve simultaneous equations'
        } />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
