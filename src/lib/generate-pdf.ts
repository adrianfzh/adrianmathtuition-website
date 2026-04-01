import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;

  const isProd = process.env.VERCEL === '1';
  if (isProd) {
    const chromium = await import('@sparticuz/chromium');
    browserInstance = await puppeteer.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  } else {
    browserInstance = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export interface InvoiceData {
  studentName: string;
  parentEmail?: string;
  month: string;
  invoiceId: string;
  issueDate: string;
  dueDate: string;
  lessonsCount: number;
  ratePerLesson: number;
  baseAmount: number;
  adjustmentAmount?: number;
  adjustmentNotes?: string;
  finalAmount: number;
  status: string;
  makeupCredits?: number;
  notes: string;
  lineItems: LineItem[];
  lineItemsExtra: ExtraLineItem[];
}

interface LineItem {
  date: string;
  day: string;
  type: string;
  description: string;
}

interface ExtraLineItem {
  description: string;
  amount: number;
  slot?: string;
  lessons?: number;
}

export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  // Read invoice template
  const templatePath = path.join(process.cwd(), 'public', 'invoice-final.html');
  let html = await fs.readFile(templatePath, 'utf8');

  // Embed PayNow logo as base64
  try {
    const paynowLogoPath = path.join(process.cwd(), 'public', 'paynow.png');
    const paynowBuffer = await fs.readFile(paynowLogoPath);
    const paynowBase64 = paynowBuffer.toString('base64');
    html = html.replace(
      /src="data:image\/png;base64,[^"]+"/,
      `src="data:image/png;base64,${paynowBase64}"`
    );
  } catch { /* paynow.png not found, skip */ }

  // Replace placeholders
  html = html.replace(/\{\{STUDENT_NAME\}\}/g, invoiceData.studentName || '');
  html = html.replace(/\{\{MONTH\}\}/g, invoiceData.month || '');
  html = html.replace(/\{\{INVOICE_ID\}\}/g, invoiceData.invoiceId || '');

  const issueDateFormatted = invoiceData.issueDate
    ? new Date(invoiceData.issueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  html = html.replace(/\{\{ISSUE_DATE\}\}/g, issueDateFormatted);

  const dueDateFormatted = invoiceData.dueDate
    ? new Date(invoiceData.dueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  html = html.replace(/\{\{DUE_DATE\}\}/g, dueDateFormatted);
  html = html.replace(/\{\{LESSONS_COUNT\}\}/g, String(invoiceData.lessonsCount || 0));
  html = html.replace(/\{\{RATE_PER_LESSON\}\}/g, String(invoiceData.ratePerLesson || 0));
  html = html.replace(/\{\{BASE_AMOUNT\}\}/g, String(invoiceData.baseAmount || 0));
  html = html.replace(/\{\{FINAL_AMOUNT\}\}/g, parseFloat(String(invoiceData.finalAmount || 0)).toFixed(2));
  html = html.replace(/\{\{STATUS\}\}/g, invoiceData.status || 'Pending');

  const paymentRef = `${(invoiceData.studentName || '').toUpperCase()} \u2013 ${(invoiceData.month || '').toUpperCase()}`;
  html = html.replace(/\{\{PAYMENT_REFERENCE\}\}/g, paymentRef);

  // Line items rows
  let lineItemsRows = '';
  if (invoiceData.lineItems?.length) {
    const groupedByDay: Record<string, LineItem[]> = {};
    invoiceData.lineItems.forEach((item) => {
      const day = item.day || 'Unknown';
      if (!groupedByDay[day]) groupedByDay[day] = [];
      groupedByDay[day].push(item);
    });
    lineItemsRows = Object.entries(groupedByDay).map(([day, items]) => {
      const count = items.length;
      const amount = (count * (invoiceData.ratePerLesson || 0)).toFixed(2);
      const description = items[0].description || `Tuition \u2014 ${invoiceData.month || ''}`;
      return `<tr><td><div class="desc-main">${description}</div></td><td><span class="slot-pill">${day}</span></td><td><span class="lessons-badge">${count}</span></td><td>$${amount}</td></tr>`;
    }).join('');
  }
  html = html.replace(/\{\{LINE_ITEMS_ROWS\}\}/g, lineItemsRows);

  // Extra line items rows
  let extraLineItemsRows = '';
  if (invoiceData.lineItemsExtra?.length) {
    extraLineItemsRows = invoiceData.lineItemsExtra.map((item) => {
      const amount = parseFloat(String(item.amount)) || 0;
      const sign = amount >= 0 ? '' : '-';
      const slotCell = item.slot ? `<span class="slot-pill">${item.slot}</span>` : '';
      const lessonsCell = item.lessons ? `<span class="lessons-badge">${item.lessons}</span>` : '';
      return `<tr><td><div class="desc-main">${item.description || 'Additional Item'}</div></td><td>${slotCell}</td><td>${lessonsCell}</td><td>${sign}$${Math.abs(amount).toFixed(2)}</td></tr>`;
    }).join('');
  }
  html = html.replace(/\{\{EXTRA_LINE_ITEMS_ROWS\}\}/g, extraLineItemsRows);
  html = html.replace(/\{\{AUTO_NOTES\}\}/g, (invoiceData.notes || '').replace(/\n/g, '<br>'));

  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('https://fonts.googleapis.com') || url.startsWith('https://fonts.gstatic.com')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise((resolve) => setTimeout(resolve, 800));

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    preferCSSPageSize: true,
  });

  await page.close();
  return Buffer.from(pdfBuffer);
}
