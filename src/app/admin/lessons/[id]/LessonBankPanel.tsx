// LessonBankPanel — copy of admin/edit-cards/BankPanel adapted for the lesson editor's
// filter shape. Lessons filter by (level, topics[]) rather than (level, topic, subgroupId).
// Drag payload identical: `application/x-bank-question` carrying the full question row JSON.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { getOfflineSettings, queryLocalBank, syncEnabledLevels } from '@/lib/offline/qb-cache';
import { ProposalSheet, loadRejected, type Proposal } from './ProposalSheet';

export type BankQuestion = {
  id: string;
  school: string;
  year: number;
  paper: string;
  question_number: string;
  question_text: string | null;
  parts: unknown;
  answer: string | null;
  solution: string | null;
  solution_images: string | null;
  topics: string[] | null;
  total_marks: number | null;
  has_image: boolean;
  image_url: string | null;
  images: { filename: string }[] | null;
  difficulty: string | null;
  source_file: string | null;
  exam_type?: string | null;
  level?: string | null;
  usage_count: number;
  subgroup_links: { id: number; name: string; isPrimary: boolean }[];
};

type SearchMode = 'keyword' | 'smart';
type Source = 'server' | 'local' | 'unavailable';
// The committed search — what actually drives a fetch. Set only when the user clicks Search
// (or presses Enter), so typing/toggling never fires a request on its own. Difficulty/image are
// NOT here — they're client-side display filters and never trigger a fetch.
type Committed = { query: string; mode: SearchMode; aiModel: 'haiku' | 'sonnet' };

// Module-scoped cache of the last bank search. The editor mounts the panel with
// key={selectedCard.id}, so switching cards REMOUNTS this component and would otherwise wipe
// the query + results — forcing a fresh (token-costing) AI search to reuse the same questions.
// Persisting here lets a remount rehydrate instantly and skip re-fetching when nothing changed.
type BankCache = {
  lessonKey: string;   // level + topics — only reuse within the same lesson scope
  sig: string;         // full search signature; identical sig ⇒ reuse, don't re-fetch
  search: string;
  mode: SearchMode;
  aiModel: 'haiku' | 'sonnet';
  hasImage: 'any' | 'true' | 'false';
  difficulties: Difficulty[];
  year: string;
  exam: string;
  results: BankQuestion[];
  total: number;
  source: Source;
};
let bankCache: BankCache | null = null;
// Scroll position of the results list, kept across the card-switch remount so the bank panel
// stays parked on the question you were looking at instead of jumping back to the top. Persisted
// to localStorage (debounced) so a full page refresh ALSO restores the position.
let bankScroll: { lessonKey: string; top: number } = { lessonKey: '', top: 0 };
const BANK_SCROLL_LS_KEY = 'lesson_bank_scroll_v1';
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
function persistScroll() {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    try { window.localStorage.setItem(BANK_SCROLL_LS_KEY, JSON.stringify(bankScroll)); } catch { /* non-fatal */ }
  }, 300);
}

// Persist the cache to localStorage so a full page reload restores the LAST search (query +
// results) instead of falling back to the default topic listing — and without re-spending tokens.
const BANK_CACHE_LS_KEY = 'lesson_bank_cache_v1';
let lsLoaded = false;
function ensureCacheLoaded() {
  if (lsLoaded) return;
  lsLoaded = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(BANK_CACHE_LS_KEY);
    if (raw) bankCache = JSON.parse(raw) as BankCache;
  } catch { /* ignore corrupt/old payloads */ }
  try {
    const s = window.localStorage.getItem(BANK_SCROLL_LS_KEY);
    if (s) bankScroll = JSON.parse(s) as { lessonKey: string; top: number };
  } catch { /* ignore */ }
}
function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    if (bankCache) window.localStorage.setItem(BANK_CACHE_LS_KEY, JSON.stringify(bankCache));
    else window.localStorage.removeItem(BANK_CACHE_LS_KEY);
  } catch { /* quota/serialise issue — non-fatal */ }
}

const DIFFICULTIES = ['Standard', 'Advanced', 'Challenging', 'Bonus'] as const;
// How many question cards to mount per "Show more" page (see renderCap below).
const RENDER_CAP_STEP = 40;
type Difficulty = typeof DIFFICULTIES[number];

const STORAGE_BUCKET = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/';

// ---------- Image schema helpers (mirrors edit-cards/BankPanel) ----------

type StemImageRecord = { url: string; pos: 'before' | 'after' };

function toStorageUrl(s: string): string {
  return s.startsWith('http') ? s : STORAGE_BUCKET + s.replace(/^question_images\//, '');
}

function isPlausibleFilename(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 6
    && !['[]', '{}', 'null', 'undefined', '[object Object]'].includes(s.trim());
}

function getStemImageRecords(q: BankQuestion): StemImageRecord[] {
  const records: StemImageRecord[] = [];
  const raw = (q.image_url ?? '').trim();
  if (raw && raw !== '[]') {
    let parsed: unknown;
    try {
      parsed = raw.startsWith('[') ? JSON.parse(raw) : raw;
    } catch {
      parsed = raw;
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of arr) {
      if (typeof entry === 'string' && isPlausibleFilename(entry)) {
        records.push({ url: entry, pos: 'after' });
      } else if (entry && typeof entry === 'object' && 'url' in entry && isPlausibleFilename((entry as { url: unknown }).url)) {
        const e = entry as { url: string; pos?: string };
        records.push({ url: e.url, pos: e.pos === 'before' ? 'before' : 'after' });
      }
    }
  }
  // Fallback: legacy rows whose only image records live in `images` (even when image_url is NULL).
  if (records.length === 0 && q.images && q.images.length > 0) {
    for (const img of q.images) {
      if (isPlausibleFilename(img?.filename)) records.push({ url: img.filename, pos: 'after' });
    }
  }
  return records;
}

function getSolutionImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[]') return [];
  try {
    const parsed = trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter(isPlausibleFilename) as string[];
  } catch {
    return isPlausibleFilename(trimmed) ? [trimmed] : [];
  }
}

// remark-math mis-pairs `$` around escaped-dollar currency (`$\$32000$`), swallowing the prose
// between two amounts into an italic run-together span. Convert a self-contained currency span to
// plain escaped text `\$<number>` (renders as a literal $) so remark-math never pairs those `$`.
function fixCurrencyDollars(text: string): string {
  // House style writes currency inside math with an escaped dollar: $\$20$, $\$k$, $\$8{,}250$,
  // $\$100900(1.009)^{n-1} - \$90810$. remark-math doesn't honour the escape and mis-pairs the
  // `$`s, swallowing prose as run-together math. Rewrite EVERY `\$` inside a math span to
  // \text{\textdollar} (no `$` character at all) so the span pairs cleanly and still renders as
  // real math. The span matcher is escape-aware so an interior `\$` doesn't end the span.
  return asText(text).replace(/\$((?:\\.|[^$\\])*)\$/g, (m, body: string) => {
    if (!body.includes('\\$')) return m; // ordinary math — leave untouched
    return `$${body.replace(/\\\$/g, '\\text{\\textdollar}')}$`;
  });
}

