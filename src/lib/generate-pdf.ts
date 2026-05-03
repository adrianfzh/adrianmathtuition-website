import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  // If we have a cached instance, verify it's still connected before reusing it.
  if (browserInstance) {
    try {
      await browserInstance.version(); // cheap health-check — throws if browser is gone
      return browserInstance;
    } catch {
      browserInstance = null; // stale/crashed — fall through to re-launch
    }
  }

  const isProd = process.env.VERCEL === '1';
  if (isProd) {
    const chromium = await import('@sparticuz/chromium-min');
    const executablePath = await chromium.default.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
    );
    browserInstance = await puppeteer.launch({
      args: chromium.default.args,
      executablePath,
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

async function renderPDF(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Allow Google Fonts so the template renders in Open Sans (not DejaVu fallback).
  // Without the actual font, headings render wider and the bot section overflows page 1.
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
  // Belt-and-braces: explicitly wait for the fontset to finish loading.
  await page.evaluate(() => (document as any).fonts?.ready);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    preferCSSPageSize: true,
  });

  await page.close();
  return Buffer.from(pdfBuffer);
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
  registerUrl?: string;
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
  const statusLabel = invoiceData.status || 'Pending';
  const statusClass = statusLabel.toLowerCase() === 'paid' ? 'paid' : 'pending';
  html = html.replace(/\{\{STATUS\}\}/g, statusLabel);
  html = html.replace(/\{\{STATUS_CLASS\}\}/g, statusClass);
  const paidStamp = statusLabel.toLowerCase() === 'paid'
    ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-60%) rotate(-35deg);border:10px solid #16a34a;border-radius:10px;padding:18px 40px;color:#16a34a;font-size:96px;font-weight:900;letter-spacing:0.12em;opacity:0.18;pointer-events:none;z-index:10;white-space:nowrap;font-family:'Open Sans',sans-serif;line-height:1;">PAID</div>`
    : '';
  html = html.replace(/\{\{PAID_STAMP\}\}/g, paidStamp);

  const paymentRef = `${(invoiceData.studentName || '').toUpperCase()} \u2013 ${(invoiceData.month || '').toUpperCase()}`;
  html = html.replace(/\{\{PAYMENT_REFERENCE\}\}/g, paymentRef);

  // Line items rows \u2014 group by description so multi-month invoices
  // (e.g. April + May combined) render as separate rows per month.
  let lineItemsRows = '';
  if (invoiceData.lineItems?.length) {
    // Preserve insertion order so April appears before May
    const groupedByDesc: Map<string, { day: string; count: number }> = new Map();
    invoiceData.lineItems.forEach((item) => {
      const desc = item.description || `Tuition \u2014 ${invoiceData.month || ''}`;
      const day  = item.day || 'Unknown';
      const existing = groupedByDesc.get(desc);
      if (existing) {
        existing.count++;
      } else {
        groupedByDesc.set(desc, { day, count: 1 });
      }
    });
    lineItemsRows = Array.from(groupedByDesc.entries()).map(([description, { day, count }]) => {
      const amount = (count * (invoiceData.ratePerLesson || 0)).toFixed(2);
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

  // Register URL (one per invoice; URL valid 30 days, token minted on click valid 7 days)
  const registerUrl = invoiceData.registerUrl || '';
  const registerHtml = registerUrl
    ? `<span class="bot-register-line">To register, visit <a href="${registerUrl}">${registerUrl.replace(/^https?:\/\//, '')}</a> for your registration code <span class="bot-register-expiry">(link expires in 1 month)</span>.</span>`
    : 'Ask Adrian for your registration code.';
  html = html.replace(/\{\{REGISTER_URL_HTML\}\}/g, registerHtml);

  return renderPDF(html);
}

export interface ReceiptData {
  studentName: string;
  parentEmail?: string;
  month: string;
  receiptId: string;
  paymentDate: string;
  finalAmount: number;
  notes: string;
  lineItems: LineItem[];
  lineItemsExtra: ExtraLineItem[];
  ratePerLesson: number;
}

export async function generateReceiptPDF(receiptData: ReceiptData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public', 'receipt-final.html');
  let html = await fs.readFile(templatePath, 'utf8');

  const receiptNumber = `R-${receiptData.receiptId.replace(/^rec/i, '').toUpperCase()}`;
  html = html.replace(/\{\{RECEIPT_ID\}\}/g, receiptNumber);
  html = html.replace(/\{\{STUDENT_NAME\}\}/g, receiptData.studentName || '');
  html = html.replace(/\{\{MONTH\}\}/g, receiptData.month || '');

  const paymentDateFormatted = receiptData.paymentDate
    ? new Date(receiptData.paymentDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '—';
  html = html.replace(/\{\{PAYMENT_DATE\}\}/g, paymentDateFormatted);
  html = html.replace(/\{\{FINAL_AMOUNT\}\}/g, parseFloat(String(receiptData.finalAmount || 0)).toFixed(2));

  let lineItemsRows = '';
  if (receiptData.lineItems?.length) {
    const groupedByDay: Record<string, LineItem[]> = {};
    receiptData.lineItems.forEach((item) => {
      const day = item.day || 'Unknown';
      if (!groupedByDay[day]) groupedByDay[day] = [];
      groupedByDay[day].push(item);
    });
    lineItemsRows = Object.entries(groupedByDay).map(([day, items]) => {
      const count = items.length;
      const amount = (count * (receiptData.ratePerLesson || 0)).toFixed(2);
      const description = items[0].description || `Tuition \u2014 ${receiptData.month || ''}`;
      return `<tr><td><div class="desc-main">${description}</div></td><td><span class="slot-pill">${day}</span></td><td><span class="lessons-badge">${count}</span></td><td>$${amount}</td></tr>`;
    }).join('');
  }
  html = html.replace(/\{\{LINE_ITEMS_ROWS\}\}/g, lineItemsRows);

  let extraLineItemsRows = '';
  if (receiptData.lineItemsExtra?.length) {
    extraLineItemsRows = receiptData.lineItemsExtra.map((item) => {
      const amount = parseFloat(String(item.amount)) || 0;
      const sign = amount >= 0 ? '' : '-';
      const slotCell = item.slot ? `<span class="slot-pill">${item.slot}</span>` : '';
      const lessonsCell = item.lessons ? `<span class="lessons-badge">${item.lessons}</span>` : '';
      return `<tr><td><div class="desc-main">${item.description || 'Additional Item'}</div></td><td>${slotCell}</td><td>${lessonsCell}</td><td>${sign}$${Math.abs(amount).toFixed(2)}</td></tr>`;
    }).join('');
  }
  html = html.replace(/\{\{EXTRA_LINE_ITEMS_ROWS\}\}/g, extraLineItemsRows);
  html = html.replace(/\{\{AUTO_NOTES\}\}/g, (receiptData.notes || '').replace(/\n/g, '<br>'));

  return renderPDF(html);
}
