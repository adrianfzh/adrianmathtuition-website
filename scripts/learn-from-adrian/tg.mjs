#!/usr/bin/env node
// Learn from Adrian — the Telegram side of the morning message (16 Oct 2026).
//
//   node tg.mjs send <message.txt> [buttons.json]   → sends it, prints {"ok":true,"message_id":N}
//   node tg.mjs mark <message_id> <slug> <text>     → that item's buttons become one status line
//   node tg.mjs reply <message_id> <text>           → a short answer under the message
//
// The message is HTML, styled like the ☀️ Staff brief (16 Oct 2026, Adrian: "make it like in
// topic staff … too many emojis"): everything escaped, the first line and every "N. title" line
// bold, and the labels "You said:", "Now:", "Proposed:" bold. It goes to the ☀️ Staff topic
// (the Airtable Settings row telegram_topics that /bindtopic staff writes), or the DM when
// Staff is not bound. Buttons: one row per item, "✅ Apply N" (lf:a:<slug>) and "🗑 Drop N" (lf:d:<slug>);
// the bot records the tap (bot handlers/learn-buttons.js), apply.mjs carries it out.
// Telegram cannot read a sent message back, so each sent keyboard is kept in
// $LFA_STATE/messages/<id>.json for `mark` to redraw. Env: TELEGRAM_BOT_TOKEN,
// TELEGRAM_CHAT_ID, LFA_STATE.
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();
const AT_TOKEN = (process.env.AIRTABLE_TOKEN || '').trim();
const AT_BASE = (process.env.AIRTABLE_BASE_ID || '').trim();
const STATE = process.env.LFA_STATE || path.join(process.env.HOME, '.adrianmath_learn');
const KB_DIR = path.join(STATE, 'messages');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LABEL = /^(You said|Now|Proposed):/;
export function toHtml(text) {
  return text.trim().split('\n').map((line, i) => {
    const e = esc(line);
    if ((i === 0 || /^\d+\.\s+\S/.test(line)) && line.trim()) return `<b>${e}</b>`;
    const m = LABEL.exec(line);
    return m ? `<b>${esc(m[0])}</b>${esc(line.slice(m[0].length))}` : e;
  }).join('\n');
}

/** The ☀️ Staff topic: { chat_id, message_thread_id } — or the DM when it is not bound. */
export async function staffTarget() {
  try {
    if (!AT_TOKEN || !AT_BASE) throw new Error('no Airtable config');
    const f = encodeURIComponent("{Setting Name}='telegram_topics'");
    const r = await fetch(`https://api.airtable.com/v0/${AT_BASE}/Settings?filterByFormula=${f}&maxRecords=1`, { headers: { Authorization: `Bearer ${AT_TOKEN}` } });
    const v = JSON.parse((await r.json()).records?.[0]?.fields?.Value || 'null');
    const chat = v && (v.chat_id || v.chatId);   // /bindtopic stores chat_id
    if (chat && v.topics && v.topics.staff) return { chat_id: chat, message_thread_id: v.topics.staff };
  } catch (e) { console.error('staff topic not found, sending to the DM:', e.message); }
  return { chat_id: CHAT };
}

export function keyboard(slugs) {
  const ok = slugs.filter((s) => /^[a-z0-9][a-z0-9-]{1,58}$/.test(s));
  if (!ok.length) return null;
  return { inline_keyboard: ok.map((s, i) => [
    { text: `✅ Apply ${i + 1}`, callback_data: `lf:a:${s}` },
    { text: `🗑 Drop ${i + 1}`, callback_data: `lf:d:${s}` },
  ]) };
}

export function markRow(kb, slug, text) {
  return { inline_keyboard: (kb.inline_keyboard || []).map((row) =>
    row.some((b) => String(b.callback_data || '').endsWith(':' + slug)) ? [{ text, callback_data: `lf:s:${slug}` }] : row) };
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (!TOKEN || !CHAT) throw new Error('no Telegram config');
  const saved = (id) => { try { return JSON.parse(fs.readFileSync(path.join(KB_DIR, `${id}.json`), 'utf8')); } catch { return null; } };
  if (cmd === 'send') {
    const text = fs.readFileSync(a, 'utf8');
    const slugs = b && fs.existsSync(b) ? JSON.parse(fs.readFileSync(b, 'utf8')) : [];
    const kb = keyboard(Array.isArray(slugs) ? slugs : []);
    const to = await staffTarget();
    const res = await tg('sendMessage', {
      ...to, text: toHtml(text), parse_mode: 'HTML', disable_web_page_preview: true,
      ...(kb ? { reply_markup: kb } : {}),
    });
    // kept with the chat and topic it went to, so mark/reply find it again
    if (kb) { fs.mkdirSync(KB_DIR, { recursive: true }); fs.writeFileSync(path.join(KB_DIR, `${res.message_id}.json`), JSON.stringify({ ...to, kb })); }
    console.log(JSON.stringify({ ok: true, message_id: res.message_id }));
  } else if (cmd === 'mark') {
    const s0 = saved(a);
    if (!s0) return;   // an old message sent before buttons — nothing to redraw
    const kb = markRow(s0.kb || s0, b, c);   // (16 Oct morning files held the keyboard alone, in the DM)
    await tg('editMessageReplyMarkup', { chat_id: s0.chat_id || CHAT, message_id: Number(a), reply_markup: kb }).catch((e) => {
      if (!/not modified/.test(e.message)) throw e;
    });
    fs.writeFileSync(path.join(KB_DIR, `${a}.json`), JSON.stringify({ chat_id: s0.chat_id || CHAT, message_thread_id: s0.message_thread_id, kb }));
  } else if (cmd === 'reply') {
    const s0 = a && a !== '0' ? saved(a) : null;
    const to = s0 && s0.chat_id ? { chat_id: s0.chat_id, ...(s0.message_thread_id ? { message_thread_id: s0.message_thread_id } : {}) } : await staffTarget();
    await tg('sendMessage', { ...to, text: b, disable_web_page_preview: true,
      ...(a && a !== '0' ? { reply_to_message_id: Number(a), allow_sending_without_reply: true } : {}) });
  } else {
    throw new Error('usage: tg.mjs send|mark|reply …');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
