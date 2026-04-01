'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';

// ── Types ──────────────────────────────────────────────────────────────────

interface Visual {
  id: string;
  type: 'desmos' | 'svg' | 'steps';
  title: string;
  concept?: string;
  expressions?: string[];
  svg?: string;
  steps?: string[];
}

interface LessonStatus {
  hasMore: boolean;
  questionActive: boolean;
}

interface Section {
  userLabel: string | null;
  aiText: string;
  status: LessonStatus;
  practiceMode: boolean;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

// ── Global declarations ───────────────────────────────────────────────────

declare global {
  interface Window {
    katex: {
      renderToString: (math: string, opts: { displayMode: boolean; throwOnError: boolean }) => string;
    };
    Desmos: {
      GraphingCalculator: (el: HTMLElement, opts: object) => {
        setExpression: (expr: { id: string; latex: string; color: string }) => void;
      };
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractStatus(text: string): LessonStatus | null {
  const match = text.match(/\|\|\|STATUS:(\{[^}]+\})\|\|\|/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripStatus(text: string) {
  return text.replace(/\s*\|\|\|STATUS:\{[^}]+\}\|\|\|/g, '').trimEnd();
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'visual'; id: string }
  | { type: 'steps'; steps: string[] };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\[VISUAL:([^\]]+)\]|\[STEPS\]([\s\S]*?)\[\/STEPS\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const t = text.slice(lastIndex, match.index);
      if (t.trim()) segments.push({ type: 'text', content: t });
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'visual', id: match[1].trim() });
    } else if (match[2] !== undefined) {
      const steps = match[2].split(/\n?---\n?/).map((s) => s.trim()).filter(Boolean);
      segments.push({ type: 'steps', steps });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) segments.push({ type: 'text', content: remaining });
  return segments;
}

const ACTION_LABELS: Record<string, string> = {
  start: 'Start the lesson. Teach me the first concept.',
  next: 'Skip. Teach me the next concept.',
  hint: 'Give me a hint.',
  example: 'Show me a worked example.',
  explain: 'Explain this concept in more depth. Why does it work? What is the theory behind it?',
  practice: 'Give me a practice question.',
  solution: 'Show me the full solution.',
  more: 'Give me another similar question.',
};

const SUBJECT_LABELS: Record<string, string> = {
  AM: 'A-Math',
  EM: 'E-Math',
  JC: 'H2 Math',
};

const DESMOS_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed'];

// ── KaTeX renderer (runs client-side after KaTeX loads) ──────────────────

