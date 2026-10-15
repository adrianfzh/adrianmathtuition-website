'use client';

// 💬 "Ask about this step" on a LAPTOP (Adrian, 15 Oct 2026: "on a laptop, show the answer beside
// the clip; keep the phone as it is"). A wide screen has room beside the clip, so the chat opens
// there instead of on the Ask page: the clip stays where it is, paused, and the student can carry
// on watching with the answer still in view. Phones go to /app/ask (lib/clip-ask hand-over).
//
// The same solver as the Ask tab, through the shared core in lib/chat-solver (stream, KaTeX,
// "Not sure about this answer?", the portal identity token, a 'portal-' chat id so the bot logs
// it like any Ask question). Text only — a photo question belongs on the Ask page. The board
// context goes in front of a question only when the step changed since the last one asked.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export interface ClipAskPanelHandle {
  /** Ask `question` about the step whose context is `context` (null = focus the box for "my own"). */
  ask: (o: { context: string; stopKey: string; label: string; question: string | null }) => void;
}

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ClipAskPanel = forwardRef<ClipAskPanelHandle, { botLevel: string | null; onClose: () => void }>(
  function ClipAskPanel({ botLevel, onClose }, ref) {
    const [loading, setLoading] = useState(false);
    const [label, setLabel] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const innerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const historyRef = useRef<HistoryEntry[]>([]);
    const chatIdRef = useRef('');
    // The step the student is asking about, and the last step whose context the solver has seen.
    const pendingRef = useRef<{ context: string; stopKey: string } | null>(null);
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

    const send = useCallback(async (preset?: string) => {
      if (loading) return;
      const text = (preset ?? inputRef.current?.value ?? '').trim();
      const inner = innerRef.current;
      if (!text || !inner) return;
      const p = pendingRef.current;
      const withContext = p && p.stopKey !== sentStopRef.current;
      const sent = withContext ? clipQuestion(p.context, text) : text;
      if (withContext) sentStopRef.current = p.stopKey;
      if (inputRef.current) { inputRef.current.value = ''; autoResize(inputRef.current); }

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
    }, [loading, botLevel, portalToken, scrollToBottom, showError]);

    const sendRef = useRef(send);
    useEffect(() => { sendRef.current = send; });

    useImperativeHandle(ref, () => ({
      ask: ({ context, stopKey, label: l, question }) => {
        pendingRef.current = { context, stopKey };
        setLabel(l);
        if (question) window.setTimeout(() => sendRef.current(question), 0);
        else window.setTimeout(() => inputRef.current?.focus(), 60);
      },
    }), []);

    return (
      <aside data-clip-ask-panel aria-label="Ask about this step"
        className="ask-page fixed z-30 top-[76px] right-4 bottom-4 w-[380px] bg-white rounded-3xl border border-slate-200 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] hidden lg:flex flex-col overflow-hidden lsn-rise"
        style={{ animationDuration: '240ms' }}>
        <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />
        <style>{`
          @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          @keyframes tdot { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }
          .stream-caret { display:inline-block; color:hsl(220,40%,40%); animation: caretBlink 1s steps(1) infinite; margin-left:1px; }
          @keyframes caretBlink { 0%,60% { opacity:1; } 61%,100% { opacity:0; } }
          [data-clip-ask-panel] .katex { font-size:1.05em; }
          [data-clip-ask-panel] .katex-display { margin:12px 0; overflow-x:auto; }
        `}</style>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-navy">💬 Ask about this step</p>
            {label && <p className="text-[11px] text-slate-400 truncate">{label}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-xl text-slate-400 hover:text-navy hover:bg-slate-50 inline-flex items-center justify-center">✕</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-3">
          <div ref={innerRef} />
        </div>
        <div className="p-3 border-t border-slate-100">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[13px] text-rose-700 mb-2">{errorMsg}</div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-black/10 p-2">
            <textarea ref={inputRef} rows={1} placeholder="Ask about this step…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              onChange={e => autoResize(e.currentTarget)}
              className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] leading-normal text-gray-900 placeholder:text-gray-400 max-h-[120px] min-h-[24px] px-1.5" />
            <button type="button" onClick={() => send()} disabled={loading} aria-label="Send"
              className="w-9 h-9 shrink-0 rounded-lg bg-navy text-[hsl(45,100%,96%)] flex items-center justify-center disabled:opacity-35">
              <SendIcon />
            </button>
          </div>
        </div>
      </aside>
    );
  },
);

export default ClipAskPanel;
