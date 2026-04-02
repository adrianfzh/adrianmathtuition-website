'use client';

import FormulaPageLayout, {
  FormulaSection,
} from '@/components/FormulaPageLayout';

const fml = (latex: string, note?: string) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ fontSize: 12, padding: '3px 0', textAlign: 'left' }}
      className="formula-row"
      dangerouslySetInnerHTML={{ __html: `$${latex}$` }}
    />
    {note && <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginTop: 1, paddingLeft: 2 }}>{note}</div>}
  </div>
);

export default function JCIntegrationPage() {
  return (
    <FormulaPageLayout
      title="Integration"
      subtitle="A-Level H2 Math"
      contentId="jc-integration-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Trigonometry */}
      <FormulaSection title="Trigonometric Integrals">
        {fml('\\int \\tan x\\, dx = \\ln|\\sec x| + C')}
        {fml('\\int \\sec x\\, dx = \\ln|\\sec x + \\tan x| + C')}
        {fml('\\int \\csc x\\, dx = -\\ln|\\csc x + \\cot x| + C')}
        {fml('\\int \\cot x\\, dx = \\ln|\\sin x| + C')}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 4 }}>Half-angle identities</div>
          {fml('\\int \\sin^2 x\\, dx = \\int \\dfrac{1-\\cos 2x}{2}\\, dx')}
          {fml('\\int \\cos^2 x\\, dx = \\int \\dfrac{1+\\cos 2x}{2}\\, dx')}
          {fml('\\int \\tan^2 x\\, dx = \\int (\\sec^2 x - 1)\\, dx')}
          {fml('\\int \\cot^2 x\\, dx = \\int (\\csc^2 x - 1)\\, dx')}
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 4 }}>Direct results</div>
          {fml('\\int \\sec^2 x\\, dx = \\tan x + C')}
          {fml('\\int \\csc^2 x\\, dx = -\\cot x + C')}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, fontStyle: 'italic', color: 'hsl(220,10%,56%)', marginTop: 10 }}>Given in MF27</div>
      </FormulaSection>

      {/* Standard Form I */}
      <FormulaSection title="Standard Form I">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 180 }} dangerouslySetInnerHTML={{ __html: '$\\int [f(x)]^n f\'(x)\\, dx$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 180 }} dangerouslySetInnerHTML={{ __html: '$\\int \\dfrac{f\'(x)}{f(x)}\\, dx$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 180 }} dangerouslySetInnerHTML={{ __html: '$\\int e^{f(x)}f\'(x)\\, dx$' }} />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$= \\dfrac{[f(x)]^{n+1}}{n+1} + C$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$= \\ln|f(x)| + C$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$= e^{f(x)} + C$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Standard Form II */}
      <FormulaSection title="Standard Form II — MF27">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 80 }}>$f(x)$</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 130 }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{x^2+a^2}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 130 }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{\\sqrt{a^2-x^2}}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 130 }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{x^2-a^2}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 130 }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{a^2-x^2}$' }} />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', background: 'hsl(220,30%,97%)', fontWeight: 600, fontSize: 11 }}>$\int f(x)\,dx$</td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{a}\\tan^{-1}\\!\\left(\\dfrac{x}{a}\\right)$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$\\sin^{-1}\\!\\left(\\dfrac{x}{a}\\right)$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{2a}\\ln\\left|\\dfrac{x-a}{x+a}\\right|$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{2a}\\ln\\left|\\dfrac{a+x}{a-x}\\right|$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* By Parts */}
      <FormulaSection title="Integration by Parts">
        <div style={{ marginBottom: 8 }}>
          <div className="formula-row" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: '$\\int u\\, dv = uv - \\int v\\, du$' }} />
        </div>
        <div style={{
          background: 'hsl(45,90%,96%)', border: '1px solid hsl(45,80%,80%)',
          borderRadius: 8, padding: '12px 16px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(30,60%,30%)', marginBottom: 8 }}>LIATE Rule — choose $u$ in this priority:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Logarithmic', 'Inverse trig', 'Algebraic', 'Trigonometric', 'Exponential'].map((label, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  background: 'hsl(220,60%,20%)', color: 'white', borderRadius: 4,
                  padding: '2px 8px', fontSize: 12, fontWeight: 700,
                }}>
                  {label[0]}
                </span>
                <span style={{ fontSize: 12, color: 'hsl(220,20%,40%)' }}>{label}</span>
                {i < arr.length - 1 && <span style={{ color: 'hsl(220,15%,70%)', fontSize: 14 }}>→</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'hsl(30,30%,45%)', marginTop: 8 }}>Mnemonic: <strong>IK − ∫ID</strong> (I keep minus I differentiate)</div>
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
