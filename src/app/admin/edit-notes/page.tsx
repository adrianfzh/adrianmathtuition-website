'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AirtableTopic {
  id: string;
  fields: { Topic?: string; Level?: string; Slug?: string };
}

interface Section {
  title: string;
  content: string;
  isPractice?: boolean;
  isSyllabus?: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved';
type ToastType = 'success' | 'error';

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateSlug(topic: string, level: string) {
  return topic.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
    '-' + (level === 'JC' ? 'jc' : 'sec');
}

function renderMarkdown(text: string): string {
  const blocks: string[] = [];
  const leftBlocks = new Set<number>();
  const inlines: string[] = [];
  // Placeholders start with < and end with > so the later [^>]\n[^<]→<br>
  // replacement never matches across their boundaries (> and < are excluded).
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
    const isLeft = m.startsWith('left ');
    const formula = isLeft ? m.slice(5) : m;
    const idx = blocks.length;
    blocks.push(formula);
    if (isLeft) leftBlocks.add(idx);
    return `<KBMATH_${idx}>`;
  });
  text = text.replace(/\$([^$\n]{1,300}?)\$/g, (_, m) => { inlines.push(m); return `<KIMATH_${inlines.length - 1}>`; });

  text = text.replace(/^```[^\n]*$/gm, '');
  text = text.replace(/\[FROM:([^\]]+)\]/g, '<div class="from-section">$1</div>');

  const BADGE = (n: string) => `<span style="flex-shrink:0;width:40px;text-align:right;font-size:12px;color:#64748b;font-weight:600;background:#f1f5f9;padding:2px 8px;border-radius:4px;margin-left:12px;white-space:nowrap;">[${n}]</span>`;

  // Part labels: (a), (b), (c) etc. at start of line
  // Matches: **Part (a):** / Part (a): / **(a)** / bare (a)
  text = text.replace(
    /^(?:\*\*Part\s*\(([a-z])\)[:\.]?\*\*|Part\s*\(([a-z])\)[:\.]?|\*\*\(([a-z])\)\*\*|\(([a-z])\))\s*(.*)$/gm,
    (_, a1, a2, a3, a4, rest) => {
      const letter = a1 || a2 || a3 || a4;
      const marksMatch = rest.match(/^(.*)\s*\[(\d+)(?:\s*marks?)?\]\s*$/);
      const content = marksMatch ? marksMatch[1].trim() : rest.trim();
      const marksNum = marksMatch ? marksMatch[2] : null;
      const contentSpan = `<span style="flex:1;min-width:0;">${content}</span>`;
      const marksSpan = marksNum ? BADGE(marksNum) : '';
      return `<div style="display:flex;gap:0;align-items:flex-start;margin-top:16px;margin-bottom:6px;"><span style="flex-shrink:0;width:36px;font-weight:700;font-size:15px;color:#1b2a4a;">(${letter})</span>${contentSpan}${marksSpan}</div>`;
    }
  );

  // Marks badge [N] at end of line — skip lines already processed by Part regex
  text = text.replace(/^((?!<div style="display:flex).+?)\s*\[(\d+)(?:\s*marks?)?\]\s*$/gm,
    (_, content, n) =>
      `<div style="display:flex;gap:0;align-items:flex-start;"><span style="flex:1;min-width:0;">${content.trim()}</span>${BADGE(n)}</div>`
  );

  // Example card — stops at next Example/Solution card or section heading
  text = text.replace(
    /\*\*Example(?:\s+\d+)?[:\.]?\*\*([^\n]*)([\s\S]*?)(?=\n\*\*(?:Example|Solution|\d+[\.:])|\n##|$)/g,
    (_, firstLine, rest) => {
      const inner = (firstLine.trim() + '\n' + rest).trim();
      return `\n<div class="example-card"><div class="example-card-label">Example</div>${inner}\n</div>\n`;
    }
  );

  // Solution card (green styling)
  text = text.replace(
    /\*\*Solution(?:\s+\d+)?[:\.]?\*\*([^\n]*)([\s\S]*?)(?=\n\*\*(?:Example|Solution|\d+[\.:])|\n##|$)/g,
    (_, firstLine, rest) => {
      const inner = (firstLine.trim() + '\n' + rest).trim();
      return `\n<div class="solution-card"><div class="solution-card-label">Solution</div>${inner}\n</div>\n`;
    }
  );

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

  // Step blocks — process before **bold** to handle **Step N:** syntax
  text = text.replace(/^(?:\*\*)?Step\s+(\d+):(?:\*\*)?\s*(.*)$/gm,
    (_, n, content) => `<div class="step-block"><span class="step-label">Step ${n}:</span>${content.trim() ? ' ' + content.trim() : ''}</div>`);
  text = text.replace(/((?:^\|.+\|\s*\n)+)/gm, tableBlock => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    let html = '<table>';
    rows.forEach((row, i) => {
      if (/^\|[-| :]+\|/.test(row)) return;
      const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    });
    return html + '</table>';
  });
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^---+$/gm, '<hr>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:^<li>[\s\S]*?<\/li>\n?)+/gm, m => {
    if (m.includes('<ul>')) return m;
    return `<ol>${m}</ol>`;
  });
  // Collapse blank lines between consecutive display math blocks to prevent double-spacing
  text = text.replace(/(<KBMATH_\d+>)\s*\n\s*\n+\s*(<KBMATH_\d+>)/g, '$1\n$2');
  text = text.replace(/\n{2,}/g, '</p><p>');
  text = '<p>' + text + '</p>';
  text = text.replace(/<p>\s*<\/p>/g, '');
  text = text.replace(/<p>(<(?:h[1-6]|ul|ol|hr|div|table)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|div|table)>)<\/p>/g, '$1');
  text = text.replace(/([^>])\n([^<])/g, '$1<br>$2');
  text = text.replace(/<KBMATH_(\d+)>/g, (_, i) => {
    const idx = Number(i);
    const delimited = `$$${blocks[idx]}$$`;
    return leftBlocks.has(idx) ? `<div class="katex-display-left">${delimited}</div>` : delimited;
  });
  text = text.replace(/<KIMATH_(\d+)>/g, (_, i) => `$${inlines[Number(i)]}$`);
  return text;
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

  const existingPractice = result.findIndex(s => /^practice$/i.test(s.title.trim()));
  if (existingPractice === -1 && practiceItems.length > 0) {
    const practiceContent = practiceItems.map(p => `[FROM:${p.source}]\n${p.block}`).join('\n\n');
    const syllIdx = result.findIndex(s => /syllabus/i.test(s.title));
    const insertAt = syllIdx > -1 ? syllIdx : result.length;
    result.splice(insertAt, 0, { title: 'Practice', content: practiceContent, isPractice: true });
  } else if (existingPractice > -1) {
    result[existingPractice].isPractice = true;
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

// ── Section content helpers ──────────────────────────────────────────────────
function getSectionBounds(fullContent: string, sectionTitle: string): [number, number] | null {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`\\*\\*(?:\\d+[.:]\\s*)?${escaped}\\*\\*`);
  const headingMatch = headingRe.exec(fullContent);
  if (!headingMatch) return null;
  const headingEnd = headingMatch.index + headingMatch[0].length;
  const bodyStart = fullContent[headingEnd] === '\n' ? headingEnd + 1 : headingEnd;
  const nextHeadingRe = /\*\*\d+[\.:]\s/g;
  nextHeadingRe.lastIndex = headingMatch.index + 1;
  const nextMatch = nextHeadingRe.exec(fullContent);
  const bodyEnd = nextMatch ? nextMatch.index : fullContent.length;
  return [bodyStart, bodyEnd];
}

function extractSectionBody(fullContent: string, sectionTitle: string, isPractice: boolean): string {
  if (isPractice) return '';
  const bounds = getSectionBounds(fullContent, sectionTitle);
  if (!bounds) return '';
  return fullContent.slice(bounds[0], bounds[1]).trimEnd();
}

function replaceSectionBody(fullContent: string, sectionTitle: string, newBody: string): string {
  const bounds = getSectionBounds(fullContent, sectionTitle);
  if (!bounds) return fullContent;
  const before = fullContent.slice(0, bounds[0]);
  const after = fullContent.slice(bounds[1]);
  const trimmedBody = newBody.trimEnd();
  return before + trimmedBody + (trimmedBody ? '\n' : '') + after;
}
function renameSectionInContent(content: string, oldTitle: string, newTitle: string): string {
  if (!newTitle.trim()) return content;
  const nt = newTitle.trim();
  // Use getRawSections to find the exact section number, then do a precise string replacement
  const rawSections = getRawSections(content);
  const secIdx = rawSections.findIndex(s => s.title === oldTitle);
  if (secIdx === -1) {
    console.warn(`[rename] Section "${oldTitle}" not found — content unchanged`);
    return content;
  }
  const n = secIdx + 1;
  // Try dot-separator first, then colon-separator
  const dotForm = `**${n}. ${oldTitle}**`;
  const colonForm = `**${n}: ${oldTitle}**`;
  if (content.includes(dotForm)) return content.replace(dotForm, `**${n}. ${nt}**`);
  if (content.includes(colonForm)) return content.replace(colonForm, `**${n}: ${nt}**`);
  // Fallback: regex limited to the heading line only
  const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\*\\*${n}[.:] ${escaped}\\*\\*`);
  if (!re.test(content)) {
    console.warn(`[rename] Could not locate heading for "${oldTitle}" — content unchanged`);
    return content;
  }
  return content.replace(re, `**${n}. ${nt}**`);
}
// ── Raw-section helpers (operate on raw editor text, no auto-generated sections) ──
function getRawSections(content: string): { title: string; body: string }[] {
  const parts = content.split(/(?=\*\*\d+[\.:]\s)/);
  const result: { title: string; body: string }[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const m = part.match(/^\*\*(?:\d+[\.:]\s*)?(.+?)\*\*/);
    if (m) {
      const body = part.replace(/^\*\*[^*\n]+\*\*\s*\n?/, '');
      result.push({ title: m[1].trim(), body });
    }
  }
  return result;
}

