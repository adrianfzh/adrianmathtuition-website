// lib/chat-solver.ts — the web math solver's CLIENT CORE, shared by the public
// /chat page and the student portal's /app/ask tab (extracted from
// src/app/chat/page.tsx on 2026-08-28 so the portal tab reuses the streaming +
// KaTeX pipeline instead of forking it).
//
// What lives here: the KaTeX/markdown render pipeline, the chat-DOM builders
// (bubbles, typing dots, feedback row), the SSE streaming engine (typewriter
// reveal, status labels, verify/correction/graph events, resume-replay
// polling), and small pure helpers. What does NOT live here: page layout,
// input boxes, scroll-position tracking, Telegram Mini App identity, the
// registration nudge — those stay with each page.
//
// Not a React component: plain DOM + fetch, client-side only (KaTeX arrives on
// window via CDN <Script> tags that each page renders itself). The pure string
// helpers at the top are safe to import in node and are unit-tested in
// chat-solver.test.ts.

export const BOT_API_BASE = 'https://adrianmath-telegram-math-bot.fly.dev';

/* ── Types ── */
export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface RestoredMessage {
  id: number;
  role: string;
  content: string;
  image_url: string | null;
  feedback: string | null;
}

/* ── KaTeX globals ── */
declare global {
  interface Window {
    katex: {
      renderToString: (math: string, opts: { displayMode: boolean; throwOnError: boolean }) => string;
    };
    renderMathInElement: (el: HTMLElement, opts: object) => void;
    Telegram?: { WebApp: { expand: () => void; ready: () => void; initData?: string } };
  }
}

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

