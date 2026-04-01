'use client';

import FormulaPageLayout, { FormulaSection } from '@/components/FormulaPageLayout';

const PF_ROWS: [string, string, string][] = [
  [
    '1.',
    '\\dfrac{px+q}{(x-a)(x-b)},\\; a \\neq b',
    '\\dfrac{A}{x-a}+\\dfrac{B}{x-b}',
  ],
  [
    '2.',
    '\\dfrac{px+q}{(x-a)^2}',
    '\\dfrac{A}{x-a}+\\dfrac{B}{(x-a)^2}',
  ],
  [
    '3.',
    '\\dfrac{px^2+qx+r}{(x-a)(x-b)(x-c)}',
    '\\dfrac{A}{x-a}+\\dfrac{B}{x-b}+\\dfrac{C}{x-c}',
  ],
  [
    '4.',
    '\\dfrac{px^2+qx+r}{(x-a)^2(x-b)}',
    '\\dfrac{A}{x-a}+\\dfrac{B}{(x-a)^2}+\\dfrac{C}{x-b}',
  ],
  [
    '5.',
    '\\dfrac{px^2+qx+r}{(x-a)(x^2+bx+c)}',
    '\\dfrac{A}{x-a}+\\dfrac{Bx+C}{x^2+bx+c}',
  ],
];

export default function PartialFractionsPage() {
  const tableHtml = `
    <table class="formula-table" style="min-width:580px;font-size:88%;table-layout:fixed;width:100%">
      <colgroup>
        <col style="width:38px"/>
        <col style="width:50%"/>
        <col style="width:50%"/>
      </colgroup>
      <thead>
        <tr>
          <th style="text-align:center;padding:10px 6px">#</th>
          <th style="text-align:center;padding:10px 16px">Expression</th>
          <th style="text-align:center;padding:10px 16px">Partial Fraction Form</th>
        </tr>
      </thead>
      <tbody>
        ${PF_ROWS.map(([num, expr, pf]) => `
          <tr>
            <td style="text-align:center;padding:16px 6px">${num}</td>
            <td style="padding:16px 20px;text-align:center">$${expr}$</td>
            <td style="padding:16px 20px;text-align:center">$${pf}$</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  return (
    <FormulaPageLayout
      title="Partial Fractions"
      subtitle="O-Level A Math"
      contentId="partial-fractions-content"
    >
      <FormulaSection title="Partial Fraction Decomposition">
        <div style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: tableHtml }} />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
