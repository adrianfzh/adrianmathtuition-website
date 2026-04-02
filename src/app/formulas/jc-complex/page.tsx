'use client';

import FormulaPageLayout, {
  FormulaSection,
  FormulaRow,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

export default function JCComplexPage() {
  return (
    <FormulaPageLayout
      title="Complex Numbers"
      subtitle="A-Level H2 Math"
      contentId="jc-complex-content"
      footerNote="Formulas for the Singapore A-Level H2 Mathematics syllabus"
    >
      {/* Basics */}
      <FormulaSection title="Forms of a Complex Number">
        <FormulaRow latex="z = a + bi = r(\cos\theta + i\sin\theta) = re^{i\theta}" />
        <FormulaRow latex="z^n = r^n(\cos n\theta + i\sin n\theta) = r^n e^{in\theta}" annotation="De Moivre's Theorem" />
        <FormulaRow latex="|z| = r = \sqrt{a^2 + b^2}" annotation="Modulus" />
        <FormulaNoteBox html="Argument $\\arg(z) = \\theta \\in (-\\pi, \\pi]$ (principal argument)" />
      </FormulaSection>

      {/* Argument by Quadrant */}
      <FormulaSection title="Argument by Quadrant">
        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
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
            </tbody>
          </table>
        </div>
        <FormulaNoteBox html="Purely real: arg is a multiple of $\\pi$, i.e. $k\\pi,\\; k \\in \\mathbb{Z}$" />
        <FormulaNoteBox html="Purely imaginary: arg is an odd multiple of $\\dfrac{\\pi}{2}$, i.e. $\\dfrac{(2k+1)\\pi}{2},\\; k \\in \\mathbb{Z}$" />
      </FormulaSection>

      {/* Properties of Modulus & Argument */}
      <FormulaSection title="Properties of Modulus & Argument">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
          <FormulaRow latex="|z_1 z_2| = |z_1||z_2|" />
          <FormulaRow latex="\arg(z_1 z_2) = \arg z_1 + \arg z_2" />
          <FormulaRow latex="\left|\dfrac{z_1}{z_2}\right| = \dfrac{|z_1|}{|z_2|}" />
          <FormulaRow latex="\arg\!\left(\dfrac{z_1}{z_2}\right) = \arg z_1 - \arg z_2" />
          <FormulaRow latex="|z^n| = |z|^n" />
          <FormulaRow latex="\arg(z^n) = n\arg z" />
          <FormulaRow latex="|z^*| = |z|" />
          <FormulaRow latex="\arg(z^*) = -\arg(z)" />
        </div>
      </FormulaSection>

      {/* Properties of Conjugates */}
      <FormulaSection title="Properties of Conjugates">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
          <FormulaRow latex="(z^*)^* = z" />
          <FormulaRow latex="(z \pm w)^* = z^* \pm w^*" />
          <FormulaRow latex="z + z^* = 2\operatorname{Re}(z)" />
          <FormulaRow latex="(zw)^* = z^* w^*" />
          <FormulaRow latex="z - z^* = 2i\operatorname{Im}(z)" />
          <FormulaRow latex="\left(\dfrac{z}{w}\right)^* = \dfrac{z^*}{w^*}" />
          <FormulaRow latex="zz^* = |z|^2" />
          <FormulaRow latex="(z^n)^* = (z^*)^n" />
        </div>
        <div style={{ marginTop: 10 }}>
          <FormulaRow latex="z = z^* \iff z \text{ is real}" />
          <FormulaRow latex="|z| = 1 \implies z^* = \dfrac{1}{z}" />
        </div>
        <div style={{
          background: 'hsl(220,40%,97%)', border: '1px solid hsl(220,30%,88%)',
          borderRadius: 8, padding: '12px 14px', marginTop: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(220,40%,25%)', marginBottom: 6 }}>
            For $z = \cos\theta + i\sin\theta$ (i.e. $|z| = 1$):
          </div>
          <FormulaRow latex="z^n + (z^n)^* = 2\cos n\theta" />
          <FormulaRow latex="z^n - (z^n)^* = 2i\sin n\theta" />
          <FormulaRow latex="z + \dfrac{1}{z} = 2\cos\theta \qquad z - \dfrac{1}{z} = 2i\sin\theta" />
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

      {/* Fundamental Theorem & Conjugate Root Theorem */}
      <FormulaSection title="Fundamental & Conjugate Root Theorems">
        <FormulaNoteBox html="A polynomial equation of degree $n$ has exactly <strong>$n$ roots</strong> (real or non-real, counting multiplicity)" />
        <FormulaNoteBox html="<strong>Conjugate Root Theorem:</strong> Non-real roots of a polynomial with <em>real</em> coefficients occur in <strong>conjugate pairs</strong> $z$ and $z^*$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
