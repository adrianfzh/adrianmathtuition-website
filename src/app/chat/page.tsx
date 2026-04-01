'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Script from 'next/script';

/* ── Types ── */
interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface Slot {
  el: HTMLDivElement;
  text: string;
}

/* ── KaTeX globals ── */
declare global {
  interface Window {
    katex: {
      renderToString: (math: string, opts: { displayMode: boolean; throwOnError: boolean }) => string;
    };
    renderMathInElement: (el: HTMLElement, opts: object) => void;
  }
}

/* ── Formula sheets config ── */
type FormulaSheetId = 'mf27' | 'amath' | 'emath';
const FORMULA_SHEETS: { id: FormulaSheetId; emoji: string; title: string; subtitle: string }[] = [
  { id: 'mf27',   emoji: '📘', title: 'A-Level MF27',   subtitle: 'H2 Math formula list' },
  { id: 'amath',  emoji: '📗', title: 'O-Level A Math',  subtitle: 'Additional Mathematics' },
  { id: 'emath',  emoji: '📙', title: 'O-Level E Math',  subtitle: 'Elementary Mathematics' },
];

/* ── Send icon SVG ── */
const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

/* ── Welcome icon SVG ── */
const MathIcon = () => (
  <svg width="44" height="52" viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M26 4 C32 4, 38 8, 38 14 C38 18, 35 21, 31 22" stroke="hsl(220,60%,20%)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M31 22 C24 24, 20 28, 20 34 C20 40, 22 44, 22 48" stroke="hsl(220,60%,20%)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M22 48 C16 48, 6 44, 6 38 C6 34, 9 31, 13 30" stroke="hsl(220,60%,20%)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <text x="26" y="20" fontFamily="serif" fontSize="18" fontWeight="700" fill="hsl(45,90%,50%)" opacity="0.9">Σ</text>
    <circle cx="8" cy="12" r="3" fill="hsl(45,90%,55%)" />
  </svg>
);

/* ── renderToElement (KaTeX inline render) ── */
function renderToElement(el: HTMLDivElement, text: string) {
  text = text.replace(/\n*CONFIDENCE\s*:\s*(HIGH|LOW)\s*$/i, '').trimEnd();
  text = text.replace(/`([^`\n]+)`/g, '$$$1$');

  let html = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/<strong>(Part\s*[\(\w\d]+[\):]?[^<\n]*)<\/strong>/g,
      '<span style="font-weight:700;display:block;margin-top:14px;color:hsl(40,80%,42%);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">$1</span>');

  if (typeof window !== 'undefined' && window.katex) {
    html = html.replace(/\$\$([^$]+?)\$\$/g, (_, math) => {
      try { return window.katex.renderToString(math, { displayMode: true, throwOnError: false }); }
      catch { return `$$${math}$$`; }
    });
    html = html.replace(/(?<!\$)\$([^$\n]{1,200}?)\$(?!\$)/g, (_, math) => {
      try { return window.katex.renderToString(math, { displayMode: false, throwOnError: false }); }
      catch { return `$${math}$`; }
    });
  }

  html = html.replace(/\n/g, '<br>');
  el.innerHTML = html;
}

/* ── formatMessage (for final display of user messages) ── */
function formatMessage(text: string): string {
  text = text.replace(/\n*CONFIDENCE\s*:\s*(HIGH|LOW)\s*$/i, '').trimEnd();
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  text = text.replace(/<strong>(Part\s*[\(\w\d]+[\):]?[^<\n]*)<\/strong>/g,
    '<span style="font-weight:700;display:block;margin-top:14px;color:hsl(40,80%,42%);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">$1</span>');
  text = text.replace(/`([^`\n]+)`/g, '$$$1$');
  text = text.replace(/\n/g, '<br>');
  return text;
}

/* ── autoResize helper ── */
function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}


let userHasScrolledUp = false;
let isProgrammaticScroll = false;

