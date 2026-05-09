'use client';

import { useCallback, useEffect, useState } from 'react';
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

// ── Thresholds ────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;

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

// ── KaTeX overrides injected once at page level ───────────────────────────────
const katexStyles = `
  .katex { font-size: 1em !important; }
  .katex-display { margin: 12px 0 !important; overflow-x: auto; overflow-y: hidden; }
  .katex-display > .katex { text-align: left; }
`;

// ── Shared markdown renderer ──────────────────────────────────────────────────
function CardMarkdown({ content, bodyStyle }: { content: string; bodyStyle?: React.CSSProperties }) {
  return (
    <div style={bodyStyle}>
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
    </div>
  );
}

// ── Desktop list view (unchanged from previous version) ───────────────────────
function DesktopView({ cards, subgroups, level, topic }: Props) {
  const groups: { sgId: number; cards: Card[] }[] = [];
  for (const card of cards) {
    const last = groups[groups.length - 1];
    if (last && last.sgId === card.subgroup_id) {
      last.cards.push(card);
    } else {
      groups.push({ sgId: card.subgroup_id, cards: [card] });
    }
  }

  return (
    <div className="hidden md:block min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <a
          href={`/revise/${level}`}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-none"
          aria-label="Back"
        >
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
                {groupCards.map((card) => (
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
          <a href={`/revise/${level}`} className="text-indigo-600 text-sm font-medium hover:underline">
            ↩ Back to {topic}
          </a>
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

  const total = cards.length;
  const card = cards[index];

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

  // Problem 3: block pull-to-refresh on mobile browsers while this view is mounted
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -SWIPE_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD) {
      goNext();
    } else if (offset.y > SWIPE_THRESHOLD || velocity.y > VELOCITY_THRESHOLD) {
      goPrev();
    }
    // Under threshold → framer-motion snaps back to y:0 via dragConstraints
  }

  const isFirstInSubgroup = index === 0 || cards[index - 1].subgroup_id !== card.subgroup_id;
  const sg = subgroups[card.subgroup_id];

  return (
    <>
      {/* KaTeX overrides — injected once */}
      <style dangerouslySetInnerHTML={{ __html: katexStyles }} />

      {/* Fixed full-screen container — body scroll disabled by overflow:hidden */}
      <div
        className="md:hidden fixed inset-0 flex flex-col"
        style={{ background: '#F5EFE2', overflow: 'hidden', touchAction: 'none', userSelect: 'none', overscrollBehavior: 'none' }}
      >
        {/* Header */}
        <div
          className="flex-none flex items-center gap-2 px-4"
          style={{ height: 52, borderBottom: '1px solid rgba(0,0,0,0.07)' }}
        >
          <a
            href={`/revise/${level}`}
            className="flex-none transition-opacity hover:opacity-60"
            style={{ color: '#888', pointerEvents: 'auto' }}
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </a>
          <h1
            className="flex-1 truncate"
            style={{ fontSize: 14, fontWeight: 600, color: '#2C3E50' }}
          >
            {topic}
          </h1>
          <span style={{ fontSize: 13, color: '#999', fontVariantNumeric: 'tabular-nums' }}>
            {index + 1} / {total}
          </span>
        </div>

        {/* Card stack — AnimatePresence controls enter/exit per index change */}
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
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={onDragEnd}
              className="absolute inset-0 flex items-center justify-center"
              style={{ padding: '12px 16px', touchAction: 'none', cursor: 'grab' }}
            >
              {/* Card */}
              <div
                className="w-full flex flex-col"
                style={{
                  maxWidth: 'min(92vw, 600px)',
                  maxHeight: 'calc(100% - 8px)',
                  background: '#FFFFFF',
                  borderRadius: 16,
                  boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                  overflow: 'hidden',
                }}
              >
                {/* Card header */}
                <div
                  className="flex-none"
                  style={{ padding: '20px 24px 14px', borderBottom: '1px solid #F0EBE0' }}
                >
                  {isFirstInSubgroup && sg && (
                    <div
                      className="inline-flex items-center gap-1"
                      style={{
                        background: '#EAF2F8',
                        color: '#2980B9',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 20,
                        marginBottom: 10,
                      }}
                    >
                      <span>📌</span>
                      <span>{sg.name}</span>
                    </div>
                  )}
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 19,
                      fontWeight: 600,
                      color: '#2C3E50',
                      lineHeight: 1.3,
                    }}
                  >
                    {card.card_title}
                  </h2>
                </div>

                {/* Card body — scrollable, stops drag propagation so scroll works */}
                <div
                  className="flex-1 overflow-y-auto"
                  style={{
                    padding: '16px 24px 20px',
                    fontSize: 16,
                    color: '#2C2C2C',
                    lineHeight: 1.65,
                    touchAction: 'pan-y',
                  }}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <CardMarkdown content={card.content} />

                  {/* Last card CTA */}
                  {index === total - 1 && (
                    <div style={{ marginTop: 24, textAlign: 'center' }}>
                      <a
                        href={`/revise/${level}`}
                        style={{ color: '#2980B9', fontSize: 14, fontWeight: 500 }}
                      >
                        ↩ Back to {topic}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Swipe hint — fades after first swipe */}
          {showHint && total > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-20">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.75, 0.75, 0] }}
                transition={{ delay: 1.2, duration: 2.5, times: [0, 0.2, 0.8, 1] }}
                style={{
                  fontSize: 12,
                  color: '#777',
                  background: 'rgba(255,255,255,0.88)',
                  padding: '5px 14px',
                  borderRadius: 20,
                  boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
                }}
              >
                swipe up ↑
              </motion.span>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div
          className="flex-none flex items-center justify-center gap-3 px-4"
          style={{ height: 52 }}
        >
          <button
            onClick={goPrev}
            disabled={index === 0}
            className="p-1.5 rounded-full transition-opacity disabled:opacity-20"
            style={{ color: '#999' }}
            aria-label="Previous card"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex items-center gap-1.5">
            {cards.map((_, i) => {
              const dist = Math.abs(i - index);
              if (dist > 4) return null;
              return (
                <button
                  key={i}
                  onClick={() => goTo(i, i > index ? 1 : -1)}
                  aria-label={`Go to card ${i + 1}`}
                  className="rounded-full flex-none transition-all duration-200"
                  style={{
                    width: i === index ? 20 : dist === 1 ? 7 : 5,
                    height: i === index ? 6 : dist === 1 ? 7 : 5,
                    background: i === index ? '#2980B9' : '#C8B89A',
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={goNext}
            disabled={index === total - 1}
            className="p-1.5 rounded-full transition-opacity disabled:opacity-20"
            style={{ color: '#999' }}
            aria-label="Next card"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
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
