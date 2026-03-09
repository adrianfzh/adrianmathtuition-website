require('dotenv').config();
const { sendInvoiceEmail } = require('./api/send-invoice.js');

const testInvoice = {
  studentName: 'Chloe Zhang',
  parentName: 'Ivy Chua',
  parentEmail: 'ablnon@hotmail.com', // Replace with your email
  month: 'April 2026',
  finalAmount: 280,
  dueDate: '15 Apr 2026',
  invoiceId: 'INV-2026-0001',
  makeupCredits: 2,
  lineItems: [
    { date: '2026-04-04', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-11', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-18', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
    { date: '2026-04-25', day: 'Saturday', type: 'Regular', description: 'Sec 4 A Math — April 2026' },
  ],
  ratePerLesson: 70,
  lessonsCount: 4,
  notes: '',
  status: 'Pending',
  issueDate: '15 Mar 2026'
};

async function testSendInvoice() {
  try {
    console.log('Sending test invoice email...');
    const result = await sendInvoiceEmail(testInvoice);
    console.log('Email sent successfully:', result);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testSendInvoice();
