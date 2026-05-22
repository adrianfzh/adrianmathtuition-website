#!/usr/bin/env node
// scripts/sync-airtable-schema.js
// Pulls live Airtable schema (no record data) and writes src/lib/airtable-schema.ts
// Run manually: npm run sync-schema
// Also runs automatically via Claude Code SessionStart hook
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Read .env.local manually — no dotenv dependency needed
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) process.env[m[1]] = m[2];
  });
}

const TOKEN   = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!TOKEN || !BASE_ID) {
  console.error('[sync-schema] Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID in .env.local');
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${TOKEN}` } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function fieldSummary(field) {
  const out = { type: field.type };
  if (field.options?.choices) {
    out.options = field.options.choices.map(c => c.name);
  }
  if (field.options?.linkedTableId) {
    out.linkedTableId = field.options.linkedTableId;
  }
  return out;
}

async function main() {
  const data = await get(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`);

  // Build table-name → tableId map (for resolving linkedTableId → name)
  const tableNameById = {};
  for (const t of data.tables) tableNameById[t.id] = t.name;

  const schema = {};
  for (const table of data.tables) {
    schema[table.name] = {
      tableId: table.id,
      fields: {},
    };
    for (const field of table.fields) {
      const summary = fieldSummary(field);
      // Resolve linkedTableId to table name for readability
      if (summary.linkedTableId) {
        summary.linkedTable = tableNameById[summary.linkedTableId] || summary.linkedTableId;
        delete summary.linkedTableId;
      }
      schema[table.name].fields[field.name] = summary;
    }
  }

  const now = new Date().toISOString();
  const lines = [
    `// AUTO-GENERATED — run \`npm run sync-schema\` to update`,
    `// Last synced: ${now}`,
    `// Source: Airtable metadata API (no student data)`,
    `//`,
    `// USAGE: import { SCHEMA } from '@/lib/airtable-schema'`,
    `// Then use SCHEMA.Students.fields['Student Name'].type etc.`,
    ``,
    `export const SCHEMA = ${JSON.stringify(schema, null, 2)} as const;`,
    ``,
    `// Field name lookup helpers — use these instead of raw strings`,
    `export const FIELDS = Object.fromEntries(`,
    `  Object.entries(SCHEMA).map(([table, def]) => [`,
    `    table,`,
    `    Object.fromEntries(Object.keys(def.fields).map(f => [`,
    `      f.replace(/[^a-zA-Z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').toUpperCase(),`,
    `      f`,
    `    ]))`,
    `  ])`,
    `) as Record<string, Record<string, string>>;`,
  ];

  const outPath = path.join(__dirname, '../src/lib/airtable-schema.ts');
  fs.writeFileSync(outPath, lines.join('\n'));

  const tableCount = Object.keys(schema).length;
  const fieldCount = Object.values(schema).reduce((s, t) => s + Object.keys(t.fields).length, 0);
  console.log(`[sync-schema] ✅ ${tableCount} tables, ${fieldCount} fields → src/lib/airtable-schema.ts`);
}

main().catch(err => {
  console.error('[sync-schema] ❌', err.message);
  process.exit(1);
});
