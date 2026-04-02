'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function JCDifferentiationPage() {
  return (
    <FormulaPageLayout
      title="Differentiation"
      subtitle="A-Level H2 Math"
      contentId="jc-diff-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Trig + Inverse Trig side by side */}
      <FormulaSection title="Trigonometric & Inverse Trigonometric">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 8 }}>Trigonometric</div>
            <FormulaRow latex="\dfrac{d}{dx}\tan x = \sec^2 x" />
            <FormulaRow latex="\dfrac{d}{dx}\cot x = -\csc^2 x" />
            <FormulaRow latex="\dfrac{d}{dx}\sec x = \sec x \tan x" />
            <FormulaRow latex="\dfrac{d}{dx}\csc x = -\csc x \cot x" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 8 }}>Inverse Trigonometric</div>
            <FormulaRow latex="\dfrac{d}{dx}\sin^{-1} x = \dfrac{1}{\sqrt{1-x^2}}" />
            <FormulaRow latex="\dfrac{d}{dx}\cos^{-1} x = -\dfrac{1}{\sqrt{1-x^2}}" />
            <FormulaRow latex="\dfrac{d}{dx}\tan^{-1} x = \dfrac{1}{1+x^2}" />
          </div>
        </div>
        <FormulaNoteBox html="Above applies to $f(x)$ via chain rule: multiply by $f'(x)$" />
      </FormulaSection>

      {/* Exponential & Logarithmic */}
      <FormulaSection title="Exponential & Logarithmic">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 8 }}>Exponential</div>
            <FormulaRow latex="\dfrac{d}{dx}e^x = e^x" />
            <FormulaRow latex="\dfrac{d}{dx}a^x = a^x \ln a" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 8 }}>Logarithmic</div>
            <FormulaRow latex="\dfrac{d}{dx}\ln x = \dfrac{1}{x}" />
            <FormulaRow latex="\dfrac{d}{dx}\log_a x = \dfrac{1}{x\ln a}" />
          </div>
        </div>
      </FormulaSection>

      {/* Increasing / Decreasing & Concavity */}
      <FormulaSection title="Increasing / Decreasing & Concavity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: 'hsl(120,40%,97%)', border: '1px solid hsl(120,30%,86%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(120,40%,25%)', marginBottom: 6 }}>Increasing</div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$\\dfrac{dy}{dx} > 0$' }} />
            <div style={{ fontSize: 12, color: 'hsl(120,20%,40%)', marginTop: 4 }} dangerouslySetInnerHTML={{ __html: 'As $x\\uparrow,\\ y\\uparrow$' }} />
          </div>
          <div style={{
            background: 'hsl(0,40%,97%)', border: '1px solid hsl(0,30%,86%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(0,40%,30%)', marginBottom: 6 }}>Decreasing</div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$\\dfrac{dy}{dx} < 0$' }} />
            <div style={{ fontSize: 12, color: 'hsl(0,20%,45%)', marginTop: 4 }} dangerouslySetInnerHTML={{ __html: 'As $x\\uparrow,\\ y\\downarrow$' }} />
          </div>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(220,50%,30%)', marginBottom: 6 }}>Concave Up</div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$\\dfrac{d^2y}{dx^2} > 0$' }} />
            <div style={{ fontSize: 12, color: 'hsl(220,20%,45%)', marginTop: 4 }} dangerouslySetInnerHTML={{ __html: 'As $x\\uparrow,\\ \\dfrac{dy}{dx}\\uparrow$' }} />
          </div>
          <div style={{
            background: 'hsl(270,40%,97%)', border: '1px solid hsl(270,30%,87%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(270,40%,30%)', marginBottom: 6 }}>Concave Down</div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$\\dfrac{d^2y}{dx^2} < 0$' }} />
            <div style={{ fontSize: 12, color: 'hsl(270,20%,45%)', marginTop: 4 }} dangerouslySetInnerHTML={{ __html: 'As $x\\uparrow,\\ \\dfrac{dy}{dx}\\downarrow$' }} />
          </div>
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
