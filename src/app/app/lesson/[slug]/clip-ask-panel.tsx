'use client';

// 💬 "Ask about this step" — the chat that opens WITH the clip, never instead of it (Adrian,
// 15 Oct 2026: "on a phone, it shouldn't go to another page, experience must be seamless, a
// student should be able to continue watching the video, and type a side question, watch that
// being replied, while video is still playing and student can see both"; earlier the same day:
// "on a laptop, show the answer beside the clip").
//   · Phone: a sheet over the bottom of the screen; the player shrinks the clip into the top part
//     (lesson-player.tsx, data-chat-sheet) and it plays on.
//   · Laptop (≥ 1024 px): a panel beside the clip; the clip slides left and plays on.
// The clip is never paused by the chat. The ready questions for the step being shown sit above the
// box and follow the clip as it moves on.
//
// The same solver as the Ask tab, through the shared core in lib/chat-solver (stream, KaTeX,
// "Not sure about this answer?", the portal identity token, a 'portal-' chat id so the bot logs
// it like any Ask question). Text only. The board so far goes in front of a question only when
// the step changed since the last question.

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import {
  type HistoryEntry,
  appendChatMessage,
  appendStreamingMessage,
  appendTypingIndicator,
  attachFeedbackRow,
  autoResize,
  postSolverChat,
  randomChatToken,
  removeTypingIndicator,
  runSolverStream,
} from '@/lib/chat-solver';
import { clipQuestion } from '@/lib/clip-ask';

