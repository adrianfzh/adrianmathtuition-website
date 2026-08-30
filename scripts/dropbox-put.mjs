#!/usr/bin/env node
// Put a local file into Adrian's Dropbox app folder from any local session.
//
//   node scripts/dropbox-put.mjs <local-file> "/Self-Study/Alessi Tay/sheet.pdf" [--overwrite]
//
// Paths are relative to Dropbox/Apps/AdrianMathNotes/ — the same root
// src/lib/dropbox.ts uses. Dropbox creates missing parents, so no mkdir.
//
// Route: local file → Vercel Blob → POST /api/admin/dropbox-put (prod). NOT a
// direct Dropbox call, because the LOCAL .env.local refresh token predates the
// `files.content.write` scope and 401s missing_scope — the same trap that bit
// the Vercel token on 2026-08-06 (docs/MARKING.md). The server's token has the
// scope. Credentials are dotenv-PARSED, never grepped: the pulled file is
// dotenv-escaped and naive extraction has produced trailing-\n secrets before.
//
// Default mode is add+autorename, so an existing file is never silently
// replaced; pass --overwrite to replace (re-filing an edited sheet).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';

const [localFile, destRaw, ...flags] = process.argv.slice(2);
if (!localFile || !destRaw) {
  console.error('usage: node scripts/dropbox-put.mjs <local-file> "/Folder/name.pdf" [--overwrite]');
  process.exit(2);
}
const overwrite = flags.includes('--overwrite');
const SITE = process.env.SITE_BASE || 'https://www.adrianmathtuition.com';

const env = dotenv.parse(fs.readFileSync(new URL('../.env.local', import.meta.url)));
const blobToken = (env.BLOB_READ_WRITE_TOKEN || '').trim();
const adminPw = (env.ADMIN_PASSWORD || '').trim();
if (!blobToken || !adminPw) {
  console.error('need BLOB_READ_WRITE_TOKEN and ADMIN_PASSWORD in .env.local');
  process.exit(1);
}

const ext = path.extname(localFile).toLowerCase();
const contentType = ext === '.pdf' ? 'application/pdf'
  : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  : 'application/octet-stream';

const body = fs.readFileSync(localFile);
// Staged under a dedicated prefix so these are distinguishable from marking
// artefacts if the Blob store is ever swept.
const blob = await put(`dropbox-staging/${path.basename(localFile)}`, body, {
  access: 'public', addRandomSuffix: true, token: blobToken, contentType,
});

const res = await fetch(`${SITE}/api/admin/dropbox-put`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
  body: JSON.stringify({ url: blob.url, path: destRaw, overwrite }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || out.error) {
  console.error(`upload failed (HTTP ${res.status}): ${out.error || 'unknown'}`);
  process.exit(1);
}
console.log(`${out.path}  (${(out.bytes / 1024).toFixed(0)} KB)`);
