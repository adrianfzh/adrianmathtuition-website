// Generate an invoice PDF, upload it to Vercel Blob, and store the blob URL on
// the invoice's `PDF URL` field. This is the SAME blob that send-invoices,
// preview, archiving, and the invoice card all use — so calling this makes an
// invoice "send-ready". Used by send-invoices to self-heal invoices that have
// no blob PDF yet (e.g. signup invoices, which only get an Airtable attachment).
import { put } from '@vercel/blob';
import { generateInvoicePDF } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { airtableRequest } from '@/lib/airtable';
import { applyPriorBalance } from '@/lib/invoice-consolidate';

export async function generateAndStoreInvoicePdf(
  invoiceRecord: { id: string; fields: Record<string, any> },
  studentName: string,
): Promise<{ buffer: Buffer; url: string }> {
  const f = invoiceRecord.fields;
  const studentId: string | undefined = f['Student']?.[0];

  let lineItems: any[] = [];
  try { lineItems = JSON.parse(f['Line Items'] || '[]'); } catch { /* ignore */ }
  let lineItemsExtra: any[] = [];
  try { lineItemsExtra = JSON.parse(f['Line Items Extra'] || '[]'); } catch { /* ignore */ }

  const invoiceData = {
    studentName,
    month: f['Month'] || '',
    invoiceId: invoiceRecord.id,
    issueDate: f['Issue Date'] || '',
    dueDate: f['Due Date'] || '',
    lessonsCount: f['Lessons Count'] || 0,
    ratePerLesson: f['Rate Per Lesson'] || 0,
    baseAmount: f['Base Amount'] || 0,
    finalAmount: f['Final Amount'] || 0,
    status: f['Status'] || 'Draft',
    makeupCredits: 0,
    notes: (f['Auto Notes'] || '') as string,
    lineItems,
    lineItemsExtra,
    registerUrl: studentId ? buildRegisterUrl(studentId) : '',
  };

  // Consolidated view: pull in the student's other open months as previous balance.
  await applyPriorBalance(invoiceData, studentId);

  const buffer = await generateInvoicePDF(invoiceData);
  const blob = await put(
    `invoices/AdrianMathTuition-Invoice-${studentName.replace(/\s+/g, '-')}-${(f['Month'] || '').replace(/\s+/g, '-')}.pdf`,
    buffer,
    { access: 'public', contentType: 'application/pdf', allowOverwrite: true },
  );
  await airtableRequest('Invoices', `/${invoiceRecord.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { 'PDF URL': blob.url } }),
  });
  return { buffer, url: blob.url };
}
