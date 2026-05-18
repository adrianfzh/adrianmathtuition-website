// BankPanel — right-panel tab showing question-bank questions filtered by the
// editor's current (level, topic, sub-group). Each question is HTML5-draggable.
//
// Drag payload uses MIME type `application/x-bank-question` carrying the full
// question row JSON. Drop targets in EditCardsClient check for that MIME type
// in onDrop and respond accordingly (replace middle editor content / create new card).

'use client';

import { useEffect, useMemo, useState } from 'react';

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
  topics: string[] | null;
  total_marks: number | null;
  has_image: boolean;
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

function questionImageUrl(q: BankQuestion): string | null {
  if (q.image_url) {
    return q.image_url.startsWith('http') ? q.image_url : STORAGE_BUCKET + q.image_url.replace(/^question_images\//, '');
  }
  const first = q.images && q.images.length > 0 ? q.images[0]?.filename : null;
  if (!first) return null;
  return first.startsWith('http') ? first : STORAGE_BUCKET + first.replace(/^question_images\//, '');
}

/**
 * Build the markdown content for a "full template" drop from a bank question.
 * Used when dragging into the middle editor (replace) or into the left card list (new card).
 */
export function buildBankWorkedExampleTemplate(q: BankQuestion): { title: string; content: string } {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const title = `WE: ${tag}`;

  const parts: string[] = [];
  parts.push(`**${tag}**`);

  if (q.question_text) parts.push(q.question_text);

  // Image (if any)
  const imgUrl = questionImageUrl(q);
  if (imgUrl) {
    parts.push(`<img src="${imgUrl}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />`);
  }

  // Sub-parts as a bullet list (if present)
  if (Array.isArray(q.parts) && q.parts.length > 0) {
    const sub: string[] = [];
    for (const p of q.parts as Array<{ label?: string; text?: string; marks?: number }>) {
      if (!p?.label) continue;
      const marks = p.marks ? ` [${p.marks}m]` : '';
      sub.push(`(${p.label})${marks} ${p.text ?? ''}`);
    }
    if (sub.length > 0) parts.push(sub.join('\n\n'));
  }

  parts.push('---');
  parts.push('**Working:**');
  if (q.solution) parts.push(q.solution);
  parts.push('---');
  parts.push(`**Answer:** ${q.answer ?? ''}`);

  return { title, content: parts.join('\n\n') };
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

function BankQuestionCard({ q, onDragStart, onDragEnd }: { q: BankQuestion; onDragStart?: () => void; onDragEnd?: () => void }) {
  const preview = (q.question_text ?? '').replace(/[$#*_]/g, '').slice(0, 140);
  const imgUrl = questionImageUrl(q);
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const difficulty = q.difficulty ?? 'Standard';

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-bank-question', JSON.stringify(q));
        e.dataTransfer.setData('text/plain', tag); // fallback so misfires don't insert garbage
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className="border border-slate-200 rounded p-2 bg-white hover:border-blue-400 hover:shadow-sm cursor-grab active:cursor-grabbing text-xs space-y-1"
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
      <div className="flex gap-2">
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt="" className="w-12 h-12 object-cover rounded border border-slate-200 shrink-0" />
        )}
        <div className="text-slate-600 line-clamp-3 leading-tight">{preview}{preview.length === 140 ? '…' : ''}</div>
      </div>
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