/** What the chat needs about the step on screen at the moment a question is sent. */
export interface ClipAskStep { context: string; stopKey: string; label: string }

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function ClipAskPanel({ botLevel, asks, label, getStep, onClose }: {
  botLevel: string | null;
  /** The ready questions for the step on screen now. */
  asks: string[];
  /** "Growth and decay · step 6 of 8" — the step on screen now. */
  label: string;
  /** Read at send time: the board so far + the beat's line, for the step on screen. */
  getStep: () => ClipAskStep | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const chatIdRef = useRef('');
  const sentStopRef = useRef<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    window.setTimeout(() => setErrorMsg(''), 4000);
  }, []);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // The signed portal identity (student quota + the bot's Questions row), as the Ask tab does.
  const tokenRef = useRef<{ token: string; at: number } | null>(null);
  const portalToken = useCallback(async (): Promise<string | null> => {
    const c = tokenRef.current;
    if (c && Date.now() - c.at < 50 * 60_000) return c.token;
    try {
      const res = await fetch('/api/portal/ask-token');
      if (!res.ok) return null;
      const d: { token?: unknown } = await res.json();
      if (typeof d.token !== 'string' || !d.token) return null;
      tokenRef.current = { token: d.token, at: Date.now() };
      return d.token;
    } catch { return null; }
  }, []);
  useEffect(() => { portalToken(); }, [portalToken]);

  const send = useCallback(async (preset?: string) => {
    if (loading) return;
    const text = (preset ?? inputRef.current?.value ?? '').trim();
    const inner = innerRef.current;
    if (!text || !inner) return;
    const step = getStep();
    const withContext = !!step && step.stopKey !== sentStopRef.current;
    const sent = withContext && step ? clipQuestion(step.context, text) : text;
    if (withContext && step) sentStopRef.current = step.stopKey;
    if (inputRef.current) { inputRef.current.value = ''; autoResize(inputRef.current); }
    setAsked(true);

    appendChatMessage(inner, 'user', text);
    if (!chatIdRef.current) chatIdRef.current = 'portal-' + randomChatToken();
    setLoading(true);
    appendTypingIndicator(inner);
    scrollToBottom();
    try {
      const requestId = 'req-' + randomChatToken();
      const body: Record<string, unknown> = {
        history: historyRef.current, source: 'portal', chatId: chatIdRef.current, requestId, message: sent,
      };
      if (botLevel) body.level = botLevel;
      const tok = await portalToken();
      if (tok) body.portalToken = tok;
      const res = await postSolverChat(body);
      removeTypingIndicator();
      if (!res.ok) { showError('Something went wrong. Please try again.'); return; }
      const streamDiv = appendStreamingMessage(inner);
      const outcome = await runSolverStream(res, {
        streamDiv, requestId, chatId: chatIdRef.current, showError, autoScroll: scrollToBottom, scrollToBottom,
      });
      if (!outcome.sawDone && !outcome.fullText && !outcome.gotError) return;
      historyRef.current.push({ role: 'user', content: sent }, { role: 'assistant', content: outcome.fullText });
      if (historyRef.current.length > 100) historyRef.current = historyRef.current.slice(-100);
      if (outcome.doneMessageId) {
        const group = streamDiv.parentElement?.parentElement as HTMLElement | null;
        if (group) attachFeedbackRow(group, outcome.doneMessageId, null, { getChatId: () => chatIdRef.current });
      }
    } catch {
      removeTypingIndicator();
      showError('No connection — check your signal and try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, botLevel, portalToken, scrollToBottom, showError, getStep]);

  return (
    <aside data-clip-ask-panel aria-label="Ask about this step"
      className="ask-page fixed z-[60] inset-x-0 bottom-0 h-[38dvh] rounded-t-3xl lg:inset-x-auto lg:top-[76px] lg:right-4 lg:bottom-4 lg:w-[380px] lg:h-auto lg:rounded-3xl bg-white border border-slate-200 shadow-[0_-10px_40px_-12px_rgba(15,23,42,0.35)] lg:shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] flex flex-col overflow-hidden lsn-rise"
      style={{ animationDuration: '240ms' }}>
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes tdot { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }
        .stream-caret { display:inline-block; color:hsl(220,40%,40%); animation: caretBlink 1s steps(1) infinite; margin-left:1px; }
        @keyframes caretBlink { 0%,60% { opacity:1; } 61%,100% { opacity:0; } }
        [data-clip-ask-panel] .katex { font-size:1em; }
        [data-clip-ask-panel] .katex-display { margin:10px 0; overflow-x:auto; }
        /* Smaller answers so the sheet is smaller and the clip above it shrinks less (Adrian, 16 Oct 2026:
           "ask about this step can be smaller (slightly smaller fonts) and player need not shrink so much"). */
        [data-clip-ask-panel] [style*="font-size:17px"], [data-clip-ask-panel] [style*="font-size:16px"], [data-clip-ask-panel] [style*="font-size: 17px"], [data-clip-ask-panel] [style*="font-size: 16px"] { font-size:14px !important; line-height:1.55 !important; }
      `}</style>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-navy">💬 Ask about this step</p>
          <p className="text-[11px] text-slate-400 truncate">{label}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the chat"
          className="shrink-0 w-8 h-8 rounded-xl text-slate-400 hover:text-navy hover:bg-slate-50 inline-flex items-center justify-center">✕</button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-2">
        {!asked && <p className="text-[13px] text-slate-500 pt-1 pb-2">The clip keeps playing. Tap a question below, or type your own.</p>}
        <div ref={innerRef} />
      </div>
      <div className="px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))] border-t border-slate-100">
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[13px] text-rose-700 mb-2">{errorMsg}</div>
        )}
        {/* The ready questions for the step on screen — they change as the clip moves on. */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" data-clip-asks style={{ scrollbarWidth: 'none' }}>
          {asks.map(q => (
            <button key={q} type="button" onClick={() => send(q)} disabled={loading}
              className="shrink-0 rounded-full bg-[hsl(45,60%,97%)] border border-amber-200 px-3 py-1.5 text-[13px] text-navy whitespace-nowrap hover:bg-amber-50 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-black/10 p-1.5">
          <textarea ref={inputRef} rows={1} placeholder="Type a question about this step…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            onChange={e => autoResize(e.currentTarget)}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[16px] leading-normal text-gray-900 placeholder:text-gray-400 max-h-[96px] min-h-[24px] px-1.5" />
          <button type="button" onClick={() => send()} disabled={loading} aria-label="Send"
            className="w-9 h-9 shrink-0 rounded-lg bg-navy text-[hsl(45,100%,96%)] flex items-center justify-center disabled:opacity-35">
            <SendIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