// Render guard for malformed source: a line with an ODD number of unescaped `$` has a stray/missing
// delimiter (a data artifact), which makes remark-math greedily italicise everything after it. Strip
// that line's single `$` so it renders as plain readable text instead of a garbled blob. Balanced
// lines (real math) are untouched; `$$` display delimiters count as two, so they're unaffected.
// Also closes a display block that opens `$$` but never closes on its own line (an import artifact:
// some marking-scheme solutions dropped the trailing `$$`). An unclosed `$$` line has an EVEN single-$
// count so the odd-count guard misses it, and remark-math's math-flow parser then swallows everything
// up to the next `$$` — across paragraph breaks — into one giant failing KaTeX node (the "red blob").
function balanceDollars(text: string): string {
  return joinMultilineMath(asText(text)).split('\n').map(line => {
    const t = line.trimEnd();
    if (t.startsWith('$$') && t.length > 2 && !t.slice(2).includes('$$')) return t + '$$';
    const singles = (line.match(/(?<!\\)\$/g) || []).length;
    return singles % 2 === 1 ? line.replace(/(?<!\\)\$/g, '') : line;
  }).join('\n');
}

// Inline math that SPANS lines — `$\mathbf{r} = \begin{pmatrix}` / rows / `\end{pmatrix}…$`, an
// import artifact seen in CJC 2025 — can't be parsed by remark-math (inline `$…$` must stay on one
// line), and the odd-$ guard above would strip its delimiters, leaving raw LaTeX. Join such spans
// onto one line first (KaTeX renders single-line pmatrix fine). A stray `$` that never closes
// within the lookahead window is left alone for the odd-$ guard to neutralise.
function joinMultilineMath(text: string): string {
  const singles = (s: string) => (s.match(/(?<!\\)\$/g) || []).length;
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('$$') || singles(line) % 2 === 0) { out.push(line); continue; }
    let j = i + 1, parity = 1, closed = false;
    for (; j < lines.length && j <= i + 12; j++) {
      if (lines[j].includes('$$')) break;
      parity = (parity + singles(lines[j])) % 2;
      if (parity === 0) { closed = true; break; }
    }
    if (closed) { out.push(lines.slice(i, j + 1).join(' ')); i = j; }
    else out.push(line);
  }
  return out.join('\n');
}

// Coerce malformed jsonb values (an import once stored a part's `text` as an ARRAY,
// which made `.replace`/`.split` throw inside render and killed the whole tab).
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => asText(x)).join('\n');
  if (v == null) return '';
  return String(v);
}

function renderInlineImagesInText(text: string | null | undefined): string {
  if (!text) return '';
  return balanceDollars(fixCurrencyDollars(asText(text))).replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
    const cleaned = url.trim();
    if (!isPlausibleFilename(cleaned)) return '';
    return `<img src="${toStorageUrl(cleaned)}" alt="" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px 0" />`;
  });
}

function partImageHtml(path: string | null | undefined): string {
  if (!isPlausibleFilename(path)) return '';
  return `<img src="${toStorageUrl(path)}" alt="" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px 0" />`;
}

/** Build the markdown content for a "full template" drop from a bank question. */
export function buildBankWorkedExampleTemplate(q: BankQuestion): { title: string; content: string } {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const title = `${tag}`;

  const out: string[] = [];
  out.push(`**${tag}**`);

  const stemRecords = getStemImageRecords(q);
  const stemBefore = stemRecords.filter(r => r.pos === 'before');
  const stemAfter = stemRecords.filter(r => r.pos === 'after');

  // Stem-only questions (no parts) carry their marks ONLY in total_marks — append them to the stem
  // so the exported question still shows "[3m]".
  const partsForMarks = Array.isArray(q.parts) ? (q.parts as Array<{ label?: string; text?: string }>) : [];
  const hasPartContent = partsForMarks.some(p => p && (p.label || (p.text && p.text.trim())));
  const stemMarks = !hasPartContent && q.total_marks ? ` [${q.total_marks}m]` : '';

  for (const r of stemBefore) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:8px 0" />`);
  }
  if (q.question_text) out.push(renderInlineImagesInText(q.question_text) + stemMarks);
  for (const r of stemAfter) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:8px 0" />`);
  }

  if (Array.isArray(q.parts) && q.parts.length > 0) {
    type PartLike = {
      label?: string; text?: string; marks?: number;
      image_url?: string; image_url_after?: string;
      subparts?: Array<{ label?: string; text?: string; marks?: number; image_url?: string; image_url_after?: string }>;
    };
    const sub: string[] = [];
    for (const p of q.parts as PartLike[]) {
      if (!p) continue;
      const marks = p.marks ? ` [${p.marks}m]` : '';
      const lines: string[] = [];
      const beforeImg = partImageHtml(p.image_url);
      const afterImg = partImageHtml(p.image_url_after);
      if (beforeImg) lines.push(beforeImg);
      // Stem-only questions are stored as a single unlabeled part — emit its text with no "(label)".
      const label = p.label ? `(${p.label}) ` : '';
      if (label || (p.text && p.text.trim())) lines.push(`${label}${renderInlineImagesInText(p.text)}${marks}`);
      if (afterImg) lines.push(afterImg);
      sub.push(lines.join('\n\n'));

      if (Array.isArray(p.subparts)) {
        for (const sp of p.subparts) {
          if (!sp?.label) continue;
          const spMarks = sp.marks ? ` [${sp.marks}m]` : '';
          const spLines: string[] = [];
          const spBefore = partImageHtml(sp.image_url);
          const spAfter = partImageHtml(sp.image_url_after);
          if (spBefore) spLines.push(`  ${spBefore}`);
          spLines.push(`  (${sp.label}) ${renderInlineImagesInText(sp.text)}${spMarks}`);
          if (spAfter) spLines.push(`  ${spAfter}`);
          sub.push(spLines.join('\n\n'));
        }
      }
    }
    if (sub.length > 0) out.push(sub.join('\n\n'));
  }

  type PartSolution = {
    label?: string; solution?: string; solution_image?: string;
    subparts?: Array<{ label?: string; solution?: string; solution_image?: string }>;
  };
  const solBits: string[] = [];
  if (q.solution) solBits.push(renderInlineImagesInText(q.solution));
  for (const u of getSolutionImageUrls(q.solution_images)) {
    solBits.push(`<img src="${toStorageUrl(u)}" alt="solution diagram" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px 0" />`);
  }
  if (Array.isArray(q.parts)) {
    for (const p of q.parts as PartSolution[]) {
      if (p?.solution) solBits.push(`**(${p.label})** ${renderInlineImagesInText(p.solution)}`);
      const psi = partImageHtml(p?.solution_image);
      if (psi) solBits.push(psi);
      if (Array.isArray(p?.subparts)) {
        for (const sp of p.subparts) {
          if (sp?.solution) solBits.push(`**(${p.label})(${sp.label})** ${renderInlineImagesInText(sp.solution)}`);
          const spsi = partImageHtml(sp?.solution_image);
          if (spsi) solBits.push(spsi);
        }
      }
    }
  }

  if (solBits.length > 0) {
    out.push('---');
    out.push('**Working:**');
    out.push(solBits.join('\n\n'));
  }
  // Compile the answer line from the top-level answer AND per-part/subpart answers — many bank
  // questions store answers only on their parts (no top-level answer).
  type PartAnswer = { label?: string; answer?: string; subparts?: Array<{ label?: string; answer?: string }> };
  const ansBits: string[] = [];
  if (q.answer && String(q.answer).trim()) ansBits.push(renderInlineImagesInText(q.answer));
  if (Array.isArray(q.parts)) {
    for (const p of q.parts as PartAnswer[]) {
      if (!p) continue;
      if (p.answer && String(p.answer).trim()) {
        ansBits.push(`${p.label ? `(${p.label}) ` : ''}${renderInlineImagesInText(p.answer)}`);
      }
      if (Array.isArray(p.subparts)) {
        for (const sp of p.subparts) {
          if (sp?.answer && String(sp.answer).trim()) {
            ansBits.push(`(${p.label ?? ''})(${sp.label ?? ''}) ${renderInlineImagesInText(sp.answer)}`);
          }
        }
      }
    }
  }
  if (ansBits.length > 0) {
    out.push('---');
    // One answer part per line so the export can list them under "Answer:".
    out.push(ansBits.length === 1 ? `**Answer:** ${ansBits[0]}` : `**Answer:**\n${ansBits.join('\n')}`);
  }

  return { title, content: out.join('\n\n') };
}

