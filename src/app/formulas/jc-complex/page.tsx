'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
} from '@/components/FormulaPageLayout';

const fmlInline = (latex: string, annotation?: string) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 0' }}>
    <div className="formula-row" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: `$${latex}$` }} />
    {annotation && <span style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>{annotation}</span>}
  </div>
);

export default function JCComplexPage() {
  return (
    <FormulaPageLayout
      title="Complex Numbers"
      subtitle="A-Level H2 Math"
      contentId="jc-complex-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Basics */}
      <FormulaSection title="Basics">
        {fmlInline('z = a + bi')}
        {fmlInline('|z| = r = \\sqrt{a^2 + b^2}', 'Modulus')}
        {fmlInline('\\arg(z) = \\theta \\in (-\\pi,\\, \\pi]', 'Principal argument')}
      </FormulaSection>

      {/* Argument by Quadrant */}
      <FormulaSection title="Argument by Quadrant">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                {['1st quadrant', '2nd quadrant', '3rd quadrant', '4th quadrant'].map((q, i) => (
                  <th key={i} style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', fontSize: 12 }}>{q}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\tan^{-1}\\!\\left|\\dfrac{b}{a}\\right|$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\pi - \\tan^{-1}\\!\\left|\\dfrac{b}{a}\\right|$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$-\\!\\left[\\pi - \\tan^{-1}\\!\\left|\\dfrac{b}{a}\\right|\\right]$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$-\\tan^{-1}\\!\\left|\\dfrac{b}{a}\\right|$' }} />
              </tr>
              <tr style={{ background: 'hsl(220,20%,99%)', fontSize: 12 }}>
                <td colSpan={2} style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: 'Purely real: $k\\pi,\\; k \\in \\mathbb{Z}$' }} />
                <td colSpan={2} style={{ border: '1px solid hsl(220,15%,88%)', padding: '8px 12px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: 'Purely imaginary: $\\dfrac{(2k+1)\\pi}{2},\\; k \\in \\mathbb{Z}$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Properties of Conjugates */}
      <FormulaSection title="Properties of Conjugates">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 11 }}>
          {[
            '(z^*)^* = z',
            '(z \\pm w)^* = z^* \\pm w^*',
            'z + z^* = 2\\operatorname{Re}(z)',
            '(zw)^* = z^* w^*',
            'z - z^* = 2i\\operatorname{Im}(z)',
            '\\left(\\dfrac{z}{w}\\right)^* = \\dfrac{z^*}{w^*}',
            'zz^* = |z|^2',
            '(z^n)^* = (z^*)^n',
          ].map((f, i) => (
            <div key={i} className="formula-row" style={{ fontSize: 11, padding: '2px 0' }} dangerouslySetInnerHTML={{ __html: `$${f}$` }} />
          ))}
        </div>
        <div style={{ marginTop: 8, borderTop: '1px solid hsl(220,15%,92%)', paddingTop: 8 }}>
          {[
            'z = z^* \\iff z \\text{ is real}',
            '|z| = 1 \\implies z^* = \\dfrac{1}{z}',
            'z^n + (z^n)^* = 2\\cos n\\theta \\quad \\text{(for } |z|=1\\text{)}',
            'z^n - (z^n)^* = 2i\\sin n\\theta \\quad \\text{(for } |z|=1\\text{)}',
            'z + \\dfrac{1}{z} = 2\\cos\\theta \\qquad z - \\dfrac{1}{z} = 2i\\sin\\theta \\quad \\text{(for } |z|=1\\text{)}',
          ].map((f, i) => (
            <div key={i} className="formula-row" style={{ fontSize: 11, padding: '2px 0' }} dangerouslySetInnerHTML={{ __html: `$${f}$` }} />
          ))}
        </div>
      </FormulaSection>

      {/* Geometrical Representation */}
      <FormulaSection title="Geometrical Representation">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {[
                { op: '$iz$', desc: 'Rotation of $\\dfrac{\\pi}{2}$ anticlockwise about origin' },
                { op: '$-iz$', desc: 'Rotation of $\\dfrac{\\pi}{2}$ clockwise about origin' },
                { op: '$-z$', desc: 'Rotation of $\\pi$ about origin' },
                { op: '$z^*$', desc: 'Reflection in the real axis' },
              ].map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? 'hsl(220,20%,99%)' : 'white' }}>
                  <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, background: 'hsl(220,30%,97%)', minWidth: 60, borderRight: '2px solid hsl(220,15%,84%)' }} dangerouslySetInnerHTML={{ __html: row.op }} />
                  <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px' }} dangerouslySetInnerHTML={{ __html: row.desc }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Fundamental Theorem of Algebra */}
      <FormulaSection title="Fundamental Theorem of Algebra">
        <FormulaRow latex="\text{A polynomial of degree } n \text{ has exactly } n \text{ roots (real or non-real)}" />
      </FormulaSection>

      {/* Conjugate Root Theorem */}
      <FormulaSection title="Conjugate Root Theorem">
        <FormulaRow latex="\text{If } p(z) = 0 \text{ and } p \text{ has real coefficients, then } p(z^*) = 0" />
        <div style={{ fontSize: 13, color: 'hsl(220,20%,40%)', marginTop: 6 }}>
          Non-real roots occur in conjugate pairs $z$ and $z^*$.
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
