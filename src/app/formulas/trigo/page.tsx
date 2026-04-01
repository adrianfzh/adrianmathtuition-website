'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
  FormulaTable,
} from '@/components/FormulaPageLayout';

export default function TrigoFormulasPage() {
  return (
    <FormulaPageLayout
      title="Trigonometric Formulas"
      subtitle="O-Level A Math"
      contentId="trigo-content"
    >
      {/* Special Ratios */}
      <FormulaSection title="Special Ratios">
        <FormulaTable
          headers={['30^\\circ', '45^\\circ', '60^\\circ']}
          rows={[
            { label: '\\sin', cells: ['\\dfrac{1}{2}', '\\dfrac{1}{\\sqrt{2}}', '\\dfrac{\\sqrt{3}}{2}'] },
            { label: '\\cos', cells: ['\\dfrac{\\sqrt{3}}{2}', '\\dfrac{1}{\\sqrt{2}}', '\\dfrac{1}{2}'] },
            { label: '\\tan', cells: ['\\dfrac{1}{\\sqrt{3}}', '1', '\\sqrt{3}'] },
          ]}
        />
      </FormulaSection>

      {/* Pythagorean Identities */}
      <FormulaSection title="Pythagorean Identities">
        <FormulaRow latex="\\sin^2\\theta + \\cos^2\\theta = 1 \\implies \\sin^2\\theta = 1 - \\cos^2\\theta" />
        <FormulaRow latex="1 + \\tan^2\\theta = \\sec^2\\theta" />
        <FormulaRow latex="1 + \\cot^2\\theta = \\csc^2\\theta" />
        <FormulaRow latex="\\cos^2\\theta = 1 - \\sin^2\\theta" />
      </FormulaSection>

      {/* Double Angle Formulae */}
      <FormulaSection title="Double Angle Formulae">
        <FormulaRow latex="\\sin 2A = 2\\sin A \\cos A" />
        <FormulaRow latex="\\cos 2A = \\cos^2 A - \\sin^2 A" />
        <FormulaRow latex="\\cos 2A = 2\\cos^2 A - 1 \\implies \\cos^2 A = \\dfrac{1 + \\cos 2A}{2}" />
        <FormulaRow latex="\\cos 2A = 1 - 2\\sin^2 A \\implies \\sin^2 A = \\dfrac{1 - \\cos 2A}{2}" />
        <FormulaRow latex="\\tan 2A = \\dfrac{2\\tan A}{1 - \\tan^2 A}" />
      </FormulaSection>

      {/* Using the Double Angle Formula */}
      <FormulaSection
        title="Using the Double Angle Formula"
        subtitle="The formula applies whenever one angle is exactly double another."
      >
        <FormulaRow
          latex="\\sin 4\\theta = 2\\sin 2\\theta\\,\\cos 2\\theta"
          annotation="← 4θ = 2 × (2θ), angle is doubled"
        />
      </FormulaSection>

      {/* Half-Angle Formulae */}
      <FormulaSection title="Half-Angle Formulae">
        <FormulaRow latex="\\sin\\theta = 2\\sin\\dfrac{\\theta}{2}\\cos\\dfrac{\\theta}{2}" />
        <FormulaRow latex="\\begin{aligned} \\cos A &= \\cos^2\\!\\dfrac{A}{2} - \\sin^2\\!\\dfrac{A}{2} \\\\[6pt] &= 2\\cos^2\\!\\dfrac{A}{2} - 1 \\\\[6pt] &= 1 - 2\\sin^2\\!\\dfrac{A}{2} \\end{aligned}" />
        <FormulaRow latex="\\tan A = \\dfrac{2\\tan\\dfrac{A}{2}}{1 - \\tan^2\\dfrac{A}{2}}" />
      </FormulaSection>

      {/* Addition Formulae */}
      <FormulaSection title="Addition Formulae">
        <FormulaRow latex="\\sin(A \\pm B) = \\sin A \\cos B \\pm \\cos A \\sin B" />
        <FormulaRow latex="\\cos(A \\pm B) = \\cos A \\cos B \\mp \\sin A \\sin B" />
        <FormulaRow latex="\\tan(A \\pm B) = \\dfrac{\\tan A \\pm \\tan B}{1 \\mp \\tan A \\tan B}" />
        <FormulaNoteBox html="Can be applied to find e.g. $\\sin 3x = \\sin(2x + x)$" />
      </FormulaSection>

      {/* R-Formula */}
      <FormulaSection title="R-Formula">
        <FormulaRow latex="a\\sin\\theta \\pm b\\cos\\theta = R\\sin(\\theta \\pm \\alpha)" />
        <FormulaRow latex="a\\cos\\theta \\pm b\\sin\\theta = R\\cos(\\theta \\mp \\alpha)" />
        <FormulaNoteBox html="where $R = \\sqrt{a^2 + b^2}$ and $\\tan\\alpha = \\dfrac{b}{a}$, with $a,\\,b > 0$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
