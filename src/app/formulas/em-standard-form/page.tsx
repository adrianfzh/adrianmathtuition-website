'use client';

import FormulaPageLayout, { FormulaSection, FormulaNoteBox } from '@/components/FormulaPageLayout';

const tableHtml = `
  <table style="width:100%;border-collapse:collapse;margin:8px 0">
    <thead>
      <tr>
        <th style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,40%,96%);font-weight:600;color:hsl(220,40%,20%)">Prefix</th>
        <th style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,40%,96%);font-weight:600;color:hsl(220,40%,20%)">Value</th>
        <th style="border:1px solid hsl(220,15%,88%);border-left:2px solid hsl(220,20%,75%);padding:10px 16px;text-align:center;background:hsl(220,40%,96%);font-weight:600;color:hsl(220,40%,20%)">Prefix</th>
        <th style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,40%,96%);font-weight:600;color:hsl(220,40%,20%)">Value</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,30%,97%)">tera</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center">$10^{12}$</td>
        <td style="border:1px solid hsl(220,15%,88%);border-left:2px solid hsl(220,20%,75%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,30%,97%)">milli</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center">$10^{-3}$</td>
      </tr>
      <tr>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,20%,99%)">giga</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,20%,99%)">$10^{9}$</td>
        <td style="border:1px solid hsl(220,15%,88%);border-left:2px solid hsl(220,20%,75%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,20%,99%)">micro</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,20%,99%)">$10^{-6}$</td>
      </tr>
      <tr>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,30%,97%)">mega</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center">$10^{6}$</td>
        <td style="border:1px solid hsl(220,15%,88%);border-left:2px solid hsl(220,20%,75%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,30%,97%)">nano</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center">$10^{-9}$</td>
      </tr>
      <tr>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,20%,99%)">kilo</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,20%,99%)">$10^{3}$</td>
        <td style="border:1px solid hsl(220,15%,88%);border-left:2px solid hsl(220,20%,75%);padding:10px 16px;text-align:center;font-weight:600;background:hsl(220,20%,99%)">pico</td>
        <td style="border:1px solid hsl(220,15%,88%);padding:10px 16px;text-align:center;background:hsl(220,20%,99%)">$10^{-12}$</td>
      </tr>
    </tbody>
  </table>
`;

export default function EmStandardFormPage() {
  return (
    <FormulaPageLayout
      title="Standard Form"
      subtitle="O-Level E Math"
      contentId="em-standard-form-content"
      footerNote="Formulas for the Singapore O-Level Elementary Mathematics syllabus"
    >
      <FormulaSection title="SI Prefixes">
        <div style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: tableHtml }} />
        <FormulaNoteBox html="Million $= 10^6$ &emsp;&emsp; Billion $= 10^9$" />
      </FormulaSection>
    </FormulaPageLayout>
  );
}
