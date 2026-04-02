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

      {/* Standard Results */}
      <FormulaSection title="Standard Summation Results">
        <FormulaRow latex="\sum_{r=1}^{n} a = an" annotation="Sum of constant" />
        <FormulaRow latex="\sum_{r=1}^{n} r = \dfrac{n}{2}(n+1)" annotation="Sum of first n natural numbers" />
        <FormulaRow latex="\sum_{r=1}^{n} r^2 = \dfrac{n}{6}(n+1)(2n+1)" annotation="Sum of squares" />
        <FormulaRow latex="\sum_{r=1}^{n} r^3 = \left[\dfrac{n}{2}(n+1)\right]^2" annotation="Sum of cubes" />
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid hsl(220,15%,92%)' }}>
          <div style={{ fontSize: 13, color: 'hsl(220,20%,40%)', marginBottom: 4 }}>GP sum example:</div>
          <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$$\\sum_{r=1}^{n} 3^r = \\dfrac{3(3^n-1)}{3-1} = \\dfrac{3}{2}(3^n - 1)$$' }} />
        </div>
      </FormulaSection>

      {/* Replacing Dummy Variable / Replacing n */}
      <FormulaSection title="Replacing Dummy Variable / Replacing n">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'hsl(220,40%,96%)' }}>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'left' }}>Technique</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'center' }}>Original</th>
                <th style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)', textAlign: 'center' }}>After Substitution</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>
                  Replace dummy variable<br/>
                  <span style={{ fontWeight: 400, color: 'hsl(220,20%,50%)', fontSize: 12 }}>$r \to r+1$</span>
                </td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n}\\dfrac{1}{r(r+1)} = 1 - \\dfrac{1}{n+1}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=0}^{n-1}\\dfrac{1}{(r+1)(r+2)} = 1 - \\dfrac{1}{n+1}$' }} />
              </tr>
              <tr style={{ background: 'hsl(220,20%,99%)' }}>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', fontWeight: 600, color: 'hsl(220,40%,20%)' }}>
                  Replace $n$<br/>
                  <span style={{ fontWeight: 400, color: 'hsl(220,20%,50%)', fontSize: 12 }}>$n \to n+1$</span>
                </td>
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n} u_r = \\dfrac{n}{n+1}$' }} />
                <td style={{ border: '1px solid hsl(220,15%,88%)', padding: '10px 14px', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: '$\\displaystyle\\sum_{r=1}^{n+1} u_r = \\dfrac{n+1}{n+2}$' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </FormulaSection>
    </FormulaPageLayout>
  );
}
