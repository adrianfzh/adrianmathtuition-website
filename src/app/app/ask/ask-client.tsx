'use client';

// The portal "Ask" tab client — a phone-first chat over the same Fly-bot
// /api/chat SSE stream as the public /chat page. All the heavy machinery
// (KaTeX pipeline, chat-DOM builders, typewriter streaming engine, feedback
// rows, history restore) is the SHARED core in lib/chat-solver.ts; this file
// is portal-specific: navy/cream styling, document-flow messages with a fixed
// composer above the mobile tab bar, the student's level hint to the bot,
// fire-and-forget question logging to /api/portal/ask-log, and the signed
// identity token (/api/portal/ask-token → body.portalToken) that upgrades the
// student from the bot's anonymous 20/day quota to the student 60/day one.

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import {
  BOT_API_BASE,
  type HistoryEntry,
  type RestoredMessage,
  appendChatMessage,
  appendStreamingMessage,
  appendTypingIndicator,
  attachFeedbackRow,
  autoResize,
  insertRestoredMessages,
  postSolverChat,
  randomChatToken,
  removeTypingIndicator,
  runSolverStream,
  whenKatexReady,
} from '@/lib/chat-solver';

// Distinct storage keys from the public /chat ('am_chat_id') so a device that
// uses both never cross-restores the other conversation.
const CHAT_ID_KEY = 'am_portal_chat_id';
const CHAT_LAST_KEY = 'am_portal_chat_last';

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function AskClient({ firstName, botLevel }: { firstName: string | null; botLevel: string | null }) {
  const [started, setStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  // Extra pages (multi-image): up to 3 more photos ride along as one question.
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<HistoryEntry[]>([]);
  // Per-conversation id — 'portal-' prefixed so the bot's Questions log (Chat
  // ID column) and its chat_messages store mark these turns as portal ones.
  const sessionIdRef = useRef<string>('');

  /* ── Scroll tracking (document scroll — the portal shell owns the page) ── */
  const scrolledUpRef = useRef(false);
  const programmaticRef = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (programmaticRef.current) return;
      const doc = document.documentElement;
      scrolledUpRef.current = doc.scrollHeight - window.scrollY - window.innerHeight > 80;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hardScroll = () => {
    programmaticRef.current = true;
    window.scrollTo(0, document.documentElement.scrollHeight);
    requestAnimationFrame(() => { programmaticRef.current = false; });
  };
  const scrollToBottom = useCallback(() => {
    scrolledUpRef.current = false;
    hardScroll();
  }, []);
  const autoScroll = useCallback(() => {
    if (!scrolledUpRef.current) hardScroll();
  }, []);

  /* ── Error banner ── */
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  }, []);

  /* ── Keep the composer above the iOS keyboard (visualViewport) ── */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const bar = composerRef.current;
      if (!bar) return;
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // >80px hidden at the bottom = the keyboard (not just browser chrome):
      // pin the composer to the keyboard top. Clearing restores the class
      // position (above the tab bar).
      bar.style.bottom = covered > 80 ? `${covered}px` : '';
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  /* ── Image handling (same policy as /chat: 1 primary + up to 3 extra) ── */
  const selectedFileRef = useRef<File | null>(null);
  useEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);
  const extraFilesRef = useRef<File[]>([]);
  useEffect(() => { extraFilesRef.current = extraFiles; }, [extraFiles]);

  const setImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { showError('Please upload an image file.'); return; }
    if (selectedFileRef.current) {
      if (extraFilesRef.current.length >= 3) { showError('Up to 4 photos per question.'); return; }
      const rd = new FileReader();
      rd.onload = ev => {
        setExtraFiles(prev => [...prev, file]);
        setExtraPreviews(prev => [...prev, ev.target?.result as string]);
      };
      rd.readAsDataURL(file);
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreviewSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [showError]);

  const removeImage = useCallback(() => {
    setSelectedFile(null);
    setPreviewSrc('');
    setExtraFiles([]);
    setExtraPreviews([]);
  }, []);
  const removeExtra = useCallback((idx: number) => {
    setExtraFiles(prev => prev.filter((_, i) => i !== idx));
    setExtraPreviews(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── Paste image ── */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) setImage(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [setImage]);

  /* ── Portal identity token (see /api/portal/ask-token) ─────────────────────
     Short-lived (60 min) signed token that tells the bot WHICH student is
     asking: student quota (60/day) + the bot's Questions row links their
     record. Fetched on mount, refreshed when older than ~50 min, and strictly
     best-effort — any failure sends the question anonymously, never blocks. */
  const portalTokenRef = useRef<{ token: string; fetchedAt: number } | null>(null);
  const tokenFetchRef = useRef<Promise<string | null> | null>(null);
  const ensurePortalToken = useCallback((): Promise<string | null> => {
    const cached = portalTokenRef.current;
    const ageMs = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (cached && ageMs < 50 * 60 * 1000) return Promise.resolve(cached.token);
    if (tokenFetchRef.current) return tokenFetchRef.current;
    const p = (async () => {
      try {
        // Never let a hung mint delay the question (the send awaits this).
        const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(4000) : undefined;
        const res = await fetch('/api/portal/ask-token', { signal });
        if (!res.ok) throw new Error(String(res.status));
        const data: { token?: unknown } = await res.json();
        if (typeof data.token !== 'string' || !data.token) throw new Error('no token');
        portalTokenRef.current = { token: data.token, fetchedAt: Date.now() };
        return data.token;
      } catch {
        // Refresh failed but the old token may still be inside its 60-min
        // life — better a soon-to-expire identity than none (bot fail-opens).
        return cached && ageMs < 59 * 60 * 1000 ? cached.token : null;
      } finally {
        tokenFetchRef.current = null;
      }
    })();
    tokenFetchRef.current = p;
    return p;
  }, []);
  useEffect(() => { ensurePortalToken(); }, [ensurePortalToken]);

  /* ── Feedback opts for the shared 👍/👎 row ── */
  const feedbackOpts = useCallback(() => ({
    getChatId: () => sessionIdRef.current,
  }), []);

  /* ── Restore the previous conversation once on mount (7-day window) ── */
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    let savedId = '';
    try {
      savedId = localStorage.getItem(CHAT_ID_KEY) || '';
      const last = parseInt(localStorage.getItem(CHAT_LAST_KEY) || '0', 10);
      if (!savedId || Date.now() - last > 7 * 24 * 60 * 60 * 1000) return;
    } catch { return; }
    fetch(`${BOT_API_BASE}/api/chat/history?chatId=${encodeURIComponent(savedId)}`)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then((data: { messages: RestoredMessage[] }) => {
        const msgs = data.messages || [];
        if (!msgs.length) return;
        whenKatexReady(() => {
          sessionIdRef.current = savedId;
          const inner = messagesInnerRef.current;
          if (!inner) return;
          conversationHistoryRef.current = insertRestoredMessages(inner, msgs, feedbackOpts());
          setStarted(true);
          setTimeout(scrollToBottom, 120);
        });
      })
      .catch(() => { /* restore is best-effort */ });
  }, [feedbackOpts, scrollToBottom]);

  /* ── Start a fresh conversation ── */
  const startNewChat = useCallback(() => {
    sessionIdRef.current = '';
    conversationHistoryRef.current = [];
    if (messagesInnerRef.current) messagesInnerRef.current.innerHTML = '';
    try {
      localStorage.removeItem(CHAT_ID_KEY);
      localStorage.removeItem(CHAT_LAST_KEY);
    } catch { /* noop */ }
    setStarted(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  /* ── Send message ── */
  const sendMessage = useCallback(async () => {
    if (isLoading) return;
    const text = inputRef.current?.value.trim() || '';
    if (!text && !selectedFile) return;

    const capturedPreviewSrc = previewSrc;
    const capturedFile = selectedFile;
    const capturedExtraFiles = extraFiles;
    const capturedExtraPreviews = extraPreviews;

    if (inputRef.current) { inputRef.current.value = ''; autoResize(inputRef.current); }
    removeImage();
    setStarted(true);

    const inner = messagesInnerRef.current;
    if (!inner) return;
    appendChatMessage(inner, 'user', text || null, capturedPreviewSrc || null);
    scrollToBottom();

    if (!sessionIdRef.current) {
      sessionIdRef.current = 'portal-' + randomChatToken();
    }
    try { localStorage.setItem(CHAT_ID_KEY, sessionIdRef.current); } catch { /* noop */ }

    // Question logging — the reason this tab exists. Fire-and-forget so a
    // logging hiccup can never delay or break the answer; keepalive survives
    // a quick tab-away. The route links the question to the student's
    // Airtable record server-side (session-authed).
    fetch('/api/portal/ask-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ text: text || null, hasImage: !!capturedFile, chatId: sessionIdRef.current }),
    }).catch(() => { /* logging is best-effort */ });

    setIsLoading(true);
    appendTypingIndicator(inner);
    scrollToBottom();

    try {
      // requestId lets the server store the finished answer for resume-replay
      // if this connection drops mid-stream.
      const requestId = 'req-' + randomChatToken();
      const body: Record<string, unknown> = {
        history: conversationHistoryRef.current,
        source: 'portal',
        chatId: sessionIdRef.current,
        requestId,
      };
      // The student's level ('EM'|'AM'|'JC'|'S1'|'S2') picks the right system
      // prompt server-side; null (dual/unknown) lets the bot's router decide.
      if (botLevel) body.level = botLevel;

      // Identify the signed-in student to the bot: student quota (60/day vs
      // anonymous 20/day) + the bot's Questions row links their record.
      // Best-effort — a missing/failed token sends the question anonymously.
      const portalToken = await ensurePortalToken();
      if (portalToken) body.portalToken = portalToken;

      if (capturedFile) {
        body.image = capturedPreviewSrc.split(',')[1];
        body.mediaType = capturedFile.type;
        body.caption = text || '';
        if (capturedExtraFiles.length) {
          body.images = [
            { data: capturedPreviewSrc.split(',')[1], mediaType: capturedFile.type },
            ...capturedExtraPreviews.map((src, i) => ({ data: src.split(',')[1], mediaType: capturedExtraFiles[i]?.type || 'image/jpeg' })),
          ];
        }
      } else {
        body.message = text;
      }

      const res = await postSolverChat(body);

      if (!res.ok) {
        removeTypingIndicator();
        showError('Something went wrong. Please try again.');
        return;
      }

      removeTypingIndicator();
      const streamDiv = appendStreamingMessage(inner);
      const outcome = await runSolverStream(res, {
        streamDiv,
        requestId,
        chatId: sessionIdRef.current,
        showError,
        autoScroll,
        scrollToBottom,
      });

      // Connection lost and resume polling came up empty — the engine already
      // rendered the notice; don't record the turn.
      if (!outcome.sawDone && !outcome.fullText && !outcome.gotError) return;

      conversationHistoryRef.current.push({ role: 'user', content: text || '[image]' });
      conversationHistoryRef.current.push({ role: 'assistant', content: outcome.fullText });
      if (conversationHistoryRef.current.length > 12) {
        conversationHistoryRef.current = conversationHistoryRef.current.slice(-12);
      }
      try { localStorage.setItem(CHAT_LAST_KEY, String(Date.now())); } catch { /* noop */ }
      if (outcome.doneMessageId) {
        const group = streamDiv.parentElement?.parentElement as HTMLElement | null;
        if (group) attachFeedbackRow(group, outcome.doneMessageId, null, feedbackOpts());
      }
      scrollToBottom();
    } catch {
      removeTypingIndicator();
      showError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading, selectedFile, previewSrc, extraFiles, extraPreviews, removeImage, scrollToBottom, autoScroll, showError, botLevel, feedbackOpts, ensurePortalToken]);

  return (
    <div className="max-w-2xl mx-auto ask-page">
      {/* KaTeX (CDN, same pins as /chat) */}
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes tdot { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .stream-caret { display:inline-block; color:hsl(220,40%,40%); animation: caretBlink 1s steps(1) infinite; margin-left:1px; }
        @keyframes caretBlink { 0%,60% { opacity:1; } 61%,100% { opacity:0; } }
        .ask-page .katex { font-size:1.05em; }
        .ask-page .katex-display { margin:12px 0; overflow-x:auto; }
      `}</style>

      {/* Header */}
      <div className="flex items-baseline justify-between pt-1 pb-3">
        <h1 className="text-xl font-bold text-navy">💬 Ask</h1>
        {started && (
          <button
            onClick={startNewChat}
            disabled={isLoading}
            className="text-sm text-gray-500 hover:text-navy disabled:opacity-40"
          >
            ⊕ New chat
          </button>
        )}
      </div>

      {/* Welcome card (until the first message) */}
      {!started && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 mb-4">
          <p className="font-semibold text-navy">Hi{firstName ? ` ${firstName}` : ''}! Stuck on a question?</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Type it out or send a photo — you&rsquo;ll get a clear, step-by-step solution.
            Mr Fong sees what you ask, so lessons can pick up exactly where you got stuck.
          </p>
        </div>
      )}

      {/* Messages (document flow; padding clears the fixed composer + tab bar) */}
      <div className="pb-48 sm:pb-40">
        <div ref={messagesInnerRef} />
      </div>

      {/* Composer — fixed above the mobile tab bar (60px + safe area) */}
      <div
        ref={composerRef}
        className="fixed left-0 right-0 z-30 bottom-[calc(60px+env(safe-area-inset-bottom))] sm:bottom-0 bg-[hsl(45,100%,98%)]/95 backdrop-blur-sm px-4 pt-2 pb-3 sm:pb-4"
      >
        <div className="max-w-2xl mx-auto">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2 text-[13px] text-rose-700 mb-2">
              {errorMsg}
            </div>
          )}
          <div className="bg-white rounded-2xl border border-black/10 shadow-lg p-2.5 flex flex-col gap-2">
            {/* Image previews */}
            {previewSrc && (
              <div className="flex gap-1.5 flex-wrap">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc} alt="preview" className="h-14 max-w-[84px] object-cover rounded-lg border border-black/10 block" />
                  <button
                    onClick={removeImage}
                    aria-label="Remove photo"
                    className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-navy text-white rounded-full text-[9px] leading-none flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
                {extraPreviews.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`page ${i + 2}`} className="h-14 max-w-[84px] object-cover rounded-lg border border-black/10 block" />
                    <button
                      onClick={() => removeExtra(i)}
                      aria-label={`Remove page ${i + 2}`}
                      className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-navy text-white rounded-full text-[9px] leading-none flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Textarea + buttons row */}
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                placeholder="Type a math question, or add a photo…"
                rows={1}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                onChange={e => autoResize(e.currentTarget)}
                className="flex-1 bg-transparent border-none outline-none resize-none text-[16px] leading-normal text-gray-900 placeholder:text-gray-400 max-h-[140px] min-h-[24px] px-1.5"
                style={{ scrollbarWidth: 'none' }}
              />
              <input
                type="file"
                id="askFileInput"
                accept="image/*"
                className="hidden"
                multiple
                onChange={e => { Array.from(e.target.files || []).forEach(f => setImage(f)); e.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => document.getElementById('askFileInput')?.click()}
                title="Add a photo"
                aria-label="Add a photo"
                className="w-9 h-9 shrink-0 rounded-lg border border-black/10 bg-[hsl(45,60%,97%)] text-gray-500 flex items-center justify-center text-[17px]"
              >
                📎
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={isLoading}
                title="Send"
                aria-label="Send"
                className="w-9 h-9 shrink-0 rounded-lg bg-navy text-[hsl(45,100%,96%)] flex items-center justify-center disabled:opacity-35 transition-opacity"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
