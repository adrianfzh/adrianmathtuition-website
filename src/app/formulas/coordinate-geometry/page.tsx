'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function CoordinateGeometryPage() {
  return (
    <FormulaPageLayout
      title="Coordinate Geometry &amp; Circles"
      subtitle="O-Level A Math"
      contentId="coord-content"
    >
      {/* Coordinate Geometry */}
      <FormulaSection title="Coordinate Geometry">
        <FormulaRow
          latex="\text{Distance} = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}"
        />
        <FormulaRow
          latex="\text{Midpoint} = \left(\dfrac{x_1 + x_2}{2},\; \dfrac{y_1 + y_2}{2}\right)"
        />
        <FormulaRow
          latex="\text{Gradient} = \dfrac{y_1 - y_2}{x_1 - x_2} = \tan\theta"
        />
        <FormulaRow
          latex="\text{Equation of line: } y - y_1 = m(x - x_1)"
        />
        <FormulaRow
          latex="\text{Lines parallel} \iff m_1 = m_2"
        />
        <FormulaRow
          latex="\text{Lines perpendicular} \iff m_1 m_2 = -1"
        />
        <FormulaRow
          latex="\text{Area of polygon} = \dfrac{1}{2} \left| \begin{vmatrix} x_1 & x_2 & x_3 & \cdots & x_1 \\ y_1 & y_2 & y_3 & \cdots & y_1 \end{vmatrix} \right|"
        />
      </FormulaSection>

      {/* Circles */}
      <FormulaSection title="Circles">
        <FormulaRow latex="(x - a)^2 + (y - b)^2 = r^2" />
        <FormulaRow latex="x^2 + y^2 - 2ax - 2by + c = 0" />
        <FormulaNoteBox html="<div style='text-align:center'>where centre $= (a, b)$ and radius $= r$<br>$r = \sqrt{a^2 + b^2 - c}$</div>" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
