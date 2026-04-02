'use client';

import Script from 'next/script';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';


interface Section {
  title: string;
  content: string;
  isPractice?: boolean;
  isSyllabus?: boolean;
}

const SUBJECT_LABELS: Record<string, string> = {
  AM: 'A-Math (O-Level)',
  EM: 'E-Math (O-Level)',
  JC: 'H2 Math (A-Level)',
};

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseSections(content: string, topic: string): Section[] {
  if (!content.trim()) return [];
  const result: Section[] = [];
  let preHeadingContent = '';

  const parts = content.split(/(?=\*\*\d+[\.:]\s)/);
  for (const part of parts) {
    if (!part.trim()) continue;
    const titleMatch = part.match(/^\*\*(?:\d+[\.:]\s*)?(.+?)\*\*/);
    if (titleMatch) {
      const body = part.replace(/^\*\*[^*\n]+\*\*\s*\n?/, '').trim();
      result.push({ title: titleMatch[1].trim(), content: body });
    } else if (result.length === 0 && part.trim()) {
      preHeadingContent = part.trim();
    }
  }

  // Prepend any content that appeared before the first numbered heading
  if (preHeadingContent && result.length > 0) {
    result[0] = { ...result[0], content: (preHeadingContent + '\n\n' + result[0].content).trim() };
  }

  if (result.length === 0) {
    return [{ title: topic || 'Notes', content: content.trim() }];
  }

  // Synthesise Practice tab from [Try:...] / [Practice:...] blocks
  const practiceItems: { source: string; block: string }[] = [];
  result.forEach(sec => {
    const re = /\[(?:Try|Practice):\s*([\s\S]*?)\]/g;
    let m;
    while ((m = re.exec(sec.content)) !== null) {
      practiceItems.push({ source: sec.title, block: m[0] });
    }
  });

  const practiceIdx = result.findIndex(s => /^practice\s*(questions)?$/i.test(s.title.trim()));
  if (practiceIdx > -1) {
    // Explicit Practice/Practice Questions section — make it the orange Practice tab
    result[practiceIdx].isPractice = true;
    result[practiceIdx].title = 'Practice';
    // Append [Try:] blocks from other sections
    const tryItems = practiceItems.filter((_, i) => result[i]?.title !== result[practiceIdx].title);
    if (tryItems.length > 0) {
      result[practiceIdx].content = (result[practiceIdx].content + '\n\n' + tryItems.map(p => `[FROM:${p.source}]\n${p.block}`).join('\n\n')).trim();
    }
    // Move to just before Syllabus (or end)
    const syllIdx = result.findIndex(s => /syllabus/i.test(s.title));
    if (syllIdx > -1 && practiceIdx !== syllIdx - 1) {
      const [prac] = result.splice(practiceIdx, 1);
      const newSyllIdx = result.findIndex(s => /syllabus/i.test(s.title));
      result.splice(newSyllIdx > -1 ? newSyllIdx : result.length, 0, prac);
    }
  } else if (practiceItems.length > 0) {
    // No explicit section — auto-generate from [Try:] blocks
    const practiceContent = practiceItems.map(p => `[FROM:${p.source}]\n${p.block}`).join('\n\n');
    const syllIdx = result.findIndex(s => /syllabus/i.test(s.title));
    const insertAt = syllIdx > -1 ? syllIdx : result.length;
    result.splice(insertAt, 0, { title: 'Practice', content: practiceContent, isPractice: true });
  }

  // Move Syllabus to end
  const syllabusIdx = result.findIndex(s => /syllabus/i.test(s.title));
  if (syllabusIdx > -1 && syllabusIdx < result.length - 1) {
    const [syl] = result.splice(syllabusIdx, 1);
    syl.isSyllabus = true;
    result.push(syl);
  } else if (syllabusIdx > -1) {
    result[syllabusIdx].isSyllabus = true;
  }

  return result;
}

