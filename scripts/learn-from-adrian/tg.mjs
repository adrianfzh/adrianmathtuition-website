#!/usr/bin/env node
// Learn from Adrian — the Telegram side of the morning message (16 Oct 2026).
//
//   node tg.mjs send <message.txt> [buttons.json]   → sends it, prints {"ok":true,"message_id":N}
//   node tg.mjs mark <message_id> <slug> <text>     → that item's buttons become one status line
//   node tg.mjs reply <message_id> <text>           → a short answer under the message
//
// The message is HTML: everything escaped, then the first line and every "N. title" line
// bold. Buttons: one row per item, "✅ Apply N" (lf:a:<slug>) and "🗑 Drop N" (lf:d:<slug>);
// the bot records the tap (bot handlers/learn-buttons.js), apply.mjs carries it out.
// Telegram cannot read a sent message back, so each sent keyboard is kept in
// $LFA_STATE/messages/<id>.json for `mark` to redraw. Env: TELEGRAM_BOT_TOKEN,
// TELEGRAM_CHAT_ID, LFA_STATE.
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();
const STATE = process.env.LFA_STATE || path.join(process.env.HOME, '.adrianmath_learn');
const KB_DIR = path.join(STATE, 'messages');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(text) {
  return text.trim().split('\n').map((line, i) => {
    const e = esc(line);
    return (i === 0 || /^\d+\.\s+\S/.test(line) || /^Already done\b/.test(line)) && line.trim() ? `<b>${e}</b>` : e;
  }).join('\n');
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
  if (cmd === 'send') {
    const text = fs.readFileSync(a, 'utf8');
    const slugs = b && fs.existsSync(b) ? JSON.parse(fs.readFileSync(b, 'utf8')) : [];
    const kb = keyboard(Array.isArray(slugs) ? slugs : []);
    const res = await tg('sendMessage', {
      chat_id: CHAT, text: toHtml(text), parse_mode: 'HTML', disable_web_page_preview: true,
      ...(kb ? { reply_markup: kb } : {}),
    });
    if (kb) { fs.mkdirSync(KB_DIR, { recursive: true }); fs.writeFileSync(path.join(KB_DIR, `${res.message_id}.json`), JSON.stringify(kb)); }
    console.log(JSON.stringify({ ok: true, message_id: res.message_id }));
  } else if (cmd === 'mark') {
    const f = path.join(KB_DIR, `${a}.json`);
    if (!fs.existsSync(f)) return;   // an old message sent before buttons — nothing to redraw
    const kb = markRow(JSON.parse(fs.readFileSync(f, 'utf8')), b, c);
    await tg('editMessageReplyMarkup', { chat_id: CHAT, message_id: Number(a), reply_markup: kb }).catch((e) => {
      if (!/not modified/.test(e.message)) throw e;
    });
    fs.writeFileSync(f, JSON.stringify(kb));
  } else if (cmd === 'reply') {
    await tg('sendMessage', { chat_id: CHAT, text: b, disable_web_page_preview: true,
      ...(a && a !== '0' ? { reply_to_message_id: Number(a), allow_sending_without_reply: true } : {}) });
  } else {
    throw new Error('usage: tg.mjs send|mark|reply …');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