// ── Single-question DOCX export ──
// Builds a one-question .docx in house style. With generateSolution=true the AI authors a worked
// solution first (used for the file only — NOT saved to the question bank).
const SOLVE_INSTRUCTION = `Add a full worked solution to this card. Preserve every labelled part — if the input has (a), (b), (i), (ii), keep them all and solve each. Put the working under a line "**Working:**". Use $\\begin{aligned}...\\end{aligned}$ for chained equations. Keep the original question text intact above the working.`;

export async function downloadQuestionDocx(q: BankQuestion, auth: string, generateSolution: boolean): Promise<void> {
  const { title, content } = buildBankWorkedExampleTemplate(q);
  let fullContent = content;
  if (generateSolution) {
    const res = await fetch('/api/edit-cards-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: SOLVE_INSTRUCTION,
        currentTitle: title,
        currentContent: content,
        level: q.level ?? 'JC',
        topic: q.topics?.[0] ?? '',
        subgroupName: 'Single question export',
        subgroupDescription: `One-off DOCX export. Topics: ${(q.topics ?? []).join(', ')}.`,
        content_kind: 'practice',
        password: auth,
      }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({} as { error?: string })); throw new Error(j.error || `HTTP ${res.status}`); }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '', result = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const data = JSON.parse(part.slice(6)) as { error?: string; chunk?: string };
        if (data.error) throw new Error(data.error);
        if (data.chunk) result += data.chunk;
      }
    }
    if (result.trim()) fullContent = result.trim();
  }
  const examDisp = q.exam_type === 'MY' ? 'MYE' : q.exam_type;
  const sourceTag = [q.year, q.level, examDisp, q.school, `P${q.paper}`, `Q${q.question_number}`].filter(Boolean).join('/');
  const { buildLessonDocx } = await import('@/lib/lesson-docx-build');
  const blob = await buildLessonDocx(
    { name: title, level: q.level ?? 'JC', description: null, topics: q.topics ?? [], section_order: ['Question'] },
    [{
      id: q.id, content_kind: 'worked_example', section_name: 'Question', card_title: title,
      content: fullContent, marks: q.total_marks ?? null, order_index: 0, source_tag: sourceTag,
    }],
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^a-z0-9-]+/gi, '_')}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function LessonBankPanel({
  level,
  topics,
  auth,
  onDragQuestion,
  onInsert,
  onStage,
  isStaged,
}: {
  level: string;
  topics: string[];
  auth: string;
  onDragQuestion?: (q: BankQuestion | null) => void;
  /** Quick-insert (button) — drops a card into a specific kind. */
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
  /** Add a question to the staging tray. */
  onStage?: (q: BankQuestion) => void;
  /** Whether a given question id is already staged (for button state). */
  isStaged?: (id: string) => boolean;
}) {
  // Identity of the current lesson scope — cache is only reused when this matches.
  ensureCacheLoaded(); // hydrate the module cache from localStorage on first use (survives reload)
  const lessonKey = `${level}::${[...topics].sort().join('|')}`;
  const hit = bankCache && bankCache.lessonKey === lessonKey ? bankCache : null;

  // `search`/`mode`/`aiModel` are the PENDING (typed) values; `committed` is what's actually been
  // searched. They diverge until the user clicks Search.
  const [search, setSearch] = useState(hit?.search ?? '');
  const [mode, setMode] = useState<SearchMode>(hit?.mode ?? 'keyword');
  const [aiModel, setAiModel] = useState<'haiku' | 'sonnet'>(hit?.aiModel ?? 'haiku');
  const [committed, setCommitted] = useState<Committed>(
    hit ? { query: hit.search, mode: hit.mode, aiModel: hit.aiModel } : { query: '', mode: 'keyword', aiModel: 'haiku' },
  );
  const [hasImage, setHasImage] = useState<'any' | 'true' | 'false'>(hit?.hasImage ?? 'any');
  const [difficulties, setDifficulties] = useState<Set<Difficulty>>(new Set(hit?.difficulties ?? []));
  const [year, setYear] = useState<string>(hit?.year ?? 'any');
  const [school, setSchool] = useState<string>('any');
  // Exam-type filter (JC only — its papers are Promo/MY/Prelim). Client-side display filter.
  const isJC = ['JC', 'JC1', 'JC2'].includes(level);
  const [exam, setExam] = useState<string>(hit?.exam ?? 'any');
  // Topic include/exclude (client-side, over the lesson's own topics). Include can be ALL (must have
  // every picked topic) or ANY (at least one). Exclude removes questions carrying any picked topic.
  const [includeTopics, setIncludeTopics] = useState<Set<string>>(new Set());
  const [excludeTopics, setExcludeTopics] = useState<Set<string>>(new Set());
  const [includeMode, setIncludeMode] = useState<'all' | 'any'>('all');
  // Topic chips visible by default; collapsing is remembered.
  const [topicFilterOpen, setTopicFilterOpen] = useState(true);
  useEffect(() => {
    try { const v = localStorage.getItem('lesson_bank_topic_filter_open'); if (v !== null) setTopicFilterOpen(v === '1'); } catch { /* ignore */ }
  }, []);
  function toggleTopicFilterOpen() {
    setTopicFilterOpen(o => {
      const n = !o;
      try { localStorage.setItem('lesson_bank_topic_filter_open', n ? '1' : '0'); } catch { /* ignore */ }
      return n;
    });
  }
  // Browsing-only image scale for previews (display preference, persisted locally; never touches the DB).
  const [imgScale, setImgScale] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('lesson_bank_img_scale')); return v >= 20 && v <= 100 ? v : 100; } catch { return 100; }
  });
  useEffect(() => { try { localStorage.setItem('lesson_bank_img_scale', String(imgScale)); } catch { /* ignore */ } }, [imgScale]);
  // How many rows to fetch for keyword/local browsing. "Load more" raises it. Resets on new search.
  const [limit, setLimit] = useState(100);
  const [questions, setQuestions] = useState<BankQuestion[]>(hit?.results ?? []);
  const [total, setTotal] = useState(hit?.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lets us reuse the cache on the FIRST effect run (mount / card-switch remount) but force a real
  // fetch on any later run (i.e. when the user explicitly clicks Search).
  const firstRun = useRef(true);
  // Scrollable results container — used to save/restore scroll position across card switches.
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRestored = useRef(false);

  // Pick the data source per fetch:
  //   * online & offline mode off  → server
  //   * online & offline mode on for this level → local cache (snappier, no waiting)
  //   * offline & cache available  → local cache
  //   * offline & cache empty      → friendly empty state
  const [source, setSource] = useState<Source>(hit?.source ?? 'server');

  // Distinct years present in the current result set, newest first — populates the Year dropdown.
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const q of questions) if (typeof q.year === 'number') ys.add(q.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [questions]);

  // Distinct schools in the current result set — populates the School dropdown.
  const availableSchools = useMemo(() => {
    const ss = new Set<string>();
    for (const q of questions) if (q.school) ss.add(q.school);
    return Array.from(ss).sort();
  }, [questions]);

  // Difficulty/image/year are client-side display filters over the fetched set — they NEVER trigger
  // a fetch (so changing them can't spend AI tokens). `displayed` is what the list renders.
  // ✨ Propose lesson — AI reads the current filtered candidates and proposes the
  // example/practice split per concept checklist; reviewed in ProposalSheet.
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalCandidates, setProposalCandidates] = useState<BankQuestion[]>([]);
  const [proposeError, setProposeError] = useState<string | null>(null);
  // Model toggle for Propose lesson — persisted; 'opus' is half the API cost of 'fable'.
  const [proposeModel, setProposeModel] = useState<'opus' | 'fable'>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('lesson_propose_model') === 'fable' ? 'fable' : 'opus'; } catch { return 'opus'; }
  });
  function pickProposeModel(m: 'opus' | 'fable') {
    setProposeModel(m);
    try { localStorage.setItem('lesson_propose_model', m); } catch { /* ignore */ }
  }

  // Render at most this many cards at once — each card is a heavy ReactMarkdown+KaTeX
  // tree, and mounting 100+ in a single synchronous render can hang or crash the tab
  // (seen when switching the Year filter onto a large set). "Show more" pages it.
  const [renderCap, setRenderCap] = useState(RENDER_CAP_STEP);
  useEffect(() => { setRenderCap(RENDER_CAP_STEP); },
    [questions, difficulties, hasImage, year, school, exam, includeTopics, excludeTopics, includeMode]);

  const displayed = useMemo(() => {
    let list = questions;
    if (difficulties.size > 0) list = list.filter(q => difficulties.has((q.difficulty ?? 'Standard') as Difficulty));
    if (hasImage !== 'any') list = list.filter(q => (hasImage === 'true' ? q.has_image : !q.has_image));
    if (year !== 'any') {
      // `year` may be a CSV of years (multi-select chips), e.g. "2024,2025".
      const ys = new Set(year.split(','));
      list = list.filter(q => ys.has(String(q.year)));
    }
    if (school !== 'any') list = list.filter(q => q.school === school);
    // The Exam select only RENDERS for JC levels — never let a leftover value filter
    // invisibly on Sec/EM/AM lessons where the control is hidden.
    if (exam !== 'any' && isJC) {
      // 'MY:JC1' style values pin BOTH exam type and level; plain values match exam type only.
      // Rows from an older offline cache may lack `level` — let those through rather than hide them.
      const [exType, exLevel] = exam.split(':');
      list = list.filter(q => (q.exam_type ?? '') === exType && (!exLevel || !q.level || q.level === exLevel));
    }
    const inc = [...includeTopics], exc = [...excludeTopics];
    if (inc.length > 0) {
      list = list.filter(q => {
        const t = q.topics ?? [];
        return includeMode === 'all' ? inc.every(x => t.includes(x)) : inc.some(x => t.includes(x));
      });
    }
    if (exc.length > 0) list = list.filter(q => { const t = q.topics ?? []; return !exc.some(x => t.includes(x)); });
    return list;
  }, [questions, difficulties, hasImage, year, exam, isJC, school, includeTopics, excludeTopics, includeMode]);

  // Read current filters at fetch-time without putting them in the fetch effect's deps.
  const filtersRef = useRef({ hasImage, difficulties, year, exam });
  filtersRef.current = { hasImage, difficulties, year, exam };

  // Keep the cache's filter fields current so a remount rehydrates the latest filter UI.
  useEffect(() => {
    if (bankCache && bankCache.lessonKey === lessonKey) {
      bankCache.hasImage = hasImage;
      bankCache.difficulties = Array.from(difficulties);
      bankCache.year = year;
      bankCache.exam = exam;
    }
  }, [hasImage, difficulties, year, exam, lessonKey]);

  // Fetch is driven ONLY by `committed` (set on Search click / Enter) and level/topics.
  useEffect(() => {
    if (!level || topics.length === 0) {
      setQuestions([]); setTotal(0); firstRun.current = false; return;
    }
    const cQuery = committed.query.trim();
    const cSmart = committed.mode === 'smart';
    // Smart with an empty query: nothing to rank.
    if (cSmart && !cQuery) {
      setQuestions([]); setTotal(0); setError(null); firstRun.current = false; return;
    }
    const sig = JSON.stringify({ k: lessonKey, q: cQuery, m: cSmart ? `smart:${committed.aiModel}` : 'kw' });
    // First run after (re)mount with a matching cache → reuse, no fetch (token-saver on card switch).
    // Any later run is an explicit Search → always fetch fresh.
    if (firstRun.current && bankCache && bankCache.lessonKey === lessonKey && bankCache.sig === sig) {
      setSource(bankCache.source); setQuestions(bankCache.results); setTotal(bankCache.total); setError(null);
      firstRun.current = false;
      return;
    }
    firstRun.current = false;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const commit = (list: BankQuestion[], tot: number, src: Source) => {
        setSource(src); setQuestions(list); setTotal(tot);
        bankCache = {
          lessonKey, sig,
          search: committed.query, mode: committed.mode, aiModel: committed.aiModel,
          hasImage: filtersRef.current.hasImage, difficulties: Array.from(filtersRef.current.difficulties),
          year: filtersRef.current.year, exam: filtersRef.current.exam,
          results: list, total: tot, source: src,
        };
        persistCache(); // survive a full reload
      };

      // Use the local cache ONLY when offline mode is explicitly enabled for this level.
      // We deliberately ignore navigator.onLine — it reports false "offline" far too often.
      const settings = await getOfflineSettings();
      const offlineModeOn = settings.enabled && settings.levels.includes(level);
      if (cancelled) return;

      // Keyword browse while offline mode is on → read the synced local cache.
      if (offlineModeOn && !cSmart) {
        // Pull a quick delta first so fresh edits (e.g. a diagram just uploaded in the question
        // viewer) appear. The sync is updated_at-cursored, so it's near-instant when nothing changed;
        // if we're genuinely offline it fails silently and we serve the cache as before.
        try { await syncEnabledLevels(); } catch { /* offline — use what we have */ }
        if (cancelled) return;
        const local = await queryLocalBank({ level, topics, search: cQuery || undefined, limit });
        if (cancelled) return;
        if (local.length === 0) {
          setSource('unavailable'); setQuestions([]); setTotal(0); // enabled but not synced yet
        } else {
          commit(local as unknown as BankQuestion[], local.length, 'local');
        }
        return;
      }

      try {
        // Smart (AI-rerank) path — needs the server.
        if (cSmart && cQuery) {
          const params = new URLSearchParams();
          params.set('level', level);
          params.set('topics', topics.join(','));
          params.set('q', cQuery);
          params.set('model', committed.aiModel);
          params.set('limit', '60');
          const res = await fetch(`/api/admin/lessons/bank-semantic?${params.toString()}`, { headers: { Authorization: `Bearer ${auth}` } });
          if (!res.ok) {
            const j = await res.json().catch(() => ({} as { error?: string }));
            throw new Error(j.error || `HTTP ${res.status}`);
          }
          const json = await res.json();
          if (cancelled) return;
          commit((json.questions ?? []) as BankQuestion[], (json.questions ?? []).length, 'server');
          return;
        }

        // Server path (keyword)
        const params = new URLSearchParams();
        params.set('level', level);
        params.set('topics', topics.join(','));
        if (cQuery) params.set('q', cQuery);
        params.set('limit', String(limit));
        const res = await fetch(`/api/admin/lessons/bank?${params.toString()}`, { headers: { Authorization: `Bearer ${auth}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        commit(json.questions ?? [], json.total ?? (json.questions?.length ?? 0), 'server');
      } catch (e) {
        if (cancelled) return;
        // Genuine network/server failure. For keyword, fall back to local cache if we have it.
        if (!cSmart) {
          try {
            const local = await queryLocalBank({ level, topics, search: cQuery || undefined, limit });
            if (cancelled) return;
            if (local.length > 0) { commit(local as unknown as BankQuestion[], local.length, 'local'); return; }
          } catch { /* ignore and fall through to error */ }
        }
        setError(e instanceof Error ? e.message : 'Load error');
        setQuestions([]); setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [level, topics, lessonKey, committed, auth, limit]);

  // Restore the saved scroll position once this lesson's results are on screen (after a card switch).
  // Runs once per mount so it doesn't fight the user's own scrolling.
  useEffect(() => {
    if (scrollRestored.current || !listRef.current || questions.length === 0) return;
    if (bankScroll.lessonKey === lessonKey) listRef.current.scrollTop = bankScroll.top;
    scrollRestored.current = true;
  }, [questions, lessonKey]);

  const committedSmart = committed.mode === 'smart';
  // True when the typed query/mode/model differs from what's been searched — highlights Search.
  const dirty = search.trim() !== committed.query.trim()
    || mode !== committed.mode
    || (mode === 'smart' && aiModel !== committed.aiModel);

  function runSearch() {
    if (topics.length === 0) return;
    const q = search.trim();
    if (mode === 'smart' && !q) return; // nothing to rank
    bankScroll = { lessonKey, top: 0 };          // a fresh search starts at the top
    persistScroll();
    listRef.current?.scrollTo({ top: 0 });
    setLimit(100);
    setCommitted({ query: q, mode, aiModel });
  }

  function clearSearch() {
    setSearch('');
    setMode('keyword');
    bankScroll = { lessonKey, top: 0 };
    persistScroll();
    listRef.current?.scrollTo({ top: 0 });
    setLimit(100);
    setCommitted({ query: '', mode: 'keyword', aiModel });
    if (bankCache && bankCache.lessonKey === lessonKey) bankCache = null;
    persistCache();
  }

  function toggleDifficulty(d: Difficulty) {
    setDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  // A topic chip cycles neutral → include (green) → exclude (red) → neutral.
  function cycleTopic(t: string) {
    const inInc = includeTopics.has(t), inExc = excludeTopics.has(t);
    if (!inInc && !inExc) {
      setIncludeTopics(s => { const n = new Set(s); n.add(t); return n; });
    } else if (inInc) {
      setIncludeTopics(s => { const n = new Set(s); n.delete(t); return n; });
      setExcludeTopics(s => { const n = new Set(s); n.add(t); return n; });
    } else {
      setExcludeTopics(s => { const n = new Set(s); n.delete(t); return n; });
    }
  }
  function clearTopicFilter() { setIncludeTopics(new Set()); setExcludeTopics(new Set()); }
  const topicFilterCount = includeTopics.size + excludeTopics.size;

  async function runPropose() {
    if (displayed.length === 0 || proposing) return;
    setProposing(true); setProposeError(null);
    const candidates = displayed;            // snapshot the current filtered pool
    try {
      const res = await fetch('/api/admin/lessons/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({
          level, topics,
          questionIds: candidates.map(q => q.id),
          rejectedIds: loadRejected(lessonKey),
          model: proposeModel,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error || `HTTP ${res.status}`) + (json.raw ? ` — starts: ${String(json.raw).slice(0, 160)}` : ''));
      setProposalCandidates(candidates);
      setProposal(json as Proposal);
    } catch (e) {
      setProposeError(e instanceof Error ? e.message : 'Proposal failed');
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Browsing-only image scaling for previews (overrides the inline max-width:100% on each img). */}
      {imgScale < 100 && <style>{`.bank-q-prose img{max-width:${imgScale}% !important;height:auto}`}</style>}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="font-medium">{level}</span>·
          <span className="truncate" title={topics.join(', ')}>{topics.length === 0 ? '(no topics)' : topics.length === 1 ? topics[0] : `${topics.length} topics`}</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode('keyword')}
            className={`flex-1 px-2 py-0.5 rounded text-[11px] border ${mode === 'keyword' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
          >Keyword</button>
          <button
            onClick={() => setMode('smart')}
            title="Search by meaning using question embeddings"
            className={`flex-1 px-2 py-0.5 rounded text-[11px] border ${mode === 'smart' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
          >✨ Smart</button>
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
            placeholder={topics.length === 0 ? 'Add topics to enable bank' : mode === 'smart' ? 'Describe it, e.g. conics hyperbola' : 'Search text or school…'}
            disabled={topics.length === 0}
            className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={runSearch}
            disabled={topics.length === 0 || (mode === 'smart' && !search.trim())}
            title="Run the search"
            className={`px-2.5 py-1 text-xs rounded text-white disabled:opacity-40 ${dirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 hover:bg-slate-500'}`}
          >Search</button>
          <button
            onClick={clearSearch}
            disabled={topics.length === 0}
            title="Clear search and cached results"
            className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >Clear</button>
        </div>
        {mode === 'smart' && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">Claude reads &amp; ranks, within this lesson&apos;s topics.</span>
            <span className="flex items-center gap-0.5 text-[10px]">
              <button
                onClick={() => setAiModel('haiku')}
                title="Fast & cheap"
                className={`px-1.5 py-px rounded border ${aiModel === 'haiku' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
              >Haiku</button>
              <button
                onClick={() => setAiModel('sonnet')}
                title="Slower, sharper judgement"
                className={`px-1.5 py-px rounded border ${aiModel === 'sonnet' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
              >Sonnet</button>
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-slate-400 uppercase tracking-wide font-medium">Difficulty:</span>
          {DIFFICULTIES.map(d => (
            <button
              key={d}
              onClick={() => toggleDifficulty(d)}
              className={`px-1.5 py-px rounded border ${difficulties.has(d) ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
          <span className="text-slate-400 ml-2">Image:</span>
          <select value={hasImage} onChange={e => setHasImage(e.target.value as 'any' | 'true' | 'false')} className="border border-slate-300 rounded px-1 py-px text-[10px]">
            <option value="any">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          <span className="text-slate-400 ml-2">Year:</span>
          {availableYears.map(y => {
            const ys = year === 'any' ? new Set<string>() : new Set(year.split(','));
            const on = ys.has(String(y));
            return (
              <button
                key={y}
                onClick={() => {
                  const next = new Set(ys);
                  if (on) next.delete(String(y)); else next.add(String(y));
                  setYear(next.size === 0 ? 'any' : [...next].sort().join(','));
                }}
                title={on ? `Showing ${y} — click to remove` : `Click to include ${y} (multi-select)`}
                className={`px-1.5 py-px rounded border tabular-nums ${on ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
              >{String(y).slice(2)}</button>
            );
          })}
          <span className="text-slate-400 ml-2">School:</span>
          <select value={school} onChange={e => setSchool(e.target.value)} className="border border-slate-300 rounded px-1 py-px text-[10px] max-w-[90px]">
            <option value="any">Any</option>
            {availableSchools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {isJC && (
            <>
              <span className="text-slate-400 ml-2">Exam:</span>
              <select value={exam} onChange={e => setExam(e.target.value)} className="border border-slate-300 rounded px-1 py-px text-[10px]">
                <option value="any">Any</option>
                <option value="Promo">Promo (JC1)</option>
                <option value="MY:JC1">MY (JC1)</option>
                <option value="MY:JC2">MY (JC2)</option>
                <option value="MY">MY (both)</option>
                <option value="Prelim">Prelim (JC2)</option>
              </select>
            </>
          )}
          <span className="text-slate-400 ml-2" title="Scale all preview images (browsing only — not saved to the question)">Img:</span>
          <input type="range" min={20} max={100} step={10} value={imgScale} onChange={e => setImgScale(Number(e.target.value))} title={`Preview images at ${imgScale}%`} className="w-16 align-middle accent-blue-600" />
          <span className="text-slate-400 w-8 tabular-nums">{imgScale}%</span>
        </div>

        {topics.length > 1 && (
          <div className="text-[10px]">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTopicFilterOpen}
                className={`px-1.5 py-px rounded border ${topicFilterCount > 0 ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
              >Topic filter{topicFilterCount > 0 ? ` (${topicFilterCount})` : ''} {topicFilterOpen ? '▴' : '▾'}</button>
              {includeTopics.size > 1 && (
                <span className="flex items-center gap-0.5">
                  <button onClick={() => setIncludeMode('all')} className={`px-1.5 py-px rounded border ${includeMode === 'all' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`} title="Must have ALL the green topics">All</button>
                  <button onClick={() => setIncludeMode('any')} className={`px-1.5 py-px rounded border ${includeMode === 'any' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`} title="Has ANY of the green topics">Any</button>
                </span>
              )}
              {topicFilterCount > 0 && <button onClick={clearTopicFilter} className="text-slate-400 hover:text-slate-700 underline">clear</button>}
            </div>
            {topicFilterOpen && (
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="text-slate-400 self-center">Click: <span className="text-emerald-700">include</span> → <span className="text-red-600">exclude</span> → off</span>
                {topics.map(t => {
                  const inc = includeTopics.has(t), exc = excludeTopics.has(t);
                  const cls = inc ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : exc ? 'bg-red-100 border-red-400 text-red-700 line-through' : 'border-slate-300 text-slate-500 hover:bg-slate-100';
                  return (
                    <button key={t} onClick={() => cycleTopic(t)} className={`px-1.5 py-px rounded border ${cls}`} title={t}>
                      {inc ? '✓ ' : exc ? '✕ ' : ''}{t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
          <span>{loading ? (committedSmart ? 'Claude is reading…' : 'Loading…')
            : (displayed.length !== questions.length
              ? `${displayed.length} match your filters · filtering ${questions.length} loaded of ${total} in topic scope`
              : `${total} found · showing ${displayed.length}`)}</span>
          {!loading && displayed.length === 0 && questions.length > 0 && (
            <span className="text-amber-700">
              hidden by: {[
                difficulties.size > 0 && `difficulty (${[...difficulties].map(d => d.slice(0, 3)).join('/')})`,
                hasImage !== 'any' && `image=${hasImage === 'true' ? 'yes' : 'no'}`,
                year !== 'any' && `year=${year}`,
                school !== 'any' && `school=${school}`,
                exam !== 'any' && isJC && `exam=${exam}`,
                includeTopics.size > 0 && `topic include (${includeTopics.size})`,
                excludeTopics.size > 0 && `topic exclude (${excludeTopics.size})`,
              ].filter(Boolean).join(', ') || 'unknown filter'}
              {' '}
              <button
                onClick={() => {
                  setDifficulties(new Set()); setHasImage('any'); setYear('any');
                  setSchool('any'); setExam('any');
                  setIncludeTopics(new Set()); setExcludeTopics(new Set());
                }}
                className="underline text-blue-600 hover:text-blue-800"
              >reset filters</button>
            </span>
          )}
          {source === 'local' && <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded">📦 cache</span>}
          {source === 'unavailable' && <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">not synced</span>}
          <span className="ml-auto inline-flex rounded border border-violet-200 overflow-hidden" title="Model for Propose lesson — Fable is stronger but 2× the API cost">
            {(['opus', 'fable'] as const).map(m => (
              <button
                key={m}
                onClick={() => pickProposeModel(m)}
                className={`text-[10px] px-1.5 py-0.5 ${proposeModel === m ? 'bg-violet-600 text-white' : 'bg-white text-violet-600 hover:bg-violet-50'}`}
              >{m === 'opus' ? 'Opus' : 'Fable'}</button>
            ))}
          </span>
          <button
            onClick={runPropose}
            disabled={proposing || displayed.length === 0}
            title="Claude reads the questions currently matching your filters and proposes the example/practice split per concept — you review before anything is staged"
            className="text-[10px] px-2 py-0.5 rounded border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-40 font-medium"
          >{proposing ? '✨ Reading questions…' : `✨ Propose lesson (${displayed.length})`}</button>
        </div>
        {proposeError && (
          <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{proposeError}</div>
        )}
      </div>

      <div
        ref={listRef}
        onScroll={e => { bankScroll = { lessonKey, top: e.currentTarget.scrollTop }; persistScroll(); }}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0"
      >
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        {!loading && !error && source === 'unavailable' && topics.length > 0 && (
          <div className="text-xs text-slate-500 italic px-2 py-4 text-center space-y-2">
            <p>Offline mode is on for this level, but it hasn&apos;t been synced yet.</p>
            <a href="/admin/offline" className="inline-block px-2 py-1 border border-slate-300 rounded text-slate-700 not-italic hover:bg-slate-50">Configure offline mode →</a>
          </div>
        )}
        {!loading && !error && source !== 'unavailable' && displayed.length === 0 && topics.length > 0 && (
          <div className="text-xs text-slate-400 italic px-2 py-4 text-center">
            {mode === 'smart' && !committed.query && !search.trim()
              ? 'Type a phrase and press Search to rank by meaning.'
              : questions.length > 0 ? 'No questions match the current filters.' : 'No matching questions.'}
          </div>
        )}
        {displayed.slice(0, renderCap).map(q => (
          <BankQuestionCard
            key={q.id}
            q={q}
            onDragStart={() => onDragQuestion?.(q)}
            onDragEnd={() => onDragQuestion?.(null)}
            onInsert={onInsert}
            onStage={onStage}
            staged={isStaged?.(q.id)}
            auth={auth}
          />
        ))}
        {displayed.length > renderCap && (
          <button
            onClick={() => setRenderCap(c => c + RENDER_CAP_STEP)}
            className="w-full text-xs py-1.5 border border-blue-300 rounded text-blue-700 bg-blue-50 hover:bg-blue-100"
            title="Render the next batch of matching questions"
          >Show {Math.min(RENDER_CAP_STEP, displayed.length - renderCap)} more ({renderCap} of {displayed.length} shown)</button>
        )}
        {!loading && committed.mode !== 'smart' && questions.length < total && (
          <button
            onClick={() => setLimit(Math.min(total, 3000))}
            className="w-full text-xs py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
            title="Fetch the rest of the topic scope in one go (so filters can see everything)"
          >Load all {total - questions.length} remaining ({questions.length} of {total} loaded)</button>
        )}
      </div>
      {proposal && (
        <ProposalSheet
          proposal={proposal}
          candidates={proposalCandidates}
          lessonKey={lessonKey}
          onClose={() => setProposal(null)}
          onStaged={() => { /* staging panel updates via its own subscription */ }}
        />
      )}
    </div>
  );
}

export function BankQuestionCard({
  q,
  onDragStart,
  onDragEnd,
  onInsert,
  onStage,
  staged,
  draggable = true,
  auth,
}: {
  q: BankQuestion;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
  onStage?: (q: BankQuestion) => void;
  staged?: boolean;
  draggable?: boolean;
  /** Admin auth — enables the per-question DOCX download (+ AI solve when no solution exists). */
  auth?: string;
}) {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const difficulty = q.difficulty ?? 'Standard';
  const [dl, setDl] = useState<'idle' | 'busy' | 'solving'>('idle');
  type PartLike = {
    label?: string; text?: string; marks?: number;
    image_url?: string; image_url_after?: string;
    subparts?: Array<{ label?: string; text?: string; marks?: number; image_url?: string; image_url_after?: string }>;
  };
  const parts = Array.isArray(q.parts) ? (q.parts as PartLike[]) : null;

  const markdown = useMemo(() => {
    const lines: string[] = [];
    const stemRecords = getStemImageRecords(q);
    const stemBefore = stemRecords.filter(r => r.pos === 'before');
    const stemAfter = stemRecords.filter(r => r.pos === 'after');

    for (const r of stemBefore) {
      lines.push(`<img src="${toStorageUrl(r.url)}" alt="" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px auto" />`);
    }
    // Stem-only questions carry their marks ONLY in total_marks — show them on the stem.
    const hasPartContent = (parts ?? []).some(p => p && (p.label || (p.text && p.text.trim())));
    const stemMarks = !hasPartContent && q.total_marks ? ` _[${q.total_marks}m]_` : '';
    if (q.question_text) lines.push(renderInlineImagesInText(q.question_text) + stemMarks);
    for (const r of stemAfter) {
      lines.push(`<img src="${toStorageUrl(r.url)}" alt="" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px auto" />`);
    }

    if (parts && parts.length > 0) {
      for (const p of parts) {
        if (!p) continue;
        const marks = p.marks ? ` _[${p.marks}m]_` : '';
        const beforeImg = partImageHtml(p.image_url);
        const afterImg = partImageHtml(p.image_url_after);
        if (beforeImg) lines.push(beforeImg);
        // Stem-only questions are stored as a single unlabeled part — render its text with no "(label)".
        const label = p.label ? `**(${p.label})** ` : '';
        if (label || (p.text && p.text.trim())) lines.push(`${label}${renderInlineImagesInText(p.text)}${marks}`);
        if (afterImg) lines.push(afterImg);
        if (Array.isArray(p.subparts)) {
          for (const sp of p.subparts) {
            if (!sp?.label) continue;
            const spMarks = sp.marks ? ` _[${sp.marks}m]_` : '';
            const spBefore = partImageHtml(sp.image_url);
            const spAfter = partImageHtml(sp.image_url_after);
            if (spBefore) lines.push(`  ${spBefore}`);
            lines.push(`  **(${sp.label})** ${renderInlineImagesInText(sp.text)}${spMarks}`);
            if (spAfter) lines.push(`  ${spAfter}`);
          }
        }
      }
    }
    return lines.join('\n\n');
  }, [q, parts]);

  // Compiled answer (top-level + per-part/subpart) rendered as real math — most questions keep
  // their answers on the parts, not the top-level field.
  const answerMd = useMemo(() => {
    type PA = { label?: string; answer?: string; subparts?: Array<{ label?: string; answer?: string }> };
    const bits: string[] = [];
    if (q.answer && String(q.answer).trim()) bits.push(fixCurrencyDollars(String(q.answer)));
    for (const p of (Array.isArray(q.parts) ? (q.parts as PA[]) : [])) {
      if (!p) continue;
      if (p.answer && p.answer.trim()) bits.push(`${p.label ? `**(${p.label})** ` : ''}${fixCurrencyDollars(p.answer)}`);
      for (const sp of (Array.isArray(p.subparts) ? p.subparts : [])) {
        if (sp?.answer && sp.answer.trim()) bits.push(`**(${p.label ?? ''})(${sp.label ?? ''})** ${fixCurrencyDollars(sp.answer)}`);
      }
    }
    return bits.length > 0 ? bits.join('  ·  ') : null;
  }, [q]);

  // Compiled worked solution (top-level + per-part/subpart + solution images), shown on demand.
  // Solutions store one working step per `\n` line; markdown collapses single newlines, so convert
  // them to hard line breaks ("  \n") to keep each step on its own line.
  const [showSol, setShowSol] = useState(false);
  const solutionMd = useMemo(() => {
    const steps = (s: string) => renderInlineImagesInText(s).split('\n').map(l => l.trim()).filter(Boolean).join('  \n');
    type PS = { label?: string; solution?: string; solution_image?: string; subparts?: Array<{ label?: string; solution?: string; solution_image?: string }> };
    const bits: string[] = [];
    if (q.solution && String(q.solution).trim()) bits.push(steps(q.solution));
    for (const p of (Array.isArray(q.parts) ? (q.parts as PS[]) : [])) {
      if (!p) continue;
      if (p.solution && p.solution.trim()) bits.push(`${p.label ? `**(${p.label})**  \n` : ''}${steps(p.solution)}`);
      const pi = partImageHtml(p.solution_image);
      if (pi) bits.push(pi);
      for (const sp of (Array.isArray(p.subparts) ? p.subparts : [])) {
        if (sp?.solution && sp.solution.trim()) bits.push(`**(${p.label ?? ''})(${sp.label ?? ''})**  \n${steps(sp.solution)}`);
        const spi = partImageHtml(sp?.solution_image);
        if (spi) bits.push(spi);
      }
    }
    for (const u of getSolutionImageUrls(q.solution_images)) {
      bits.push(`<img src="${toStorageUrl(u)}" alt="" loading="lazy" decoding="async" style="max-width:100%;display:block;margin:6px 0" />`);
    }
    return bits.length > 0 ? bits.join('\n\n') : null;
  }, [q]);

  return (
    <div
      draggable={draggable}
      // Offscreen cards skip layout, paint AND image decoding — without this, a long
      // list of 300-DPI diagram scans decodes hundreds of MB of bitmaps at once and
      // can crash the tab (seen with the 2024 Linear Law set).
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('application/x-bank-question', JSON.stringify(q));
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart?.();
      } : undefined}
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
      className={`border border-slate-200 rounded p-2 bg-white hover:border-blue-400 hover:shadow-sm text-xs space-y-1.5 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-slate-700 font-medium">{tag}</span>
        {q.exam_type ? (
          <span className="text-[10px] px-1.5 py-px rounded bg-indigo-100 text-indigo-700 font-medium" title="Exam type (level)">
            {(q.level === 'JC1' || q.level === 'JC2') ? `${q.level} ` : ''}{q.exam_type}
          </span>
        ) : null}
        <span className={`text-[10px] px-1.5 py-px rounded ${difficulty === 'Standard' ? 'bg-slate-100 text-slate-600' : difficulty === 'Advanced' ? 'bg-amber-100 text-amber-700' : difficulty === 'Challenging' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
          {difficulty.slice(0, 3)}
        </span>
        {q.total_marks ? <span className="text-[10px] text-slate-400">{q.total_marks}m</span> : null}
        {q.has_image ? <span className="text-[10px] text-slate-400" title="Has diagram">📷</span> : null}
        {q.usage_count > 0 && (
          <span className="ml-auto text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-px rounded font-medium" title={`Used in ${q.usage_count} card${q.usage_count > 1 ? 's' : ''}`}>
            ✓ {q.usage_count}
          </span>
        )}
      </div>

      {markdown && (
        <div
          className="prose prose-sm prose-slate max-w-none text-[12px] leading-snug bank-q-prose"
          onMouseDown={draggable ? (e) => e.stopPropagation() : undefined}
        >
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
            {markdown}
          </ReactMarkdown>
        </div>
      )}

      {answerMd && (
        <div
          className="text-[11px] bg-green-50/70 border border-green-200 rounded px-2 py-1 prose prose-sm prose-slate max-w-none leading-snug bank-q-prose"
          onMouseDown={draggable ? (e) => e.stopPropagation() : undefined}
        >
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
            {`**Answer:** ${answerMd}`}
          </ReactMarkdown>
        </div>
      )}

      {solutionMd && (
        <div onMouseDown={draggable ? (e) => e.stopPropagation() : undefined}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSol(s => !s); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
          >{showSol ? '▾ Hide solution' : '▸ Show solution'}</button>
          {showSol && (
            <div className="mt-1 text-[12px] bg-amber-50/50 border border-amber-200 rounded px-2.5 py-1.5 prose prose-sm prose-slate max-w-none leading-relaxed bank-q-prose">
              <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                {solutionMd}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {(onInsert || onStage || auth) && (
        <div className="flex gap-1 pt-1 border-t border-slate-100">
          {auth && (
            <button
              onClick={async (e) => {
                e.stopPropagation(); setDl('busy');
                try { await downloadQuestionDocx(q, auth, false); } catch (err) { alert('DOCX failed: ' + (err as Error).message); }
                setDl('idle');
              }}
              disabled={dl !== 'idle'}
              title="Download just this question as a .docx (native Word equations)"
              className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50"
            >{dl === 'busy' ? '…' : '⬇ DOCX'}</button>
          )}
          {auth && !solutionMd && (
            <button
              onClick={async (e) => {
                e.stopPropagation(); setDl('solving');
                try { await downloadQuestionDocx(q, auth, true); } catch (err) { alert('Solve failed: ' + (err as Error).message); }
                setDl('idle');
              }}
              disabled={dl !== 'idle'}
              title="No solution in the bank — the AI writes the working, then downloads the .docx (not saved to the bank)"
              className="text-[10px] px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded hover:bg-violet-100 disabled:opacity-50"
            >{dl === 'solving' ? '✨ Solving…' : '✨ Solve & ⬇'}</button>
          )}
          {onInsert && <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'refresher'); }}
            className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
          >+ RF</button>}
          {onInsert && <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'worked_example'); }}
            className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
          >+ WE</button>}
          {onInsert && <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'practice'); }}
            className="text-[10px] px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100"
          >+ Pr</button>}
          {onStage && <button
            onClick={(e) => { e.stopPropagation(); onStage(q); }}
            disabled={staged}
            title={staged ? 'Already in staging' : 'Add to staging tray'}
            className="ml-auto text-[10px] px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
          >{staged ? '☆ staged' : '☆ Stage'}</button>}
        </div>
      )}
    </div>
  );
}

/** RightPanel — tab UI wrapping AI sidebar + bank panel. Same layout pattern as edit-cards. */
export function LessonRightPanel({
  level,
  topics,
  auth,
  activeTab,
  onTabChange,
  aiContent,
  onInsert,
  onDragQuestion,
  onStage,
  isStaged,
}: {
  level: string;
  topics: string[];
  auth: string;
  activeTab: 'ai' | 'bank';
  onTabChange: (t: 'ai' | 'bank') => void;
  aiContent: React.ReactNode;
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
  onDragQuestion?: (q: BankQuestion | null) => void;
  onStage?: (q: BankQuestion) => void;
  isStaged?: (id: string) => boolean;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white flex">
        <button
          onClick={() => onTabChange('ai')}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-r border-slate-200 ${activeTab === 'ai' ? 'bg-slate-50 text-blue-700 border-b-2 border-b-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          ✨ AI Assist
        </button>
        <button
          onClick={() => onTabChange('bank')}
          className={`flex-1 px-3 py-2 text-xs font-semibold ${activeTab === 'bank' ? 'bg-slate-50 text-blue-700 border-b-2 border-b-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          📚 Bank
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'ai' && aiContent}
        {activeTab === 'bank' && (
          <LessonBankPanel
            level={level}
            topics={topics}
            auth={auth}
            onInsert={onInsert}
            onDragQuestion={onDragQuestion}
            onStage={onStage}
            isStaged={isStaged}
          />
        )}
      </div>
    </div>
  );
}
