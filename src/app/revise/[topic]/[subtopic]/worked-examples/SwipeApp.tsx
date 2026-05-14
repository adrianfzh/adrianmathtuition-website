'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, type PanInfo } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

interface Card {
  id: string;
  subgroup_id: number;
  display_group: string | null;
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
  focusedSubgroupName?: string;
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
  .katex-display { margin: 12px 0 !important; overflow-x: auto; overflow-y: hidden; max-width: 100%; }
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
      rehypePlugins={[rehypeRaw, [rehypeKatex, katexOptions]]}
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
function DesktopView({ cards, subgroups, level, topic, focusedSubgroupName }: Props) {
  // Group by display_group (falling back to subgroup name for cards without one)
  const groups: { section: string; cards: Card[] }[] = [];
  for (const card of cards) {
    const section = card.display_group ?? subgroups[card.subgroup_id]?.name ?? '';
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.cards.push(card);
    else groups.push({ section, cards: [card] });
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
          {focusedSubgroupName
            ? <p className="text-xs text-indigo-600 mt-0.5">Focused on: {focusedSubgroupName}</p>
            : <p className="text-xs text-gray-400 mt-0.5">{cards.length} worked examples</p>
          }
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {groups.map(({ section, cards: gc }) => (
          <section key={section} id={`section-${section}`}>
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
        ))}
        <div className="text-center pt-4 pb-8">
          <a href={`/revise/${level}`} className="text-indigo-600 text-sm font-medium hover:underline">↩ Back to {topic}</a>
        </div>
      </div>
    </div>
  );
}

// ── Mobile swipe view ─────────────────────────────────────────────────────────
function MobileSwipeView({ cards, subgroups, level, topic, focusedSubgroupName }: Props) {
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
  const [hasInteracted, setHasInteracted] = useState(false);
  const dotStripRef = useRef<HTMLDivElement>(null);
  const activeDotRef = useRef<HTMLButtonElement>(null);

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

  // Auto-centre active dot (Problem 7)
  useEffect(() => {
    activeDotRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

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
    setHasInteracted(true);
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
          <div className="flex-1 min-w-0">
            <h1 className="truncate" style={{ fontSize: 14, fontWeight: 600, color: '#2C3E50' }}>{topic}</h1>
            {focusedSubgroupName && <p className="truncate" style={{ fontSize: 11, color: '#6366f1', marginTop: 1 }}>Focused on: {focusedSubgroupName}</p>}
          </div>
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
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: '#2C3E50', lineHeight: 1.3 }}>{card.card_title}</h2>
                </div>
                <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px 20px', fontSize: 16, color: '#2C2C2C', lineHeight: 1.65, touchAction: 'pan-x pan-y' }} onPointerDown={e => e.stopPropagation()}>
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

        {/* Bottom bar: scrollable dots + morphing Ask pill/input bar */}
        <div className="flex-none" style={{ height: 62, borderTop: '1px solid rgba(0,0,0,0.07)', position: 'relative' }}>
          {/* Nav row — fades out when chat is open */}
          <motion.div
            className="absolute inset-0 flex items-center pl-1 pr-0 gap-1"
            animate={{ opacity: chatOpen ? 0 : 1 }}
            transition={{ duration: 0.07 }}
            style={{ pointerEvents: chatOpen ? 'none' : 'auto' }}
          >
            <button onClick={goPrev} disabled={index === 0} className="p-1.5 rounded-full transition-opacity disabled:opacity-20 flex-none" style={{ color: '#999' }} aria-label="Previous card">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
            </button>

            {/* Problem 7: scrollable dot strip with sub-group separators */}
            <div
              ref={dotStripRef}
              className="flex-1"
              style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none', padding: '0 4px', gap: 0 }}
            >
              <style>{`.dot-strip::-webkit-scrollbar { display: none }`}</style>
              {cards.map((c, i) => {
                const isSgBreak = i > 0 && cards[i - 1].subgroup_id !== c.subgroup_id;
                return (
                  <Fragment key={i}>
                    {isSgBreak && (
                      <div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.13)', flexShrink: 0, margin: '0 3px' }} />
                    )}
                    <button
                      ref={i === index ? activeDotRef : null}
                      onClick={() => goTo(i, i > index ? 1 : -1)}
                      aria-label={`Card ${i + 1}`}
                      style={{ padding: '10px 4px', background: 'transparent', border: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', scrollSnapAlign: 'center', cursor: 'pointer' }}
                    >
                      <div style={{
                        width: i === index ? 12 : 8,
                        height: i === index ? 12 : 8,
                        borderRadius: '50%',
                        background: i === index ? '#E67E22' : 'rgba(0,0,0,0.2)',
                        transition: 'width 0.18s, height 0.18s, background 0.18s',
                      }} />
                    </button>
                  </Fragment>
                );
              })}
            </div>

            <button onClick={goNext} disabled={index === total - 1} className="p-1.5 rounded-full transition-opacity disabled:opacity-20 flex-none" style={{ color: '#999' }} aria-label="Next card">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>

            {/* Spacer: pill width (100) + right margin (12) + chevron-to-pill gap (16) */}
            <div style={{ width: 128, flexShrink: 0 }} />
          </motion.div>

          {/* Problem 5: Morphing orange pill ↔ input bar */}
          <LayoutGroup>
            <motion.div
              layout
              transition={{ layout: { type: 'spring', stiffness: chatOpen ? 400 : 520, damping: chatOpen ? 35 : 38, mass: 0.55 } }}
              style={{
                position: 'absolute',
                ...(chatOpen
                  ? { left: 8, right: 8, top: 7, bottom: 7 }
                  : { right: 12, top: 7, bottom: 7, width: 100 }),
                borderRadius: 24,
                background: '#E67E22',
                display: 'flex',
                alignItems: 'center',
                padding: chatOpen ? '0 8px' : '0 10px',
                gap: chatOpen ? 4 : 6,
                boxShadow: '0 4px 14px rgba(230,126,34,0.35)',
                willChange: 'transform, width',
                overflow: 'hidden',
                cursor: chatOpen ? 'default' : 'pointer',
              }}
              onClick={!chatOpen ? openChat : undefined}
              onPointerDown={e => e.stopPropagation()}
              aria-label={chatOpen ? undefined : 'Ask the tutor'}
            >
              {/* Owl — always visible as anchor */}
              <motion.span
                animate={!hasInteracted ? { rotate: [0, 0, 0, -3, 3, 0, 0] } : { rotate: 0 }}
                transition={{ repeat: Infinity, repeatDelay: 5.2, duration: 0.45, ease: 'easeInOut', times: [0, 0.25, 0.4, 0.55, 0.75, 0.88, 1] }}
                style={{ fontSize: 19, lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                🤖
              </motion.span>

              {/* Pill mode: "Ask" label */}
              <AnimatePresence>
                {!chatOpen && (
                  <motion.span
                    key="ask-label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.06 }}
                    style={{ color: '#FFF', fontWeight: 700, fontSize: 15, flexShrink: 0, letterSpacing: 0.2 }}
                  >
                    Ask
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Bar mode: input + send + close */}
              <AnimatePresence>
                {chatOpen && (
                  <motion.div
                    key="bar-content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.06, delay: 0.07 }}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                  >
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={onInputKeyDown}
                      placeholder="Type your question…"
                      rows={1}
                      style={{ flex: 1, resize: 'none', border: 0, borderRadius: 14, padding: '6px 10px', fontSize: 16, lineHeight: 1.3, background: 'rgba(255,255,255,0.22)', color: '#FFF', outline: 'none', minWidth: 0, maxHeight: 40, overflowY: 'hidden', touchAction: 'pan-y' }}
                      onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 40) + 'px'; }}
                    />
                    <style>{`::placeholder { color: rgba(255,255,255,0.65); }`}</style>
                    <button
                      onClick={sendMessage}
                      disabled={!inputValue.trim() || isStreaming}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: !inputValue.trim() || isStreaming ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.35)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.12s' }}
                      aria-label="Send"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                    <button
                      onClick={closeChat}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      aria-label="Close chat"
                    >
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
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
