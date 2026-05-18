// BankPanel — right-panel tab showing question-bank questions filtered by the
// editor's current (level, topic, sub-group). Each question is HTML5-draggable.
//
// Drag payload uses MIME type `application/x-bank-question` carrying the full
// question row JSON. Drop targets in EditCardsClient check for that MIME type
// in onDrop and respond accordingly (replace middle editor content / create new card).

'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

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
  /** JSON-serialised array of solution diagram URLs (legacy text column) */
  solution_images: string | null;
  topics: string[] | null;
  total_marks: number | null;
  has_image: boolean;
  /** JSON-serialised array of stem image records: bare URL or {url, pos:'before'|'after'} */
  image_url: string | null;
  images: { filename: string }[] | null;
  difficulty: string | null;
  source_file: string | null;
  usage_count: number;
  subgroup_links: { id: number; name: string; isPrimary: boolean }[];
};

const DIFFICULTIES = ['Standard', 'Advanced', 'Challenging', 'Bonus'] as const;
type Difficulty = typeof DIFFICULTIES[number];

const STORAGE_BUCKET = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/';

// ---------- Image schema helpers ----------
//
// Mirrors the question_bank_viewer.html schema:
//
//  * q.image_url is a JSON-serialised array of stem-image records.
//    Each entry is either a bare URL string (legacy — treated as pos:'after')
//    or an object { url, pos: 'before' | 'after' }.
//
//  * q.parts[i].image_url      — diagram shown BEFORE the part's text
//    q.parts[i].image_url_after — diagram shown AFTER the part's text
//    Same for subparts.
//
//  * q.parts[i].text and q.question_text may contain inline image tokens
//    `{{IMG:question_images/xyz.png}}` which render at that exact position.
//
//  * q.solution_images is a JSON-serialised array of URLs (top-level solution
//    diagrams). q.parts[i].solution_image is a per-part variant.
//
// Treating image_url as a flat string (as we used to) loses position metadata
// and drops secondary images. These helpers re-implement the viewer's reader
// side so the bank panel renders exactly what the viewer renders.

type StemImageRecord = { url: string; pos: 'before' | 'after' };

function toStorageUrl(s: string): string {
  return s.startsWith('http') ? s : STORAGE_BUCKET + s.replace(/^question_images\//, '');
}

function isPlausibleFilename(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 6
    && !['[]', '{}', 'null', 'undefined', '[object Object]'].includes(s.trim());
}

/** Parse q.image_url (JSON array of records, or legacy bare string) into a list of {url,pos}. */
function getStemImageRecords(q: BankQuestion): StemImageRecord[] {
  if (!q.image_url) return [];
  const raw = q.image_url.trim();
  if (!raw || raw === '[]') return [];
  let parsed: unknown;
  try {
    parsed = raw.startsWith('[') ? JSON.parse(raw) : raw;
  } catch {
    parsed = raw;
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const records: StemImageRecord[] = [];
  for (const entry of arr) {
    if (typeof entry === 'string' && isPlausibleFilename(entry)) {
      records.push({ url: entry, pos: 'after' });
    } else if (entry && typeof entry === 'object' && 'url' in entry && isPlausibleFilename((entry as { url: unknown }).url)) {
      const e = entry as { url: string; pos?: string };
      records.push({ url: e.url, pos: e.pos === 'before' ? 'before' : 'after' });
    }
  }
  // Fall back to images jsonb column if image_url yielded nothing
  if (records.length === 0 && q.images && q.images.length > 0) {
    for (const img of q.images) {
      if (isPlausibleFilename(img?.filename)) records.push({ url: img.filename, pos: 'after' });
    }
  }
  return records;
}

/** Walks q.solution_images (JSON array) into a flat list of URLs. */
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

/** Replace `{{IMG:question_images/xyz.png}}` tokens with raw `<img>` tags (rehypeRaw renders them). */
function renderInlineImagesInText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
    const cleaned = url.trim();
    if (!isPlausibleFilename(cleaned)) return '';
    return `<img src="${toStorageUrl(cleaned)}" alt="" style="max-width:100%;display:block;margin:6px 0" />`;
  });
}

/** Build an HTML `<img>` tag for a per-part image_url. Returns '' on null/garbage. */
function partImageHtml(path: string | null | undefined): string {
  if (!isPlausibleFilename(path)) return '';
  return `<img src="${toStorageUrl(path)}" alt="" style="max-width:100%;display:block;margin:6px 0" />`;
}

