#!/usr/bin/env node
// 💬 "Ask about this step" — the round trip on a phone-sized browser (SPEC-CLIP-PIPELINE.md §2b).
//
//   node scripts/clips/ask-look.mjs [slug] [--stop 5] [--ask 0] [--laptop] [--base http://localhost:3210] [--out DIR]
//
// Server: `node scripts/clips/serve-prod.mjs build` then `… start` (a local production build whose
// student login works — the pulled .env.production.local has its secrets masked).
// Signs an admin session (as look.mjs does) + the preview student's session (the chat needs a
// student; --student <email> for another of Adrian's fixtures), opens /app/lesson/<slug>?at=<stop>
// at 390 × 844 (--laptop: 1280 × 800), taps "Ask about this step" (the chat opens WITH the clip,
// which must keep playing), taps ready question <ask>, waits for the answer, and checks the clip
// moved on meanwhile and that the board + slider and the chat are on screen together.
// Pictures go to <out>; the summary prints as JSON. The answer only comes on the real site or the
// preview (the chat server answers those origins only).
// Default: growth-and-decay-am at stop 5 — the "take L N" beat Adrian asked about.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const slug = args._[0] || 'growth-and-decay-am';
const STOP = Number(args.stop ?? 5);
const ASK = Number(args.ask ?? 0);
const BASE = String(args.base || 'http://localhost:3210').replace(/\/$/, '');
const OUT = String(args.out || path.join(os.tmpdir(), 'clip-ask-look', slug));

function dotenv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n$/, '').trim();
  }
  return out;
}
function adminToken() {
  const env = { ...dotenv(path.join(ROOT, '.env.local')), ...process.env };
  const s = env.ADMIN_SESSION_SECRET || env.SIGNUP_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not in .env.local');
  const expires = Date.now() + 3600_000;
  return `${expires}.${crypto.createHmac('sha256', s).update(`admin.${expires}`).digest('base64url')}`;
}

/** The preview student's session cookies (Ask needs a signed-in student; the clip itself needs the
 *  admin cookie while clips are admin-only). Magic link + verifyOtp, as scripts/leak-test does. */
async function studentCookies(email) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { createClient } = require('@supabase/supabase-js');
  const { createServerClient } = require('@supabase/ssr');
  const env = dotenv(path.join(ROOT, '.env.local'));
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const admin = createClient(url, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (e2) throw new Error(`verifyOtp: ${e2.message}`);
  const jar = {};
  const ssr = createServerClient(url, anonKey, {
    cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (cs) => { for (const c of cs) jar[c.name] = c.value; } },
    auth: { autoRefreshToken: false },
  });
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token });
  await ssr.auth.getSession();
  return Object.entries(jar).map(([name, value]) => ({ name, value, url: BASE }));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const puppeteer = await import('puppeteer-core');
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const out = { slug, stop: STOP, errors: [] };
try {
  const page = await browser.newPage();
  await page.setViewport(args.laptop
    ? { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
    : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setCookie({ name: 'admin_session', value: adminToken(), url: BASE });
  await page.setCookie(...(await studentCookies(String(args.student || 'portal-teste@example.com'))));
  page.on('pageerror', (e) => out.errors.push(String(e)));
  if (args.debug) {
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.error('[nav]', f.url()); });
    page.on('console', (m) => console.error('[console]', m.type(), m.text().slice(0, 200)));
  }
  // Start from a clean chat so the answer we read is this one.
  await page.goto(`${BASE}/app/lesson/${slug}?at=${STOP}`, { waitUntil: 'networkidle2', timeout: 120_000 });
  await page.evaluate(() => { try { localStorage.removeItem('am_portal_chat_id'); } catch {} });
  await sleep(2500);
  out.openedAtStep = await page.$eval('[data-step]', el => Number(el.getAttribute('data-step'))).catch(() => null);
  await page.screenshot({ path: path.join(OUT, '1-clip.png') });

  const askBtn = await page.$('[data-clip-ask] > button');
  if (!askBtn) throw new Error('no "Ask about this step" button');
  await askBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await askBtn.click();
  await sleep(900);
  const stepAtOpen = await page.$eval('[data-step]', el => Number(el.getAttribute('data-step'))).catch(() => null);
  out.pausedAfterOpen = await page.$eval('[data-step]', el => el.hasAttribute('data-paused')).catch(() => null);
  out.stayedOnClip = page.url().includes('/app/lesson/');
  out.readyQuestions = await page.$$eval('[data-clip-asks] button', bs => bs.map(b => b.textContent.trim()));
  await page.screenshot({ path: path.join(OUT, '2-chat-open.png') });

  const chips = await page.$$('[data-clip-asks] button');
  if (!chips.length) throw new Error('no ready questions in the chat');
  const pick = chips[Math.min(ASK, chips.length - 1)];
  out.asked = await pick.evaluate(b => b.textContent.trim());
  await pick.click();
  // Both on screen: the board and its slider above the phone sheet / left of the laptop panel.
  await sleep(1500);
  out.layout = await page.evaluate(() => {
    const p = document.querySelector('[data-clip-ask-panel]')?.getBoundingClientRect();
    const b = document.querySelector('.lsn-stage')?.getBoundingClientRect();
    const sc = document.querySelector('.lsn-scrub')?.getBoundingClientRect();
    if (!p) return { panel: null };
    const r = (x) => (x ? { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right) } : null);
    const bothSeen = window.innerWidth >= 1024
      ? !!b && b.right <= p.left && b.top >= 0
      : !!b && b.top >= 0 && b.bottom <= p.top && (!sc || sc.bottom <= p.top);
    return { panel: r(p), board: r(b), slider: r(sc), bothSeen };
  });
  await page.screenshot({ path: path.join(OUT, '2b-asked-while-playing.png') });
  // Wait for the answer (no caret, text stable for 3 s), up to 90 s — the clip plays on meanwhile.
  let last = '', stable = 0;
  for (let i = 0; i < 90 && stable < 3; i++) {
    await sleep(1000);
    const t = await page.evaluate(() => document.querySelector('[data-clip-ask-panel]')?.innerText ?? '');
    const streaming = await page.$('[data-clip-ask-panel] .stream-caret');
    stable = t === last && !streaming && t.length > 200 ? stable + 1 : 0;
    last = t;
  }
  out.chatText = last.slice(0, 3000);
  out.stepAtOpen = stepAtOpen;
  out.stepAfterAnswer = await page.$eval('[data-step]', el => Number(el.getAttribute('data-step'))).catch(() => null);
  out.clipKeptPlaying = out.stepAfterAnswer !== stepAtOpen || (await page.evaluate(() => /Now try one/.test(document.body.innerText)));
  await page.screenshot({ path: path.join(OUT, '3-answer.png') });
} catch (e) {
  out.errors.push(String(e));
} finally {
  await browser.close();
}
out.pictures = OUT;
console.log(JSON.stringify(out, null, 2));
