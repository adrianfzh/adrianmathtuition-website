'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow, FormulaNoteBox } from '@/components/FormulaPageLayout';

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'hsl(220,10%,56%)',
  fontStyle: 'italic',
  marginBottom: 2,
  display: 'block',
  textAlign: 'left',
};

function LabelledFormula({ label, latex }: { label: string; latex: string }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <FormulaRow latex={latex} />
    </div>
  );
}

export default function EmCoordinateGeometryPage() {
  return (
    <FormulaPageLayout
      title="Coordinate Geometry"
      subtitle="O-Level E Math"
      contentId="em-coord-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Linear Graphs">
        <LabelledFormula label="Equation of slanted lines" latex="y = mx + c" />
        <LabelledFormula label="Equation of vertical lines" latex="x = a" />
        <LabelledFormula label="Equation of horizontal lines" latex="y = a" />
      </FormulaSection>

      <FormulaSection title="Quadratic Graphs">
        <LabelledFormula label="Standard form" latex="y = ax^2 + bx + c" />
        <LabelledFormula label="Factorized form" latex="y = a(x - \alpha)(x - \beta) \quad \Rightarrow \quad x\text{-intercepts: } \alpha,\; \beta" />
        <LabelledFormula label="Completed square form" latex="y = a(x - h)^2 + k \quad \Rightarrow \quad \text{turning point } (h,\; k)" />
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