function renderTextAndLatex(el: HTMLElement, text: string) {
  text = text.replace(/`([^`\n]+)`/g, '$$$1$');
  let html = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

  if (typeof window !== 'undefined' && window.katex) {
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
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

// ── Steps block builder ───────────────────────────────────────────────────

function buildStepsBlock(steps: string[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lrn-steps';

  const stepEls = steps.map((step, i) => {
    const el = document.createElement('div');
    el.className = 'lrn-step-item';
    el.style.display = i === 0 ? 'block' : 'none';
    renderTextAndLatex(el, step);
    container.appendChild(el);
    return el;
  });

  if (steps.length <= 1) return container;

  let visible = 1;
  const btn = document.createElement('button');
  btn.className = 'lrn-step-btn';
  btn.textContent = `Next step ▶ (1/${steps.length})`;
  btn.onclick = () => {
    if (visible >= steps.length) return;
    stepEls[visible].style.display = 'block';
    stepEls[visible].classList.add('lrn-fade-in');
    visible++;
    if (visible >= steps.length) {
      btn.textContent = '✅ All steps shown';
      btn.disabled = true;
    } else {
      btn.textContent = `Next step ▶ (${visible}/${steps.length})`;
    }
    stepEls[visible - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  container.appendChild(btn);
  return container;
}

// ── Content renderer ──────────────────────────────────────────────────────

function renderContent(
  text: string,
  container: HTMLElement,
  visualsMap: Record<string, Visual>
) {
  const segments = parseSegments(text);

  for (const seg of segments) {
    if (seg.type === 'text') {
      const div = document.createElement('div');
      renderTextAndLatex(div, seg.content);
      container.appendChild(div);

    } else if (seg.type === 'visual') {
      const visual = visualsMap[seg.id];
      if (!visual) continue;

      if (visual.type === 'desmos') {
        const wrapper = document.createElement('div');
        wrapper.className = 'lrn-desmos';
        container.appendChild(wrapper);
        const exprs = visual.expressions ?? [];
        const tryInit = (attempts: number) => {
          if (typeof window !== 'undefined' && window.Desmos) {
            try {
              const calc = window.Desmos.GraphingCalculator(wrapper, {
                expressions: false,
                keypad: false,
                settingsMenu: false,
                zoomButtons: true,
                border: false,
                expressionsTopbar: false,
              });
              exprs.forEach((expr, i) => {
                calc.setExpression({ id: `e${i}`, latex: expr.trim(), color: DESMOS_COLORS[i % 4] });
              });
            } catch {
              wrapper.textContent = '📊 Graph unavailable';
            }
          } else if (attempts < 20) {
            setTimeout(() => tryInit(attempts + 1), 200);
          } else {
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.padding = '0 16px';
            wrapper.style.color = 'hsl(220,10%,46%)';
            wrapper.style.fontSize = '14px';
            wrapper.textContent = '📊 Graph unavailable in this browser';
          }
        };
        requestAnimationFrame(() => tryInit(0));

      } else if (visual.type === 'svg') {
        const wrapper = document.createElement('div');
        wrapper.className = 'lrn-svg';
        const clean = (visual.svg ?? '').replace(/<script[\s\S]*?<\/script>/gi, '');
        wrapper.innerHTML = clean;
        container.appendChild(wrapper);

      } else if (visual.type === 'steps') {
        container.appendChild(buildStepsBlock(visual.steps ?? []));
      }

    } else if (seg.type === 'steps') {
      container.appendChild(buildStepsBlock(seg.steps));
    }
  }
}

/* ── User scroll intent flag (module-level, survives re-renders) ── */
let lrnUserHasScrolledUp = false;

// ── Main component (inner) ────────────────────────────────────────────────

function LearnInner() {
  const params = useSearchParams();
  const router = useRouter();

  const subject = params.get('subject') ?? 'AM';
  const topic = params.get('topic') ?? 'Differentiation';
  const subjectLabel = SUBJECT_LABELS[subject] ?? subject;

  // ── State ──
  const [initDone, setInitDone] = useState(false);
  const [subtopics, setSubtopics] = useState<string[]>([]);
  const [lessonStarted, setLessonStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [katexReady, setKatexReady] = useState(false);

  // Action area re-render trigger
  const [actionTick, setActionTick] = useState(0);

  // ── Refs (mutable, no re-render needed) ──
  const visualsMapRef = useRef<Record<string, Visual>>({});
  const conversationRef = useRef<HistoryEntry[]>([]);
  const lessonStatusRef = useRef<LessonStatus>({ hasMore: true, questionActive: false });
  const practiceModeRef = useRef(false);
  const sectionsRef = useRef<Section[]>([]);
  const currentIndexRef = useRef(-1);
  const isLoadingRef = useRef(false);

  // DOM refs
  const messagesRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subtopicSelectRef = useRef<HTMLSelectElement>(null);

  // ── Init: fetch metadata ──
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, topic, action: 'init' }),
        });
        if (resp.ok) {
          const meta = await resp.json();
          (meta.visuals ?? []).forEach((v: Visual) => { visualsMapRef.current[v.id] = v; });
          setSubtopics(meta.subtopics ?? []);
        }
      } catch { /* proceed */ }
      setInitDone(true);
    })();
  }, [subject, topic]);

  // ── Scroll helpers ──
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    lrnUserHasScrolledUp = false;
    el.scrollTop = el.scrollHeight;
  }, []);

  const scrollToBottomIfNear = useCallback(() => {
    const el = scrollRef.current;
    if (!el || lrnUserHasScrolledUp) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // ── Scroll intent listener ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      lrnUserHasScrolledUp = !isNearBottom;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // ── Render a section into messagesRef ──
  const renderSection = useCallback((section: Section) => {
    if (!messagesRef.current) return;
    messagesRef.current.innerHTML = '';

    if (section.userLabel) {
      const g = document.createElement('div');
      g.className = 'lrn-msg-group lrn-user';
      g.innerHTML = `<div class="lrn-bubble lrn-bubble-user">${escapeHtml(section.userLabel)}</div>`;
      messagesRef.current.appendChild(g);
    }

    const botGroup = document.createElement('div');
    botGroup.className = 'lrn-msg-group lrn-bot';
    const bubble = document.createElement('div');
    bubble.className = 'lrn-bubble lrn-bubble-bot';
    const content = document.createElement('div');
    bubble.appendChild(content);
    botGroup.appendChild(bubble);
    messagesRef.current.appendChild(botGroup);

    renderContent(section.aiText, content, visualsMapRef.current);
    scrollToBottom();
  }, [scrollToBottom]);

  const displaySection = useCallback((index: number) => {
    const sections = sectionsRef.current;
    if (index < 0 || index >= sections.length) return;
    currentIndexRef.current = index;
    const section = sections[index];
    lessonStatusRef.current = { ...section.status };
    practiceModeRef.current = section.practiceMode;
    renderSection(section);
    setActionTick((t) => t + 1);
  }, [renderSection]);

  // ── Call API (SSE) ──
  const callLearn = useCallback(async ({
    action,
    studentAnswer,
    userLabel,
    _startMessage,
  }: {
    action: string;
    studentAnswer?: string;
    userLabel?: string | null;
    _startMessage?: string;
  }) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    // Show user bubble
    if (userLabel && messagesRef.current) {
      const g = document.createElement('div');
      g.className = 'lrn-msg-group lrn-user';
      g.innerHTML = `<div class="lrn-bubble lrn-bubble-user">${escapeHtml(userLabel)}</div>`;
      messagesRef.current.appendChild(g);
      scrollToBottom();
    }

    // Typing indicator
    const typingGroup = document.createElement('div');
    typingGroup.className = 'lrn-msg-group lrn-bot';
    typingGroup.id = 'lrn-typing';
    typingGroup.innerHTML = `<div class="lrn-typing"><div class="lrn-dot"></div><div class="lrn-dot"></div><div class="lrn-dot"></div></div>`;
    if (messagesRef.current) {
      messagesRef.current.appendChild(typingGroup);
      scrollToBottom();
    }

    let fullText = '';

    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject, topic, action, studentAnswer,
          conversationHistory: conversationRef.current,
          _startMessage,
        }),
      });

      if (!res.ok) throw new Error('HTTP error');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.visuals) {
              parsed.visuals.forEach((v: Visual) => { visualsMapRef.current[v.id] = v; });
            }
            if (parsed.chunk) fullText += parsed.chunk;
          } catch { /* skip */ }
        }
      }
    } catch {
      typingGroup.remove();
      if (messagesRef.current) {
        const g = document.createElement('div');
        g.className = 'lrn-msg-group lrn-bot';
        g.innerHTML = `<div class="lrn-bubble lrn-bubble-bot" style="color:hsl(0,60%,45%);font-size:15px;">Something went wrong. Please try again.</div>`;
        messagesRef.current.appendChild(g);
        scrollToBottomIfNear();
      }
      isLoadingRef.current = false;
      setIsLoading(false);
      setActionTick((t) => t + 1);
      return;
    }

    // Parse status
    const status = extractStatus(fullText);
    if (status) lessonStatusRef.current = status;
    const cleanText = stripStatus(fullText);

    // Remove typing, render bot response
    typingGroup.remove();
    if (messagesRef.current) {
      const botGroup = document.createElement('div');
      botGroup.className = 'lrn-msg-group lrn-bot';
      const bubble = document.createElement('div');
      bubble.className = 'lrn-bubble lrn-bubble-bot';
      const contentDiv = document.createElement('div');
      bubble.appendChild(contentDiv);
      botGroup.appendChild(bubble);
      messagesRef.current.appendChild(botGroup);
      renderContent(cleanText, contentDiv, visualsMapRef.current);
      lrnUserHasScrolledUp = false;
      scrollToBottomIfNear();
    }

    // Update conversation history (keep last 20)
    const userContent =
      action === 'answer' ? (studentAnswer ?? '') : (ACTION_LABELS[action] ?? action);
    conversationRef.current.push({ role: 'user', content: userContent });
    conversationRef.current.push({ role: 'assistant', content: cleanText });
    if (conversationRef.current.length > 20) {
      conversationRef.current = conversationRef.current.slice(conversationRef.current.length - 20);
    }

    // Save section
    sectionsRef.current.push({
      userLabel: userLabel ?? null,
      aiText: cleanText,
      status: { ...lessonStatusRef.current },
      practiceMode: practiceModeRef.current,
    });
    currentIndexRef.current = sectionsRef.current.length - 1;

    isLoadingRef.current = false;
    setIsLoading(false);
    setActionTick((t) => t + 1);
  }, [subject, topic, scrollToBottom, scrollToBottomIfNear]);

  // ── Start lesson ──
  const startLesson = useCallback(() => {
    const subtopic = subtopicSelectRef.current?.value ?? '';
    setLessonStarted(true);
    const startMessage = subtopic
      ? `Start the lesson focusing on: ${subtopic}. Skip other sub-topics.`
      : 'Start the lesson. Teach me the first concept.';
    callLearn({ action: 'start', _startMessage: startMessage });
  }, [callLearn]);

  // ── Answer submit ──
  const submitAnswer = useCallback((ta: HTMLTextAreaElement) => {
    const val = ta.value.trim();
    if (!val || isLoadingRef.current) return;
    callLearn({ action: 'answer', studentAnswer: val, userLabel: val });
  }, [callLearn]);

  // ── Action buttons (imperative DOM — mirrors old HTML logic exactly) ──
  const actionWrapperRef = useRef<HTMLDivElement>(null);

  const updateActionButtons = useCallback(() => {
    const wrapper = actionWrapperRef.current;
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const sections = sectionsRef.current;
    const curIdx = currentIndexRef.current;
    const hasPrev = curIdx > 0;
    const hasNext = curIdx < sections.length - 1;
    const isLatest = curIdx === sections.length - 1;
    const status = lessonStatusRef.current;
    const practice = practiceModeRef.current;

    const mkSecondary = (label: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.className = 'lrn-btn-secondary';
      btn.textContent = label;
      btn.disabled = isLoadingRef.current;
      btn.onclick = onClick;
      return btn;
    };

    const mkPrimary = (label: string, onClick: () => void, fullWidth = false) => {
      const btn = document.createElement('button');
      btn.className = fullWidth ? 'lrn-btn-primary lrn-btn-full' : 'lrn-btn-primary';
      btn.textContent = label;
      btn.disabled = isLoadingRef.current;
      btn.onclick = onClick;
      return btn;
    };

    if (!isLatest) {
      // Viewing old section — only nav buttons
      const row = document.createElement('div');
      row.className = 'lrn-nav-row';
      if (hasPrev) row.appendChild(mkSecondary('← Previous', () => displaySection(curIdx - 1)));
      if (hasNext) row.appendChild(mkSecondary('Next →', () => displaySection(curIdx + 1)));
      wrapper.appendChild(row);
      return;
    }

    if (status.questionActive && !practice) {
      // Question active in lesson mode
      wrapper.appendChild(buildAnswerRowEl());
      const sec = document.createElement('div');
      sec.className = 'lrn-secondary-btns';
      if (hasPrev) sec.appendChild(mkSecondary('← Previous', () => displaySection(curIdx - 1)));
      sec.appendChild(mkSecondary('💡 Hint', () => callLearn({ action: 'hint', userLabel: 'Give me a hint' })));
      sec.appendChild(mkSecondary('⏭ Skip', () => callLearn({ action: 'next', userLabel: 'Skip — show me the next concept' })));
      sec.appendChild(mkSecondary('📖 Example', () => callLearn({ action: 'example', userLabel: 'Show me an example' })));
      sec.appendChild(mkSecondary('🔍 Explain more', () => callLearn({ action: 'explain', userLabel: 'Explain more' })));
      wrapper.appendChild(sec);

    } else if (practice) {
      // Practice mode
      wrapper.appendChild(buildAnswerRowEl());
      const sec = document.createElement('div');
      sec.className = 'lrn-secondary-btns';
      if (hasPrev) sec.appendChild(mkSecondary('← Previous', () => displaySection(curIdx - 1)));
      sec.appendChild(mkSecondary('💡 Hint', () => callLearn({ action: 'hint', userLabel: 'Give me a hint' })));
      sec.appendChild(mkSecondary('✅ Solution', () => callLearn({ action: 'solution', userLabel: 'Show full solution' })));
      sec.appendChild(mkSecondary('🔁 Another', () => callLearn({ action: 'more', userLabel: 'Give me another question' })));
      wrapper.appendChild(sec);

    } else if (status.hasMore) {
      // Has more concepts
      wrapper.appendChild(mkPrimary('Continue →', () => callLearn({ action: 'next', userLabel: 'Continue' }), true));
      const sec = document.createElement('div');
      sec.className = 'lrn-secondary-btns';
      if (hasPrev) sec.appendChild(mkSecondary('← Previous', () => displaySection(curIdx - 1)));
      sec.appendChild(mkSecondary('🏋️ Practice', () => {
        practiceModeRef.current = true;
        callLearn({ action: 'practice', userLabel: 'Give me a practice question' });
      }));
      sec.appendChild(mkSecondary('🔍 Explain more', () => callLearn({ action: 'explain', userLabel: 'Explain more' })));
      sec.appendChild(mkSecondary('📖 Example', () => callLearn({ action: 'example', userLabel: 'Show me an example' })));
      wrapper.appendChild(sec);

    } else {
      // Lesson complete
      wrapper.appendChild(mkPrimary('🏋️ Practice Question', () => {
        practiceModeRef.current = true;
        callLearn({ action: 'practice', userLabel: 'Give me a practice question' });
      }, true));
      const sec = document.createElement('div');
      sec.className = 'lrn-secondary-btns';
      if (hasPrev) sec.appendChild(mkSecondary('← Previous', () => displaySection(curIdx - 1)));
      sec.appendChild(mkSecondary('🔄 Start Over', () => {
        conversationRef.current = [];
        lessonStatusRef.current = { hasMore: true, questionActive: false };
        practiceModeRef.current = false;
        sectionsRef.current = [];
        currentIndexRef.current = -1;
        if (messagesRef.current) messagesRef.current.innerHTML = '';
        callLearn({ action: 'start' });
      }));
      wrapper.appendChild(sec);
    }
  }, [callLearn, displaySection]);

  function buildAnswerRowEl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lrn-answer-row';

    const ta = document.createElement('textarea');
    ta.className = 'lrn-answer-input';
    ta.placeholder = 'Your answer…';
    ta.rows = 1;
    ta.disabled = isLoadingRef.current;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer(ta); }
    });

    const btn = document.createElement('button');
    btn.className = 'lrn-btn-primary';
    btn.textContent = 'Submit';
    btn.disabled = isLoadingRef.current;
    btn.onclick = () => submitAnswer(ta);

    row.appendChild(ta);
    row.appendChild(btn);
    requestAnimationFrame(() => ta.focus());
    return row;
  }

  // Re-render action buttons when tick changes
  useEffect(() => {
    if (lessonStarted) updateActionButtons();
  }, [actionTick, lessonStarted, updateActionButtons]);

  return (
    <>
      {/* KaTeX */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        strategy="afterInteractive"
        onLoad={() => setKatexReady(true)}
      />
      {/* Desmos */}
      <Script
        src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
        strategy="afterInteractive"
      />

      {/* ── Nav ── */}
      <nav className="lrn-nav">
        <div className="lrn-nav-container">
          <div className="lrn-nav-left">
            <button className="lrn-back-btn" onClick={() => router.back()} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="lrn-nav-topic">{topic}</span>
          </div>
          <span className="lrn-nav-subject">{subjectLabel}</span>
        </div>
      </nav>

      {/* ── Scroll area ── */}
      <div className="lrn-scroll" ref={scrollRef}>
        <div className="lrn-inner">

          {/* Start screen */}
          {!lessonStarted && (
            <div className="lrn-start-screen">
              <div className="lrn-start-icon">📐</div>
              <div>
                <div className="lrn-start-topic">{topic}</div>
                <div className="lrn-start-subject">{subjectLabel}</div>
              </div>

              {subtopics.length > 0 && (
                <div className="lrn-subtopic-picker">
                  <h2 className="lrn-subtopic-heading">What would you like to learn?</h2>
                  <select className="lrn-subtopic-select" ref={subtopicSelectRef}>
                    <option value="">Start from the beginning</option>
                    {subtopics.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                className="lrn-btn-start"
                disabled={!initDone}
                onClick={startLesson}
              >
                {initDone ? 'Start Lesson →' : 'Loading…'}
              </button>
            </div>
          )}

          {/* Messages container */}
          <div ref={messagesRef} />
        </div>
      </div>

      {/* ── Action area ── */}
      {lessonStarted && (
        <div className="lrn-action-area">
          <div className="lrn-action-wrapper" ref={actionWrapperRef} />
        </div>
      )}

      {/* Suppress unused-var warning for katexReady */}
      {katexReady && null}
    </>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────

export default function LearnPage() {
  return (
    <div className="lrn-root">
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
          <p style={{ color: 'hsl(220,10%,46%)' }}>Loading…</p>
        </div>
      }>
        <LearnInner />
      </Suspense>
    </div>
  );
}
