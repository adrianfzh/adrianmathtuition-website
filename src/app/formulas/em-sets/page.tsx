'use client';

import FormulaPageLayout, { FormulaSection } from '@/components/FormulaPageLayout';

const defsHtml = `
<div style="line-height:1.9;font-size:14px;color:hsl(220,20%,28%)">
  <div style="margin-bottom:14px">
    <span style="font-weight:700;color:hsl(220,60%,20%)">Equal sets</span>
    are sets that have exactly the same elements.
  </div>
  <div style="margin-bottom:14px">
    <div>
      <span style="font-weight:700;color:hsl(220,60%,20%)">Subsets:</span>
      If every element of set $A$ is also an element of set $B$, then $A$ is a subset of $B$.
    </div>
    <div style="margin:6px 0 0 18px">$A \\subset B$ &nbsp; or &nbsp; $A \\subseteq B$</div>
  </div>
  <div style="margin-bottom:14px">
    <span style="font-weight:700;color:hsl(220,60%,20%)">Universal set $\\epsilon$:</span>
    The set that contains all the elements.
  </div>
  <div style="margin-bottom:14px">
    <span style="font-weight:700;color:hsl(220,60%,20%)">Null set $\\phi$ or $\\{\\}$:</span>
    An empty set.
  </div>
  <div style="margin-bottom:14px">
    <span style="font-weight:700;color:hsl(220,60%,20%)">Union:</span>
    $A \\cup B$ &nbsp;→&nbsp; elements in $A$ <em>or</em> $B$
  </div>
  <div>
    <span style="font-weight:700;color:hsl(220,60%,20%)">Intersection:</span>
    $A \\cap B$ &nbsp;→&nbsp; elements in $A$ <em>and</em> $B$
  </div>
</div>
`;

export default function EmSetsPage() {
  return (
    <FormulaPageLayout
      title="Sets"
      subtitle="O-Level E Math"
      contentId="em-sets-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="Set Definitions">
        <div dangerouslySetInnerHTML={{ __html: defsHtml }} />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
