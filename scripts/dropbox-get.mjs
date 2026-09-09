#!/usr/bin/env node
// Fetch a file (or its metadata) out of Adrian's Dropbox app folder from any local session.
//
//   node scripts/dropbox-get.mjs "/Students/Alessi Tay/2026-09-08 2021 OLevel Amath Paper 2/3 Practice Again.docx" prev.docx
//   node scripts/dropbox-get.mjs "/Students/…/3 Practice Again.docx" --meta      → JSON: name, size, client_modified, server_modified, rev
//
// Paths are relative to Dropbox/Apps/AdrianMathNotes/ — the same root
// src/lib/dropbox.ts uses. The read-side twin of dropbox-put.mjs, added 9 Sep
// 2026 for the sheet worker's "reuse before you write" step: an earlier sheet
// on the same paper, as Adrian last left it in Word. client_modified later than
// the sheet job's completed_at means he edited it — his copy is the one to reuse.
//
// Route: GET /api/admin/dropbox-get (prod), admin bearer — NOT a direct Dropbox
// call, for the same reason as dropbox-put (the local token is the narrow one).
// Credentials are dotenv-PARSED, never grepped.
import fs from 'node:fs';
import dotenv from 'dotenv';

const [srcRaw, ...rest] = process.argv.slice(2);
const meta = rest.includes('--meta');
const outFile = rest.find(a => !a.startsWith('--'));
if (!srcRaw || (!meta && !outFile)) {
  console.error('usage: node scripts/dropbox-get.mjs "/Folder/name.docx" <local-file> | --meta');
  process.exit(2);
}
const SITE = process.env.SITE_BASE || 'https://www.adrianmathtuition.com';
const env = dotenv.parse(fs.readFileSync(new URL('../.env.local', import.meta.url)));
const adminPw = (env.ADMIN_PASSWORD || '').trim();
if (!adminPw) { console.error('need ADMIN_PASSWORD in .env.local'); process.exit(1); }

const url = `${SITE}/api/admin/dropbox-get?path=${encodeURIComponent(srcRaw)}${meta ? '&meta=1' : ''}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${adminPw}` } });
if (!res.ok) {
  const out = await res.json().catch(() => ({}));
  console.error(`fetch failed (HTTP ${res.status}): ${out.error || 'unknown'}`);
  process.exit(1);
}
if (meta) {
  console.log(JSON.stringify(await res.json(), null, 2));
} else {
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  console.log(`${outFile}  (${(buf.length / 1024).toFixed(0)} KB, client_modified ${res.headers.get('x-client-modified')})`);
}
