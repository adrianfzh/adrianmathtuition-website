'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function JCFunctionsPage() {
  return (
    <FormulaPageLayout
      title="Functions"
      subtitle="A-Level H2 Math"
      contentId="jc-functions-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Inverse Functions */}
      <FormulaSection title="Inverse Functions">
        <FormulaNoteBox html="Need to pass the <strong>horizontal line test</strong> for $f^{-1}$ to exist" />
        <FormulaRow latex="D_{f^{-1}} = R_f \qquad R_{f^{-1}} = D_f" />
        <FormulaNoteBox html="Graphs of inverse functions are reflections about $y = x$" />
        <FormulaRow latex="f^{-1}f(x) = x \qquad ff^{-1}(x) = x" />
        <FormulaRow latex="D_{f^{-1}f} = D_f \qquad D_{ff^{-1}} = D_{f^{-1}}" />
        <div style={{ marginTop: 10, borderTop: '1px solid hsl(220,15%,92%)', paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 6 }}>Solving Equations</div>
          <FormulaNoteBox html="Solve $f(x) = f^{-1}(x) \implies$ Solve $f(x) = x$" />
          <FormulaNoteBox html="Solve $ff^{-1}(x) = f^{-1}f(x) \implies D_{f^{-1}} \cap D_f$" />
        </div>
      </FormulaSection>

      {/* Composite Functions */}
      <FormulaSection title="Composite Functions">
        <FormulaNoteBox html="For composite function $gf$ to exist: $R_f \subseteq D_g$" />
        <div style={{ marginTop: 8 }}>
          <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$$gf(x) = g(f(x))$$' }} />
        </div>
        <FormulaNoteBox html="$D_{gf} = D_f$ &emsp; $R_{gf} \subseteq R_g$" />
      </FormulaSection>

      {/* Self Inverse Functions */}
      <FormulaSection title="Self-Inverse Functions">
        <FormulaNoteBox html="$f^{-1}(x) = f(x)$ — the function is its own inverse" />
        <FormulaRow latex="f^2(x) = f^4(x) = f^{\text{even}}(x) = x" />
        <FormulaRow latex="f^3(x) = f^5(x) = f^{\text{odd}}(x) = f(x)" />
      </FormulaSection>

      {/* Odd & Even */}
      <FormulaSection title="Odd & Even Functions">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'hsl(220,60%,25%)', marginBottom: 8 }}>Odd Function</div>
            <div style={{ fontSize: 13, color: 'hsl(220,20%,35%)', marginBottom: 6 }}>Symmetrical about the <strong>origin</strong></div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$f(-x) = -f(x)$' }} />
          </div>
          <div style={{
            background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'hsl(220,60%,25%)', marginBottom: 8 }}>Even Function</div>
            <div style={{ fontSize: 13, color: 'hsl(220,20%,35%)', marginBottom: 6 }}>Symmetrical about the <strong>$y$-axis</strong></div>
            <div className="formula-row" dangerouslySetInnerHTML={{ __html: '$f(-x) = f(x)$' }} />
          </div>
        </div>
      </FormulaSection>

      {/* Periodic Functions */}
      <FormulaSection title="Periodic Functions">
        <FormulaRow latex="f(x+a) = f(x)" />
        <FormulaNoteBox html="Graph repeats every $a$ units — $a$ is the <strong>period</strong>" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
