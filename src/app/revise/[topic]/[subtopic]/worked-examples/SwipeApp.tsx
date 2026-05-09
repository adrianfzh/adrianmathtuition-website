'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Card {
  id: string;
  subgroup_id: number;
  order_index: number;
  card_title: string;
  content: string;
  content_kind: string;
}

interface Subgroup {
  id: number;
  name: string;
  description: string;
}

interface Props {
  cards: Card[];
  subgroups: Record<number, Subgroup>;
  level: string;
  topic: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;
const CHAT_ENDPOINT = 'https://adrianmath-telegram-math-bot.fly.dev/api/chat';

// ── Animation variants ────────────────────────────────────────────────────────
const slideVariants = {
  enter: (dir: 1 | -1) => ({ y: dir > 0 ? '100%' : '-100%', opacity: 1 }),
  center: { y: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ y: dir > 0 ? '-100%' : '100%', opacity: 1 }),
};

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 };

// ── KaTeX overrides ───────────────────────────────────────────────────────────
const katexStyles = `
  .katex { font-size: 1em !important; }
  .katex-display { margin: 12px 0 !important; overflow-x: auto; overflow-y: hidden; }
  .katex-display > .katex { text-align: left; }
`;

// ── Problem 6 fix: remark-math v6 requires $$ on its own line (fence model).
//    DB content uses $$\begin{aligned}...$$\end{aligned}$$ format.
//    Pre-process: ensure newlines around $$ delimiters. ─────────────────────
function fixMathFences(src: string): string {
  return src
    // If $$ is immediately followed by non-whitespace, insert a newline after it
    .replace(/\$\$(?=\S)/g, () => '$$\n')
    // If $$ is immediately preceded by non-whitespace, insert a newline before it
    .replace(/([^\n\s])\$\$/g, (_, c: string) => `${c}\n$$`);
}

// ── Rehype-KaTeX options (Problem 6) ─────────────────────────────────────────
const katexOptions = {
  strict: false,
  trust: true,
  throwOnError: false,
  output: 'htmlAndMathml' as const,
  macros: { '\\tfrac': '\\frac' },
};

// ── Shared markdown renderer ──────────────────────────────────────────────────
function CardMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[[rehypeKatex, katexOptions]]}
      components={{
        p: ({ node: _n, ...props }) => (
          <p style={{ margin: '0 0 12px 0', lineHeight: 1.65 }} {...props} />
        ),
        strong: ({ node: _n, ...props }) => (
          <strong style={{ fontWeight: 700, color: '#1a1a1a' }} {...props} />
        ),
        em: ({ node: _n, ...props }) => <em style={{ color: '#555' }} {...props} />,
        hr: ({ node: _n, ...props }) => (
          <hr style={{ border: 0, borderTop: '1px dashed #d0c8b8', margin: '14px 0' }} {...props} />
        ),
      }}
    >
      {fixMathFences(content)}
    </ReactMarkdown>
  );
}

