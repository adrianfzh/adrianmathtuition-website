const { Resend } = require('resend');
const { generateInvoicePDF } = require('./generate-pdf.js');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInvoiceEmail(invoiceData) {
    try {
        // 1. Generate PDF
        const pdfBuffer = await generateInvoicePDF(invoiceData);
        
        // 2. Build email HTML
        const paymentRef = `${(invoiceData.studentName || '').toUpperCase()} – ${(invoiceData.month || '').toUpperCase()}`;
        
        const emailHtml = `
<p>Dear Parent/Student,</p>
<p>Please find attached the invoice for ${invoiceData.studentName} 
for ${invoiceData.month} — <strong>$${invoiceData.finalAmount}</strong>, 
due by <strong>${invoiceData.dueDate}</strong>.</p>
<p>To pay, PayNow to <strong>91397985</strong> with 
reference <strong>${paymentRef}</strong>.</p>
<p>Please feel free to reach out if you have any 
questions.</p>
<p>Best regards,<br>Adrian</p>
        `.trim();
        
        // 3. Send email via Resend
        const { data, error } = await resend.emails.send({
            from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
            to: [invoiceData.parentEmail],
            subject: `Invoice for ${invoiceData.month} – ${invoiceData.studentName}`,
            html: emailHtml,
            attachments: [{
                filename: `Invoice-${invoiceData.studentName}-${invoiceData.month}.pdf`,
                content: pdfBuffer.toString('base64'),
                type: 'application/pdf',
                disposition: 'attachment'
            }]
        });
        
        if (error) {
            throw new Error(`Resend API error: ${error.message}`);
        }
        
        return { 
            success: true, 
            messageId: data.id 
        };
        
    } catch (error) {
        console.error('Error sending invoice email:', error);
        throw error;
    }
}

module.exports = { sendInvoiceEmail };