/**
 * Build the markdown content for a "full template" drop from a bank question.
 * Used when dragging into the middle editor (replace) or into the left card list (new card).
 *
 * Image rules — mirrors question_bank_viewer.html exactly:
 *  - Stem images (q.image_url) are a JSON array of {url, pos:'before'|'after'} records:
 *      'before' images go above the stem text, 'after' images go below.
 *  - Inline `{{IMG:url}}` tokens inside q.question_text / parts[i].text /
 *    subparts[j].text are replaced with `<img>` at the exact position.
 *  - Per-part: parts[i].image_url goes BEFORE the part's text,
 *    parts[i].image_url_after goes AFTER it. Same for subparts.
 *  - Solution images: q.solution_images (JSON array of URLs) goes after the
 *    top-level solution; parts[i].solution_image goes after the per-part solution.
 */
export function buildBankWorkedExampleTemplate(q: BankQuestion): { title: string; content: string } {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const title = `WE: ${tag}`;

  const out: string[] = [];
  out.push(`**${tag}**`);

  // Stem images — split into before/after groups
  const stemRecords = getStemImageRecords(q);
  const stemBefore = stemRecords.filter((r) => r.pos === 'before');
  const stemAfter = stemRecords.filter((r) => r.pos === 'after');

  for (const r of stemBefore) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />`);
  }
  if (q.question_text) out.push(renderInlineImagesInText(q.question_text));
  for (const r of stemAfter) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />`);
  }

  // Parts (with per-part diagrams + inline tokens)
  if (Array.isArray(q.parts) && q.parts.length > 0) {
    type PartLike = {
      label?: string; text?: string; marks?: number;
      image_url?: string; image_url_after?: string;
      subparts?: Array<{ label?: string; text?: string; marks?: number; image_url?: string; image_url_after?: string }>;
    };
    const sub: string[] = [];
    for (const p of q.parts as PartLike[]) {
      if (!p?.label) continue;
      const marks = p.marks ? ` [${p.marks}m]` : '';
      const lines: string[] = [];
      const beforeImg = partImageHtml(p.image_url);
      const afterImg = partImageHtml(p.image_url_after);
      if (beforeImg) lines.push(beforeImg);
      lines.push(`(${p.label}) ${renderInlineImagesInText(p.text)}${marks}`);
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

  // Solutions — top-level + per-part, each followed by their respective solution images
  type PartSolution = {
    label?: string; solution?: string; solution_image?: string;
    subparts?: Array<{ label?: string; solution?: string; solution_image?: string }>;
  };
  const solBits: string[] = [];
  if (q.solution) solBits.push(renderInlineImagesInText(q.solution));
  // Top-level solution_images (JSON array of URLs)
  for (const u of getSolutionImageUrls(q.solution_images)) {
    solBits.push(`<img src="${toStorageUrl(u)}" alt="solution diagram" style="max-width:100%;display:block;margin:6px 0" />`);
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
  if (q.answer) {
    out.push('---');
    out.push(`**Answer:** ${q.answer}`);
  }

  return { title, content: out.join('\n\n') };
}

export function BankPanel({
  level,
  topic,
  subgroupId,
  auth,
  onDragQuestion,
}: {
  level: string;
  topic: string;
  subgroupId: number | null;
  auth: string;
  onDragQuestion?: (q: BankQuestion | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [hasImage, setHasImage] = useState<'any' | 'true' | 'false'>('any');
  const [difficulties, setDifficulties] = useState<Set<Difficulty>>(new Set());
  const [restrictSubgroup, setRestrictSubgroup] = useState<boolean>(true);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set('level', level);
    params.set('topic', topic);
    if (restrictSubgroup && subgroupId) params.set('subgroupId', String(subgroupId));
    if (search.trim()) params.set('search', search.trim());
    if (hasImage !== 'any') params.set('hasImage', hasImage);
    if (difficulties.size > 0) params.set('difficulty', Array.from(difficulties).join(','));
    params.set('limit', '100');
    return `/api/admin/cards/bank-questions?${params.toString()}`;
  }, [level, topic, subgroupId, restrictSubgroup, search, hasImage, difficulties]);

  // Debounced fetch
  useEffect(() => {
    if (!level || !topic) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setQuestions(json.questions ?? []);
        setTotal(json.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load error');
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [url, level, topic, auth]);

  function toggleDifficulty(d: Difficulty) {
    setDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter row */}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="font-medium">{level}</span>·
          <span className="truncate" title={topic}>{topic}</span>
          {subgroupId && (
            <label className="ml-auto flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={restrictSubgroup} onChange={(e) => setRestrictSubgroup(e.target.checked)} className="h-3 w-3" />
              <span>Sub-group only</span>
            </label>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question text…"
          className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-slate-400 uppercase tracking-wide font-medium">Difficulty:</span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => toggleDifficulty(d)}
              className={`px-1.5 py-px rounded border ${difficulties.has(d) ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
          <span className="text-slate-400 ml-2">Image:</span>
          <select value={hasImage} onChange={(e) => setHasImage(e.target.value as 'any' | 'true' | 'false')} className="border border-slate-300 rounded px-1 py-px text-[10px]">
            <option value="any">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div className="text-[10px] text-slate-400">{loading ? 'Loading…' : `${total} matching · showing ${questions.length}`}</div>
      </div>

      {/* Question list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        {!loading && !error && questions.length === 0 && (
          <div className="text-xs text-slate-400 italic px-2 py-4 text-center">No matching questions.</div>
        )}
        {questions.map((q) => (
          <BankQuestionCard
            key={q.id}
            q={q}
            onDragStart={() => onDragQuestion?.(q)}
            onDragEnd={() => onDragQuestion?.(null)}
          />
        ))}
      </div>
    </div>
  );
}

// Render full question with proper image positioning (mirrors viewer schema):
//   stem before-images → stem text (inline tokens resolved) → stem after-images
//   per-part: image_url → text → image_url_after, then same for each subpart.
// Always fully expanded — no truncation, no click-to-expand toggle.
function BankQuestionCard({ q, onDragStart, onDragEnd }: { q: BankQuestion; onDragStart?: () => void; onDragEnd?: () => void }) {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const difficulty = q.difficulty ?? 'Standard';
  type PartLike = {
    label?: string; text?: string; marks?: number;
    image_url?: string; image_url_after?: string;
    subparts?: Array<{ label?: string; text?: string; marks?: number; image_url?: string; image_url_after?: string }>;
  };
  const parts = Array.isArray(q.parts) ? (q.parts as PartLike[]) : null;

  // Build markdown source. Images are emitted as raw <img> tags; rehypeRaw
  // (already in the plugin chain) renders them. Inline {{IMG:url}} tokens
  // inside text are replaced inline.
  const markdown = useMemo(() => {
    const lines: string[] = [];
    const stemRecords = getStemImageRecords(q);
    const stemBefore = stemRecords.filter((r) => r.pos === 'before');
    const stemAfter = stemRecords.filter((r) => r.pos === 'after');

    for (const r of stemBefore) {
      lines.push(`<img src="${toStorageUrl(r.url)}" alt="" style="max-width:100%;display:block;margin:6px auto" />`);
    }
    if (q.question_text) lines.push(renderInlineImagesInText(q.question_text));
    for (const r of stemAfter) {
      lines.push(`<img src="${toStorageUrl(r.url)}" alt="" style="max-width:100%;display:block;margin:6px auto" />`);
    }

    if (parts && parts.length > 0) {
      for (const p of parts) {
        if (!p?.label) continue;
        const marks = p.marks ? ` _[${p.marks}m]_` : '';
        const beforeImg = partImageHtml(p.image_url);
        const afterImg = partImageHtml(p.image_url_after);
        if (beforeImg) lines.push(beforeImg);
        lines.push(`**(${p.label})** ${renderInlineImagesInText(p.text)}${marks}`);
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

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-bank-question', JSON.stringify(q));
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className="border border-slate-200 rounded p-2 bg-white hover:border-blue-400 hover:shadow-sm cursor-grab active:cursor-grabbing text-xs space-y-1.5"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-slate-700 font-medium">{tag}</span>
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

      {/* Question body — images render inline as <img> via rehypeRaw, math via rehypeKatex */}
      {markdown && (
        <div
          className="prose prose-sm prose-slate max-w-none text-[12px] leading-snug bank-q-prose"
          onMouseDown={(e) => e.stopPropagation()} /* allow text selection */
        >
          <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeKatex]}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      )}

      {/* Answer (compact) */}
      {q.answer && (
        <div className="text-[11px] flex items-center gap-1.5">
          <span className="text-slate-400 font-medium">Answer:</span>
          <code className="bg-green-50 border border-green-200 text-green-800 px-1.5 py-px rounded">{String(q.answer).slice(0, 80)}</code>
        </div>
      )}
    </div>
  );
}

/**
 * RightPanel — wraps AI sidebar and Bank panel in a tab UI.
 * AI children is passed in so we don't re-import AISidebar machinery here.
 */
export function RightPanel({
  level,
  topic,
  subgroupId,
  auth,
  activeTab,
  onTabChange,
  aiContent,
  bankCount,
  onDragQuestion,
}: {
  level: string;
  topic: string;
  subgroupId: number | null;
  auth: string;
  activeTab: 'ai' | 'bank';
  onTabChange: (t: 'ai' | 'bank') => void;
  aiContent: React.ReactNode;
  bankCount?: number;
  onDragQuestion?: (q: BankQuestion | null) => void;
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
          📚 Bank{typeof bankCount === 'number' ? ` (${bankCount})` : ''}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'ai' && aiContent}
        {activeTab === 'bank' && (
          <BankPanel level={level} topic={topic} subgroupId={subgroupId} auth={auth} onDragQuestion={onDragQuestion} />
        )}
      </div>
    </div>
  );
}
