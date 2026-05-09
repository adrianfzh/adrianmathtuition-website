'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
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

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

// ── KaTeX overrides ───────────────────────────────────────────────────────────
const katexStyles = `
  .katex { font-size: 1em !important; }
  .katex-display { margin: 12px 0 !important; overflow-x: auto; overflow-y: hidden; }
  .katex-display > .katex { text-align: left; }
`;

// ── Shared markdown renderer ──────────────────────────────────────────────────
function CardMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false }]]}
      components={{
        p: ({ node: _n, ...props }) => (
          <p style={{ margin: '0 0 12px 0', lineHeight: 1.65 }} {...props} />
        ),
        strong: ({ node: _n, ...props }) => (
          <strong style={{ fontWeight: 700, color: '#1a1a1a' }} {...props} />
        ),
        em: ({ node: _n, ...props }) => (
          <em style={{ color: '#555' }} {...props} />
        ),
        hr: ({ node: _n, ...props }) => (
          <hr style={{ border: 0, borderTop: '1px dashed #d0c8b8', margin: '14px 0' }} {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────
function ChatPanel({
  card,
  level,
  messages,
  onClose,
  onSend,
  isStreaming,
}: {
  card: Card;
  level: string;
  messages: ChatMessage[];
  onClose: () => void;
  onSend: (text: string) => void;
  isStreaming: boolean;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function onPanelDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 500) onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onPointerDown={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={onPanelDragEnd}
        className="absolute left-0 right-0 bottom-0 z-40 flex flex-col"
        style={{
          height: '75%',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          touchAction: 'none',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D0C8BE' }} />
        </div>

        {/* Panel header */}
        <div
          className="flex-none flex items-start justify-between px-5 pb-3"
          style={{ borderBottom: '1px solid #F0EBE0' }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#2C3E50' }}>
              Ask about this question
            </p>
            <p
              className="truncate"
              style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}
            >
              {card.card_title}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: '#AAA', flexShrink: 0, marginTop: 2 }}
            aria-label="Close chat"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: '12px 16px', touchAction: 'pan-y' }}
          onPointerDown={e => e.stopPropagation()}
        >
          {messages.length === 0 && (
            <p style={{ fontSize: 14, color: '#AAA', textAlign: 'center', marginTop: 24 }}>
              Ask a question about this worked example ✏️
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#2980B9' : '#F5F2ED',
                  color: msg.role === 'user' ? '#FFF' : '#2C2C2C',
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {msg.role === 'assistant' ? (
                  <CardMarkdown content={msg.content || '…'} />
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role === 'user' && (
            <div style={{ display: 'flex', gap: 4, paddingLeft: 4, marginBottom: 12 }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: '#C8B89A' }}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="flex-none flex items-end gap-2 px-3 py-3"
          style={{
            borderTop: '1px solid #F0EBE0',
            background: '#FAFAF8',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question…"
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: '1px solid #E8E0D5',
              borderRadius: 12,
              padding: '9px 12px',
              fontSize: 15,
              lineHeight: 1.4,
              background: '#FFF',
              color: '#2C2C2C',
              outline: 'none',
              maxHeight: 96,
              overflowY: 'auto',
              touchAction: 'pan-y',
            }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 96) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: !input.trim() || isStreaming ? '#D0C8BE' : '#E67E22',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            aria-label="Send"
          >
            {/* Paper-plane icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </motion.div>
    </>
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
        {groups.map(({ sgId, cards: groupCards }) => {
          const sg = subgroups[sgId];
          return (
            <section key={sgId} id={`sg-${sgId}`}>
              {sg && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-base">📌</span>
                  <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">{sg.name}</h2>
                </div>
              )}
              <div className="space-y-4">
                {groupCards.map(card => (
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const total = cards.length;
  const card = cards[index];

  // Reset chat messages when card changes
  useEffect(() => { setChatMessages([]); }, [index]);

  // Block pull-to-refresh while mounted (Problem 3)
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

  async function sendChatMessage(text: string) {
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
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
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
        return;
      }

      // Seed empty assistant bubble
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
          } catch { /* malformed SSE line */ }
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

  function closeChat() {
    abortRef.current?.abort();
    setChatOpen(false);
  }

  const isFirstInSubgroup = index === 0 || cards[index - 1].subgroup_id !== card.subgroup_id;
  const sg = subgroups[card.subgroup_id];

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

        {/* Card stack */}
        <div className="flex-1 relative" style={{ overflow: 'hidden' }}>
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
                      <span>📌</span>
                      <span>{sg.name}</span>
                    </div>
                  )}
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: '#2C3E50', lineHeight: 1.3 }}>{card.card_title}</h2>
                </div>
                <div
                  className="flex-1 overflow-y-auto"
                  style={{ padding: '16px 24px 20px', fontSize: 16, color: '#2C2C2C', lineHeight: 1.65, touchAction: 'pan-y' }}
                  onPointerDown={e => e.stopPropagation()}
                >
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
          {showHint && total > 1 && (
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

          {/* Chat panel (AnimatePresence manages enter/exit) */}
          <AnimatePresence>
            {chatOpen && (
              <ChatPanel
                card={card}
                level={level}
                messages={chatMessages}
                onClose={closeChat}
                onSend={sendChatMessage}
                isStreaming={isStreaming}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Bottom nav */}
        <div className="flex-none flex items-center justify-center gap-3 px-4" style={{ height: 52 }}>
          <button onClick={goPrev} disabled={index === 0} className="p-1.5 rounded-full transition-opacity disabled:opacity-20" style={{ color: '#999' }} aria-label="Previous card">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5">
            {cards.map((_, i) => {
              const dist = Math.abs(i - index);
              if (dist > 4) return null;
              return (
                <button key={i} onClick={() => goTo(i, i > index ? 1 : -1)} aria-label={`Go to card ${i + 1}`} className="rounded-full flex-none transition-all duration-200" style={{ width: i === index ? 20 : dist === 1 ? 7 : 5, height: i === index ? 6 : dist === 1 ? 7 : 5, background: i === index ? '#2980B9' : '#C8B89A' }} />
              );
            })}
          </div>
          <button onClick={goNext} disabled={index === total - 1} className="p-1.5 rounded-full transition-opacity disabled:opacity-20" style={{ color: '#999' }} aria-label="Next card">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Chat FAB — fixed in the swipe container, above bottom nav */}
        <motion.button
          onClick={() => setChatOpen(true)}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5, type: 'spring', stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          aria-label="Ask the tutor"
          style={{
            position: 'absolute',
            right: 'max(20px, calc(env(safe-area-inset-right) + 12px))',
            bottom: 'calc(52px + max(20px, calc(env(safe-area-inset-bottom) + 12px)))',
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#E67E22',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.20)',
            zIndex: 25,
            pointerEvents: 'auto',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
          </svg>
        </motion.button>
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
