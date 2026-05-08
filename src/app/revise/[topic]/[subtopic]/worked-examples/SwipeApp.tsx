'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimation, type PanInfo } from 'framer-motion';
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

const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

// ── Shared markdown renderer ──────────────────────────────────────────────────
function CardMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content}
    </ReactMarkdown>
  );
}

// ── Desktop list view ─────────────────────────────────────────────────────────
function DesktopView({
  cards,
  subgroups,
  level,
  topic,
}: Props) {
  // Group cards by subgroup_id, preserving order
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
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <a
          href={`/revise/${level}`}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-none"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{topic}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{cards.length} worked examples</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {groups.map(({ sgId, cards: groupCards }) => {
          const sg = subgroups[sgId];
          return (
            <section key={sgId} id={`sg-${sgId}`}>
              {/* Sub-group heading */}
              {sg && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-base">📌</span>
                  <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                    {sg.name}
                  </h2>
                </div>
              )}

              <div className="space-y-4">
                {groupCards.map((card) => (
                  <article
                    key={card.id}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                  >
                    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                      <h3 className="text-base font-semibold text-gray-900 leading-snug">
                        {card.card_title}
                      </h3>
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

        {/* Footer CTA */}
        <div className="text-center pt-4 pb-8">
          <a
            href={`/revise/${level}`}
            className="text-indigo-600 text-sm font-medium hover:underline"
          >
            ↩ Back to {topic}
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Mobile swipe view ─────────────────────────────────────────────────────────
function MobileSwipeView({
  cards,
  subgroups,
  level,
  topic,
}: Props) {
  const [index, setIndex] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const controls = useAnimation();
  const isAnimating = useRef(false);

  const total = cards.length;
  const card = cards[index];
  const nextCard = index < total - 1 ? cards[index + 1] : null;

  const goTo = useCallback(
    async (newIndex: number, dir: 'up' | 'down') => {
      if (isAnimating.current) return;
      if (newIndex < 0 || newIndex >= total) return;
      isAnimating.current = true;
      await controls.start({
        y: dir === 'up' ? -100 : 100,
        opacity: 0,
        transition: { duration: 0.22, ease: 'easeIn' },
      });
      setIndex(newIndex);
      await controls.set({ y: dir === 'up' ? 60 : -60, opacity: 0 });
      await controls.start({
        y: 0,
        opacity: 1,
        transition: { duration: 0.22, ease: 'easeOut' },
      });
      isAnimating.current = false;
    },
    [controls, total],
  );

  const goNext = useCallback(() => {
    setShowHint(false);
    goTo(index + 1, 'up');
  }, [goTo, index]);

  const goPrev = useCallback(() => {
    goTo(index - 1, 'down');
  }, [goTo, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.key === 'ArrowUp') goNext();
        else goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  function onPanEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -SWIPE_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD) {
      goNext();
    } else if (offset.y > SWIPE_THRESHOLD || velocity.y > VELOCITY_THRESHOLD) {
      goPrev();
    }
  }

  const isFirstInSubgroup =
    index === 0 || cards[index - 1].subgroup_id !== card.subgroup_id;
  const sg = subgroups[card.subgroup_id];

  return (
    <div
      className="md:hidden fixed inset-0 flex flex-col bg-white"
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      {/* Header */}
      <div className="flex-none px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
        <a
          href={`/revise/${level}`}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <h1 className="flex-1 text-sm font-semibold text-gray-700 truncate">{topic}</h1>
        <span className="text-sm text-gray-400 tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 relative overflow-hidden">
        {nextCard && (
          <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center pb-2 pointer-events-none z-0">
            <div className="w-full mx-4 h-10 bg-gray-50 rounded-t-xl shadow-sm border border-gray-100 opacity-60" />
          </div>
        )}

        <motion.div
          animate={controls}
          initial={{ y: 0, opacity: 1 }}
          onPanEnd={onPanEnd}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.15}
          className="absolute inset-0 mx-3 my-2 mb-14 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden z-10 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <div className="flex-none px-4 pt-4 pb-3 border-b border-gray-50">
            {isFirstInSubgroup && sg && (
              <div className="mb-2 inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">
                <span>📌</span>
                <span className="truncate max-w-[220px]">{sg.name}</span>
              </div>
            )}
            <h2 className="text-base font-semibold text-gray-800 leading-snug">
              {card.card_title}
            </h2>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={e => e.stopPropagation()}
          >
            <CardMarkdown content={card.content} />
          </div>

          {index === total - 1 && (
            <div className="flex-none px-4 py-3 border-t border-gray-100 text-center">
              <a
                href={`/revise/${level}`}
                className="text-indigo-600 text-sm font-medium hover:underline"
              >
                ↩ Back to {topic}
              </a>
            </div>
          )}
        </motion.div>

        {showHint && total > 1 && (
          <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0.6, 0] }}
              transition={{ delay: 0.8, duration: 2.5, times: [0, 0.2, 0.8, 1] }}
              className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full shadow-sm"
            >
              swipe up ↑
            </motion.span>
          </div>
        )}
      </div>

      {/* Progress dots + nav */}
      <div className="flex-none pb-4 flex items-center justify-center gap-3 px-4">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-20 transition-colors"
          aria-label="Previous card"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 overflow-hidden max-w-[200px]">
          {cards.map((_, i) => {
            const dist = Math.abs(i - index);
            if (dist > 4) return null;
            return (
              <button
                key={i}
                onClick={() => goTo(i, i > index ? 'up' : 'down')}
                aria-label={`Go to card ${i + 1}`}
                className="transition-all duration-200 rounded-full flex-none"
                style={{
                  width: i === index ? 20 : dist === 1 ? 7 : 5,
                  height: i === index ? 6 : dist === 1 ? 7 : 5,
                  backgroundColor: i === index ? '#4f46e5' : '#d1d5db',
                }}
              />
            );
          })}
        </div>

        <button
          onClick={goNext}
          disabled={index === total - 1}
          className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-20 transition-colors"
          aria-label="Next card"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
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
