'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

const fml = (latex: string) => (
  <div style={{ fontSize: 12, padding: '3px 0', textAlign: 'left' }}
    className="formula-row"
    dangerouslySetInnerHTML={{ __html: `$${latex}$` }}
  />
);

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
            <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 6 }}>Trigonometric</div>
            {fml('\\dfrac{d}{dx}\\tan x = \\sec^2 x')}
            {fml('\\dfrac{d}{dx}\\cot x = -\\csc^2 x')}
            {fml('\\dfrac{d}{dx}\\sec x = \\sec x \\tan x')}
            {fml('\\dfrac{d}{dx}\\csc x = -\\csc x \\cot x')}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 6 }}>Inverse Trigonometric</div>
            {fml('\\dfrac{d}{dx}\\sin^{-1} x = \\dfrac{1}{\\sqrt{1-x^2}}')}
            {fml('\\dfrac{d}{dx}\\cos^{-1} x = -\\dfrac{1}{\\sqrt{1-x^2}}')}
            {fml('\\dfrac{d}{dx}\\tan^{-1} x = \\dfrac{1}{1+x^2}')}
          </div>
        </div>
        <FormulaNoteBox html="Above applies to $f(x)$ via chain rule: multiply by $f'(x)$" />
      </FormulaSection>

      {/* Exponential & Logarithmic */}
      <FormulaSection title="Exponential & Logarithmic">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 6 }}>Exponential</div>
            {fml('\\dfrac{d}{dx}e^x = e^x')}
            {fml('\\dfrac{d}{dx}a^x = a^x \\ln a')}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(220,40%,30%)', marginBottom: 6 }}>Logarithmic</div>
            {fml('\\dfrac{d}{dx}\\ln x = \\dfrac{1}{x}')}
            {fml('\\dfrac{d}{dx}\\log_a x = \\dfrac{1}{x\\ln a}')}
          </div>
        </div>
      </FormulaSection>

      {/* Increasing / Decreasing & Concavity */}
      <FormulaSection title="Increasing / Decreasing & Concavity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Increasing', bg: 'hsl(120,40%,97%)', border: 'hsl(120,30%,86%)', labelColor: 'hsl(120,40%,25%)', noteColor: 'hsl(120,20%,40%)', formula: '\\dfrac{dy}{dx} > 0', note: 'As $x\\uparrow,\\ y\\uparrow$' },
            { label: 'Decreasing', bg: 'hsl(0,40%,97%)', border: 'hsl(0,30%,86%)', labelColor: 'hsl(0,40%,30%)', noteColor: 'hsl(0,20%,45%)', formula: '\\dfrac{dy}{dx} < 0', note: 'As $x\\uparrow,\\ y\\downarrow$' },
            { label: 'Concave Up', bg: 'hsl(220,40%,97%)', border: 'hsl(220,30%,88%)', labelColor: 'hsl(220,50%,30%)', noteColor: 'hsl(220,20%,45%)', formula: '\\dfrac{d^2y}{dx^2} > 0', note: 'As $x\\uparrow,\\ \\dfrac{dy}{dx}\\uparrow$' },
            { label: 'Concave Down', bg: 'hsl(270,40%,97%)', border: 'hsl(270,30%,87%)', labelColor: 'hsl(270,40%,30%)', noteColor: 'hsl(270,20%,45%)', formula: '\\dfrac{d^2y}{dx^2} < 0', note: 'As $x\\uparrow,\\ \\dfrac{dy}{dx}\\downarrow$' },
          ].map((item, i) => (
            <div key={i} style={{ background: item.bg, border: `1px solid ${item.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: item.labelColor, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, textAlign: 'left' }} className="formula-row" dangerouslySetInnerHTML={{ __html: `$${item.formula}$` }} />
              <div style={{ fontSize: 11, color: item.noteColor, marginTop: 3 }} dangerouslySetInnerHTML={{ __html: item.note }} />
            </div>
          ))}
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
