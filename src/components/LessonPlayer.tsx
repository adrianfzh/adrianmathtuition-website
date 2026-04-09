'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepItem {
  tag?: string;
  math?: string;
  explain?: string;
  isFinal?: boolean;
}

interface Rule {
  0: string;
  1: string;
  length: number;
  [idx: number]: string;
}

interface Slide {
  type: 'title' | 'concept' | 'concept_text' | 'worked' | 'try' | 'summary';
  narration?: string;
  // title slide
  // concept / concept_text
  title?: string;
  subtitle?: string;
  rules?: [string, string][];
  note?: string;
  body?: string;  // concept_text prose
  // worked
  method?: string;
  question?: string;
  steps?: StepItem[];
  // try
  marks?: number;
  hint?: string;
  solution?: StepItem[];
  // summary
  points?: { text: string; color?: string }[];
}

interface LessonData {
  topic: string;
  subtopic: string;
  level: string;
  slides: Slide[];
}

interface Props {
  lessonData: LessonData;
}

// ─── KaTeX loader ─────────────────────────────────────────────────────────────

let katexLoaded = false;
let katexLoading: Promise<void> | null = null;

function loadKaTeX(): Promise<void> {
  if (katexLoaded) return Promise.resolve();
  if (katexLoading) return katexLoading;
  katexLoading = new Promise((resolve) => {
    if ((window as any).katex) { katexLoaded = true; resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => { katexLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
  return katexLoading;
}

function renderMath(latex: string, display = false): string {
  if (!(window as any).katex) return `<span class="math-fallback">${latex}</span>`;
  try {
    return (window as any).katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    });
  } catch {
    return `<span class="math-fallback">${latex}</span>`;
  }
}

// Render mixed text+math: $inline$ and $$display$$
function renderMixed(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\$([^$]+)\$\$/g, (_, m) => renderMath(m.trim(), true))
    .replace(/\$([^$\n]+)\$/g, (_, m) => renderMath(m.trim(), false));
}

// ─── Slide renderers ──────────────────────────────────────────────────────────

function TitleSlide({ slide, lessonData }: { slide: Slide; lessonData: LessonData }) {
  return (
    <div className="lp-slide lp-title-slide">
      <div className="lp-title-inner">
        <div className="lp-level-badge">{lessonData.level}</div>
        <h1 className="lp-title-topic" style={{ fontFamily: 'var(--font-display)' }}>
          {lessonData.topic}
        </h1>
        <h2 className="lp-title-subtopic">{lessonData.subtopic}</h2>
        <div className="lp-title-decoration" aria-hidden>
          {['∫', '∑', 'θ', 'π', '√', 'Δ'].map((c, i) => (
            <span key={i} className="lp-deco-char" style={{ animationDelay: `${i * 0.15}s` }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConceptSlide({ slide }: { slide: Slide }) {
  const isWarning = /warning|caution|note|common mistake/i.test(slide.title || '');
  return (
    <div className="lp-slide lp-concept-slide">
      <div className="lp-card">
        {isWarning ? (
          <div className="lp-warning-header">⚠️ {slide.title}</div>
        ) : (
          <h2 className="lp-card-title">{slide.title}</h2>
        )}
        {slide.subtitle && (
          <p className="lp-card-subtitle"
            dangerouslySetInnerHTML={{ __html: renderMixed(slide.subtitle) }} />
        )}
        {slide.rules && slide.rules.length > 0 && (
          <div className="lp-rules">
            {slide.rules.map((rule, i) => (
              <div key={i} className="lp-rule-row">
                <span className="lp-rule-from" dangerouslySetInnerHTML={{ __html: renderMixed(rule[0]) }} />
                <span className="lp-rule-arrow">→</span>
                <span className="lp-rule-to" dangerouslySetInnerHTML={{ __html: renderMixed(rule[1]) }} />
              </div>
            ))}
          </div>
        )}
        {slide.note && (
          <div className="lp-note-box" dangerouslySetInnerHTML={{ __html: renderMixed(slide.note) }} />
        )}
      </div>
    </div>
  );
}

function ConceptTextSlide({ slide }: { slide: Slide }) {
  return (
    <div className="lp-slide lp-concept-slide">
      <div className="lp-card">
        {slide.title && <h2 className="lp-card-title">{slide.title}</h2>}
        {slide.body && (
          <div className="lp-concept-body"
            dangerouslySetInnerHTML={{ __html: renderMixed(slide.body) }} />
        )}
        {slide.note && (
          <div className="lp-note-box" dangerouslySetInnerHTML={{ __html: renderMixed(slide.note) }} />
        )}
      </div>
    </div>
  );
}

function WorkedSlide({ slide }: { slide: Slide }) {
  const [revealed, setRevealed] = useState(0);
  const steps = slide.steps || [];
  const allRevealed = revealed >= steps.length;

  return (
    <div className="lp-slide lp-worked-slide">
      <div className="lp-card">
        <div className="lp-worked-header">
          <h2 className="lp-card-title">{slide.title}</h2>
          {slide.method && <p className="lp-method-tag">Method: {slide.method}</p>}
        </div>
        {slide.question && (
          <div className="lp-question-box">
            <div className="lp-question-label">Question</div>
            <div className="lp-question-math"
              dangerouslySetInnerHTML={{ __html: renderMixed(slide.question) }} />
          </div>
        )}
        <div className="lp-steps">
          {steps.slice(0, revealed).map((step, i) => (
            <div key={i} className={`lp-step ${step.isFinal ? 'lp-step-final' : ''}`}>
              {step.tag && <div className="lp-step-tag">{step.tag}</div>}
              {step.math && (
                <div className="lp-step-math"
                  dangerouslySetInnerHTML={{ __html: renderMixed(step.math) }} />
              )}
              {step.explain && <div className="lp-step-explain">{step.explain}</div>}
            </div>
          ))}
        </div>
        {!allRevealed && (
          <div className="lp-reveal-buttons">
            <button className="lp-btn-next-step" onClick={() => setRevealed(r => r + 1)}>
              Show next step →
            </button>
            <button className="lp-btn-show-all" onClick={() => setRevealed(steps.length)}>
              Show all
            </button>
          </div>
        )}
        {allRevealed && steps.length > 0 && (
          <button className="lp-btn-reset" onClick={() => setRevealed(0)}>↺ Reset</button>
        )}
      </div>
    </div>
  );
}

function TrySlide({ slide }: { slide: Slide }) {
  const [showSolution, setShowSolution] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const solution = slide.solution || [];

  return (
    <div className="lp-slide lp-try-slide">
      <div className="lp-card lp-try-card">
        <div className="lp-try-header">
          <h2 className="lp-card-title">{slide.title || 'Your Turn'}</h2>
          {slide.marks && (
            <span className="lp-marks-badge">[{slide.marks} mark{slide.marks !== 1 ? 's' : ''}]</span>
          )}
        </div>
        {slide.question && (
          <div className="lp-question-box lp-try-question">
            <div className="lp-question-math"
              dangerouslySetInnerHTML={{ __html: renderMixed(slide.question) }} />
          </div>
        )}
        {slide.hint && !showSolution && (
          <div className="lp-hint-area">
            {showHint ? (
              <div className="lp-hint-box">💡 {slide.hint}</div>
            ) : (
              <button className="lp-btn-hint" onClick={() => setShowHint(true)}>
                💡 Show hint
              </button>
            )}
          </div>
        )}
        {!showSolution ? (
          <button className="lp-btn-solution" onClick={() => setShowSolution(true)}>
            Show Solution
          </button>
        ) : (
          <div className="lp-solution">
            <div className="lp-solution-label">Solution</div>
            {solution.map((step, i) => (
              <div key={i} className={`lp-step ${step.isFinal ? 'lp-step-final' : ''}`}>
                {step.math && (
                  <div className="lp-step-math"
                    dangerouslySetInnerHTML={{ __html: renderMixed(step.math) }} />
                )}
                {step.explain && <div className="lp-step-explain">{step.explain}</div>}
              </div>
            ))}
            <button className="lp-btn-reset" onClick={() => { setShowSolution(false); setShowHint(false); }}>
              ↺ Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummarySlide({ slide }: { slide: Slide }) {
  const points = slide.points || [];
  return (
    <div className="lp-slide lp-summary-slide">
      <div className="lp-card">
        <h2 className="lp-card-title" style={{ fontFamily: 'var(--font-display)' }}>
          {slide.title || 'Key Takeaways'}
        </h2>
        <ul className="lp-summary-points">
          {points.map((pt, i) => (
            <li key={i} className="lp-summary-point">
              <span className="lp-point-dot" style={{ background: pt.color || 'var(--color-navy)' }} />
              <span dangerouslySetInnerHTML={{ __html: renderMixed(pt.text) }} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function renderSlide(slide: Slide, lessonData: LessonData) {
  switch (slide.type) {
    case 'title':   return <TitleSlide slide={slide} lessonData={lessonData} />;
    case 'concept':      return <ConceptSlide slide={slide} />;
    case 'concept_text': return <ConceptTextSlide slide={slide} />;
    case 'worked':       return <WorkedSlide slide={slide} />;
    case 'try':     return <TrySlide slide={slide} />;
    case 'summary': return <SummarySlide slide={slide} />;
    default:        return <ConceptSlide slide={slide} />;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LessonPlayer({ lessonData }: Props) {
  const slides = lessonData.slides || [];
  const total = slides.length;

  const [current, setCurrent] = useState(0);
  const [katexReady, setKatexReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [slideKey, setSlideKey] = useState(0); // forces slide remount on navigate

  const slideRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const scrollTopOnTouchStart = useRef(0);

  useEffect(() => {
    loadKaTeX().then(() => setKatexReady(true));
  }, []);

  // Re-render math when slide changes or katex loads
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (katexReady) forceUpdate(n => n + 1);
  }, [katexReady, current]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return;
    stopSpeaking();
    setCurrent(idx);
    setSlideKey(k => k + 1);
    slideRef.current?.scrollTo({ top: 0 });
  }, [total]);

  const prev = useCallback(() => goTo(current - 1), [current, goTo]);
  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  // ── Touch / swipe ────────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    scrollTopOnTouchStart.current = slideRef.current?.scrollTop ?? 0;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    const dx = Math.abs(touchStartX.current - e.changedTouches[0].clientX);
    if (Math.abs(dy) < 40 || dx > Math.abs(dy) * 0.8) return; // too small or horizontal

    const el = slideRef.current;
    if (!el) return;

    if (dy > 0) {
      // Swipe up → next slide: only if at bottom of scroll
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const didNotScroll = el.scrollTop === scrollTopOnTouchStart.current;
      if (atBottom || didNotScroll) next();
    } else {
      // Swipe down → prev slide: only if at top of scroll
      const atTop = el.scrollTop <= 0;
      const didNotScroll = el.scrollTop === scrollTopOnTouchStart.current;
      if (atTop || didNotScroll) prev();
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next();
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // ── TTS ───────────────────────────────────────────────────────────────────────
  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function toggleSpeak() {
    if (speaking) { stopSpeaking(); return; }
    const text = slides[current]?.narration;
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
  }

  useEffect(() => { return () => window.speechSynthesis?.cancel(); }, []);

  const progress = total > 1 ? (current / (total - 1)) * 100 : 100;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="lp-root">
        {/* Progress bar */}
        <div className="lp-progress-track">
          <div className="lp-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Top bar */}
        <div className="lp-topbar">
          <a href="/revise" className="lp-back-btn" onClick={stopSpeaking}>
            ←
          </a>
          <div className="lp-topbar-info">
            <span className="lp-topbar-topic">{lessonData.subtopic}</span>
          </div>
          <div className="lp-topbar-right">
            <span className="lp-slide-counter">{current + 1} / {total}</span>
            {slides[current]?.narration && (
              <button
                className={`lp-speak-btn ${speaking ? 'speaking' : ''}`}
                onClick={toggleSpeak}
                aria-label={speaking ? 'Stop narration' : 'Play narration'}
              >
                🔊
              </button>
            )}
          </div>
        </div>

        {/* Slide area */}
        <div
          className="lp-slide-area"
          ref={slideRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div key={slideKey} className="lp-slide-wrapper lp-slide-enter">
            {renderSlide(slides[current], lessonData)}
          </div>
        </div>

        {/* Bottom nav */}
        <div className="lp-bottombar">
          <button
            className="lp-nav-btn"
            onClick={prev}
            disabled={current === 0}
            aria-label="Previous slide"
          >
            ↑
          </button>

          <div className="lp-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={`lp-dot ${i === current ? 'active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            className="lp-nav-btn"
            onClick={next}
            disabled={current === total - 1}
            aria-label="Next slide"
          >
            ↓
          </button>
        </div>
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lp-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--color-background);
  font-family: var(--font-sans);
  color: var(--color-foreground);
  overflow: hidden;
  user-select: none;
}

/* Progress */
.lp-progress-track {
  height: 3px;
  background: var(--color-border);
  flex-shrink: 0;
}
.lp-progress-bar {
  height: 100%;
  background: var(--color-amber);
  transition: width 0.3s ease;
}

/* Top bar */
.lp-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 50px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-card);
}
.lp-back-btn {
  font-size: 20px;
  color: var(--color-muted-foreground);
  text-decoration: none;
  padding: 6px;
  margin: -6px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.lp-back-btn:hover { color: var(--color-navy); }
.lp-topbar-info { flex: 1; min-width: 0; }
.lp-topbar-topic {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-navy);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.lp-topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.lp-slide-counter {
  font-size: 13px;
  color: var(--color-muted-foreground);
  font-variant-numeric: tabular-nums;
}
.lp-speak-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.lp-speak-btn:hover, .lp-speak-btn.speaking { opacity: 1; }
.lp-speak-btn.speaking { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

/* Slide area */
.lp-slide-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
.lp-slide-wrapper {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* Slide enter animation */
.lp-slide-enter {
  animation: slideIn 0.22s ease-out;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Base slide */
.lp-slide {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 16px 16px;
}

/* ── Title slide ── */
.lp-title-slide {
  background: var(--color-navy);
  min-height: 100%;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.lp-title-inner { position: relative; z-index: 1; padding: 32px 24px; }
.lp-level-badge {
  display: inline-block;
  background: var(--color-amber);
  color: var(--color-navy);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 14px;
  border-radius: 20px;
  margin-bottom: 20px;
}
.lp-title-topic {
  font-size: clamp(28px, 7vw, 44px);
  color: white;
  line-height: 1.15;
  margin-bottom: 10px;
}
.lp-title-subtopic {
  font-size: clamp(16px, 4vw, 22px);
  color: rgba(255,255,255,0.7);
  font-weight: 400;
}
.lp-title-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.lp-deco-char {
  position: absolute;
  font-family: var(--font-display);
  font-size: clamp(60px, 12vw, 100px);
  color: rgba(255,255,255,0.04);
  animation: float 6s ease-in-out infinite;
}
.lp-deco-char:nth-child(1) { top: 5%;  left: 5%; }
.lp-deco-char:nth-child(2) { top: 10%; right: 8%; }
.lp-deco-char:nth-child(3) { top: 45%; left: 2%; }
.lp-deco-char:nth-child(4) { bottom: 15%; right: 5%; }
.lp-deco-char:nth-child(5) { bottom: 5%;  left: 15%; }
.lp-deco-char:nth-child(6) { top: 60%;  right: 15%; }
@keyframes float {
  0%,100% { transform: translateY(0) rotate(-5deg); }
  50%      { transform: translateY(-12px) rotate(5deg); }
}

/* ── Card (used by concept/worked/try/summary) ── */
.lp-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lp-card-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 4.5vw, 24px);
  color: var(--color-navy);
  line-height: 1.25;
}
.lp-card-subtitle {
  font-size: 15px;
  color: var(--color-muted-foreground);
  line-height: 1.65;
}
.lp-concept-body {
  font-size: 15px;
  color: var(--color-foreground);
  line-height: 1.75;
  white-space: pre-wrap;
}

/* ── Concept: warning variant ── */
.lp-warning-header {
  font-size: 16px;
  font-weight: 700;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  padding: 10px 14px;
}

/* ── Rules table ── */
.lp-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lp-rule-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-muted);
  border-radius: 10px;
  font-size: 15px;
}
.lp-rule-from { flex: 1; color: var(--color-muted-foreground); }
.lp-rule-arrow { font-size: 18px; color: var(--color-amber-dark); flex-shrink: 0; }
.lp-rule-to { flex: 1; font-weight: 700; color: var(--color-navy); }

/* Note box */
.lp-note-box {
  background: var(--color-amber-light);
  border-left: 3px solid var(--color-amber);
  border-radius: 0 8px 8px 0;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--color-amber-dark);
  line-height: 1.6;
}

/* ── Worked ── */
.lp-worked-header { display: flex; flex-direction: column; gap: 4px; }
.lp-method-tag {
  font-size: 13px;
  color: var(--color-muted-foreground);
  font-style: italic;
}

/* Question box */
.lp-question-box {
  border: 1px solid var(--color-border);
  border-top: 3px solid var(--color-navy);
  border-radius: 0 0 12px 12px;
  padding: 14px 16px;
  background: white;
}
.lp-question-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-muted-foreground);
  margin-bottom: 8px;
}
.lp-question-math {
  font-size: 16px;
  user-select: text;
  line-height: 1.8;
  overflow-x: auto;
}
.lp-question-math .katex-display { margin: 8px 0; }

/* Steps */
.lp-steps { display: flex; flex-direction: column; gap: 10px; }
.lp-step {
  border-left: 3px solid var(--color-border);
  padding: 10px 14px;
  border-radius: 0 8px 8px 0;
  background: var(--color-muted);
}
.lp-step-final {
  border-left-color: var(--color-amber);
  background: var(--color-amber-light);
}
.lp-step-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted-foreground);
  margin-bottom: 6px;
}
.lp-step-final .lp-step-tag { color: var(--color-amber-dark); }
.lp-step-math {
  font-size: 15px;
  user-select: text;
  overflow-x: auto;
  line-height: 1.8;
}
.lp-step-math .katex-display { margin: 6px 0; }
.lp-step-explain {
  font-size: 13px;
  color: var(--color-muted-foreground);
  margin-top: 4px;
  line-height: 1.5;
}

/* Reveal buttons */
.lp-reveal-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
.lp-btn-next-step {
  padding: 10px 18px;
  background: var(--color-navy);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: opacity 0.15s;
  flex: 1;
}
.lp-btn-next-step:hover { opacity: 0.88; }
.lp-btn-show-all {
  padding: 10px 14px;
  background: none;
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-muted-foreground);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: border-color 0.15s;
}
.lp-btn-show-all:hover { border-color: var(--color-navy); color: var(--color-navy); }
.lp-btn-reset {
  align-self: flex-start;
  padding: 8px 14px;
  background: none;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-muted-foreground);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: border-color 0.15s;
}
.lp-btn-reset:hover { border-color: var(--color-navy); color: var(--color-navy); }

/* ── Try (practice) slide ── */
.lp-try-card {
  border-top: 3px solid #16a34a;
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.lp-try-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.lp-marks-badge {
  font-size: 12px;
  font-weight: 600;
  color: #15803d;
  background: #dcfce7;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 4px;
}
.lp-try-question { background: white; }
.lp-hint-area { margin-top: -4px; }
.lp-btn-hint {
  background: none;
  border: 1.5px dashed var(--color-amber);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-amber-dark);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background 0.15s;
}
.lp-btn-hint:hover { background: var(--color-amber-light); }
.lp-hint-box {
  background: var(--color-amber-light);
  border: 1px solid var(--color-amber);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--color-amber-dark);
  line-height: 1.55;
}
.lp-btn-solution {
  width: 100%;
  padding: 12px;
  background: #15803d;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: opacity 0.15s;
}
.lp-btn-solution:hover { opacity: 0.88; }
.lp-solution { display: flex; flex-direction: column; gap: 8px; }
.lp-solution-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #15803d;
}

/* ── Summary ── */
.lp-summary-points {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lp-summary-point {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 15px;
  line-height: 1.6;
  user-select: text;
}
.lp-point-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

/* Math fallback */
.math-fallback {
  font-family: monospace;
  background: var(--color-muted);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-muted-foreground);
}

/* ── Bottom nav ── */
.lp-bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-card);
  flex-shrink: 0;
  gap: 12px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
}
.lp-nav-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border);
  background: var(--color-card);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-navy);
  flex-shrink: 0;
  transition: all 0.15s;
}
.lp-nav-btn:hover:not(:disabled) {
  background: var(--color-navy);
  color: white;
  border-color: var(--color-navy);
}
.lp-nav-btn:disabled { opacity: 0.25; cursor: default; }

/* Dots */
.lp-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: center;
  flex: 1;
  max-width: 240px;
}
.lp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: none;
  background: var(--color-border);
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}
.lp-dot.active {
  background: var(--color-amber);
  transform: scale(1.5);
}
.lp-dot:hover:not(.active) { background: var(--color-muted-foreground); }

/* KaTeX overrides */
.katex { font-size: 1em; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }

/* Desktop: constrain card width */
@media (min-width: 640px) {
  .lp-slide { padding: 32px 24px; align-items: center; }
  .lp-card { max-width: 600px; width: 100%; }
  .lp-title-inner { padding: 48px 32px; }
  .lp-bottombar { padding: 12px 32px; }
}
`;
