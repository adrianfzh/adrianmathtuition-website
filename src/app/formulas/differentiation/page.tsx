'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function DifferentiationPage() {
  return (
    <FormulaPageLayout
      title="Differentiation"
      subtitle="O-Level A Math"
      contentId="diff-content"
    >
      {/* Algebraic */}
      <FormulaSection title="Algebraic Expressions">
        <FormulaRow latex="\dfrac{d}{dx}(ax^n) = anx^{n-1}" />
      </FormulaSection>

      {/* Trigonometric */}
      <FormulaSection title="Trigonometric Expressions">
        <FormulaRow latex="\dfrac{d}{dx}\sin x = \cos x" />
        <FormulaRow latex="\dfrac{d}{dx}\cos x = -\sin x" />
        <FormulaRow latex="\dfrac{d}{dx}\tan x = \sec^2 x" />
      </FormulaSection>

      {/* Exponential */}
      <FormulaSection title="Exponential Expressions">
        <FormulaRow latex="\dfrac{d}{dx}e^x = e^x" />
      </FormulaSection>

      {/* Logarithmic */}
      <FormulaSection title="Logarithmic Expressions">
        <FormulaRow latex="\dfrac{d}{dx}\ln x = \dfrac{1}{x}" />
      </FormulaSection>

      {/* Chain Rule */}
      <FormulaSection title="Chain Rule">
        <FormulaRow latex="\dfrac{dy}{dx} = \dfrac{dy}{du} \times \dfrac{du}{dx}" />
        <FormulaNoteBox html="Use when differentiating a <em>function of a function</em>, e.g. $\sin(3x^2)$ or $e^{x^2}$" />
      </FormulaSection>

      {/* Product Rule */}
      <FormulaSection title="Product Rule">
        <FormulaRow latex="\dfrac{d}{dx}(uv) = u\dfrac{dv}{dx} + v\dfrac{du}{dx}" />
        <FormulaNoteBox html="Use when differentiating a <em>product</em> of two functions, e.g. $x^2 \sin x$" />
      </FormulaSection>

      {/* Quotient Rule */}
      <FormulaSection title="Quotient Rule">
        <FormulaRow latex="\dfrac{d}{dx}\!\left(\dfrac{u}{v}\right) = \dfrac{v\,\dfrac{du}{dx} - u\,\dfrac{dv}{dx}}{v^2}" />
        <FormulaNoteBox html="Use when differentiating a <em>quotient</em> of two functions, e.g. $\dfrac{\sin x}{x}$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