// Collision-safe id for chat sessions / stream requests.
export function randomChatToken(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

// Portal account → the bot's optional `level` request field. webchat.js reads
// it as the HIGHEST-priority system-prompt selector ('JC' | 'EM' | 'AM' |
// 'S1' | 'S2' — anything else falls through to the router's guess), so only
// send a value when it is unambiguous: a dual EM+AM student forced to 'AM'
// would get AM methods on EM homework, which is exactly the failure the bot's
// own dual-student handling avoids — those return null (omit the field).
export function botLevelForAccount(level: string | null, subjects: string[] | null): string | null {
  const lv = (level || '').trim();
  if (/^JC/i.test(lv) || /^J[12]\b/i.test(lv)) return 'JC';
  if (/^Sec\s?1\b/i.test(lv)) return 'S1';
  if (/^Sec\s?2\b/i.test(lv)) return 'S2';
  if (/^Sec/i.test(lv)) {
    // Students.Subjects options: Math / E Math / A Math / IP Math / H1 Math / H2 Math
    const subj = (subjects || []).map(s => String(s).trim().toLowerCase());
    const hasAM = subj.includes('a math');
    const hasEM = subj.includes('e math') || subj.includes('math');
    if (hasAM && !hasEM) return 'AM';
    if (hasEM && !hasAM) return 'EM';
    return null; // dual, IP, or unknown → let the bot's router classify per question
  }
  return null;
}

/* ── trim unclosed math during streaming so raw LaTeX never flashes ── */
export function trimUnclosedMath(t: string): string {
  // Unclosed display math: odd number of $$ delimiters → hold back from the last $$
  const dd = t.split('$$');
  if (dd.length % 2 === 0) t = dd.slice(0, -1).join('$$');
  // Unclosed inline math: odd count of single $ outside $$ pairs → hold back from the last $
  const singles = t.replace(/\$\$[\s\S]*?\$\$/g, '').match(/\$/g) || [];
  if (singles.length % 2 === 1) t = t.slice(0, t.lastIndexOf('$'));
  // Unclosed backtick segment (converted to math later in the pipeline)
  const ticks = t.match(/`/g) || [];
  if (ticks.length % 2 === 1) t = t.slice(0, t.lastIndexOf('`'));
  // Hold back trailing marker lines while streaming (stripped fully on final
  // render): CONFIDENCE:…, DIAGRAM:REQUEST …, DATA:MISSING … — the bot's
  // machine-readable tail markers, which may stack after the answer.
  t = t.replace(/(\n\s*(?:CONFIDENCE|DIAGRAM|DATA)\s*:[^\n]*)+\s*$/i, '');
  // …and a partially-streamed marker keyword ("CONFID", "DIAGR", "DATA:")
  t = t.replace(/\n\s*[A-Z]{2,10}\s*:?\s*$/, '');
  return t;
}

/* ── renderToElement (KaTeX inline render) ── */
export function renderToElement(el: HTMLDivElement, text: string, streaming = false) {
  if (streaming) text = trimUnclosedMath(text);
  text = text.replace(/\n\s*(?:CONFIDENCE\s*:\s*(?:HIGH|LOW)|DIAGRAM\s*:\s*REQUEST[^\n]*|DATA\s*:\s*MISSING[^\n]*)(?=\n|$)/gi, '').trimEnd();
  text = text.replace(/`([^`\n]+)`/g, '$$$1$');

  // Fix 1: bare \begin{matrix} has no brackets in KaTeX — upgrade to \begin{pmatrix}
  text = text.replace(/\\begin\{matrix\}/g, '\\begin{pmatrix}');
  text = text.replace(/\\end\{matrix\}/g, '\\end{pmatrix}');

  // Fix 2: UNDELIMITED LaTeX environments — the bot sometimes emits
  // \begin{pmatrix}...\end{pmatrix} with no $ delimiters at all, and the KaTeX
  // pass below only renders $-delimited math, so students saw raw LaTeX code.
  // Wrap bare environments in $$...$$ — but only OUTSIDE existing math spans,
  // so already-delimited ones aren't double-wrapped. (Split keeps $-spans at
  // odd indices; we only rewrite the even, non-math segments.)
  const BARE_ENV = /\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|aligned|align\*?|gathered)\}[\s\S]*?\\end\{\1\}/g;
  text = text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(BARE_ENV, (m) => `$$${m}$$`)))
    .join('');

  // Fix 3: escaped dollar signs (\$123) → plain dollar ($123) so currency renders correctly
  text = text.replace(/\\\$(\d)/g, '$$$1');

  let html = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/<strong>(Part\s*[\(\w\d]+[\):]?[^<\n]*)<\/strong>/g,
      '<span style="font-weight:700;display:block;margin-top:14px;color:hsl(40,80%,42%);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">$1</span>');

  // Stash KaTeX output behind placeholders: its SVG path data contains
  // newlines, and the \n→<br> pass below would corrupt it (a <br> inside
  // path d="..." makes √ radicals and stretchy braces invisible).
  // ⚠ The placeholder is \uE000<index>\uE001 (private-use sentinels; the
  // original page embedded them as INVISIBLE literal characters — written as
  // escapes here so grep/edit passes can't silently drop them). Without the
  // sentinels the un-stash regex would eat every digit in the answer.
  const mathChunks: string[] = [];
  const stash = (rendered: string) => `\uE000${mathChunks.push(rendered) - 1}\uE001`;
  if (typeof window !== 'undefined' && window.katex) {
    html = html.replace(/\$\$([^$]+?)\$\$/g, (_, math) => {
      try { return stash(window.katex.renderToString(math, { displayMode: true, throwOnError: false })); }
      catch { return `$$${math}$$`; }
    });
    html = html.replace(/(?<!\$)\$([^$]{1,2000}?)\$(?!\$)/g, (_, math) => {
      try { return stash(window.katex.renderToString(math, { displayMode: false, throwOnError: false })); }
      catch { return `$${math}$`; }
    });
  }

  // Markdown pipe tables → HTML tables. Runs AFTER math is stashed (so pipes
  // inside math like P(A|B) can't break cells) and BEFORE the newline→<br> pass.
  html = html.replace(/(^|\n)((?:\|[^\n]*\|[ \t]*\n)\|[ \t:|-]+\|[ \t]*\n(?:\|[^\n]*\|[ \t]*(?:\n|$))+)/g, (_m, lead: string, tbl: string) => {
    const rows = tbl.trim().split('\n');
    const cells = (r: string) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const th = cells(rows[0]).map(c =>
      `<th style="border:1px solid hsl(220,15%,84%);padding:6px 12px;background:hsl(220,30%,96%);text-align:left;font-weight:600;">${c}</th>`).join('');
    const body = rows.slice(2).map(r =>
      '<tr>' + cells(r).map(c => `<td style="border:1px solid hsl(220,15%,84%);padding:6px 12px;">${c}</td>`).join('') + '</tr>').join('');
    return `${lead}<table style="border-collapse:collapse;margin:10px 0;font-size:0.95em;max-width:100%;"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  });

  html = html.replace(/\n/g, '<br>');
  html = html.replace(/\uE000(\d+)\uE001/g, (_, i) => mathChunks[+i]);
  if (streaming) html += '<span class="stream-caret">▍</span>';
  el.innerHTML = html;
}

