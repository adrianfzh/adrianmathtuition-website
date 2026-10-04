#!/usr/bin/env node
// scripts/nightly-builder/screenshot.mjs — the phone-width picture of a page for the nightly
// builder's morning message (docs/NIGHTLY-BUILDER.md §3 step 9). Readability rule: Adrian
// judges the rendered page, not the code, so the message carries what the page looks like.
//
//   node scripts/nightly-builder/screenshot.mjs --base https://…vercel.app --path /notes --out /tmp/a.png [--admin]
//
// --admin signs in first (POST /api/admin/session with ADMIN_PASSWORD, or MARKER_API_TOKEN on
// the Fly worker — the same value) and carries the cookie. Chromium: @sparticuz/chromium on
// Linux (the Fly worker), the local Chrome on a Mac (CHROME_PATH to override).
// Prints the output path; exit 1 on failure.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const base = String(arg('--base') || '').replace(/\/$/, '');
const pathname = arg('--path', '/');
const out = arg('--out');
const admin = process.argv.includes('--admin');
const width = Number(arg('--width', 390));
const height = Number(arg('--height', 844));
if (!/^https:\/\//.test(base) || !out) { console.error('usage: --base https://… --path /x --out file.png [--admin]'); process.exit(2); }

async function chrome() {
  if (process.platform === 'linux') {
    const mod = await import('@sparticuz/chromium');
    const c = mod.default || mod;
    return { executablePath: await c.executablePath(), args: c.args };
  }
  const mac = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return { executablePath: mac, args: [] };
}

async function adminCookie() {
  const password = (process.env.ADMIN_PASSWORD || process.env.MARKER_API_TOKEN || '').trim();
  if (!password) throw new Error('no ADMIN_PASSWORD for --admin');
  const r = await fetch(`${base}/api/admin/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), redirect: 'manual' });
  const set = r.headers.get('set-cookie') || '';
  const m = set.match(/admin_session=([^;]+)/);
  if (!r.ok || !m) throw new Error(`admin sign-in failed (HTTP ${r.status})`);
  return m[1];
}

const { executablePath, args } = await chrome();
const browser = await puppeteer.launch({ executablePath, args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (admin) {
    const value = await adminCookie();
    await page.setCookie({ name: 'admin_session', value, domain: new URL(base).hostname, path: '/', secure: true, httpOnly: true });
  }
  const res = await page.goto(base + pathname, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));              // streamed islands and KaTeX settle
  await page.screenshot({ path: out, fullPage: false });
  fs.statSync(out);
  console.log(`${out} (HTTP ${res ? res.status() : '?'})`);
} catch (e) {
  console.error('screenshot failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
