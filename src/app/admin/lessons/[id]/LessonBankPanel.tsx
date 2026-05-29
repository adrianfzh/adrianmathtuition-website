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
import { getOfflineSettings, queryLocalBank } from '@/lib/offline/qb-cache';

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
  results: BankQuestion[];
  total: number;
  source: Source;
};
let bankCache: BankCache | null = null;
// Scroll position of the results list, kept across the card-switch remount so the bank panel
// stays parked on the question you were looking at instead of jumping back to the top.
let bankScroll: { lessonKey: string; top: number } = { lessonKey: '', top: 0 };

const DIFFICULTIES = ['Standard', 'Advanced', 'Challenging', 'Bonus'] as const;
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

function renderInlineImagesInText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
    const cleaned = url.trim();
    if (!isPlausibleFilename(cleaned)) return '';
    return `<img src="${toStorageUrl(cleaned)}" alt="" style="max-width:100%;display:block;margin:6px 0" />`;
  });
}

function partImageHtml(path: string | null | undefined): string {
  if (!isPlausibleFilename(path)) return '';
  return `<img src="${toStorageUrl(path)}" alt="" style="max-width:100%;display:block;margin:6px 0" />`;
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

  for (const r of stemBefore) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />`);
  }
  if (q.question_text) out.push(renderInlineImagesInText(q.question_text));
  for (const r of stemAfter) {
    out.push(`<img src="${toStorageUrl(r.url)}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" />`);
  }

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

  type PartSolution = {
    label?: string; solution?: string; solution_image?: string;
    subparts?: Array<{ label?: string; solution?: string; solution_image?: string }>;
  };
  const solBits: string[] = [];
  if (q.solution) solBits.push(renderInlineImagesInText(q.solution));
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

export function LessonBankPanel({
  level,
  topics,
  auth,
  onDragQuestion,
  onInsert,
}: {
  level: string;
  topics: string[];
  auth: string;
  onDragQuestion?: (q: BankQuestion | null) => void;
  /** Quick-insert (button) — drops a card into a specific kind. */
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
}) {
  // Identity of the current lesson scope — cache is only reused when this matches.
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

  // Difficulty/image/year are client-side display filters over the fetched set — they NEVER trigger
  // a fetch (so changing them can't spend AI tokens). `displayed` is what the list renders.
  const displayed = useMemo(() => {
    let list = questions;
    if (difficulties.size > 0) list = list.filter(q => difficulties.has((q.difficulty ?? 'Standard') as Difficulty));
    if (hasImage !== 'any') list = list.filter(q => (hasImage === 'true' ? q.has_image : !q.has_image));
    if (year !== 'any') list = list.filter(q => String(q.year) === year);
    return list;
  }, [questions, difficulties, hasImage, year]);

  // Read current filters at fetch-time without putting them in the fetch effect's deps.
  const filtersRef = useRef({ hasImage, difficulties, year });
  filtersRef.current = { hasImage, difficulties, year };

  // Keep the cache's filter fields current so a remount rehydrates the latest filter UI.
  useEffect(() => {
    if (bankCache && bankCache.lessonKey === lessonKey) {
      bankCache.hasImage = hasImage;
      bankCache.difficulties = Array.from(difficulties);
      bankCache.year = year;
    }
  }, [hasImage, difficulties, year, lessonKey]);

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
          year: filtersRef.current.year,
          results: list, total: tot, source: src,
        };
      };

      // Use the local cache ONLY when offline mode is explicitly enabled for this level.
      // We deliberately ignore navigator.onLine — it reports false "offline" far too often.
      const settings = await getOfflineSettings();
      const offlineModeOn = settings.enabled && settings.levels.includes(level);
      if (cancelled) return;

      // Keyword browse while offline mode is on → read the synced local cache.
      if (offlineModeOn && !cSmart) {
        const local = await queryLocalBank({ level, topics, search: cQuery || undefined, limit: 100 });
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
        params.set('limit', '100');
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
            const local = await queryLocalBank({ level, topics, search: cQuery || undefined, limit: 100 });
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
  }, [level, topics, lessonKey, committed, auth]);

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
    listRef.current?.scrollTo({ top: 0 });
    setCommitted({ query: q, mode, aiModel });
  }

  function clearSearch() {
    setSearch('');
    setMode('keyword');
    bankScroll = { lessonKey, top: 0 };
    listRef.current?.scrollTo({ top: 0 });
    setCommitted({ query: '', mode: 'keyword', aiModel });
    if (bankCache && bankCache.lessonKey === lessonKey) bankCache = null;
  }

  function toggleDifficulty(d: Difficulty) {
    setDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
            placeholder={topics.length === 0 ? 'Add topics to enable bank' : mode === 'smart' ? 'Describe it, e.g. conics hyperbola' : 'Search question text…'}
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
          <select value={year} onChange={e => setYear(e.target.value)} className="border border-slate-300 rounded px-1 py-px text-[10px]">
            <option value="any">Any</option>
            {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-2">
          <span>{loading ? (committedSmart ? 'Claude is reading…' : 'Loading…') : `${total} found · showing ${displayed.length}`}</span>
          {source === 'local' && <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded">📦 cache</span>}
          {source === 'unavailable' && <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">not synced</span>}
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={e => { bankScroll = { lessonKey, top: e.currentTarget.scrollTop }; }}
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
        {displayed.map(q => (
          <BankQuestionCard
            key={q.id}
            q={q}
            onDragStart={() => onDragQuestion?.(q)}
            onDragEnd={() => onDragQuestion?.(null)}
            onInsert={onInsert}
          />
        ))}
      </div>
    </div>
  );
}

function BankQuestionCard({
  q,
  onDragStart,
  onDragEnd,
  onInsert,
}: {
  q: BankQuestion;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
}) {
  const tag = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
  const difficulty = q.difficulty ?? 'Standard';
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

      {markdown && (
        <div
          className="prose prose-sm prose-slate max-w-none text-[12px] leading-snug bank-q-prose"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
            {markdown}
          </ReactMarkdown>
        </div>
      )}

      {q.answer && (
        <div className="text-[11px] flex items-center gap-1.5">
          <span className="text-slate-400 font-medium">Answer:</span>
          <code className="bg-green-50 border border-green-200 text-green-800 px-1.5 py-px rounded">{String(q.answer).slice(0, 80)}</code>
        </div>
      )}

      {onInsert && (
        <div className="flex gap-1 pt-1 border-t border-slate-100">
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'refresher'); }}
            className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
          >+ RF</button>
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'worked_example'); }}
            className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
          >+ WE</button>
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(q, 'practice'); }}
            className="text-[10px] px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100"
          >+ Pr</button>
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
}: {
  level: string;
  topics: string[];
  auth: string;
  activeTab: 'ai' | 'bank';
  onTabChange: (t: 'ai' | 'bank') => void;
  aiContent: React.ReactNode;
  onInsert?: (q: BankQuestion, kind: 'refresher' | 'worked_example' | 'practice') => void;
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
          />
        )}
      </div>
    </div>
  );
}