/* ── formatMessage (for final display of user messages) ── */
export function formatMessage(text: string): string {
  text = text.replace(/\n\s*(?:CONFIDENCE\s*:\s*(?:HIGH|LOW)|DIAGRAM\s*:\s*REQUEST[^\n]*|DATA\s*:\s*MISSING[^\n]*)(?=\n|$)/gi, '').trimEnd();
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  text = text.replace(/<strong>(Part\s*[\(\w\d]+[\):]?[^<\n]*)<\/strong>/g,
    '<span style="font-weight:700;display:block;margin-top:14px;color:hsl(40,80%,42%);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">$1</span>');
  text = text.replace(/`([^`\n]+)`/g, '$$$1$');
  text = text.replace(/\n/g, '<br>');
  return text;
}

/* ── image lightbox: click any chat image to view it enlarged ── */
export function openLightbox(src: string) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(10,15,30,0.88);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn 0.15s ease;padding:24px;';
  const big = document.createElement('img');
  big.src = src;
  big.style.cssText = 'max-width:96vw;max-height:94vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,0.5);object-fit:contain;';
  overlay.appendChild(big);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

export function makeImageZoomable(img: HTMLImageElement) {
  img.style.cursor = 'zoom-in';
  img.addEventListener('click', () => openLightbox(img.src));
}

/* ── autoResize helper ── */
export function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

/* ── Chat-DOM builders ────────────────────────────────────────────────────── */

/* ── Add user/bot message to the messages container; returns the group ── */
export function appendChatMessage(inner: HTMLDivElement, role: 'user' | 'bot', content: string | null, imageDataUrl?: string | null): HTMLElement {
  const group = document.createElement('div');
  group.style.cssText = `margin-bottom:20px;animation:fadeUp 0.2s ease;display:${role === 'user' ? 'flex' : 'block'};${role === 'user' ? 'justify-content:flex-end;' : ''}`;

  const bubble = document.createElement('div');
  bubble.style.cssText = role === 'user'
    ? 'padding:12px 16px;border-radius:16px;border-bottom-right-radius:4px;font-size:17px;line-height:1.7;background:hsl(220,60%,20%);color:hsl(45,100%,96%);max-width:78%;'
    : 'padding:12px 0;font-size:17px;line-height:1.7;';

  if (imageDataUrl) {
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.style.cssText = 'max-width:240px;border-radius:10px;display:block;margin-bottom:8px;border:1px solid rgba(255,255,255,0.2);';
    makeImageZoomable(img);
    bubble.appendChild(img);
  }

  if (content) {
    const textDiv = document.createElement('div');
    textDiv.innerHTML = formatMessage(content);
    bubble.appendChild(textDiv);
    requestAnimationFrame(() => {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(textDiv, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
            ],
            throwOnError: false,
          });
        } catch { /* noop */ }
      }
    });
  }

  group.appendChild(bubble);
  inner.appendChild(group);
  return group;
}

/* ── Typing indicator (jumping dots + delayed "Thinking…" label) ── */
export function appendTypingIndicator(inner: HTMLDivElement) {
  const group = document.createElement('div');
  group.id = 'typingGroup';
  group.style.cssText = 'margin-bottom:20px;';
  group.innerHTML = `<div id="typingBubble" style="display:inline-flex;gap:5px;align-items:center;padding:14px 4px;">
    <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0s infinite;opacity:0.4;"></span>
    <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0.2s infinite;opacity:0.4;"></span>
    <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0.4s infinite;opacity:0.4;"></span>
  </div>`;
  inner.appendChild(group);
  // Adaptive thinking can delay the first token 10-30s — after 6s, tell the
  // student the bot is thinking rather than looking frozen. No-op if the
  // typing bubble is already gone.
  setTimeout(() => {
    const bubble = document.getElementById('typingBubble');
    if (bubble && !document.getElementById('thinkingLabel')) {
      bubble.insertAdjacentHTML('beforeend',
        '<span id="thinkingLabel" style="margin-left:8px;font-size:13px;color:hsl(220,10%,46%);">Thinking…</span>');
    }
  }, 6000);
}

export function removeTypingIndicator() {
  document.getElementById('typingGroup')?.remove();
}

/* ── Add streaming message; returns the text div the stream renders into ── */
export function appendStreamingMessage(inner: HTMLDivElement): HTMLDivElement {
  const group = document.createElement('div');
  group.style.cssText = 'margin-bottom:20px;';
  const bubble = document.createElement('div');
  bubble.style.cssText = 'padding:12px 0;font-size:17px;line-height:1.7;';
  const textDiv = document.createElement('div');
  textDiv.className = 'streaming-content';
  bubble.appendChild(textDiv);
  group.appendChild(bubble);
  inner.appendChild(group);
  return textDiv;
}

/* ── 👍/👎 feedback row under an assistant answer ── */
export interface FeedbackOpts {
  apiBase?: string;
  getChatId: () => string;
  getTgInitData?: () => string | undefined;
}

export function attachFeedbackRow(group: HTMLElement, messageId: number, existing: string | null, opts: FeedbackOpts) {
  if (!messageId || group.querySelector('.fb-row')) return;
  const apiBase = opts.apiBase || BOT_API_BASE;
  const row = document.createElement('div');
  row.className = 'fb-row';
  row.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
  if (existing) row.dataset.voted = existing;
  const mk = (kind: 'up' | 'down') => {
    const b = document.createElement('button');
    b.textContent = kind === 'up' ? '👍' : '👎';
    b.setAttribute('aria-label', kind === 'up' ? 'Good answer' : 'Bad answer');
    b.style.cssText = 'background:none;border:1px solid hsl(220,15%,88%);border-radius:8px;padding:2px 9px;cursor:pointer;font-size:13px;opacity:0.5;';
    if (existing === kind) { b.style.opacity = '1'; b.style.background = 'hsl(220,60%,96%)'; }
    b.onclick = () => {
      if (row.dataset.voted) return;
      row.dataset.voted = kind;
      Array.from(row.children).forEach(c => { (c as HTMLElement).style.opacity = c === b ? '1' : '0.3'; });
      b.style.background = 'hsl(220,60%,96%)';
      const fbBody: Record<string, unknown> = { chatId: opts.getChatId(), messageId, feedback: kind };
      const tgInit = opts.getTgInitData?.();
      if (tgInit) fbBody.tgInitData = tgInit;
      fetch(`${apiBase}/api/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbBody),
      }).catch(() => { /* feedback is best-effort */ });
    };
    return b;
  };
  row.appendChild(mk('up'));
  row.appendChild(mk('down'));
  group.appendChild(row);
}

