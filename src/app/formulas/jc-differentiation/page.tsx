'use client';

import FormulaPageLayout, {
  FormulaSection,
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
    </FormulaPageLayout>
  );
}
