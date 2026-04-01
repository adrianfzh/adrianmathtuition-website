require('dotenv').config();
const handler = require('./api/send-invoices');

const req = { method: 'POST' };
const res = {
  status: (code) => ({ json: (data) => console.log('Status:', code, data) }),
  json: (data) => console.log('Result:', JSON.stringify(data, null, 2))
};

console.log('Testing batch invoice sending...');
handler(req, res).catch(console.error);