/* ── Conversation restore ─────────────────────────────────────────────────── */

// KaTeX loads from CDN — wait for it (max ~6s) so restored math renders.
export function whenKatexReady(cb: () => void) {
  const waitKatex = (tries: number) => {
    if ((typeof window.katex !== 'undefined' && typeof window.renderMathInElement === 'function') || tries > 40) cb();
    else setTimeout(() => waitKatex(tries + 1), 150);
  };
  waitKatex(0);
}

// Inserts restored messages into the container (with feedback rows on
// assistant turns) and returns the trimmed HistoryEntry[] to seed the
// conversation history with.
export function insertRestoredMessages(
  inner: HTMLDivElement,
  msgs: RestoredMessage[],
  feedbackOpts: FeedbackOpts,
): HistoryEntry[] {
  for (const m of msgs) {
    if (m.role === 'user') {
      appendChatMessage(inner, 'user', m.content === '[image]' ? null : m.content, m.image_url || null);
    } else {
      const group = appendChatMessage(inner, 'bot', m.content);
      if (m.id) attachFeedbackRow(group, m.id, m.feedback, feedbackOpts);
    }
  }
  return msgs.slice(-12).map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));
}

/* ── POST /api/chat with one retry (3s apart); throws Error('Network error') ── */
export async function postSolverChat(body: Record<string, unknown>, apiBase = BOT_API_BASE): Promise<Response> {
  let attempts = 0;
  while (true) {
    try {
      return await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      attempts++;
      if (attempts >= 2) throw new Error('Network error');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

/* ── The streaming engine ─────────────────────────────────────────────────── */
//
// Consumes the bot's SSE response into streamDiv with the client-side
// typewriter (two-layer stable-prefix/live-tail rendering — see the comments
// inline), handles verify / status / correction / graph / done events, and on
// a mid-stream drop polls { resume: requestId } for the server-side replay.
// Guarantees its status ticker is stopped and the typewriter finalized on any
// exit, including thrown network errors (the caller still handles the error
// banner itself). Callers pass scroll behavior in — pages own their scroll
// containers and their "user scrolled up" tracking.

export interface SolverStreamOpts {
  streamDiv: HTMLDivElement;
  requestId: string;
  chatId: string;
  apiBase?: string;
  showError: (msg: string) => void;
  // Reveal-time scroll: called when new characters appear; the page's
  // implementation should respect its own scrolled-up flag.
  autoScroll: () => void;
  // Hard scroll (connection-lost message).
  scrollToBottom: () => void;
}

export interface SolverStreamOutcome {
  fullText: string;
  sawDone: boolean;
  gotError: boolean;
  doneMessageId: number | null;
}

export async function runSolverStream(res: Response, opts: SolverStreamOpts): Promise<SolverStreamOutcome> {
  const { streamDiv, requestId, chatId, showError } = opts;
  const apiBase = opts.apiBase || BOT_API_BASE;

  const streamStartedAt = Date.now();
  let fullText = '';
  let sawDone = false;
  let gotError = false;
  let doneMessageId: number | null = null;
  let lastStatus: { status: string; chars?: number; glimpse?: string | null } | null = null;
  let statusTicker: ReturnType<typeof setInterval> | null = null;
  const stopStatusTicker = () => { if (statusTicker) { clearInterval(statusTicker); statusTicker = null; } };
  // Client-side typewriter: received text accumulates in fullText (buffer);
  // a rAF loop reveals it at a steady chars/sec rate regardless of how bursty
  // network delivery is. SMOOTHNESS: re-rendering the whole message through
  // KaTeX every tick gets slower as the answer grows (visible stutter + math
  // re-typeset flicker). Instead the message renders in TWO layers — a stable
  // prefix (all completed paragraphs, re-rendered only when a paragraph
  // completes) and a short live tail (re-rendered every frame, cheap) — so
  // the per-frame cost stays constant however long the answer gets.
  // Reveal pacing (2026-08-26, per Adrian — stream like Claude's own UI):
  // a CONTINUOUS proportional rate replaces the old fixed 38 cps base with
  // stepped catch-up (240/480 cps at hard backlog thresholds), which read
  // slowly on short answers and visibly LURCHED when a threshold tripped.
  // Each frame aims to drain the current backlog in ~DRAIN_S seconds, so the
  // reveal speed rises and falls smoothly with the model's arrival speed,
  // never trails it by more than ~a quarter second, and keeps a gentle floor
  // so trickling text still types rather than stalling.
  const MIN_CPS = 60;   // floor: pleasant typing feel when the model trickles
  const DRAIN_S = 0.25; // target lag behind arrivals
  let displayedLen = 0;
  let lastShownLen = -1;
  let typerRAF: number | null = null;
  let typerLastTs = 0;
  let stablePrefix = '';
  const ensureStreamLayers = (): { stable: HTMLDivElement; tail: HTMLDivElement } => {
    let stable = streamDiv.querySelector<HTMLDivElement>(':scope > .stream-stable');
    let tail = streamDiv.querySelector<HTMLDivElement>(':scope > .stream-tail');
    if (!stable || !tail) {
      streamDiv.innerHTML = '';
      stable = document.createElement('div'); stable.className = 'stream-stable';
      tail = document.createElement('div'); tail.className = 'stream-tail';
      streamDiv.appendChild(stable); streamDiv.appendChild(tail);
      stablePrefix = '\u0000'; // force a prefix re-render after the layers were rebuilt
    }
    return { stable, tail };
  };
  const typerFrame = (ts: number) => {
    if (!typerLastTs) typerLastTs = ts;
    const backlog = fullText.length - displayedLen;
    const cps = Math.max(MIN_CPS, backlog / DRAIN_S);
    displayedLen = Math.min(fullText.length, displayedLen + ((ts - typerLastTs) / 1000) * cps);
    typerLastTs = ts;
    const caughtUp = displayedLen >= fullText.length;
    // Render + autoscroll ONLY when new characters were revealed this frame.
    // Without this gate, the caught-up-but-waiting phase (e.g. while the graph
    // generates) re-rendered and force-scrolled every frame — the user
    // couldn't scroll up at all during graph generation.
    const shownLen = Math.floor(displayedLen);
    if (shownLen !== lastShownLen) {
      lastShownLen = shownLen;
      const { stable, tail } = ensureStreamLayers();
      const shown = fullText.slice(0, shownLen);
      const cut = shown.lastIndexOf('\n\n');
      const prefix = cut === -1 ? '' : shown.slice(0, cut + 2);
      const tailText = cut === -1 ? shown : shown.slice(cut + 2);
      if (prefix !== stablePrefix) { renderToElement(stable, prefix); stablePrefix = prefix; }
      renderToElement(tail, tailText, true); // short tail → cheap per frame
      opts.autoScroll();
    }
    if (caughtUp && sawDone) {
      typerRAF = null;
      renderToElement(streamDiv, fullText); // final render: full text, single layer, no caret
      return;
    }
    typerRAF = requestAnimationFrame(typerFrame);
  };
  const startTyper = () => { if (typerRAF === null) { typerLastTs = 0; typerRAF = requestAnimationFrame(typerFrame); } };
  // On any abnormal exit (network error, stream end without done), let the
  // typer finish revealing whatever arrived, then stop — never loop forever.
  const typerFinalize = () => { sawDone = true; startTyper(); };
  const renderStatusLabel = () => {
    if (fullText || !lastStatus) { stopStatusTicker(); return; }
    const secs = Math.round((Date.now() - streamStartedAt) / 1000);
    // Only rebuild the DOM when the stage changes — rebuilding every second
    // would restart the jumping-dots animation and look janky. The reasoning
    // glimpse updates via textContent (XSS-safe) without a rebuild.
    const existing = streamDiv.querySelector('.st-label') as HTMLElement | null;
    if (existing && existing.dataset.status === lastStatus.status) {
      const secsEl = streamDiv.querySelector('.st-secs');
      if (secsEl) secsEl.textContent = `${secs}s`;
      const gEl = streamDiv.querySelector('.st-glimpse');
      if (gEl) gEl.textContent = lastStatus.glimpse ? ` — ${lastStatus.glimpse}` : '';
      return;
    }
    const text = lastStatus.status === 'writing'
      ? 'Writing the solution'
      : lastStatus.status === 'checking'
        ? 'Checking the working'
        : lastStatus.status === 'reconnecting'
          ? 'Reconnecting'
          : 'Thinking';
    const dot = (delay: string) =>
      `<span style="width:5px;height:5px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s ${delay} infinite;opacity:0.4;"></span>`;
    streamDiv.innerHTML =
      `<em class="st-label" data-status="${lastStatus.status}" style="color:hsl(220,10%,46%);font-size:0.95em;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;">` +
      `${text}<span class="st-glimpse" style="opacity:0.7;"></span>&nbsp;${dot('0s')}${dot('0.2s')}${dot('0.4s')}` +
      `&nbsp;<span class="st-secs" style="opacity:0.55;font-size:0.85em;">${secs}s</span></em>`;
    const gEl = streamDiv.querySelector('.st-glimpse');
    if (gEl) gEl.textContent = lastStatus.glimpse ? ` — ${lastStatus.glimpse}` : '';
  };

  const consumeStream = async (streamRes: Response) => {
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));

          if (parsed.error) { gotError = true; showError(parsed.error); return; }

          if (parsed.verify) {
            fullText = '';
            displayedLen = 0;
            streamDiv.innerHTML = '<em>🔄 Verifying answer...</em>';
            continue;
          }

          // Image-question progress: server streams internally (buffered for
          // verification) and reports stages so the wait never looks frozen.
          // A 1s client-side ticker keeps the elapsed time counting smoothly
          // between server events (which arrive every ~1.5-5s).
          if (parsed.status) {
            if (!fullText) {
              // Keep the last reasoning glimpse when a bare keepalive arrives
              lastStatus = { status: parsed.status, chars: parsed.chars, glimpse: parsed.glimpse ?? lastStatus?.glimpse ?? null };
              renderStatusLabel();
              if (!statusTicker) statusTicker = setInterval(renderStatusLabel, 1000);
            } else if (parsed.status === 'checking') {
              // Image answers now stream LIVE; the handwriting check runs after.
              // Show a small trailing indicator under the already-visible answer.
              if (!document.getElementById('postCheck')) {
                const chk = document.createElement('div');
                chk.id = 'postCheck';
                chk.style.cssText = 'margin-top:8px;font-size:0.82em;color:hsl(220,10%,55%);display:flex;align-items:center;gap:6px;';
                chk.innerHTML = '<span style="display:inline-block;width:11px;height:11px;border:2px solid #ccc;border-top-color:#888;border-radius:50%;animation:spin 0.8s linear infinite;"></span> double-checking the reading…';
                streamDiv.parentElement?.appendChild(chk);
              }
            }
            continue;
          }

          if (parsed.chunk) {
            stopStatusTicker();
            fullText += parsed.chunk;
            startTyper();
          }

          if (parsed.correction) {
            // Rare: the post-stream verifier changed the answer. Replace the
            // shown text instantly and say so honestly.
            document.getElementById('postCheck')?.remove();
            fullText = parsed.correction;
            displayedLen = fullText.length;
            lastShownLen = -1;
            renderToElement(streamDiv, fullText);
            if (parsed.note) {
              const badge = document.createElement('div');
              badge.style.cssText = 'margin-top:8px;font-size:0.82em;color:hsl(35,60%,38%);';
              badge.textContent = `✍️ ${parsed.note}`;
              streamDiv.parentElement?.appendChild(badge);
            }
            continue;
          }

          if (parsed.graphLoading === true) {
            const loader = document.createElement('div');
            loader.id = 'graphLoader';
            loader.style.cssText = 'margin-top:12px;padding:12px;background:rgba(0,0,0,0.03);border-radius:8px;display:flex;align-items:center;gap:8px;font-size:0.9em;color:#666;';
            loader.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#333;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Generating graph...';
            streamDiv.parentElement?.appendChild(loader);
            continue;
          }

          if (parsed.graphLoading === false) {
            document.getElementById('graphLoader')?.remove();
            continue;
          }

          if (parsed.graph) {
            const img = document.createElement('img');
            img.src = parsed.graph;
            img.alt = 'Graph';
            img.style.cssText = 'max-width:100%;margin-top:12px;border-radius:8px;display:block;';
            makeImageZoomable(img);
            streamDiv.parentElement?.appendChild(img);
            continue;
          }

          if (parsed.done) {
            document.getElementById('postCheck')?.remove();
            sawDone = true;
            if (typeof parsed.messageId === 'number') doneMessageId = parsed.messageId;
            stopStatusTicker();
            // Don't render immediately — the typewriter finishes revealing the
            // buffer and its final frame does the clean full render.
            startTyper();
          }
        } catch { /* ignore parse errors */ }
      }
    }
  };

  try {
    await consumeStream(res);

    if (gotError && !fullText) {
      stopStatusTicker();
      streamDiv.innerHTML = '';
    }

    // Mid-stream drop: the server keeps generating and stores the finished
    // answer for 5 minutes — poll for a replay instead of losing the answer.
    if (!sawDone && !gotError) {
      lastStatus = { status: 'reconnecting', glimpse: null };
      renderStatusLabel();
      if (!statusTicker) statusTicker = setInterval(renderStatusLabel, 1000);
      for (let attempt = 0; attempt < 40 && !sawDone; attempt++) { // 160s — hard image answers think for minutes
        await new Promise(r => setTimeout(r, 4000));
        try {
          const rr = await fetch(`${apiBase}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume: requestId, chatId }),
          });
          if (rr.status === 202) continue;          // still generating server-side
          if (!rr.ok || !rr.body) break;            // gone — fall through to error
          fullText = '';                             // replay rebuilds from scratch
          await consumeStream(rr);
        } catch { /* transient network error — keep polling */ }
      }
      stopStatusTicker();
    }

    // Stream ended without a done event → server restarted or connection
    // dropped mid-answer (and resume polling came up empty). Never leave a
    // stale status label hanging.
    if (!sawDone && !fullText && !gotError) {
      stopStatusTicker();
      streamDiv.innerHTML = '<em style="color:hsl(0,50%,45%);">⚠️ Connection lost while solving — please send your question again.</em>';
      opts.scrollToBottom();
    }
  } finally {
    // Same guarantees the /chat page's finally block used to provide via refs:
    // no ticker left running, and the typer finishes whatever arrived.
    stopStatusTicker();
    typerFinalize();
  }

  return { fullText, sawDone, gotError, doneMessageId };
}
