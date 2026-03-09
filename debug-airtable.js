// Run with: node debug-airtable.js
// Requires Node.js 18+ (for native fetch) or earlier with node-fetch

const fs = require('fs');
const path = require('path');

// Manually load .env
const envPath = path.join(__dirname, '.env');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
envLines.forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
});

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

console.log('TOKEN :', TOKEN ? `${TOKEN.slice(0, 10)}... (length ${TOKEN.length})` : 'MISSING');
console.log('BASE_ID:', BASE_ID || 'MISSING');
console.log('');

async function run() {
    // 1. List tables in the base via Meta API
    console.log('--- Listing tables in base via Meta API ---');
    const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const metaText = await metaRes.text();
    console.log('Status:', metaRes.status);
    try {
        const metaData = JSON.parse(metaText);
        if (metaData.tables) {
            console.log('Tables found:');
            metaData.tables.forEach(t => console.log(`  - "${t.name}" (id: ${t.id})`));
        } else {
            console.log('Response:', metaText);
        }
    } catch {
        console.log('Raw response:', metaText);
    }

    console.log('');
    // 2. Try fetching the Slots table directly (no filter, no field selection)
    console.log('--- Fetching Slots table directly ---');
    const slotsRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Slots?maxRecords=1`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    console.log('Status:', slotsRes.status);
    console.log('Body:', await slotsRes.text());
}

run().catch(console.error);