// ── Desktop list view ─────────────────────────────────────────────────────────
function DesktopView({ cards, subgroups, level, topic }: Props) {
  const groups: { sgId: number; cards: Card[] }[] = [];
  for (const card of cards) {
    const last = groups[groups.length - 1];
    if (last && last.sgId === card.subgroup_id) last.cards.push(card);
    else groups.push({ sgId: card.subgroup_id, cards: [card] });
  }
  return (
    <div className="hidden md:block min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <a href={`/revise/${level}`} className="text-gray-400 hover:text-gray-600 transition-colors flex-none" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{topic}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{cards.length} worked examples</p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {groups.map(({ sgId, cards: gc }) => {
          const sg = subgroups[sgId];
          return (
            <section key={sgId} id={`sg-${sgId}`}>
              {sg && (
                <div className="flex items-center gap-2 mb-4">
                  <span>📌</span>
                  <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">{sg.name}</h2>
                </div>
              )}
              <div className="space-y-4">
                {gc.map(card => (
                  <article key={card.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                      <h3 className="text-base font-semibold text-gray-900 leading-snug">{card.card_title}</h3>
                    </div>
                    <div className="px-6 py-5 prose prose-sm max-w-none text-gray-700">
                      <CardMarkdown content={card.content} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        <div className="text-center pt-4 pb-8">
          <a href={`/revise/${level}`} className="text-indigo-600 text-sm font-medium hover:underline">↩ Back to {topic}</a>
        </div>
      </div>
    </div>
  );
}

// ── Mobile swipe view ─────────────────────────────────────────────────────────
function MobileSwipeView({ cards, subgroups, level, topic }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showHint, setShowHint] = useState(true);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  const total = cards.length;
  const card = cards[index];

  // Reset chat when card changes
  useEffect(() => {
    setChatMessages([]);
    setChatOpen(false);
    setInputValue('');
    abortRef.current?.abort();
  }, [index]);

  // Block pull-to-refresh (Problem 3)
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      document.body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  // Auto-scroll response strip
  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollTop = stripRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const goTo = useCallback(
    (newIndex: number, dir: 1 | -1) => {
      if (newIndex < 0 || newIndex >= total) return;
      setDirection(dir);
      setIndex(newIndex);
      setShowHint(false);
    },
    [total],
  );

  const goNext = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (chatOpen) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, chatOpen]);

  function onCardDragEnd(_: unknown, info: PanInfo) {
    if (chatOpen) return;
    const { offset, velocity } = info;
    if (offset.y < -SWIPE_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD) goNext();
    else if (offset.y > SWIPE_THRESHOLD || velocity.y > VELOCITY_THRESHOLD) goPrev();
  }

  function openChat() {
    setChatOpen(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  function closeChat() {
    abortRef.current?.abort();
    setChatOpen(false);
    setInputValue('');
  }

  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    setInputValue('');

    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const context = `Student is reading the worked example titled '${card.card_title}'. The card content was:\n\n${card.content}\n\nThe student is asking the question above in the context of this worked example.`;

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context, level: level.toUpperCase() }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
        return;
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

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
            if (parsed.chunk) {
              fullText += parsed.chunk;
              setChatMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: fullText };
                return next;
              });
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setChatMessages(prev => {
        const next = [...prev];
        if (next[next.length - 1]?.role === 'assistant' && !next[next.length - 1].content) {
          next[next.length - 1] = { role: 'assistant', content: 'Connection error. Please try again.' };
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const isFirstInSubgroup = index === 0 || cards[index - 1].subgroup_id !== card.subgroup_id;
  const sg = subgroups[card.subgroup_id];
  const hasMessages = chatMessages.length > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: katexStyles }} />

      <div
        className="md:hidden fixed inset-0 flex flex-col"
        style={{ background: '#F5EFE2', overflow: 'hidden', touchAction: 'none', userSelect: 'none', overscrollBehavior: 'none' }}
      >
        {/* Header */}
        <div className="flex-none flex items-center gap-2 px-4" style={{ height: 52, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <a href={`/revise/${level}`} className="flex-none transition-opacity hover:opacity-60" style={{ color: '#888', pointerEvents: 'auto' }} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </a>
          <h1 className="flex-1 truncate" style={{ fontSize: 14, fontWeight: 600, color: '#2C3E50' }}>{topic}</h1>
          <span style={{ fontSize: 13, color: '#999', fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {total}</span>
        </div>

        {/* Card stack — flex-1 shrinks when response strip is visible */}
        <div className="flex-1 relative" style={{ overflow: 'hidden', minHeight: 0 }}>
          <AnimatePresence custom={direction} initial={false}>
            <motion.div
              key={index}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={springTransition}
              drag={chatOpen ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={onCardDragEnd}
              className="absolute inset-0 flex items-center justify-center"
              style={{ padding: '12px 16px', touchAction: chatOpen ? 'auto' : 'none', cursor: chatOpen ? 'default' : 'grab' }}
            >
              <div
                className="w-full flex flex-col"
                style={{ maxWidth: 'min(92vw, 600px)', maxHeight: 'calc(100% - 8px)', background: '#FFFFFF', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', overflow: 'hidden' }}
              >
                <div className="flex-none" style={{ padding: '20px 24px 14px', borderBottom: '1px solid #F0EBE0' }}>
                  {isFirstInSubgroup && sg && (
                    <div className="inline-flex items-center gap-1" style={{ background: '#EAF2F8', color: '#2980B9', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, marginBottom: 10 }}>
                      <span>📌</span><span>{sg.name}</span>
                    </div>
                  )}
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: '#2C3E50', lineHeight: 1.3 }}>{card.card_title}</h2>
                </div>
                <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px 20px', fontSize: 16, color: '#2C2C2C', lineHeight: 1.65, touchAction: 'pan-y' }} onPointerDown={e => e.stopPropagation()}>
                  <CardMarkdown content={card.content} />
                  {index === total - 1 && (
                    <div style={{ marginTop: 24, textAlign: 'center' }}>
                      <a href={`/revise/${level}`} style={{ color: '#2980B9', fontSize: 14, fontWeight: 500 }}>↩ Back to {topic}</a>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Swipe hint */}
          {showHint && total > 1 && !chatOpen && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-20">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.75, 0.75, 0] }}
                transition={{ delay: 1.2, duration: 2.5, times: [0, 0.2, 0.8, 1] }}
                style={{ fontSize: 12, color: '#777', background: 'rgba(255,255,255,0.88)', padding: '5px 14px', borderRadius: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}
              >
                swipe up ↑
              </motion.span>
            </div>
          )}
        </div>

        {/* Response strip — slides in above input bar, max 35vh */}
        <AnimatePresence>
          {chatOpen && hasMessages && (
            <motion.div
              ref={stripRef}
              key="strip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="flex-none overflow-y-auto"
              style={{
                maxHeight: '35vh',
                background: '#FAF6EE',
                borderTop: '1px solid #E8DFD0',
                padding: '10px 14px',
                touchAction: 'pan-y',
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '7px 11px',
                    borderRadius: msg.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                    background: msg.role === 'user' ? '#2980B9' : '#FFFFFF',
                    color: msg.role === 'user' ? '#FFF' : '#2C2C2C',
                    fontSize: 14,
                    lineHeight: 1.5,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }}>
                    {msg.role === 'assistant'
                      ? <CardMarkdown content={msg.content || '…'} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    }
                  </div>
                </div>
              ))}
              {isStreaming && chatMessages[chatMessages.length - 1]?.role === 'user' && (
                <div style={{ display: 'flex', gap: 4, paddingLeft: 2, paddingBottom: 4 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.13 }} style={{ width: 6, height: 6, borderRadius: '50%', background: '#C8B89A' }} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom bar: progress nav OR chat input */}
        <div className="flex-none" style={{ height: 56, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          {!chatOpen ? (
              /* Normal bottom nav with progress dots + Ask pill */
              <div className="flex items-center justify-center gap-3 px-4 h-full">
                <button onClick={goPrev} disabled={index === 0} className="p-1.5 rounded-full transition-opacity disabled:opacity-20" style={{ color: '#999' }} aria-label="Previous card">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                </button>
                <div className="flex items-center gap-1.5 flex-1 justify-center">
                  {cards.map((_, i) => {
                    const dist = Math.abs(i - index);
                    if (dist > 4) return null;
                    return <button key={i} onClick={() => goTo(i, i > index ? 1 : -1)} aria-label={`Go to card ${i + 1}`} className="rounded-full flex-none transition-all duration-200" style={{ width: i === index ? 20 : dist === 1 ? 7 : 5, height: i === index ? 6 : dist === 1 ? 7 : 5, background: i === index ? '#2980B9' : '#C8B89A' }} />;
                  })}
                </div>
                <button onClick={goNext} disabled={index === total - 1} className="p-1.5 rounded-full transition-opacity disabled:opacity-20" style={{ color: '#999' }} aria-label="Next card">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                {/* Ask pill button */}
                <motion.button
                  onClick={openChat}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 1.5, type: 'spring', stiffness: 300, damping: 20 }}
                  whileTap={{ scale: 0.93 }}
                  aria-label="Ask the tutor"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#E67E22', color: '#FFF', borderRadius: 22, padding: '7px 14px', fontSize: 15, fontWeight: 700, boxShadow: '0 3px 10px rgba(0,0,0,0.18)', flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
                  Ask
                </motion.button>
              </div>
            ) : (
              /* Chat input bar */
              <div
                className="flex items-center gap-2 px-3 h-full"
                style={{ background: '#FAFAF8' }}
                onPointerDown={e => e.stopPropagation()}
              >
                <button onClick={closeChat} style={{ color: '#AAA', flexShrink: 0, padding: 4 }} aria-label="Close chat">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Ask about this question…"
                  rows={1}
                  style={{ flex: 1, resize: 'none', border: '1px solid #E8E0D5', borderRadius: 10, padding: '7px 10px', fontSize: 15, lineHeight: 1.3, background: '#FFF', color: '#2C2C2C', outline: 'none', maxHeight: 44, overflowY: 'hidden', touchAction: 'pan-y' }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 44) + 'px'; }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: !inputValue.trim() || isStreaming ? '#D0C8BE' : '#E67E22', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
                  aria-label="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            )}
        </div>
      </div>
    </>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function SwipeApp(props: Props) {
  return (
    <>
      <MobileSwipeView {...props} />
      <DesktopView {...props} />
    </>
  );
}
