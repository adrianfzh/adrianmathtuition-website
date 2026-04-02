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

export default function JCVectorsPage() {
  return (
    <FormulaPageLayout
      title="Vectors"
      subtitle="A-Level H2 Math"
      contentId="jc-vectors-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Basics */}
      <FormulaSection title="Basics">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 540 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 160 }}>Unit Vector</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 190 }}>Midpoint Theorem</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'hsl(220,40%,20%)', minWidth: 190 }}>Ratio Theorem</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\hat{v} = \\dfrac{\\mathbf{v}}{|\\mathbf{v}|}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\overrightarrow{OM} = \\dfrac{\\mathbf{a}+\\mathbf{b}}{2}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\overrightarrow{OM} = \\dfrac{\\lambda\\mathbf{a} + \\mu\\mathbf{b}}{\\lambda + \\mu}$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>

      {/* Dot & Cross Product */}
      <FormulaSection title="Dot Product & Cross Product">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(220,60%,25%)', marginBottom: 8 }}>Dot Product</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'hsl(220,20%,40%)', lineHeight: 1.8, listStyleType: 'disc' }}>
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{a} = |\\mathbf{a}|^2$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{b} = \\mathbf{b} \\cdot \\mathbf{a}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot (\\mathbf{b}+\\mathbf{c}) = \\mathbf{a}\\cdot\\mathbf{b} + \\mathbf{a}\\cdot\\mathbf{c}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{b} = 0 \\implies \\mathbf{a} \\perp \\mathbf{b}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{b} > 0 \\implies$ same direction' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\cdot \\mathbf{b} < 0 \\implies$ opposite direction' }} />
            </ul>
          </div>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(220,60%,25%)', marginBottom: 8 }}>Cross Product</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'hsl(220,20%,40%)', lineHeight: 1.8, listStyleType: 'disc' }}>
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\times \\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\sin\\theta\\,\\hat{n}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$|\\mathbf{a} \\times \\mathbf{b}| = |\\mathbf{a}||\\mathbf{b}|\\sin\\theta$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\times \\mathbf{b} = -\\mathbf{b} \\times \\mathbf{a}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\times (\\mathbf{b}+\\mathbf{c}) = \\mathbf{a}\\times\\mathbf{b} + \\mathbf{a}\\times\\mathbf{c}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$(\\mathbf{b}+\\mathbf{c}) \\times \\mathbf{a} = \\mathbf{b}\\times\\mathbf{a} + \\mathbf{c}\\times\\mathbf{a}$' }} />
              <li dangerouslySetInnerHTML={{ __html: '$\\mathbf{a} \\times \\mathbf{b} = \\mathbf{0} \\implies \\mathbf{a} \\parallel \\mathbf{b}$' }} />
              <li dangerouslySetInnerHTML={{ __html: 'In particular, $\\mathbf{a} \\times \\mathbf{a} = \\mathbf{0}$' }} />
            </ul>
          </div>
        </div>
      </FormulaSection>

      {/* Lines & Planes */}
      <FormulaSection title="Lines & Planes">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'hsl(220,60%,25%)', marginBottom: 6 }}>Line</div>
            {fml('\\mathbf{r} = \\mathbf{a} + \\lambda\\mathbf{d}')}
            {fml('\\dfrac{x-a_1}{d_1} = \\dfrac{y-a_2}{d_2} = \\dfrac{z-a_3}{d_3}')}
          </div>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'hsl(220,60%,25%)', marginBottom: 6 }}>Plane</div>
            {fml('\\mathbf{r} \\cdot \\mathbf{n} = d')}
            {fml('ax + by + cz = d')}
            {fml('\\mathbf{r} = \\mathbf{a} + \\lambda\\mathbf{d}_1 + \\mu\\mathbf{d}_2')}
          </div>
        </div>
      </FormulaSection>

      {/* Projections & Distances */}
      <FormulaSection title="Projections & Distances">
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Length of projection of PQ onto line (direction d)</div>
          {fml('\\dfrac{|\\overrightarrow{PQ} \\cdot \\mathbf{d}|}{|\\mathbf{d}|}')}
        </div>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Length of projection of PQ onto plane (normal n)</div>
          {fml('\\dfrac{|\\overrightarrow{PQ} \\times \\mathbf{n}|}{|\\mathbf{n}|}')}
        </div>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Distance from point to plane (normal n)</div>
          {fml('\\dfrac{|\\overrightarrow{PQ} \\cdot \\mathbf{n}|}{|\\mathbf{n}|}')}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Distance between two parallel planes</div>
          {fml('\\dfrac{|d_1 - d_2|}{|\\mathbf{n}|}')}
        </div>
      </FormulaSection>

      {/* Angles */}
      <FormulaSection title="Angles">
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Between two lines</div>
          {fml('\\cos\\theta = \\dfrac{|\\mathbf{d}_1 \\cdot \\mathbf{d}_2|}{|\\mathbf{d}_1||\\mathbf{d}_2|}')}
        </div>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Between line and plane</div>
          {fml('\\sin\\theta = \\dfrac{|\\mathbf{d} \\cdot \\mathbf{n}|}{|\\mathbf{d}||\\mathbf{n}|}')}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 2 }}>Between two planes</div>
          {fml('\\cos\\theta = \\dfrac{|\\mathbf{n}_1 \\cdot \\mathbf{n}_2|}{|\\mathbf{n}_1||\\mathbf{n}_2|}')}
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