function renderMarkdown(text: string): string {
  const blocks: string[] = [];
  const leftBlocks = new Set<number>();
  const inlines: string[] = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
    const isLeft = m.startsWith('left ');
    const formula = isLeft ? m.slice(5) : m;
    const idx = blocks.length;
    blocks.push(formula);
    if (isLeft) leftBlocks.add(idx);
    return `%%B${idx}%%`;
  });
  text = text.replace(/\$([^$\n]{1,300}?)\$/g, (_, m) => { inlines.push(m); return `%%I${inlines.length - 1}%%`; });

  text = text.replace(/^```[^\n]*$/gm, '');
  text = text.replace(/\[FROM:([^\]]+)\]/g, '<div class="from-section">$1</div>');

  // Part labels: (a), (b), (c), (i), (ii), (iii) etc. at start of line
  // Trailing [N] or [N marks] extracted as 3rd flex item for right-edge alignment
  text = text.replace(
    /^(?:\*\*Part\s*\(([a-z]+)\)[:\.]?\*\*|Part\s*\(([a-z]+)\)[:\.]?|\*\*\(([a-z]+)\)\*\*|\(([a-z]+)\))\s*(.*)?$/gm,
    (whole, a1, a2, a3, a4, rest = '') => {
      const letter = a1 || a2 || a3 || a4;
      const validRoman = /^(i{1,3}|iv|vi{0,3}|ix|x)$/;
      if (!/^[a-z]$/.test(letter) && !validRoman.test(letter)) return whole;
      const marksMatch = rest.trim().match(/^([\s\S]*?)\s*\[(\d{1,2})(?:\s*marks?)?\]\s*$/);
      if (marksMatch) {
        return `<div class="part-header-row"><span class="part-label">(${letter})</span><span class="part-first-line">${marksMatch[1].trim()}</span><span class="marks-badge">[${marksMatch[2]}]</span></div>`;
      }
      return `<div class="part-header-row"><span class="part-label">(${letter})</span><span class="part-first-line">${rest.trim()}</span></div>`;
    }
  );

  // Step blocks processed BEFORE card split so they don't confuse boundary detection
  text = text.replace(/^(?:\*\*)?Step\s*(\d+):(?:\*\*)?\s*(.*)$/gm,
    (_, n, content) => `<div class="step-block"><span class="step-pill">Step ${n}</span>${content.trim() ? ' ' + content.trim() : ''}</div>`);

  // Card wrapping: Solution cards nested inside Example cards via state machine.
  // Example opens an example-card div; Solution opens a solution-card div INSIDE it.
  // Section headings (##, **N.) close both. A new Example closes any open cards first.
  {
    const lines = text.split('\n');
    const output: string[] = [];
    let inExample = false;
    let inSolution = false;

    for (const line of lines) {
      const isExampleStart = /^\*\*(Example)(?:\s+\d+)?[:\.]?(?:\s+[^*]*)?\*\*/.test(line);
      const isSolutionStart = /^\*\*(Solution)(?:\s+\d+)?[:\.]?\*\*/.test(line);
      const isSectionStart = /^\*\*\d+[\.:]+\s/.test(line) || /^##\s/.test(line);

      if (isSectionStart) {
        if (inSolution) { output.push('</div>'); inSolution = false; }
        if (inExample) { output.push('</div>'); inExample = false; }
        output.push(line);
      } else if (isExampleStart) {
        if (inSolution) { output.push('</div>'); inSolution = false; }
        if (inExample) { output.push('</div>'); inExample = false; }
        const titleMatch = line.match(/^\*\*Example(?:\s+\d+)?[:\.]?(?:\s+([^*]*))?\*\*(.*)$/);
        const title = titleMatch?.[1]?.trim() || '';
        const rest = titleMatch?.[2]?.trim() || '';
        const titleHtml = title ? `<div style="font-weight:600;font-size:16px;color:#1b2a4a;margin-bottom:8px;">${title}</div>` : '';
        output.push(`<div class="example-card"><div class="example-card-label">Example</div>${titleHtml}`);
        if (rest) output.push(rest);
        inExample = true;
      } else if (isSolutionStart) {
        if (inSolution) { output.push('</div>'); inSolution = false; }
        const rest = line.replace(/^\*\*Solution(?:\s+\d+)?[:\.]?\*\*\s*/, '').trim();
        output.push(`<div class="solution-card"><div class="solution-card-label">Solution</div>`);
        if (rest) output.push(rest);
        inSolution = true;
      } else {
        output.push(line);
      }
    }

    if (inSolution) output.push('</div>');
    if (inExample) output.push('</div>');

    text = output.join('\n');
  }

  // Try/Practice with optional trailing [N marks]
  text = text.replace(/\[(?:Try|Practice):\s*([\s\S]*?)\](?:\s*\[(\d+)\s*marks?\])?/g,
    (_, q, marks) => {
      const marksHtml = marks ? `<span class="marks-badge">[${marks} mark${marks === '1' ? '' : 's'}]</span>` : '';
      return `<div class="practice-callout">${marksHtml}<div class="practice-callout-label">Try this</div>${q.trim()}</div>`;
    }
  );

  text = text.replace(/\[Ans(?:wer)?:\s*([\s\S]*?)\]/g, (_, ans) =>
    `<div class="answer-spoiler" onclick="this.classList.toggle('revealed')" title="Click to reveal"><span class="reveal-label">Tap to reveal answer</span><span class="answer-text">${ans.trim()}</span></div>`
  );

  text = text.replace(/\*\*Note:\*\*\s*([^\n]+)/g, '<div class="note-box"><strong>Note:</strong> $1</div>');

  text = text.replace(/((?:^\|.+\|\s*\n)+)/gm, tableBlock => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    let html = '<table>';
    rows.forEach((row, i) => {
      if (/^\|[-| :]+\|/.test(row)) return;
      const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    });
    html += '</table>';
    return html;
  });

  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^---+$/gm, '<hr>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // Practice question numbers: Q1. Q2. Q3. etc.
  // If content starts with a part label like (i) or (a), render Q number and part on same line.
  text = text.replace(/^Q(\d+)[\.:]+\s*(.*)?$/gm, (_, n, content = '') => {
    const validRoman = /^(i{1,3}|iv|vi{0,3}|ix|x)$/;
    const partMatch = content.match(/^\(([a-z]+)\)\s+([\s\S]*)$/);
    if (partMatch) {
      const letter = partMatch[1];
      if (/^[a-z]$/.test(letter) || validRoman.test(letter)) {
        const rest = partMatch[2].trim();
        const mMatch = rest.match(/^([\s\S]*?)\s*\[(\d{1,2})(?:\s*marks?)?\]\s*$/);
        const pContent = mMatch ? mMatch[1].trim() : rest;
        const mNum = mMatch ? mMatch[2] : null;
        const mSpan = mNum ? `<span class="marks-badge">[${mNum}]</span>` : '';
        return `<div class="practice-q-with-part"><span class="practice-q-num">Q${n}</span><span class="part-label">(${letter})</span><span class="part-first-line">${pContent}</span>${mSpan}</div>`;
      }
    }
    const marksMatch = content.match(/^(.*?)\s*\[(\d{1,2})(?:\s*marks?)?\]\s*$/);
    const qContent = marksMatch ? marksMatch[1].trim() : content.trim();
    const marksNum = marksMatch ? marksMatch[2] : null;
    const marksSpan = marksNum ? `<span class="marks-badge">[${marksNum}]</span>` : '';
    return `<div class="practice-q"><span class="practice-q-num">Q${n}</span>${qContent}${marksSpan}</div>`;
  });

  text = text.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  text = text.replace(/^(?!Q)\d+\.\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:^<li>[\s\S]*?<\/li>\n?)+/gm, m => {
    if (m.includes('<ul>')) return m;
    return `<ol>${m}</ol>`;
  });

  // General marks badges: [N] or [N marks] anywhere not already inside a badge span.
  // (?<!>) prevents re-wrapping badges already emitted by the Part regex (which end with >[N]<)
  text = text.replace(/(?<!>)\[(\d{1,2})(?:\s*marks?)?\]/g, '<span class="marks-badge-float">[$1]</span>');

  // Collapse blank lines between consecutive display math blocks to prevent double-spacing
  text = text.replace(/(%%B\d+%%)\s*\n\s*\n+\s*(%%B\d+%%)/g, '$1\n$2');
  text = text.replace(/\n{2,}/g, '</p><p>');
  text = '<p>' + text + '</p>';
  text = text.replace(/<p>\s*<\/p>/g, '');
  text = text.replace(/<p>(<(?:h[1-6]|ul|ol|hr|div|table)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|div|table)>)<\/p>/g, '$1');
  text = text.replace(/([^>])\n([^<])/g, '$1<br>$2');

  // Render KaTeX directly if available, otherwise restore delimiters for post-processing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const katex = typeof window !== 'undefined' ? (window as any).katex : null;
  if (katex) {
    text = text.replace(/%%B(\d+)%%/g, (_, i) => {
      const idx = Number(i);
      try {
        const rendered = katex.renderToString(blocks[idx], { displayMode: true, throwOnError: false });
        return leftBlocks.has(idx) ? `<div class="katex-display-left">${rendered}</div>` : rendered;
      }
      catch { return `$$${blocks[idx]}$$`; }
    });
    text = text.replace(/%%I(\d+)%%/g, (_, i) => {
      try { return katex.renderToString(inlines[Number(i)], { displayMode: false, throwOnError: false }); }
      catch { return `$${inlines[Number(i)]}$`; }
    });
  } else {
    text = text.replace(/%%B(\d+)%%/g, (_, i) => `$$${blocks[Number(i)]}$$`);
    text = text.replace(/%%I(\d+)%%/g, (_, i) => `$${inlines[Number(i)]}$`);
  }

  // Wrap each part's content in a part-block so all child elements get 40px left indent.
  // Also split on practice-q / practice-q-with-part so Q-numbered questions break out.
  {
    const segments = text.split(/(?=<div class="(?:part-header-row|practice-q(?:-with-part)?)">)/);
    text = segments.map(seg => {
      if (seg.startsWith('<div class="part-header-row">')) {
        return `<div class="part-block">${seg}</div>`;
      }
      return seg;
    }).join('');
  }

  // Wrap practice question blocks so sub-content is indented under each Q
  if (text.includes('practice-q')) {
    const segments = text.split(/(?=<div class="practice-q(?:-with-part)?">)/);
    text = segments.map(seg => {
      if (seg.startsWith('<div class="practice-q')) {
        return `<div class="practice-q-block">${seg}</div>`;
      }
      return seg;
    }).join('');
  }

  return text;
}

function renderMath(el: HTMLElement) {
  if (typeof window === 'undefined') return;
  const tryRender = (attempts: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rme = (window as any).renderMathInElement;
    if (rme) {
      try {
        rme(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$',  right: '$',  display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { console.warn('[KaTeX]', e); }
    } else if (attempts < 30) {
      setTimeout(() => tryRender(attempts + 1), 100);
    }
  };
  tryRender(0);
}

function ReviseContent() {
  const searchParams = useSearchParams();
  const subject = searchParams.get('subject') || 'AM';
  const topic   = searchParams.get('topic')   || '';

  const subjectLabel = SUBJECT_LABELS[subject] || subject;

  const [sections, setSections]       = useState<Section[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const tabBarRef  = useRef<HTMLDivElement>(null);

  // Load notes — wait for KaTeX before setting sections so renderMarkdown can render inline
  useEffect(() => {
    if (!topic) { setLoading(false); return; }
    (async () => {
      try {
        // Wait for window.katex (up to 5s) so renderMarkdown can call renderToString directly
        await new Promise<void>((resolve) => {
          const check = (n: number) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((typeof window !== 'undefined' && (window as any).katex) || n > 50) resolve();
            else setTimeout(() => check(n + 1), 100);
          };
          check(0);
        });
        const r = await fetch(`/api/notes?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const raw = data.content || data.generatedContent || '';
        setSections(raw.trim() ? parseSections(raw, topic) : []);
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [subject, topic]);

  // Render section content + KaTeX
  const renderSection = useCallback((index: number, secs: Section[]) => {
    if (!contentRef.current || !secs[index]) return;
    const sec = secs[index];

    let subtitle = '';
    if (sec.isPractice)  subtitle = 'Questions from all sections — tap answers to reveal';
    if (sec.isSyllabus)  subtitle = 'Syllabus coverage for this topic';

    contentRef.current.innerHTML =
      `<div class="section-title">${escapeHtml(sec.title)}</div>` +
      (subtitle ? `<div class="section-subtitle">${escapeHtml(subtitle)}</div>` : '') +
      renderMarkdown(sec.content);

    renderMath(contentRef.current);

    // Scroll content to top
    const scroll = contentRef.current.closest('.content-scroll') as HTMLElement | null;
    if (scroll) scroll.scrollTop = 0; else window.scrollTo(0, 0);
  }, []);

  // Re-render when section changes
  useEffect(() => {
    if (!loading && sections.length > 0) {
      renderSection(currentIndex, sections);
    }
  }, [currentIndex, sections, loading, renderSection]);

  // Scroll active tab into view
  useEffect(() => {
    if (!tabBarRef.current) return;
    const pills = tabBarRef.current.querySelectorAll('.tab-pill');
    const active = pills[currentIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentIndex]);

  function showSection(i: number) {
    setCurrentIndex(i);
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="revise-layout">
        <TopNav topic="Loading…" badge="" />
        <div className="tab-bar" />
        <div className="page-body">
          <div className="content-scroll">
            <div className="content-area">
              <div className="skeleton title" />
              <div className="skeleton w80" />
              <div className="skeleton w60" />
              <div className="skeleton" />
              <div className="skeleton w80" />
              <div className="skeleton w40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No topic
  if (!topic) {
    return (
      <div className="revise-layout">
        <TopNav topic="Revise" badge={subjectLabel} />
        <div className="tab-bar" />
        <div className="page-body">
          <div className="content-scroll">
            <div className="content-area">
              <div className="state-message">
                <div className="state-title">No topic specified</div>
                <p>Add <code>?topic=Binomial+Expansion</code> to the URL.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (fetchError) {
    return (
      <div className="revise-layout">
        <TopNav topic={topic} badge={subjectLabel} />
        <div className="tab-bar" />
        <div className="page-body">
          <div className="content-scroll">
            <div className="content-area">
              <div className="state-message">
                <div className="state-title">Failed to load</div>
                <p>Could not load notes. Please try again.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No content
  if (sections.length === 0) {
    return (
      <div className="revise-layout">
        <TopNav topic={topic} badge={subjectLabel} />
        <div className="tab-bar" />
        <div className="page-body">
          <div className="content-scroll">
            <div className="content-area">
              <div className="state-message">
                <div className="state-title">{topic}</div>
                <p>No notes available for this topic yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
        strategy="afterInteractive"
      />
      <div className="revise-layout">
        <TopNav topic={topic} badge={subjectLabel} />

        {/* Mobile pill tab bar */}
        <div className="tab-bar" ref={tabBarRef}>
          {sections.map((sec, i) => (
            <button
              key={i}
              className={
                'tab-pill' +
                (sec.isPractice ? ' practice-tab' : '') +
                (sec.isSyllabus ? ' syllabus-tab' : '') +
                (i === currentIndex ? ' active' : '')
              }
              onClick={() => showSection(i)}
            >
              {sec.title}
            </button>
          ))}
        </div>

        {/* Page body: sidebar + content */}
        <div className="page-body">
          {/* Desktop sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-topic">{topic}</div>
              <span className="sidebar-badge">{subjectLabel}</span>
            </div>
            <nav className="sidebar-nav">
              {sections.map((sec, i) => {
                const isSpecial = sec.isPractice || sec.isSyllabus;
                const prevSpecial = i > 0 && (sections[i - 1].isPractice || sections[i - 1].isSyllabus);
                const showDivider = isSpecial && !prevSpecial;
                return (
                  <div key={i}>
                    {showDivider && <div className="sidebar-divider" />}
                    <div
                      className={
                        'sidebar-item' +
                        (sec.isPractice ? ' practice-item' : '') +
                        (sec.isSyllabus ? ' syllabus-item' : '') +
                        (i === currentIndex ? ' active' : '')
                      }
                      onClick={() => showSection(i)}
                    >
                      {sec.title}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Content scroll area */}
          <div className="content-scroll">
            <div className="content-area" ref={contentRef} />
          </div>
        </div>
      </div>
    </>
  );
}

function TopNav({ topic, badge }: { topic: string; badge: string }) {
  return (
    <div className="top-nav">
      <a href="javascript:history.back()" className="back-link" aria-label="Back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </a>
      <span className="nav-topic">{topic}</span>
      {badge && <span className="nav-badge">{badge}</span>}
    </div>
  );
}

export default function RevisePage() {
  return (
    <Suspense fallback={
      <div className="revise-layout">
        <div className="top-nav">
          <span className="nav-topic">Loading…</span>
        </div>
        <div className="page-body">
          <div className="content-scroll">
            <div className="content-area">
              <div className="skeleton title" />
              <div className="skeleton w80" />
              <div className="skeleton w60" />
            </div>
          </div>
        </div>
      </div>
    }>
      <ReviseContent />
    </Suspense>
  );
}
