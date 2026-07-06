'use client';

// /admin/worksheet-builder — visual worksheet builder.
// Search the Supabase question bank (seed past-paper questions + AI-generated
// practice questions), add questions to a sortable set, assign each a role
// (Worked Example vs Practice), then Generate → annotate WEs with Claude →
// assemble a house-styled A4 PDF → Vercel Blob URL.

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// ── Types ─────────────────────────────────────────────────────────────────────

type UiLevel = 'EM' | 'AM' | 'H2';
type Source = 'all' | 'seed' | 'generated';
type Role = 'we' | 'practice';

interface SearchResult {
  id: string;
  source: 'seed' | 'generated';
  text: string;
  marks: number | null;
  provenance: string;
  difficulty: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  answer: string;
  solution: string;
}

interface SetItem extends SearchResult {
  role: Role;
  annotated?: string;
}

interface ExportRow {
  id: string;
  exported_at: string;
  title: string;
  subtitle: string | null;
  level: string | null;
  format: string | null;
  question_count: number | null;
  total_marks: number | null;
  file_urls: { pdf?: string } | null;
}

interface Toast {
  msg: string;
  kind: 'success' | 'error';
}

const LEVELS: { value: UiLevel; label: string }[] = [
  { value: 'EM', label: 'EM (O-Level)' },
  { value: 'AM', label: 'AM (O-Level)' },
  { value: 'H2', label: 'H2 (JC)' },
];

/** UI level → subgroups.level used by /api/admin/cards/topics */
const TOPIC_LEVEL: Record<UiLevel, string> = { EM: 'EM', AM: 'AM', H2: 'JC' };

const katexMd = {
  remarkPlugins: [remarkMath, remarkGfm],
  rehypePlugins: [rehypeKatex],
};

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

// ── Sortable pill (module-level — uses useSortable) ──────────────────────────