function getContentPreamble(content: string): string {
  const m = content.match(/\*\*\d+[\.:]\s/);
  return m?.index !== undefined ? content.slice(0, m.index) : '';
}

function reorderSectionsInContent(content: string, fromIdx: number, toIdx: number): string {
  const preamble = getContentPreamble(content);
  const sections = getRawSections(content);
  if (fromIdx < 0 || fromIdx >= sections.length || toIdx < 0 || toIdx >= sections.length) return content;
  const reordered = [...sections];
  [reordered[fromIdx], reordered[toIdx]] = [reordered[toIdx], reordered[fromIdx]];
  const body = reordered.map((s, i) => `**${i + 1}. ${s.title}**\n${s.body.trimEnd()}`).join('\n\n');
  return preamble + body;
}

function deleteSectionFromContent(content: string, rawIdx: number): string {
  const preamble = getContentPreamble(content);
  const sections = getRawSections(content);
  if (rawIdx < 0 || rawIdx >= sections.length || sections.length <= 1) return content;
  sections.splice(rawIdx, 1);
  const body = sections.map((s, i) => `**${i + 1}. ${s.title}**\n${s.body.trimEnd()}`).join('\n\n');
  return preamble + body;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function EditNotesPage() {
  // Auth
  const [pwInput, setPwInput] = useState('');
  const [pwShake, setPwShake] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const passwordRef = useRef('');

  // Topics
  const [topics, setTopics] = useState<AirtableTopic[]>([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const currentSlugRef = useRef<string | null>(null);

  // Editor meta
  const [metaTopic, setMetaTopic] = useState('');
  const [metaLevel, setMetaLevel] = useState('AM');
  const [slugDisplay, setSlugDisplay] = useState('—');
  const metaTopicRef = useRef('');
  const metaLevelRef = useRef('AM');
  const slugDisplayRef = useRef('—');

  // Undo stack
  const undoStackRef = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  // UI state
  const [editorShown, setEditorShown] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [katexLoaded, setKatexLoaded] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const aiInstructionRef = useRef('');
  const aiDraftRef = useRef('');
  const aiPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DOM refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumsRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewTabsRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);

  // Preview section state (imperative, avoids re-renders on tab click)
  const previewSectionsRef = useRef<Section[]>([]);
  const activeSectionRef = useRef(0);

  // Full content ground truth (all sections combined)
  const fullContentRef = useRef('');

  // Resizable horizontal split (preview width / editor gets remainder)
  const [previewWidthPx, setPreviewWidthPx] = useState<number | null>(null);
  const previewWidthRef = useRef<number | null>(null);

  // Resizable horizontal split (preview sidebar width)
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number | null>(null);
  const sidebarWidthRef = useRef<number | null>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);

  // Sync refs to state
  useEffect(() => { metaTopicRef.current = metaTopic; }, [metaTopic]);
  useEffect(() => { metaLevelRef.current = metaLevel; }, [metaLevel]);
  useEffect(() => { slugDisplayRef.current = slugDisplay; }, [slugDisplay]);
  useEffect(() => { currentSlugRef.current = currentSlug; }, [currentSlug]);
  useEffect(() => { aiInstructionRef.current = aiInstruction; }, [aiInstruction]);

  // Restore last AI instruction from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('editNotesAiInstruction');
    if (saved) setAiInstruction(saved);
  }, []);

  // Restore preview width + sidebar width from sessionStorage once panes are mounted
  useEffect(() => {
    if (!editorShown) return;
    requestAnimationFrame(() => {
      const panes = panesRef.current;
      if (!panes) return;
      const saved = sessionStorage.getItem('editNotesPreviewWidth');
      const defaultW = Math.round(panes.offsetWidth * 0.5);
      const w = saved ? parseInt(saved, 10) : defaultW;
      if (!isNaN(w)) {
        setPreviewWidthPx(w);
        previewWidthRef.current = w;
      }
      const savedSw = sessionStorage.getItem('editNotesSidebarWidth');
      if (savedSw) {
        const sw = parseInt(savedSw, 10);
        if (!isNaN(sw)) { setSidebarWidthPx(sw); sidebarWidthRef.current = sw; }
      }
    });
  }, [editorShown]);

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const panes = panesRef.current;
    if (!panes) return;
    const startX = e.clientX;
    const startW = previewWidthRef.current ?? Math.round(panes.offsetWidth * 0.5);
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(200, Math.min(panes.offsetWidth - 200, startW + ev.clientX - startX));
      setPreviewWidthPx(newW);
      previewWidthRef.current = newW;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (previewWidthRef.current !== null) {
        sessionStorage.setItem('editNotesPreviewWidth', String(previewWidthRef.current));
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onDividerTouchStart(e: React.TouchEvent) {
    const panes = panesRef.current;
    if (!panes) return;
    const startX = e.touches[0].clientX;
    const startW = previewWidthRef.current ?? Math.round(panes.offsetWidth * 0.5);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const newW = Math.max(200, Math.min(panes.offsetWidth - 200, startW + ev.touches[0].clientX - startX));
      setPreviewWidthPx(newW);
      previewWidthRef.current = newW;
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      if (previewWidthRef.current !== null) {
        sessionStorage.setItem('editNotesPreviewWidth', String(previewWidthRef.current));
      }
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  function onSidebarDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const body = previewBodyRef.current;
    if (!body) return;
    const startX = e.clientX;
    const startW = sidebarWidthRef.current ?? 148;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(80, Math.min(280, startW + ev.clientX - startX));
      setSidebarWidthPx(newW);
      sidebarWidthRef.current = newW;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (sidebarWidthRef.current !== null) {
        sessionStorage.setItem('editNotesSidebarWidth', String(sidebarWidthRef.current));
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onSidebarDividerTouchStart(e: React.TouchEvent) {
    const startX = e.touches[0].clientX;
    const startW = sidebarWidthRef.current ?? 148;
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const newW = Math.max(80, Math.min(280, startW + ev.touches[0].clientX - startX));
      setSidebarWidthPx(newW);
      sidebarWidthRef.current = newW;
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      if (sidebarWidthRef.current !== null) {
        sessionStorage.setItem('editNotesSidebarWidth', String(sidebarWidthRef.current));
      }
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  function showToast(msg: string, type: ToastType = 'success') {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000);
  }

  const loadApp = useCallback(async (pw: string) => {
    try {
      const resp = await fetch(`/api/notes?list=all&password=${encodeURIComponent(pw)}`);
      if (resp.status === 401) {
        const err = Object.assign(new Error('Unauthorized'), { status: 401 });
        throw err;
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      sessionStorage.setItem('editNotesPass', pw);
      passwordRef.current = pw;
      setTopics(Array.isArray(data) ? data : []);
      setAuthed(true);
    } catch (err) {
      setPwLoading(false);
      setAuthed(false);
      if ((err as { status?: number }).status === 401) {
        sessionStorage.removeItem('editNotesPass');
        passwordRef.current = '';
        setPwShake(true);
        setTimeout(() => setPwShake(false), 400);
        setPwInput('');
      } else {
        showToast('Connection failed — check your network', 'error');
      }
    }
  }, []);

  // On mount: check sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('editNotesPass');
    if (saved) {
      passwordRef.current = saved;
      setAuthed(true); // optimistic
      loadApp(saved);
    }
  }, [loadApp]);

  async function tryPassword() {
    const val = pwInput.trim();
    if (!val) return;
    setPwLoading(true);
    await loadApp(val);
    setPwLoading(false);
  }

  // Line numbers
  function updateLineNumbers() {
    if (!textareaRef.current || !lineNumsRef.current) return;
    const lines = textareaRef.current.value.split('\n');
    setLineCount(lines.length);
    lineNumsRef.current.innerHTML = lines.map((_, i) => `<span>${i + 1}</span>`).join('');
  }

  function syncLineNumbers() {
    if (!textareaRef.current || !lineNumsRef.current) return;
    lineNumsRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderMath(el: HTMLElement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rme = (window as any).renderMathInElement;
    if (!rme) { setTimeout(() => renderMath(el), 80); return; }
    try {
      rme(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
      });
    } catch (e) { console.warn('[KaTeX]', e); }
  }

  function renderPreviewTabs() {
    const tabs = previewTabsRef.current;
    if (!tabs) return;
    const sections = previewSectionsRef.current;
    const active = activeSectionRef.current;
    const rawSections = getRawSections(fullContentRef.current);
    const rawCount = rawSections.length;
    tabs.innerHTML = sections.map((sec, i) => {
      const cls = ['en-preview-sitem',
        sec.isPractice ? 'practice' : '',
        sec.isSyllabus ? 'syllabus' : '',
        i === active ? 'active' : '',
      ].filter(Boolean).join(' ');
      const renamable = !sec.isPractice && !sec.isSyllabus && sec.title !== 'Overview';
      const titleAttr = renamable ? ' title="Double-click to rename"' : '';

      // Reorder / delete controls — only for real (numbered) sections
      const rawIdx = rawSections.findIndex(s => s.title === sec.title);
      const isReal = rawIdx !== -1 && !sec.isPractice && !sec.isSyllabus;
      const controls = isReal ? `
        <span class="en-sitem-arrows">
          <button class="en-sitem-btn" data-move-up="${i}" title="Move section up"${rawIdx === 0 ? ' style="visibility:hidden"' : ''}>▲</button>
          <button class="en-sitem-btn" data-move-down="${i}" title="Move section down"${rawIdx === rawCount - 1 ? ' style="visibility:hidden"' : ''}>▼</button>
        </span>
        <span class="en-sitem-label">${escapeHtml(sec.title)}</span>
        <button class="en-sitem-btn en-sitem-delete" data-delete-idx="${i}" title="Delete section">×</button>
      ` : `<span class="en-sitem-label">${escapeHtml(sec.title)}</span>`;

      return `<div class="${cls}" data-idx="${i}"${titleAttr}>${controls}</div>`;
    }).join('');
  }

  function renderPreviewSection() {
    if (!previewRef.current) return;
    const sections = previewSectionsRef.current;
    const sec = sections[activeSectionRef.current];
    if (!sec) { previewRef.current.innerHTML = ''; return; }
    let subtitle = '';
    if (sec.isPractice) subtitle = 'Questions from all sections — tap answers to reveal';
    if (sec.isSyllabus) subtitle = 'Syllabus coverage for this topic';
    previewRef.current.innerHTML =
      `<div class="section-title">${escapeHtml(sec.title)}</div>` +
      (subtitle ? `<div class="section-subtitle">${escapeHtml(subtitle)}</div>` : '') +
      renderMarkdown(sec.content);
    renderMath(previewRef.current);
  }

  function updatePreview(contentOverride?: string) {
    const text = contentOverride !== undefined ? contentOverride : fullContentRef.current;
    if (!text.trim()) {
      if (previewTabsRef.current) previewTabsRef.current.innerHTML = '';
      if (previewRef.current) previewRef.current.innerHTML = '';
      previewSectionsRef.current = [];
      return;
    }
    const sections = parseSections(text, metaTopicRef.current || 'Notes');
    previewSectionsRef.current = sections;
    if (activeSectionRef.current >= sections.length) activeSectionRef.current = 0;
    renderPreviewTabs();
    renderPreviewSection();
  }

  function schedulePreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => updatePreview(), 300);
  }

  // Re-render math when KaTeX loads
  useEffect(() => {
    if (katexLoaded && previewRef.current && previewRef.current.innerHTML) {
      renderMath(previewRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [katexLoaded]);

  // Section-click delegation on preview sidebar
  useEffect(() => {
    if (!editorShown) return;
    const tabs = previewTabsRef.current;
    if (!tabs) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // ── Move-up button ──
      const upBtn = target.closest('[data-move-up]') as HTMLElement | null;
      if (upBtn) {
        moveSection(parseInt(upBtn.dataset.moveUp!, 10), 'up');
        return;
      }

      // ── Move-down button ──
      const downBtn = target.closest('[data-move-down]') as HTMLElement | null;
      if (downBtn) {
        moveSection(parseInt(downBtn.dataset.moveDown!, 10), 'down');
        return;
      }

      // ── Delete button ──
      const delBtn = target.closest('[data-delete-idx]') as HTMLElement | null;
      if (delBtn) {
        deleteSection(parseInt(delBtn.dataset.deleteIdx!, 10));
        return;
      }

      // ── Regular tab click ──
      const item = target.closest('[data-idx]') as HTMLElement | null;
      if (!item) return;
      const idx = parseInt(item.dataset.idx ?? '0', 10);
      if (isNaN(idx)) return;
      activeSectionRef.current = idx;
      tabs.querySelectorAll('[data-idx]').forEach((p, i) => {
        p.classList.toggle('active', i === idx);
      });
      const sec = previewSectionsRef.current[idx];
      if (!sec || !previewRef.current) return;
      let subtitle = '';
      if (sec.isPractice) subtitle = 'Questions from all sections — tap answers to reveal';
      if (sec.isSyllabus) subtitle = 'Syllabus coverage for this topic';
      previewRef.current.innerHTML =
        `<div class="section-title">${escapeHtml(sec.title)}</div>` +
        (subtitle ? `<div class="section-subtitle">${escapeHtml(subtitle)}</div>` : '') +
        renderMarkdown(sec.content);
      renderMath(previewRef.current);
      // Update editor textarea to show this section's body
      if (textareaRef.current) {
        textareaRef.current.value = extractSectionBody(fullContentRef.current, sec.title, sec.isPractice ?? false);
        updateLineNumbers();
      }
    };
    tabs.addEventListener('click', onClick);
    return () => tabs.removeEventListener('click', onClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorShown]);

  // Double-click to rename section tab
  useEffect(() => {
    if (!editorShown) return;
    const tabs = previewTabsRef.current;
    if (!tabs) return;
    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Ignore double-clicks on control buttons
      if (target.closest('[data-move-up],[data-move-down],[data-delete-idx]')) return;
      const item = target.closest('[data-idx]') as HTMLElement | null;
      if (!item) return;
      const idx = parseInt(item.dataset.idx ?? '0', 10);
      const sec = previewSectionsRef.current[idx];
      if (!sec || sec.isPractice || sec.isSyllabus || sec.title === 'Overview') return;

      // Replace tab text with an inline input
      item.innerHTML = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = sec.title;
      Object.assign(input.style, {
        width: '100%', font: 'inherit', background: 'transparent',
        border: 'none', outline: '1.5px solid rgba(255,255,255,0.6)',
        borderRadius: '3px', padding: '0 2px', color: 'inherit',
        minWidth: '60px',
      });
      item.appendChild(input);
      input.focus();
      input.select();

      const commit = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== sec.title) {
          pushUndo();
          fullContentRef.current = renameSectionInContent(fullContentRef.current, sec.title, newTitle);
          // Update textarea if this section is currently being edited
          if (activeSectionRef.current === idx && textareaRef.current) {
            const newBody = extractSectionBody(fullContentRef.current, newTitle, false);
            textareaRef.current.value = newBody;
            updateLineNumbers();
          }
          updatePreview();
        } else {
          renderPreviewTabs();
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = sec.title; input.blur(); }
      });
      e.stopPropagation();
    };
    tabs.addEventListener('dblclick', onDblClick);
    return () => tabs.removeEventListener('dblclick', onDblClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorShown]);

  // Cmd+Z / Ctrl+Z undo — only when editor textarea is NOT focused
  useEffect(() => {
    if (!editorShown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (document.activeElement === textareaRef.current) return; // let browser handle natively
        e.preventDefault();
        performUndo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorShown]);

  function handleEditorChange() {
    const activeSec = previewSectionsRef.current[activeSectionRef.current];
    const newBody = textareaRef.current?.value ?? '';
    if (activeSec && !activeSec.isPractice) {
      fullContentRef.current = replaceSectionBody(fullContentRef.current, activeSec.title, newBody);
    } else if (!activeSec || previewSectionsRef.current.length === 0) {
      fullContentRef.current = newBody;
    }
    updateLineNumbers();
    schedulePreview();
  }

  function pushUndo() {
    undoStackRef.current.push(fullContentRef.current);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }

  function performUndo() {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    setUndoCount(undoStackRef.current.length);
    fullContentRef.current = previous;
    const newSections = parseSections(previous, metaTopicRef.current || 'Notes');
    const currentTitle = previewSectionsRef.current[activeSectionRef.current]?.title;
    const newIdx = currentTitle ? newSections.findIndex(s => s.title === currentTitle) : 0;
    activeSectionRef.current = newIdx >= 0 ? newIdx : 0;
    updatePreview();
    const activeSec = previewSectionsRef.current[activeSectionRef.current];
    if (textareaRef.current) {
      textareaRef.current.value = activeSec && !activeSec.isPractice
        ? extractSectionBody(fullContentRef.current, activeSec.title, false)
        : previous;
      updateLineNumbers();
    }
  }

  function applySectionReorder(newContent: string, preserveTitle: string) {
    fullContentRef.current = newContent;
    const newSections = parseSections(newContent, metaTopicRef.current || 'Notes');
    const newIdx = newSections.findIndex(s => s.title === preserveTitle);
    activeSectionRef.current = newIdx >= 0 ? newIdx : 0;
    updatePreview();
    const activeSecNew = previewSectionsRef.current[activeSectionRef.current];
    if (textareaRef.current && activeSecNew && !activeSecNew.isPractice) {
      textareaRef.current.value = extractSectionBody(fullContentRef.current, activeSecNew.title, false);
      updateLineNumbers();
    }
  }

  function moveSection(displayIdx: number, direction: 'up' | 'down') {
    const sections = previewSectionsRef.current;
    const rawSections = getRawSections(fullContentRef.current);
    const sec = sections[displayIdx];
    if (!sec || sec.isPractice || sec.isSyllabus) return;
    const rawIdx = rawSections.findIndex(s => s.title === sec.title);
    if (rawIdx === -1) return;
    const targetRawIdx = direction === 'up' ? rawIdx - 1 : rawIdx + 1;
    if (targetRawIdx < 0 || targetRawIdx >= rawSections.length) return;
    pushUndo();
    const preserveTitle = sections[activeSectionRef.current]?.title ?? sec.title;
    applySectionReorder(reorderSectionsInContent(fullContentRef.current, rawIdx, targetRawIdx), preserveTitle);
  }

  function deleteSection(displayIdx: number) {
    const sections = previewSectionsRef.current;
    const rawSections = getRawSections(fullContentRef.current);
    if (rawSections.length <= 1) { showToast("Can't delete the last section", 'error'); return; }
    const sec = sections[displayIdx];
    if (!sec) return;
    const rawIdx = rawSections.findIndex(s => s.title === sec.title);
    if (rawIdx === -1) return;
    if (!confirm(`Delete section "${sec.title}" and all its content?`)) return;
    pushUndo();
    const activeTitle = sections[activeSectionRef.current]?.title ?? '';
    const preserveTitle = activeTitle === sec.title
      ? (rawSections[rawIdx + 1] ?? rawSections[rawIdx - 1])?.title ?? ''
      : activeTitle;
    applySectionReorder(deleteSectionFromContent(fullContentRef.current, rawIdx), preserveTitle);
  }

  function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  function getNextSectionNumber(): number {
    const matches = [...fullContentRef.current.matchAll(/\*\*(\d+)[.:]/g)];
    const nums = matches.map(m => parseInt(m[1], 10));
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  }

  function insertSection() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    const n = getNextSectionNumber();
    const prefix = `\n\n**${n}. `;
    const name = 'New Section';
    const suffix = `**\n\n`;
    const insertPos = ta.selectionStart;
    insertAtCursor(ta, prefix + name + suffix);
    // Select "New Section" so user can type the name immediately
    ta.selectionStart = insertPos + prefix.length;
    ta.selectionEnd = insertPos + prefix.length + name.length;
    handleEditorChange();
  }

  function insertExample() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    insertAtCursor(ta, '\n\n**Example:**\nDescription here.\n\n');
    handleEditorChange();
  }

  function insertPractice() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    insertAtCursor(ta, '\n\n[Try: Your question here]\n[Ans: The answer]\n\n');
    handleEditorChange();
  }

  function insertList() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    const text = '\n- Item 1\n- Item 2\n- Item 3\n';
    const insertPos = ta.selectionStart;
    insertAtCursor(ta, text);
    // Place cursor at start of "Item 1" so user can edit immediately
    const item1Start = insertPos + '\n- '.length;
    ta.selectionStart = item1Start;
    ta.selectionEnd = item1Start + 'Item 1'.length;
    ta.focus();
    handleEditorChange();
  }

  function insertSolution() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    insertAtCursor(ta, '\n\n**Solution:**\n**Step 1:** \n\n**Step 2:** \n\n**Step 3:** \n\n');
    handleEditorChange();
  }

  function insertAligned() {
    const ta = textareaRef.current;
    if (!ta) return;
    pushUndo();
    insertAtCursor(ta, '\n\n$$\\begin{aligned}\n  &=  \\\\\n  &= \n\\end{aligned}$$\n\n');
    handleEditorChange();
  }

  async function loadTopic(slug: string) {
    setCurrentSlug(slug);
    currentSlugRef.current = slug;
    setEditorShown(true);
    if (textareaRef.current) textareaRef.current.value = '';
    if (previewRef.current) previewRef.current.innerHTML = '<p style="color:var(--color-muted-foreground);padding:20px">Loading…</p>';
    try {
      const resp = await fetch(`/api/notes?slug=${encodeURIComponent(slug)}&password=${encodeURIComponent(passwordRef.current)}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const record = await resp.json();
      if (!record) { showToast('Topic not found', 'error'); return; }
      const f = record.fields;
      setMetaTopic(f.Topic || '');
      setMetaLevel(f.Level || 'AM');
      setSlugDisplay(f.Slug || slug);
      const content = f.Content || '';
      fullContentRef.current = content;
      activeSectionRef.current = 0;
      // Show first section body in textarea
      const secs = parseSections(content, f.Topic || 'Notes');
      if (secs.length > 0) {
        const firstSec = secs[0];
        if (textareaRef.current) {
          textareaRef.current.value = extractSectionBody(content, firstSec.title, firstSec.isPractice ?? false);
        }
      } else if (textareaRef.current) {
        textareaRef.current.value = content;
      }
      updateLineNumbers();
      updatePreview();
    } catch {
      showToast('Failed to load topic', 'error');
    }
  }

  function newTopic() {
    setCurrentSlug('__new__');
    currentSlugRef.current = '__new__';
    setMetaTopic('');
    setMetaLevel('AM');
    setSlugDisplay('—');
    fullContentRef.current = '';
    activeSectionRef.current = 0;
    if (textareaRef.current) textareaRef.current.value = '';
    if (previewRef.current) previewRef.current.innerHTML = '';
    if (previewTabsRef.current) previewTabsRef.current.innerHTML = '';
    previewSectionsRef.current = [];
    updateLineNumbers();
    setEditorShown(true);
  }

  function handleTopicInput(val: string) {
    setMetaTopic(val);
    if (currentSlugRef.current === '__new__' && val) {
      setSlugDisplay(generateSlug(val, metaLevelRef.current));
    }
  }

  function handleLevelChange(val: string) {
    setMetaLevel(val);
    if (currentSlugRef.current === '__new__' && metaTopicRef.current) {
      setSlugDisplay(generateSlug(metaTopicRef.current, val));
    }
  }

  async function saveNotes() {
    const topic = metaTopicRef.current.trim();
    const level = metaLevelRef.current || 'AM';
    const content = fullContentRef.current;
    if (!topic) { showToast('Topic name is required', 'error'); return; }

    const slug = currentSlugRef.current === '__new__'
      ? generateSlug(topic, level)
      : (slugDisplayRef.current !== '—' ? slugDisplayRef.current : generateSlug(topic, level));

    setSaveState('saving');
    try {
      const resp = await fetch(
        `/api/notes?password=${encodeURIComponent(passwordRef.current)}&slug=${encodeURIComponent(slug)}&topic=${encodeURIComponent(topic)}&level=${encodeURIComponent(level)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }
      );
      if (!resp.ok) {
        let detail = '';
        try { const j = await resp.json(); detail = j.error || ''; } catch { /**/ }
        throw new Error(`HTTP ${resp.status}${detail ? ': ' + detail : ''}`);
      }
      const result = await resp.json();

      setSlugDisplay(slug);
      setCurrentSlug(slug);
      currentSlugRef.current = slug;

      const topicsResp = await fetch(`/api/notes?list=all&password=${encodeURIComponent(passwordRef.current)}`);
      if (topicsResp.ok) {
        const tList = await topicsResp.json();
        setTopics(Array.isArray(tList) ? tList : []);
      }

      setSaveState('saved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 3000);
      showToast(result.action === 'created' ? 'Topic created' : 'Saved', 'success');
    } catch (err) {
      setSaveState('idle');
      showToast(`Save failed: ${(err as Error).message}`, 'error');
    }
  }

  // ── AI assistant ────────────────────────────────────────────────
  async function callAI() {
    const instruction = aiInstructionRef.current.trim();
    if (!instruction) return;
    sessionStorage.setItem('editNotesAiInstruction', instruction);
    setAiStatus('loading');
    aiDraftRef.current = '';

    // Send only the active section's content to the AI
    const activeSec = previewSectionsRef.current[activeSectionRef.current];
    const currentSectionContent = activeSec && !(activeSec.isPractice)
      ? extractSectionBody(fullContentRef.current, activeSec.title, false)
      : fullContentRef.current;

    try {
      const resp = await fetch('/api/edit-notes-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          currentContent: currentSectionContent,
          topic: metaTopicRef.current,
          subject: metaLevelRef.current,
          password: passwordRef.current,
        }),
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try { const j = await resp.json(); msg = j.error || msg; } catch { /**/ }
        throw new Error(msg);
      }

      const reader = resp.body!.getReader();
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
          let data: Record<string, unknown>;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.chunk) {
            aiDraftRef.current += data.chunk as string;
            if (aiPreviewTimerRef.current) clearTimeout(aiPreviewTimerRef.current);
            aiPreviewTimerRef.current = setTimeout(() => {
              const sec = previewSectionsRef.current[activeSectionRef.current];
              if (sec && !sec.isPractice) {
                const draftContent = replaceSectionBody(fullContentRef.current, sec.title, aiDraftRef.current);
                updatePreview(draftContent);
              } else {
                updatePreview(aiDraftRef.current);
              }
            }, 50);
          }
          if (data.done) {
            if (aiPreviewTimerRef.current) clearTimeout(aiPreviewTimerRef.current);
            const sec = previewSectionsRef.current[activeSectionRef.current];
            if (sec && !sec.isPractice) {
              updatePreview(replaceSectionBody(fullContentRef.current, sec.title, aiDraftRef.current));
            } else {
              updatePreview(aiDraftRef.current);
            }
            setAiStatus('done');
          }
          if (data.error) throw new Error(data.error as string);
        }
      }
    } catch (err) {
      setAiStatus('error');
      showToast(`AI error: ${(err as Error).message}`, 'error');
      updatePreview();
    }
  }

  function acceptAI() {
    pushUndo();
    const sec = previewSectionsRef.current[activeSectionRef.current];
    if (sec && !sec.isPractice) {
      fullContentRef.current = replaceSectionBody(fullContentRef.current, sec.title, aiDraftRef.current);
      if (textareaRef.current) {
        textareaRef.current.value = aiDraftRef.current;
        updateLineNumbers();
      }
    } else {
      fullContentRef.current = aiDraftRef.current;
      if (textareaRef.current) {
        textareaRef.current.value = aiDraftRef.current;
        updateLineNumbers();
      }
    }
    aiDraftRef.current = '';
    updatePreview();
    setAiStatus('idle');
    setAiOpen(false);
  }

  function rejectAI() {
    aiDraftRef.current = '';
    setAiStatus('idle');
    updatePreview();
  }
  // ────────────────────────────────────────────────────────────────

  const filteredTopics = topicSearch
    ? topics.filter(t => t.fields.Topic?.toLowerCase().includes(topicSearch.toLowerCase()))
    : topics;

  const FloppyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  );

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
        strategy="afterInteractive"
        onLoad={() => setKatexLoaded(true)}
      />

      <div className="en-layout">
        {/* Password gate */}
        {!authed && (
          <div className="en-gate">
            <div className="en-gate-card">
              <h1>Edit Notes</h1>
              <p>Enter your admin password to continue.</p>
              <input
                type="password"
                className={`en-pw-input${pwShake ? ' shake' : ''}`}
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && tryPassword()}
                placeholder="Password"
                autoComplete="current-password"
                autoFocus
              />
              <button className="en-pw-btn" onClick={tryPassword} disabled={pwLoading}>
                {pwLoading ? 'Checking…' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Top nav */}
        <nav className="en-nav">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="javascript:history.back()" className="en-back" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </a>
          <span className="en-nav-title">Edit Notes</span>
          <span className="en-nav-badge">
            {authed ? `${topics.length} topics` : 'Loading…'}
          </span>
        </nav>

        {/* Toast */}
        <div className={`en-toast ${toastType}${toastVisible ? ' show' : ''}`}>
          {toastMsg}
        </div>

        {/* App shell */}
        {authed && (
          <div className="en-shell">
            {/* Sidebar */}
            <aside className="en-sidebar">
              <div className="en-sidebar-search">
                <input
                  type="search"
                  placeholder="Search topics…"
                  autoComplete="off"
                  value={topicSearch}
                  onChange={e => setTopicSearch(e.target.value)}
                />
              </div>
              <div className="en-topic-list">
                {filteredTopics.length === 0 ? (
                  <div className="en-topic-empty">
                    {topics.length === 0 ? 'Loading…' : 'No topics found'}
                  </div>
                ) : filteredTopics.map(t => (
                  <div
                    key={t.id || t.fields.Slug}
                    className={`en-topic-item${currentSlug === t.fields.Slug ? ' active' : ''}`}
                    onClick={() => t.fields.Slug && loadTopic(t.fields.Slug)}
                  >
                    <span>{t.fields.Topic || 'Untitled'}</span>
                    <span className="en-level-tag">{t.fields.Level || ''}</span>
                  </div>
                ))}
              </div>
              <div className="en-sidebar-footer">
                <button className="en-btn-new" onClick={newTopic}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Topic
                </button>
              </div>
            </aside>

            {/* Editor main */}
            <div className="en-main">
              {!editorShown ? (
                <div className="en-empty">
                  <div>
                    <div className="en-empty-icon">📝</div>
                    <p>Select a topic from the list,<br />or create a new one.</p>
                  </div>
                </div>
              ) : (
                <div className="en-editor-shell">
                  {/* Meta bar */}
                  <div className="en-meta-bar">
                    <div className="en-meta-field">
                      <span className="en-meta-label">Topic</span>
                      <input
                        type="text"
                        className="en-meta-input"
                        placeholder="e.g. Binomial Expansion"
                        value={metaTopic}
                        onChange={e => handleTopicInput(e.target.value)}
                        style={{ minWidth: 180 }}
                      />
                    </div>
                    <div className="en-meta-field">
                      <span className="en-meta-label">Level</span>
                      <select
                        className="en-meta-select"
                        value={metaLevel}
                        onChange={e => handleLevelChange(e.target.value)}
                      >
                        <option value="AM">A-Math (Sec)</option>
                        <option value="EM">E-Math (Sec)</option>
                        <option value="JC">H2 Math (JC)</option>
                      </select>
                    </div>
                    <div className="en-meta-field">
                      <span className="en-meta-label">Slug</span>
                      <span className="en-slug-display">{slugDisplay}</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                      className="en-btn-view-live"
                      disabled={!currentSlug || currentSlug === '__new__'}
                      onClick={() => {
                        const url = `/revise?subject=${encodeURIComponent(metaLevel)}&topic=${encodeURIComponent(metaTopic)}`;
                        window.open(url, '_blank');
                      }}
                      title="Open live revision page in new tab"
                    >
                      ↗ View Live
                    </button>
                    <button
                      className="en-btn-undo"
                      onClick={performUndo}
                      disabled={undoCount === 0}
                      title="Undo last operation (Cmd+Z / Ctrl+Z when editor is not focused)"
                    >
                      ↩ Undo{undoCount > 0 ? ` (${undoCount})` : ''}
                    </button>
                    <button
                      className={`en-ai-btn${aiOpen ? ' active' : ''}`}
                      disabled={!currentSlug || currentSlug === '__new__'}
                      onClick={() => setAiOpen(o => !o)}
                      title="AI assistant — edit notes with natural language"
                    >
                      ✨ AI
                    </button>
                    <button
                      className={`en-btn-save${saveState === 'saved' ? ' saved' : ''}`}
                      onClick={saveNotes}
                      disabled={saveState === 'saving'}
                    >
                      {saveState === 'saving' ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'en-spin 1s linear infinite' }}>
                            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0" />
                          </svg>
                          Saving…
                        </>
                      ) : saveState === 'saved' ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Saved
                        </>
                      ) : (
                        <><FloppyIcon /> Save</>
                      )}
                    </button>
                  </div>

                  {/* AI Panel */}
                  {aiOpen && (
                    <div className="en-ai-panel">
                      <div className="en-ai-chips">
                        {[
                          '+ Worked example',
                          '+ Practice questions',
                          '+ Summary table',
                          'Simplify language',
                          'Add step markers',
                        ].map(chip => (
                          <button
                            key={chip}
                            className="en-ai-chip"
                            disabled={aiStatus === 'loading'}
                            onClick={() => setAiInstruction(chip)}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                      <div className="en-ai-row">
                        <textarea
                          className="en-ai-textarea"
                          placeholder="e.g. Add a worked example for completing the square"
                          value={aiInstruction}
                          rows={2}
                          disabled={aiStatus === 'loading'}
                          onChange={e => {
                            setAiInstruction(e.target.value);
                            sessionStorage.setItem('editNotesAiInstruction', e.target.value);
                          }}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault();
                              if (aiStatus !== 'loading' && aiInstruction.trim()) callAI();
                            }
                          }}
                        />
                        <div className="en-ai-actions">
                          {aiStatus === 'done' ? (
                            <>
                              <button className="en-ai-accept" onClick={acceptAI}>✓ Accept</button>
                              <button className="en-ai-reject" onClick={rejectAI}>✕ Reject</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="en-ai-apply"
                                onClick={callAI}
                                disabled={aiStatus === 'loading' || !aiInstruction.trim()}
                              >
                                {aiStatus === 'loading' ? 'Generating…' : 'Apply'}
                              </button>
                              <button
                                className="en-ai-cancel"
                                onClick={() => { rejectAI(); setAiOpen(false); }}
                                disabled={aiStatus === 'loading'}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {aiStatus === 'loading' && (
                        <div className="en-ai-status">⏳ Generating — preview updates live…</div>
                      )}
                      {aiStatus === 'error' && (
                        <div className="en-ai-status error">⚠️ Generation failed. Try again.</div>
                      )}
                      {aiStatus === 'done' && (
                        <div className="en-ai-status done">✓ Done — accept to apply changes, or reject to discard.</div>
                      )}
                    </div>
                  )}

                  {/* Panes */}
                  <div className="en-panes" ref={panesRef}>
                    {/* Preview pane — LEFT */}
                    <div
                      className="en-pane en-pane-preview"
                      style={previewWidthPx ? { flex: 'none', width: previewWidthPx } : undefined}
                    >
                      <div className="en-pane-header">
                        <span className="en-pane-label">Preview</span>
                        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }} title="Rendered exactly as it appears on the live /revise page">Matches live /revise page</span>
                      </div>
                      <div className="en-preview-body" ref={previewBodyRef}>
                        <nav
                          className="en-preview-sidebar"
                          ref={previewTabsRef}
                          style={sidebarWidthPx ? { width: sidebarWidthPx, flex: 'none' } : undefined}
                        />
                        <div
                          className="en-sidebar-divider"
                          onMouseDown={onSidebarDividerMouseDown}
                          onTouchStart={onSidebarDividerTouchStart}
                        >
                          <div className="en-sidebar-grip" />
                        </div>
                        <div className="en-preview-wrap">
                          <div className="en-preview" ref={previewRef} />
                        </div>
                      </div>
                    </div>

                    {/* Drag divider */}
                    <div
                      className="en-divider"
                      onMouseDown={onDividerMouseDown}
                      onTouchStart={onDividerTouchStart}
                    >
                      <div className="en-divider-grip" />
                    </div>

                    {/* Editor pane — RIGHT */}
                    <div className="en-pane en-pane-editor">
                      <div className="en-pane-header">
                        <span className="en-pane-label">
                          {previewSectionsRef.current[activeSectionRef.current]
                            ? `Editing: ${previewSectionsRef.current[activeSectionRef.current].title}`
                            : 'Editor'}
                        </span>
                        <div className="en-editor-toolbar">
                          <button className="en-tool-btn" onClick={insertSection} title="Insert new section heading">+ Section</button>
                          <button className="en-tool-btn" onClick={insertExample} title="Insert worked example">+ Example</button>
                          <button className="en-tool-btn" onClick={insertSolution} title="Insert solution card with steps">+ Solution</button>
                          <button className="en-tool-btn" onClick={insertPractice} title="Insert practice question">+ Practice</button>
                          <button className="en-tool-btn" onClick={insertList} title="Insert bullet list">+ List</button>
                          <button className="en-tool-btn" onClick={insertAligned} title="Insert aligned equations block">+ Aligned</button>
                          <button
                            className={`en-tool-btn en-tool-btn--help${syntaxOpen ? ' active' : ''}`}
                            onClick={() => setSyntaxOpen(o => !o)}
                            title="Syntax guide"
                          >?</button>
                        </div>
                        <span className="en-line-count">{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="en-editor-wrap">
                        <div className="en-line-numbers" ref={lineNumsRef} />
                        <textarea
                          ref={textareaRef}
                          className="en-textarea"
                          spellCheck={false}
                          autoCorrect="off"
                          autoCapitalize="off"
                          placeholder={"Start writing content here…\n\nUse **bold headings** for sections:\n\n**1. Binomial Expansion**\nThe binomial theorem states...\n\n**Example 1:**\nExpand $(1+x)^4$\n\n[Try: Expand $(2+x)^3$]\n[Ans: $8 + 12x + 6x^2 + x^3$]"}
                          onChange={handleEditorChange}
                          onScroll={syncLineNumbers}
                          onKeyDown={e => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const el = textareaRef.current!;
                              const start = el.selectionStart;
                              const end = el.selectionEnd;
                              el.value = el.value.substring(0, start) + '    ' + el.value.substring(end);
                              el.selectionStart = el.selectionEnd = start + 4;
                              updateLineNumbers();
                            }
                            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                              e.preventDefault();
                              saveNotes();
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Syntax guide overlay */}
                  {syntaxOpen && (
                    <div className="en-syntax-overlay" onClick={() => setSyntaxOpen(false)}>
                      <div className="en-syntax-panel" onClick={e => e.stopPropagation()}>
                        <div className="en-syntax-header">
                          <span>Syntax Guide</span>
                          <button className="en-syntax-close" onClick={() => setSyntaxOpen(false)}>✕</button>
                        </div>
                        <div className="en-syntax-body">
                          <table className="en-syntax-table">
                            <tbody>
                              <tr><td><code>**1. Section Name**</code></td><td>Creates a section tab</td></tr>
                              <tr><td><code>**Example:**</code></td><td>Example card (navy top bar)</td></tr>
                              <tr><td><code>**Solution:**</code></td><td>Solution card (green top bar)</td></tr>
                              <tr><td><code>**Part (a):**</code> or <code>**(a)**</code></td><td>Part label with circle badge</td></tr>
                              <tr><td><code>**Step 1:** text</code></td><td>Numbered step with spacing</td></tr>
                              <tr><td><code>[5]</code> or <code>[5 marks]</code></td><td>Right-aligned marks badge (end of line)</td></tr>
                              <tr><td><code>$$\begin&#123;aligned&#125; x+2 &amp;= 5 \\ x &amp;= 3 \end&#123;aligned&#125;$$</code></td><td>Aligned equations (align on =)</td></tr>
                              <tr><td><code>[Try: question]</code></td><td>Practice callout</td></tr>
                              <tr><td><code>[Ans: answer]</code></td><td>Click-to-reveal answer</td></tr>
                              <tr><td><code>**Note:** text</code></td><td>Note box</td></tr>
                              <tr><td><code>$math$</code></td><td>Inline math (KaTeX)</td></tr>
                              <tr><td><code>$$math$$</code></td><td>Display math (centered)</td></tr>
                              <tr><td><code>$$left math$$</code></td><td>Display math (left-aligned)</td></tr>
                              <tr><td><code>## Heading</code></td><td>Sub-heading</td></tr>
                              <tr><td><code>- item</code></td><td>Bullet list</td></tr>
                              <tr><td><code>1. item</code></td><td>Numbered list</td></tr>
                              <tr><td><code>**bold**</code></td><td>Bold text</td></tr>
                              <tr><td><code>*italic*</code></td><td>Italic text</td></tr>
                              <tr><td><code>---</code></td><td>Horizontal rule</td></tr>
                              <tr><td>Single newline</td><td>Line break</td></tr>
                              <tr><td>Double newline</td><td>New paragraph</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
