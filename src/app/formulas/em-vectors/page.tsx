'use client';

import FormulaPageLayout, { FormulaSection, FormulaRow, FormulaNoteBox } from '@/components/FormulaPageLayout';

export default function EmVectorsPage() {
  return (
    <FormulaPageLayout
      title="Vectors"
      subtitle="O-Level E Math"
      contentId="em-vectors-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Vector Basics">
        <FormulaRow
          latex="\left|\begin{pmatrix} x \\ y \end{pmatrix}\right| = \sqrt{x^2 + y^2}"
          annotation="Length (magnitude) of a vector"
        />
        <FormulaRow
          latex="\overrightarrow{AB} = k\,\overrightarrow{CD}"
          annotation="Parallel vectors"
        />
        <FormulaRow
          latex="\overrightarrow{AB} = k\,\overrightarrow{AC}"
          annotation="Collinear points"
        />
      </FormulaSection>

      <FormulaSection title="Position Vectors">
        <FormulaNoteBox html="Position vectors $\overrightarrow{OP},\; \overrightarrow{OA},\; \overrightarrow{OB}$ all start from the origin $O$." />
        <FormulaRow
          latex="\overrightarrow{OP} = \begin{pmatrix} 2 \\ -3 \end{pmatrix} \;\Leftrightarrow\; P(2,\,-3)"
          annotation="Column vectors ↔ coordinates"
        />
      </FormulaSection>

      <FormulaSection title="Connecting Vectors">
        <FormulaRow latex="\overrightarrow{AB} = \overrightarrow{AO} + \overrightarrow{OB}" />
        <FormulaNoteBox html="From $A$ to $O$, then from $O$ to $B$." />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