export default function ChatPage() {
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [showDragOverlay, setShowDragOverlay] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [formulaSheet, setFormulaSheet] = useState<FormulaSheetId | null>(null);

  const welcomeInputRef = useRef<HTMLTextAreaElement>(null);
  const fixedInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<HistoryEntry[]>([]);
  const renderTimerRef = useRef<number | null>(null);
  const pendingRenderRef = useRef<Slot | null>(null);
  const dragCounterRef = useRef(0);

  /* ── scrollToBottom ── */
  const scrollToBottom = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    userHasScrolledUp = false;
    isProgrammaticScroll = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { isProgrammaticScroll = false; });
  };

  /* ── Track whether user has scrolled up ── */
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (isProgrammaticScroll) return;
      userHasScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Error banner ── */
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  }, []);

  /* ── Image handling ── */
  const setImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { showError('Please upload an image file.'); return; }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreviewSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [showError]);

  const removeImage = useCallback(() => {
    setSelectedFile(null);
    setPreviewSrc('');
  }, []);

  /* ── scheduleRender ── */
  const scheduleRender = useCallback((el: HTMLDivElement, text: string) => {
    pendingRenderRef.current = { el, text };
    if (!renderTimerRef.current) {
      renderTimerRef.current = requestAnimationFrame(() => {
        renderTimerRef.current = null;
        if (pendingRenderRef.current) {
          renderToElement(pendingRenderRef.current.el, pendingRenderRef.current.text);
          pendingRenderRef.current = null;
        }
        if (!userHasScrolledUp) {
          const scroll = chatScrollRef.current;
          if (scroll) {
            isProgrammaticScroll = true;
            scroll.scrollTop = scroll.scrollHeight;
            requestAnimationFrame(() => { isProgrammaticScroll = false; });
          }
        }
      });
    }
  }, []);

  /* ── Add user/bot message to DOM ── */
  const addMessageToDOM = useCallback((role: 'user' | 'bot', content: string | null, imageDataUrl?: string | null) => {
    const inner = messagesInnerRef.current;
    if (!inner) return;

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
    scrollToBottom();
  }, []);

  /* ── Add typing indicator to DOM ── */
  const addTypingToDOM = useCallback(() => {
    const inner = messagesInnerRef.current;
    if (!inner) return;
    const group = document.createElement('div');
    group.id = 'typingGroup';
    group.style.cssText = 'margin-bottom:20px;';
    group.innerHTML = `<div id="typingBubble" style="display:inline-flex;gap:5px;align-items:center;padding:14px 4px;">
      <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0s infinite;opacity:0.4;"></span>
      <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0.2s infinite;opacity:0.4;"></span>
      <span class="tdot" style="width:7px;height:7px;border-radius:50%;background:hsl(220,10%,46%);display:inline-block;animation:tdot 1.2s 0.4s infinite;opacity:0.4;"></span>
    </div>`;
    inner.appendChild(group);
    scrollToBottom();
  }, []);

  const removeTypingFromDOM = useCallback(() => {
    document.getElementById('typingGroup')?.remove();
  }, []);

  /* ── Add streaming message ── */
  const addStreamingMessage = useCallback((): HTMLDivElement => {
    const inner = messagesInnerRef.current!;
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
  }, []);

  /* ── Transfer welcome text to fixed input on transition ── */
  useEffect(() => {
    if (conversationStarted && fixedInputRef.current && welcomeInputRef.current) {
      const val = welcomeInputRef.current.value;
      if (val) {
        fixedInputRef.current.value = val;
        autoResize(fixedInputRef.current);
        welcomeInputRef.current.value = '';
      }
    }
  }, [conversationStarted]);

  /* ── Send message ── */
  const sendMessage = useCallback(async () => {
    if (isLoading) return;
    const input = conversationStarted ? fixedInputRef.current : welcomeInputRef.current;
    const text = input?.value.trim() || '';
    if (!text && !selectedFile) return;

    const capturedPreviewSrc = previewSrc;
    const capturedFile = selectedFile;

    // Transition to chat
    if (!conversationStarted) {
      setConversationStarted(true);
      await new Promise(r => setTimeout(r, 60));
    }

    // Clear input
    if (fixedInputRef.current) { fixedInputRef.current.value = ''; autoResize(fixedInputRef.current); }
    if (welcomeInputRef.current) { welcomeInputRef.current.value = ''; autoResize(welcomeInputRef.current); }
    removeImage();

    // Add user message
    addMessageToDOM('user', text || null, capturedPreviewSrc || null);

    setIsLoading(true);
    addTypingToDOM();

    try {
      const isTelegramWebview = /Telegram/i.test(navigator.userAgent);
      const body: Record<string, unknown> = {
        history: conversationHistoryRef.current,
        source: isTelegramWebview ? 'telegram-webview' : 'website',
      };

      if (capturedFile) {
        body.image = capturedPreviewSrc.split(',')[1];
        body.mediaType = capturedFile.type;
        body.caption = text || '';
      } else {
        body.message = text;
      }

      let res: Response | undefined;
      let attempts = 0;
      while (attempts < 2) {
        try {
          res = await fetch('https://adrianmath-telegram-math-bot.fly.dev/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          break;
        } catch {
          attempts++;
          if (attempts >= 2) throw new Error('Network error');
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      if (!res || !res.ok) {
        removeTypingFromDOM();
        showError('Something went wrong. Please try again.');
        return;
      }

      removeTypingFromDOM();
      const streamDiv = addStreamingMessage();
      let fullText = '';

      const reader = res.body!.getReader();
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

            if (parsed.error) { showError(parsed.error); return; }

            if (parsed.verify) {
              fullText = '';
              streamDiv.innerHTML = '<em>🔄 Verifying answer...</em>';
              continue;
            }

            if (parsed.chunk) {
              fullText += parsed.chunk;
              scheduleRender(streamDiv, fullText);
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
              streamDiv.parentElement?.appendChild(img);
              continue;
            }

            if (parsed.done) {
              if (renderTimerRef.current) { cancelAnimationFrame(renderTimerRef.current); renderTimerRef.current = null; }
              renderToElement(streamDiv, fullText);
            }
          } catch { /* ignore parse errors */ }
        }
      }

      conversationHistoryRef.current.push({ role: 'user', content: text || '[image]' });
      conversationHistoryRef.current.push({ role: 'assistant', content: fullText });
      if (conversationHistoryRef.current.length > 12) {
        conversationHistoryRef.current = conversationHistoryRef.current.slice(-12);
      }
      scrollToBottom();

    } catch {
      removeTypingFromDOM();
      showError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
      fixedInputRef.current?.focus();
    }
  }, [isLoading, conversationStarted, selectedFile, previewSrc, removeImage, addMessageToDOM, addTypingToDOM, removeTypingFromDOM, addStreamingMessage, scheduleRender, showError]);

  /* ── Keyboard listeners ── */
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (formulaSheet) { setFormulaSheet(null); return; }
        if (menuOpen) { setMenuOpen(false); return; }
        if (selectedFile) { removeImage(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && selectedFile && !isLoading) {
        const focused = document.activeElement?.tagName;
        if (focused !== 'TEXTAREA') { e.preventDefault(); sendMessage(); }
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [formulaSheet, menuOpen, selectedFile, isLoading, removeImage, sendMessage]);

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

  /* ── Drag & drop ── */
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounterRef.current++;
        setShowDragOverlay(true);
      }
    };
    const handleDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setShowDragOverlay(false); }
    };
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setShowDragOverlay(false);
      const file = e.dataTransfer?.files[0];
      if (file) setImage(file);
    };
    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('drop', handleDrop);
    return () => {
      document.body.removeEventListener('dragenter', handleDragEnter);
      document.body.removeEventListener('dragleave', handleDragLeave);
      document.body.removeEventListener('dragover', handleDragOver);
      document.body.removeEventListener('drop', handleDrop);
    };
  }, [setImage]);

  /* ── Shared input box JSX builder ── */
  const renderInputBox = (
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    placeholder: string,
    inputId: string,
  ) => (
    <div
      id={inputId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: `1.5px solid ${showDragOverlay ? 'hsl(45,90%,55%)' : 'hsl(220,15%,88%)'}`,
        borderRadius: 12,
        padding: '10px 10px 10px 16px',
        boxShadow: showDragOverlay ? '0 0 0 3px hsla(45,90%,55%,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
        background: showDragOverlay ? 'hsl(45,90%,92%)' : 'hsl(0,0%,100%)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        rows={1}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        onChange={e => autoResize(e.currentTarget)}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          color: 'hsl(220,40%,13%)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 17,
          lineHeight: 1.5,
          resize: 'none',
          maxHeight: 140,
          minHeight: 24,
          scrollbarWidth: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <input
          type="file"
          id="fileInput"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setImage(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => document.getElementById('fileInput')?.click()}
          title="Upload image"
          style={{
            width: 36, height: 36, borderRadius: 8,
            border: '1.5px solid hsl(220,15%,88%)',
            background: 'hsl(210,20%,98%)',
            color: 'hsl(220,10%,46%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 17,
          }}
        >
          📎
        </button>
        <button
          type="button"
          onClick={sendMessage}
          disabled={isLoading}
          title="Send"
          style={{
            width: 36, height: 36, borderRadius: 8,
            border: 'none',
            background: 'hsl(220,60%,20%)',
            color: 'hsl(45,100%,96%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.35 : 1,
            transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );

  return (
    <div className="chat-layout">
      {/* KaTeX scripts */}
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
        strategy="afterInteractive"
      />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes tdot { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .message-bubble .katex { font-size:1.05em; }
        .message-bubble .katex-display { margin:12px 0; overflow-x:auto; }
        .message-bubble strong { font-weight:600; }
        .menu-formula-btn:hover { background: hsl(220,40%,95%) !important; border-color: hsl(220,30%,82%) !important; }
        .menu-link-btn:hover { color: hsl(220,60%,20%) !important; }
      `}</style>

      {/* Drag Overlay */}
      {showDragOverlay && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'hsla(210,20%,98%,0.92)',
          zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14,
          border: '2.5px dashed hsl(45,90%,55%)',
          borderRadius: 16, margin: 12,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 52 }}>📸</div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: 'hsl(220,60%,20%)' }}>
            Drop image to upload
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 50,
        background: 'hsla(0,0%,100%,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid hsl(220,15%,88%)',
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: 1152, margin: '0 auto', padding: '0 16px',
          height: 64, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{
              background: 'none', border: 'none', padding: '8px 6px',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              gap: 5, color: 'hsl(220,10%,46%)', flexShrink: 0,
            }}
          >
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 2, background: 'currentColor' }} />
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 2, background: 'currentColor' }} />
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 2, background: 'currentColor' }} />
          </button>

          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: 'hsl(220,60%,20%)' }}>
              ADRIAN&apos;S
            </span>
            <span style={{ color: 'hsl(220,10%,46%)', fontSize: 14 }} className="hidden sm:inline">math tuition</span>
          </Link>

          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'hsl(220,10%,46%)', fontSize: 14, fontWeight: 500, textDecoration: 'none', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden sm:inline">Back to website</span>
          </Link>
        </div>
      </nav>

      {/* Slide-out menu backdrop */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 59,
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Slide-out menu panel (always rendered for smooth animation) */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 'min(280px, 85vw)',
        background: 'white',
        boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 60,
        display: 'flex', flexDirection: 'column',
        transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease-out',
        pointerEvents: menuOpen ? 'auto' : 'none',
        overflowY: 'auto',
      }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', height: 64, flexShrink: 0,
          borderBottom: '1px solid hsl(220,15%,92%)',
        }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'hsl(220,60%,20%)' }}>
            Menu
          </span>
          <button
            onClick={() => setMenuOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'hsl(220,10%,56%)', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Formula sheets section */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'hsl(220,10%,56%)', marginBottom: 10,
            padding: '0 4px',
          }}>
            📐 Formula Sheets
          </div>
          {FORMULA_SHEETS.map(sheet => (
            <button
              key={sheet.id}
              className="menu-formula-btn"
              onClick={() => { setMenuOpen(false); setFormulaSheet(sheet.id); }}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 12px', marginBottom: 8, minHeight: 52,
                background: 'hsl(220,30%,98%)', border: '1px solid hsl(220,15%,90%)',
                borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{sheet.emoji}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'hsl(220,40%,15%)', lineHeight: 1.3 }}>{sheet.title}</div>
                <div style={{ fontSize: 12, color: 'hsl(220,10%,56%)', marginTop: 2 }}>{sheet.subtitle}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ margin: '16px 16px 8px', borderBottom: '1px solid hsl(220,15%,92%)' }} />

        {/* Extra links */}
        <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column' }}>
          <button
            className="menu-link-btn"
            onClick={() => {
              setMenuOpen(false);
              setTimeout(() => {
                (conversationStarted ? fixedInputRef.current : welcomeInputRef.current)?.focus();
              }, 50);
            }}
            style={{
              textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              padding: '11px 4px', fontSize: 14, color: 'hsl(220,40%,15%)',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.12s',
            }}
          >
            💬 Ask a question
          </button>
          <Link
            href="/"
            className="menu-link-btn"
            style={{
              padding: '11px 4px', fontSize: 14, color: 'hsl(220,10%,46%)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.12s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to website
          </Link>
        </div>
      </div>

      {/* Full-screen PDF overlay */}
      {formulaSheet && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'white',
          zIndex: 70,
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* PDF overlay top bar */}
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 12px 0 4px', height: 52,
            background: 'hsl(220,60%,20%)',
            borderBottom: '1px solid hsl(220,50%,15%)',
          }}>
            <button
              onClick={() => setFormulaSheet(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(45,90%,80%)', fontSize: 14, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 10px', flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
            <span style={{
              flex: 1, textAlign: 'center',
              fontFamily: "'DM Serif Display', serif", fontSize: 15,
              color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {FORMULA_SHEETS.find(s => s.id === formulaSheet)?.title}
            </span>
            <a
              href={`/formulas/${formulaSheet}.pdf`}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'hsl(45,90%,80%)', fontSize: 13, fontWeight: 500,
                textDecoration: 'none', padding: '8px 6px', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Open
            </a>
          </div>

          {/* PDF embed */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <iframe
              src={`/formulas/${formulaSheet}.pdf`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={FORMULA_SHEETS.find(s => s.id === formulaSheet)?.title}
            />
            {/* Fallback shown below iframe on mobile if PDF doesn't render */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '10px 16px',
              background: 'hsla(0,0%,100%,0.95)',
              borderTop: '1px solid hsl(220,15%,90%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13, color: 'hsl(220,10%,46%)',
              pointerEvents: 'none',
            }}>
              Can&apos;t see the PDF?{' '}
              <a
                href={`/formulas/${formulaSheet}.pdf`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'hsl(220,60%,40%)', fontWeight: 600, pointerEvents: 'auto' }}
              >
                Tap to open directly ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable chat area */}
      <div
        ref={chatScrollRef}
        style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'hsl(220,15%,88%) transparent', overflowAnchor: 'none', overscrollBehavior: 'contain' }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>

          {/* Welcome state */}
          {!conversationStarted && (
            <div style={{ padding: '56px 0 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80,
                background: 'hsl(45,90%,92%)',
                border: '2px solid hsl(45,90%,55%)',
                borderRadius: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
              }}>
                <MathIcon />
              </div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '2.75rem', color: 'hsl(220,60%,20%)', marginBottom: 12, lineHeight: 1.15 }}>
                Have a math question?
              </h1>
              <p style={{ fontSize: 18, color: 'hsl(220,10%,46%)', maxWidth: 420, lineHeight: 1.65, marginBottom: 32 }}>
                Type it out or drop a photo — get a clear, step-by-step solution instantly. Secondary and JC math covered.
              </p>

              {/* Welcome input */}
              <div style={{ width: '100%', maxWidth: 580 }}>
                {errorMsg && (
                  <div style={{
                    background: 'hsl(0,90%,97%)', border: '1px solid hsl(0,70%,85%)',
                    borderRadius: 8, padding: '9px 14px', fontSize: 13, color: 'hsl(0,60%,45%)', marginBottom: 10,
                  }}>
                    {errorMsg}
                  </div>
                )}
                {previewSrc && (
                  <div style={{ marginBottom: 10, position: 'relative', width: 'fit-content' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="preview" style={{ height: 160, maxWidth: 280, objectFit: 'cover', borderRadius: 10, border: '1px solid hsl(220,15%,88%)', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                    <button onClick={removeImage} style={{
                      position: 'absolute', top: -7, right: -7,
                      width: 22, height: 22,
                      background: 'white', border: '1px solid hsl(220,15%,88%)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 11, color: 'hsl(220,10%,46%)',
                    }}>✕</button>
                  </div>
                )}
                {renderInputBox(welcomeInputRef, 'Type a question, or paste / drop a photo…', 'inputBoxWelcome')}
                <p style={{ marginTop: 8, fontSize: 12, color: 'hsl(220,10%,46%)', opacity: 0.6, textAlign: 'center' }}>
                  Enter to send · Shift+Enter for new line · Paste or drag images
                </p>
              </div>
            </div>
          )}

          {/* Messages area */}
          <div style={{ padding: conversationStarted ? '32px 0 24px' : '0', display: conversationStarted ? 'block' : 'none' }}>
            <div ref={messagesInnerRef} />
          </div>

        </div>
      </div>

      {/* Fixed bottom input (shown after conversation starts) */}
      {conversationStarted && (
        <div style={{
          borderTop: '1px solid hsl(220,15%,88%)',
          padding: '14px 24px 18px',
          background: 'hsla(0,0%,100%,0.95)',
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {errorMsg && (
              <div style={{
                background: 'hsl(0,90%,97%)', border: '1px solid hsl(0,70%,85%)',
                borderRadius: 8, padding: '9px 14px', fontSize: 13, color: 'hsl(0,60%,45%)', marginBottom: 10,
              }}>
                {errorMsg}
              </div>
            )}
            {previewSrc && (
              <div style={{ marginBottom: 10, position: 'relative', width: 'fit-content' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewSrc} alt="preview" style={{ height: 160, maxWidth: 280, objectFit: 'cover', borderRadius: 10, border: '1px solid hsl(220,15%,88%)', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                <button onClick={removeImage} style={{
                  position: 'absolute', top: -7, right: -7,
                  width: 22, height: 22,
                  background: 'white', border: '1px solid hsl(220,15%,88%)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 11, color: 'hsl(220,10%,46%)',
                }}>✕</button>
              </div>
            )}
            {renderInputBox(fixedInputRef, 'Ask a follow-up question, or drop a photo…', 'inputBoxFixed')}
          </div>
        </div>
      )}
    </div>
  );
}