function SortablePill({
  item,
  index,
  onToggleRole,
  onRemove,
}: {
  item: SetItem;
  index: number;
  onToggleRole: (uid: string) => void;
  onRemove: (uid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-2 shadow-sm"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 select-none px-0.5"
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{index + 1}.</span>
      <span className="flex-1 text-sm text-slate-800 min-w-0 truncate" title={item.text}>
        {truncate(item.text, 80)}
      </span>
      {item.marks != null && <span className="text-xs text-slate-500 shrink-0">[{item.marks}]</span>}
      <button
        onClick={() => onToggleRole(item.id)}
        className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 transition-colors ${
          item.role === 'we'
            ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
            : 'bg-emerald-100 border-emerald-300 text-emerald-800'
        }`}
        title="Tap to flip role"
      >
        {item.role === 'we' ? 'Worked Ex.' : 'Practice'}
      </button>
      <button
        onClick={() => onRemove(item.id)}
        className="text-slate-400 hover:text-red-500 text-sm px-1 shrink-0"
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

export default function WorksheetBuilderClient() {
  // Auth
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Search panel
  const [level, setLevel] = useState<UiLevel>('AM');
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Source>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Worksheet set
  const [items, setItems] = useState<SetItem[]>([]);
  const [title, setTitle] = useState('');
  const [allowDiagrams, setAllowDiagrams] = useState(false);
  const [format, setFormat] = useState('pdf');

  // Generate
  const [progress, setProgress] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Recent exports
  const [exports, setExports] = useState<ExportRow[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  const showToast = useCallback((msg: string, kind: Toast['kind']) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Auth bootstrap ──────────────────────────────────────────────────────────
  useEffect(() => {
    ensureAdminSession().then(ok => setAuthed(ok));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true);
    else setLoginError('Incorrect password');
  }

  // ── Data fetches ────────────────────────────────────────────────────────────
  const loadExports = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/worksheet-builder/exports');
      if (!res.ok) return;
      const data = await res.json();
      setExports(data.exports ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadExports();
  }, [authed, loadExports]);

  useEffect(() => {
    if (!authed) return;
    setTopic('');
    fetch(`/api/admin/cards/topics?level=${encodeURIComponent(TOPIC_LEVEL[level])}`)
      .then(r => (r.ok ? r.json() : { topics: [] }))
      .then(d => setTopics(d.topics ?? []))
      .catch(() => setTopics([]));
  }, [authed, level]);

  async function runSearch() {
    setSearching(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ level, source });
      if (topic) params.set('topic', topic);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/worksheet-builder/questions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.questions ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Search failed', 'error');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // ── Set operations ─────────────────────────────────────────────────────────
  function addItem(q: SearchResult) {
    setItems(prev => {
      if (prev.some(i => i.id === q.id)) return prev;
      return [...prev, { ...q, role: 'practice' as Role }];
    });
  }

  const toggleRole = useCallback((id: string) => {
    setItems(prev =>
      prev.map(i => (i.id === id ? { ...i, role: i.role === 'we' ? ('practice' as Role) : ('we' as Role), annotated: undefined } : i))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const from = prev.findIndex(i => i.id === active.id);
      const to = prev.findIndex(i => i.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  // ── Generate flow ──────────────────────────────────────────────────────────
  async function generate() {
    if (!items.length) {
      showToast('Add some questions first', 'error');
      return;
    }
    const wsTitle = title.trim() || 'Worksheet';
    const levelLabel = LEVELS.find(l => l.value === level)?.label ?? level;
    const subtitle = `${levelLabel} · ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    setResultUrl(null);
    try {
      // 1. Annotate each Worked Example sequentially (one Claude call per question)
      const weItems = items.filter(i => i.role === 'we');
      const annotatedMap = new Map<string, string>();
      for (let n = 0; n < weItems.length; n++) {
        const it = weItems[n];
        if (it.annotated) {
          annotatedMap.set(it.id, it.annotated);
          continue;
        }
        setProgress(`Annotating ${n + 1}/${weItems.length}…`);
        const res = await fetch('/api/admin/worksheet-builder/annotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionText: it.text,
            solution: it.solution,
            answer: it.answer,
            marks: it.marks,
            allowDiagrams,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Annotation failed on example ${n + 1}`);
        annotatedMap.set(it.id, data.annotated);
        // Cache on the item so a retry doesn't re-annotate
        setItems(prev => prev.map(p => (p.id === it.id ? { ...p, annotated: data.annotated } : p)));
      }

      // 2. Assemble PDF
      setProgress('Assembling PDF…');
      const res = await fetch('/api/admin/worksheet-builder/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wsTitle,
          subtitle,
          level,
          format: 'pdf',
          items: items.map(i => ({
            id: i.id,
            role: i.role,
            text: i.text,
            marks: i.marks,
            answer: i.answer,
            annotated: i.role === 'we' ? annotatedMap.get(i.id) : undefined,
            imageUrl: i.imageUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assembly failed');

      setResultUrl(data.url);
      showToast('Worksheet generated', 'success');
      loadExports();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Generation failed', 'error');
    } finally {
      setProgress(null);
    }
  }

  async function copyUrl() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      showToast('Link copied', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Checking session…</div>;
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md w-80">
          <h1 className="text-lg font-bold text-slate-800 mb-4">Worksheet Builder</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
            autoFocus
          />
          {loginError && <p className="text-red-600 text-xs mb-2">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-700">
            Log in
          </button>
        </form>
      </div>
    );
  }

  const busy = progress !== null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Worksheet Builder</h1>
        <p className="text-sm text-slate-500 mb-6">
          Search the question bank, build a set, assign roles, generate a house-styled PDF.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* ── Left: search ─────────────────────────────────────────────── */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value as UiLevel)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  {LEVELS.map(l => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <select
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">All topics</option>
                  {topics.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="Search question text…"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <select
                  value={source}
                  onChange={e => setSource(e.target.value as Source)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="all">All sources</option>
                  <option value="seed">Past papers</option>
                  <option value="generated">AI practice</option>
                </select>
                <button
                  onClick={runSearch}
                  disabled={searching}
                  className="bg-slate-800 text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
                >
                  {searching ? '…' : 'Search'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {searching && <p className="text-sm text-slate-500">Searching…</p>}
              {!searching && searched && results.length === 0 && (
                <p className="text-sm text-slate-500">No questions found.</p>
              )}
              {results.map(q => {
                const added = items.some(i => i.id === q.id);
                return (
                  <div key={q.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          q.source === 'seed' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
                        }`}
                      >
                        {q.provenance}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {q.difficulty && <span className="text-[11px] text-slate-500">{q.difficulty}</span>}
                        {q.marks != null && <span className="text-[11px] text-slate-500 font-semibold">[{q.marks}]</span>}
                        <button
                          onClick={() => addItem(q)}
                          disabled={added}
                          className="text-xs font-bold bg-emerald-600 text-white rounded-full w-6 h-6 leading-none hover:bg-emerald-500 disabled:bg-slate-300"
                          title={added ? 'Already in set' : 'Add to worksheet'}
                        >
                          {added ? '✓' : '＋'}
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-800 leading-snug max-h-32 overflow-hidden [&_p]:m-0 [&_p]:mb-1">
                      <ReactMarkdown {...katexMd}>{truncate(q.text, 320)}</ReactMarkdown>
                    </div>
                    {q.hasImage && <div className="text-[11px] text-slate-400 mt-1">📷 has diagram</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: worksheet set ──────────────────────────────────────── */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
                Worksheet set {items.length > 0 && <span className="text-slate-400 font-normal">({items.length})</span>}
              </h2>

              {items.length === 0 ? (
                <p className="text-sm text-slate-400 mb-4">No questions yet — add some from the left.</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 mb-4">
                      {items.map((item, idx) => (
                        <SortablePill key={item.id} item={item} index={idx} onToggleRole={toggleRole} onRemove={removeItem} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Worksheet title (e.g. Surds Revision Set A)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={allowDiagrams} onChange={e => setAllowDiagrams(e.target.checked)} />
                  Allow generated diagrams in worked examples
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="pdf">PDF</option>
                    <option value="docx" disabled title="DOCX via the chat clerk for now">
                      DOCX (via the chat clerk for now)
                    </option>
                  </select>
                  <button
                    onClick={generate}
                    disabled={busy || items.length === 0 || format !== 'pdf'}
                    className="flex-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy ? progress : 'Generate worksheet'}
                  </button>
                </div>

                {resultUrl && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-emerald-800 mb-2">✅ Worksheet ready</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={resultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-emerald-700 underline truncate"
                      >
                        {resultUrl}
                      </a>
                      <button
                        onClick={copyUrl}
                        className="text-xs bg-emerald-600 text-white rounded px-2 py-1 font-semibold hover:bg-emerald-500 shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Recent exports ──────────────────────────────────────────────── */}
        <div className="mt-10">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Recent exports</h2>
          {exports.length === 0 ? (
            <p className="text-sm text-slate-400">No exports yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {exports.map(ex => (
                <div key={ex.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="text-slate-400 text-xs w-24 shrink-0">
                    {ex.exported_at ? new Date(ex.exported_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '—'}
                  </span>
                  <span className="flex-1 font-medium text-slate-800 truncate">{ex.title || 'Untitled'}</span>
                  {ex.level && <span className="text-xs text-slate-500 shrink-0">{ex.level}</span>}
                  {ex.question_count != null && (
                    <span className="text-xs text-slate-500 shrink-0">{ex.question_count} q</span>
                  )}
                  {ex.file_urls?.pdf ? (
                    <a
                      href={ex.file_urls.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 underline shrink-0"
                    >
                      PDF
                    </a>
                  ) : (
                    <span className="text-xs text-slate-300 shrink-0">no file</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-lg z-50 ${
            toast.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
