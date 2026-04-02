'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function JCSequencesPage() {
  return (
    <FormulaPageLayout
      title="Series & Sequences"
      subtitle="A-Level H2 Math"
      contentId="jc-sequences-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Arithmetic Progression */}
      <FormulaSection title="Arithmetic Progression (AP)">
        <FormulaRow latex="T_n = a + (n-1)d" />
        <FormulaRow latex="S_n = \dfrac{n}{2}(2a + (n-1)d) = \dfrac{n}{2}(a+l)" />
        <FormulaNoteBox html="Show sequence is AP: $T_{n+1} - T_n = d$ (constant)" />
      </FormulaSection>

      {/* Geometric Progression */}
      <FormulaSection title="Geometric Progression (GP)">
        <FormulaRow latex="T_n = ar^{n-1}" />
        <FormulaRow latex="S_n = \dfrac{a(1-r^n)}{1-r} = \dfrac{a(r^n - 1)}{r-1}" />
        <FormulaRow latex="S_\infty = \dfrac{a}{1-r} \quad (|r| < 1)" />
        <FormulaNoteBox html="Show sequence is GP: $\dfrac{T_{n+1}}{T_n} = r$ (constant)" />
      </FormulaSection>

      {/* Finding nth term */}
      <FormulaSection title="Finding the nth Term from Sum">
        <FormulaRow latex="T_n = S_n - S_{n-1}" />
        <FormulaNoteBox html="Valid for $n \geq 2$. For $n = 1$: $T_1 = S_1$" />
      </FormulaSection>

      {/* Standard Results — annotation above formula */}
      <FormulaSection title="Standard Summation Results">
        {[
          { label: 'Sum of constant', latex: '\\sum_{r=1}^{n} a = an' },
          { label: 'Sum of first n natural numbers', latex: '\\sum_{r=1}^{n} r = \\dfrac{n}{2}(n+1)' },
          { label: 'Sum of squares', latex: '\\sum_{r=1}^{n} r^2 = \\dfrac{n}{6}(n+1)(2n+1)' },
          { label: 'Sum of cubes', latex: '\\sum_{r=1}^{n} r^3 = \\left[\\dfrac{n}{2}(n+1)\\right]^2' },
        ].map((item, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 1 }}>{item.label}</div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: `$$${item.latex}$$` }} />
          </div>
        ))}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 11, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 1 }}>GP sum example</div>
          <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$$\\sum_{r=1}^{n} 3^r = \\dfrac{3(3^n-1)}{3-1} = \\dfrac{3}{2}(3^n - 1)$$' }} />
        </div>
      </FormulaSection>

      {/* Replacing Dummy Variable / Replacing n */}
      <FormulaSection title="Replacing Dummy Variable / Replacing n">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'left', minWidth: 160 }}>Technique</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'center', minWidth: 270 }}>Original</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'center', minWidth: 270 }}>After Substitution</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', whiteSpace: 'nowrap' }}>
                  Replace dummy variable<br/>
                  <span style={{ fontWeight: 400, color: 'hsl(220,20%,50%)', fontSize: 12 }}>$r \to r+1$</span>
                </td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n}\\dfrac{1}{r(r+1)} = 1 - \\dfrac{1}{n+1}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=0}^{n-1}\\dfrac{1}{(r+1)(r+2)} = 1 - \\dfrac{1}{n+1}$' }} />
              </tr>
              <tr style={{ background: 'hsl(220,20%,99%)' }}>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', whiteSpace: 'nowrap' }}>
                  Replace $n$<br/>
                  <span style={{ fontWeight: 400, color: 'hsl(220,20%,50%)', fontSize: 12 }}>$n \to n+1$</span>
                </td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n} u_r = \\dfrac{n}{n+1}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n+1} u_r = \\dfrac{n+1}{n+2}$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
