'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function JCGraphingPage() {
  return (
    <FormulaPageLayout
      title="Graphing Techniques"
      subtitle="A-Level H2 Math"
      contentId="jc-graphing-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Conics */}
      <FormulaSection title="Conics">
        <FormulaRow latex="\text{Circle: } (x-a)^2 + (y-b)^2 = r^2" />
        <FormulaRow latex="\text{Ellipse: } \dfrac{(x-h)^2}{a^2} + \dfrac{(y-k)^2}{b^2} = 1" />
        <FormulaRow latex="\text{Hyperbola: } \dfrac{(x-h)^2}{a^2} - \dfrac{(y-k)^2}{b^2} = 1" />
        <FormulaRow latex="\text{Asymptote: } y - k = \pm\dfrac{b}{a}(x-h)" />
      </FormulaSection>

      {/* Rational Graphs & Asymptotes */}
      <FormulaSection title="Rational Graphs & Asymptotes">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>Form</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>Vertical Asymptote</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>Horizontal / Oblique</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$y = \\dfrac{ax+b}{cx+d}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$x = -\\dfrac{d}{c}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: 'Horizontal: $y = \\dfrac{a}{c}$' }} />
              </tr>
              <tr style={{ background: 'hsl(220,20%,99%)' }}>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$y = \\dfrac{ax^2+bx+c}{dx+e}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$x = -\\dfrac{e}{d}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: 'Oblique: $y = \\dfrac{a}{d}x + f$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Translation */}
      <FormulaSection title="Transformation of Graphs — Translation">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {[
            { sub: 'y \\to y + a', desc: 'Translate in <strong>negative</strong> $y$-direction by $a$ units' },
            { sub: 'y \\to y - a', desc: 'Translate in <strong>positive</strong> $y$-direction by $a$ units' },
            { sub: 'x \\to x + a', desc: 'Translate in <strong>negative</strong> $x$-direction by $a$ units' },
            { sub: 'x \\to x - a', desc: 'Translate in <strong>positive</strong> $x$-direction by $a$ units' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid hsl(220,15%,93%)' }}>
              <div className="formula-row" dangerouslySetInnerHTML={{ __html: `$${item.sub}$` }} style={{ fontWeight: 600, marginBottom: 2 }} />
              <div style={{ fontSize: 13, color: 'hsl(220,20%,40%)' }} dangerouslySetInnerHTML={{ __html: item.desc }} />
            </div>
          ))}
        </div>
      </FormulaSection>

      {/* Scaling */}
      <FormulaSection title="Scaling">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {[
            { sub: 'y \\to ay', desc: 'Scale along $y$-axis by factor $\\dfrac{1}{a}$' },
            { sub: 'y \\to \\dfrac{1}{a}y', desc: 'Scale along $y$-axis by factor $a$' },
            { sub: 'x \\to ax', desc: 'Scale along $x$-axis by factor $\\dfrac{1}{a}$' },
            { sub: 'x \\to \\dfrac{1}{a}x', desc: 'Scale along $x$-axis by factor $a$' },
            { sub: 'y \\to -y', desc: 'Reflect about $x$-axis' },
            { sub: 'x \\to -x', desc: 'Reflect about $y$-axis' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid hsl(220,15%,93%)' }}>
              <div className="formula-row" dangerouslySetInnerHTML={{ __html: `$${item.sub}$` }} style={{ fontWeight: 600, marginBottom: 2 }} />
              <div style={{ fontSize: 13, color: 'hsl(220,20%,40%)' }} dangerouslySetInnerHTML={{ __html: item.desc }} />
            </div>
          ))}
        </div>
      </FormulaSection>

      {/* Special Transformations */}
      <FormulaSection title="Special Transformations">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            {
              label: 'y = |f(x)|',
              points: ['Reflect bottom part up (below $x$-axis → above)'],
            },
            {
              label: 'y = f(|x|)',
              points: ['1. Abandon left half', '2. Reflect right half to left'],
            },
            {
              label: "y = f'(x)",
              points: [
                '1. Vertical asymptote remains',
                '2. $x$-coordinates of turning points become $x$-intercepts',
                '3. Trace the gradient',
              ],
            },
            {
              label: 'y = \\dfrac{1}{f(x)}',
              points: [
                '1. $x$-intercept → asymptote',
                '2. Asymptote → $x$-intercept',
                '3. Max → min, min → max',
                '4. All $y$ values become $\\dfrac{1}{y}$',
                '5. Observe behavior near asymptote',
              ],
            },
          ].map((card, i) => (
            <div key={i} style={{
              background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
              borderRadius: 8, padding: '12px 14px',
            }}>
              <div className="formula-row" style={{ fontWeight: 700, marginBottom: 8, color: 'hsl(220,60%,25%)' }} dangerouslySetInnerHTML={{ __html: `$${card.label}$` }} />
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'hsl(220,20%,35%)', lineHeight: 1.7, listStyleType: 'disc' }}>
                {card.points.map((pt, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: pt }} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
