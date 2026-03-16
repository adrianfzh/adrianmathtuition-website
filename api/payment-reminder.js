const { sendTelegram } = require('./telegram');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const cronSecret = process.env.CRON_SECRET;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = req.headers['authorization'];
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const validAdmin = adminPassword && authHeader === `Bearer ${adminPassword}`;

    if (!isVercelCron && !validCron && !validAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    await sendTelegram(
        `💰 <b>Payment Reminder</b>\n\n` +
        `Remember to check payments received and update Airtable before ` +
        `invoices generate tomorrow at 7am.\n\n` +
        `Go to Airtable → Invoices → tick Is Paid for received payments.`
    );

    return res.json({ ok: true });
};
