const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  
  const isProd = process.env.VERCEL === '1';
  if (isProd) {
    const chromium = require('@sparticuz/chromium');
    browserInstance = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function generateInvoicePDF(invoiceData) {
    try {
        // 1. Read invoice template
        const templatePath = path.join(__dirname, '..', 'invoice-final.html');
        let html = await fs.readFile(templatePath, 'utf8');

        // Write PayNow logo to temp file for Puppeteer to load
        const paynowMatch = html.match(/src="data:image\/png;base64,([^"]+)"/);
        let paynowTempPath = null;
        if (paynowMatch) {
            const paynowBuffer = Buffer.from(paynowMatch[1], 'base64');
            paynowTempPath = path.join(os.tmpdir(), `paynow-${crypto.randomBytes(6).toString('hex')}.png`);
            await fs.writeFile(paynowTempPath, paynowBuffer);
            html = html.replace(
                /src="data:image\/png;base64,[^"]+"/,
                `src="file://${paynowTempPath}"`
            );
        }

        // 2. Replace placeholders
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
        html = html.replace(/\{\{LESSONS_COUNT\}\}/g, invoiceData.lessonsCount || '0');
        html = html.replace(/\{\{RATE_PER_LESSON\}\}/g, invoiceData.ratePerLesson || '0');
        html = html.replace(/\{\{BASE_AMOUNT\}\}/g, invoiceData.baseAmount || '0');
        html = html.replace(/\{\{FINAL_AMOUNT\}\}/g, parseFloat(invoiceData.finalAmount || 0).toFixed(2));
        html = html.replace(/\{\{STATUS\}\}/g, invoiceData.status || 'Pending');
        
        // Payment reference: STUDENT NAME – MONTH
        const paymentRef = `${(invoiceData.studentName || '').toUpperCase()} – ${(invoiceData.month || '').toUpperCase()}`;
        html = html.replace(/\{\{PAYMENT_REFERENCE\}\}/g, paymentRef);

        // Generate line items rows grouped by slot/day
        let lineItemsRows = '';
        if (invoiceData.lineItems && Array.isArray(invoiceData.lineItems)) {
            // Group by day
            const groupedByDay = {};
            invoiceData.lineItems.forEach(item => {
                const day = item.day || 'Unknown';
                if (!groupedByDay[day]) {
                    groupedByDay[day] = [];
                }
                groupedByDay[day].push(item);
            });
            
            // Create one row per day
            lineItemsRows = Object.entries(groupedByDay).map(([day, items]) => {
                const count = items.length;
                const amount = (count * (invoiceData.ratePerLesson || 0)).toFixed(2);
                const description = items[0].description || `Tuition — ${invoiceData.month || ''}`;
                return `
                    <tr>
                        <td>
                            <div class="desc-main">${description}</div>
                        </td>
                        <td><span class="slot-pill">${day}</span></td>
                        <td><span class="lessons-badge">${count}</span></td>
                        <td>$${amount}</td>
                    </tr>
                `;
            }).join('');
        }
        html = html.replace(/\{\{LINE_ITEMS_ROWS\}\}/g, lineItemsRows);

        // Extra (manually added) line items
        let extraLineItemsRows = '';
        if (invoiceData.lineItemsExtra && Array.isArray(invoiceData.lineItemsExtra) && invoiceData.lineItemsExtra.length > 0) {
            extraLineItemsRows = invoiceData.lineItemsExtra.map(item => {
                const amount = parseFloat(item.amount) || 0;
                const sign = amount >= 0 ? '' : '-';
                const slotCell = item.slot
                    ? `<span class="slot-pill">${item.slot}</span>`
                    : '';
                const lessonsCell = item.lessons
                    ? `<span class="lessons-badge">${item.lessons}</span>`
                    : '';
                return `
                    <tr>
                        <td>
                            <div class="desc-main">${item.description || 'Additional Item'}</div>
                        </td>
                        <td>${slotCell}</td>
                        <td>${lessonsCell}</td>
                        <td>${sign}$${Math.abs(amount).toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
        }
        html = html.replace(/\{\{EXTRA_LINE_ITEMS_ROWS\}\}/g, extraLineItemsRows);

        html = html.replace(/\{\{AUTO_NOTES\}\}/g, invoiceData.notes || '');

        // Write full HTML to temp file so file:// image URLs resolve correctly
        const htmlTempPath = path.join(os.tmpdir(), `invoice-${crypto.randomBytes(6).toString('hex')}.html`);
        await fs.writeFile(htmlTempPath, html, 'utf8');

        // 3. Get browser instance
        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.goto(`file://${htmlTempPath}`, { waitUntil: ['domcontentloaded', 'load'], timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0',
                bottom: '0',
                left: '0',
                right: '0',
            },
            preferCSSPageSize: true,
        });

        await page.close();
        await fs.unlink(htmlTempPath).catch(() => {});
        if (paynowTempPath) {
            await fs.unlink(paynowTempPath).catch(() => {});
        }
        return Buffer.from(pdfBuffer);  // convert Uint8Array to Buffer
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
}

module.exports = { generateInvoicePDF, closeBrowser };
