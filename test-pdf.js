const fs = require('fs');
const path = require('path');
const { generateInvoicePDF, closeBrowser } = require('./api/generate-pdf.js');

const testInvoice = {
  studentName: 'Chloe Zhang',
  month: 'April 2026',
  invoiceId: 'INV-2026-0001',
  issueDate: '15 Mar 2026',
  dueDate: '15 Apr 2026',
  lessonsCount: 4,
  ratePerLesson: 70,
  baseAmount: 280,
  finalAmount: 280,
  status: 'Pending',
  notes: '',
  makeupCredits: 2,
  lineItems: [
    { date: '2026-04-04', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-11', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-18', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-25', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
  ]
};

async function testPDFGeneration() {
  try {
    console.time('Total');
    
    for (let i = 0; i < 3; i++) {
      console.time(`PDF ${i+1}`);
      const pdfBuffer = await generateInvoicePDF(testInvoice);
      
      // Save each PDF with a different name
      const outputPath = path.join(__dirname, `test-invoice-${i+1}.pdf`);
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.timeEnd(`PDF ${i+1}`);
      console.log(`PDF ${i+1} generated successfully: test-invoice-${i+1}.pdf`);
    }
    
    await closeBrowser();
    console.timeEnd('Total');
    console.log('All PDFs generated and browser closed.');
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}

testPDFGeneration();
