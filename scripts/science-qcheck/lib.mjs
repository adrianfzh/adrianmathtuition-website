// 🧪 Structured science question check — shared bits for pick.mjs / apply.mjs (14 Oct 2026).
// The science bank lives in its own Supabase project (SUPABASE_URL_SCIENCE / SUPABASE_SERVICE_KEY_SCIENCE,
// set on the Fly worker; on a Mac read from the website's .env.local).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
function envFile() {
  const f = path.join(here, '..', '..', '.env.local');
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\\n$/, '').trim();
  }
  return out;
}
const fileEnv = envFile();
const env = k => (process.env[k] || fileEnv[k] || '').trim();
export const URL = env('SUPABASE_URL_SCIENCE').replace(/\/+$/, '');
export const KEY = env('SUPABASE_SERVICE_KEY_SCIENCE');
export const SITE = env('MARKER_API_BASE') || 'https://www.adrianmathtuition.com';
export const SITE_TOKEN = env('MARKER_API_TOKEN') || env('ADMIN_PASSWORD');
if (!URL || !KEY) { console.error('no SUPABASE_URL_SCIENCE / SUPABASE_SERVICE_KEY_SCIENCE'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function rest(p, init = {}) {
  let r;
  for (let i = 0; ; i++) {   // a network blip (DNS, reset) is retried, a database answer is not
    try { r = await fetch(`${URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } }); break; }
    catch (e) { if (i >= 4) throw e; await new Promise(res => setTimeout(res, 2000 * (i + 1))); }
  }
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

export const LEVELS = { PHY: 'PHYS', CHEM: 'CHEM', BIO: 'BIO' };
export const SUBJECT = { PHY: 'physics', CHEM: 'chemistry', BIO: 'biology' };
const MCQ1 = /^\s*[A-Da-d]\s*$/, MCQ2 = /^\s*\*\*[A-Da-d]\*\*/;
/** lib/science-bank eligible() + the structured filter of scienceNext, in JS. */
export function servableStructured(r) {
  return !r.quarantined && (!r.ai_generated || r.verified) && (!r.has_image || r.image_watermark_status === 'clean')
    && !r.not_in_syllabus && !/^gce$/i.test(r.school || '') && r.practice_hidden === false && (r.question_text || '') !== ''
    && (r.answer == null || (!MCQ1.test(r.answer) && !MCQ2.test(r.answer))) && !!r.solution;
}
export const flat = ps => (ps || []).flatMap(p => [p, ...flat(p.subparts)]);
export function figureUrls(r) {
  const base = `${URL}/storage/v1/object/public/question_images/`;
  const out = [];
  const add = v => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(e => add(typeof e === 'string' ? e : e?.url));
    const s = String(v).trim(); if (!s || s === '[]') return;
    if (s.startsWith('[')) { try { return add(JSON.parse(s)); } catch { /* a path */ } }
    out.push(s);
  };
  add(r.image_url); add(r.images);
  for (const p of flat(r.parts)) { add(p.image_url); add(p.image_url_after); }
  const txt = `${r.question_text} ${flat(r.parts).map(p => p.text).join(' ')}`;
  for (const m of txt.matchAll(/\{\{IMG:([^}]+)\}\}|!\[[^\]]*\]\(([^)]+)\)/g)) add(m[1] || m[2]);
  return [...new Set(out)].map(u => (/^https?:/.test(u) ? u : base + u.replace(/^\/+/, '').replace(/^(question_images\/)+/, '')));
}
/** The open practice topics, pure + Combined: the site's public list (lib/portal-beta). */
export async function openTopics() {
  const r = await fetch(`${SITE}/api/portal/practice/open-topics`);
  const j = await r.json();
  return { pure: j.topics || {}, combined: j.combinedTopics || {} };
}
export async function stamp(ok, summary, meta) {
  if (!SITE_TOKEN || process.env.QCHECK_NO_STAMP === '1') return;
  await fetch(`${SITE}/api/job-log`, { method: 'POST', headers: { Authorization: `Bearer ${SITE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job: 'science-qcheck', ok, summary: summary.slice(0, 300), meta }) }).catch(() => {});
}
