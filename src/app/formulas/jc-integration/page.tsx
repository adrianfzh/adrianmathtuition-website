'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

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
        <FormulaRow latex="\int \tan x\, dx = \ln|\sec x| + C" />
        <FormulaRow latex="\int \sec x\, dx = \ln|\sec x + \tan x| + C" annotation="Given in MF26" />
        <FormulaRow latex="\int \csc x\, dx = -\ln|\csc x + \cot x| + C" annotation="Given in MF26" />
        <FormulaRow latex="\int \cot x\, dx = \ln|\sin x| + C" />
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 6 }}>Half-angle identities</div>
          <FormulaRow latex="\int \sin^2 x\, dx = \int \frac{1-\cos 2x}{2}\, dx" />
          <FormulaRow latex="\int \cos^2 x\, dx = \int \frac{1+\cos 2x}{2}\, dx" />
          <FormulaRow latex="\int \tan^2 x\, dx = \int (\sec^2 x - 1)\, dx" />
          <FormulaRow latex="\int \cot^2 x\, dx = \int (\csc^2 x - 1)\, dx" />
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 6 }}>Direct results</div>
          <FormulaRow latex="\int \sec^2 x\, dx = \tan x + C" />
          <FormulaRow latex="\int \csc^2 x\, dx = -\cot x + C" />
        </div>
        <FormulaNoteBox html="Product of trig functions (e.g. $\int \sin 2x \sin 6x\, dx$) → use <strong>Factor Formula</strong>" />
      </FormulaSection>

      {/* Standard Form I */}
      <FormulaSection title="Standard Form I — Recognition">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\int [f(x)]^n f\'(x)\\, dx$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\int \\dfrac{f\'(x)}{f(x)}\\, dx$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\int e^{f(x)}f\'(x)\\, dx$' }} />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$= \\dfrac{[f(x)]^{n+1}}{n+1} + C$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$= \\ln|f(x)| + C$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$= e^{f(x)} + C$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Standard Form II */}
      <FormulaSection title="Standard Form II — Inverse Trig Forms">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>$f(x)$</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{x^2+a^2}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{\\sqrt{a^2-x^2}}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{x^2-a^2}$' }} />
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{a^2-x^2}$' }} />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center', background: 'hsl(220,30%,97%)', fontWeight: 600, fontSize: 11 }}>$\int f(x)\,dx$</td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{a}\\tan^{-1}\\!\\left(\\dfrac{x}{a}\\right)$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\sin^{-1}\\!\\left(\\dfrac{x}{a}\\right)$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{2a}\\ln\\left|\\dfrac{x-a}{x+a}\\right|$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\dfrac{1}{2a}\\ln\\left|\\dfrac{a+x}{a-x}\\right|$' }} />
              </tr>
            </tbody>
          </table>
        </div>
        <FormulaNoteBox html="All results $+ C$. Given in MF26." />
      </FormulaSection>

      {/* By Parts */}
      <FormulaSection title="Integration by Parts">
        <FormulaRow latex="\int u\, dv = uv - \int v\, du" />
        <div style={{
          background: 'hsl(45,90%,96%)', border: '1px solid hsl(45,80%,80%)',
          borderRadius: 8, padding: '12px 16px', marginTop: 8,
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
