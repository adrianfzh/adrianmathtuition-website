'use client';

import Image from 'next/image';
import FormulaPageLayout, {
  FormulaSection,
  FormulaNoteBox,
} from '@/components/FormulaPageLayout';

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ExpLogGraphsPage() {
  return (
    <FormulaPageLayout
      title="Exponential &amp; Logarithmic Graphs"
      subtitle="O-Level A Math"
      contentId="exp-log-content"
    >
      <FormulaSection title="Exponential Graphs" subtitle="4 basic shapes:">
        <Image
          src="/formulas/exp-graph.png"
          alt="Exponential graphs: y = eˣ, y = e⁻ˣ, y = −eˣ, y = −e⁻ˣ"
          width={420}
          height={420}
          style={{ display: 'block', margin: '8px auto', maxWidth: '72%', height: 'auto' }}
        />
      </FormulaSection>

      <FormulaSection title="Logarithmic Graphs" subtitle="4 basic shapes:">
        <Image
          src="/formulas/log-graph.png"
          alt="Logarithmic graphs: y = ln x, y = ln(−x), y = −ln x, y = −ln(−x)"
          width={420}
          height={420}
          style={{ display: 'block', margin: '8px auto', maxWidth: '72%', height: 'auto' }}
        />
        <FormulaNoteBox html="<strong>Asymptote of $y = \ln(ax - b)$:</strong><br>Set argument to zero: $ax - b = 0 \implies x = \dfrac{b}{a}$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
