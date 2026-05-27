'use client';

// /admin/lessons — list lessons + create new (works offline via the offline store).
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadLessons, addLesson } from '@/lib/offline/store';
import type { LocalLesson } from '@/lib/offline/db';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function LessonsListPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [lessons, setLessons] = useState<LocalLesson[]>([]);
  const [source, setSource] = useState<'network' | 'cache' | 'loading'>('loading');
  const [filter, setFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw');
    setAuthed(!!pw);
  }, []);

  const refresh = useCallback(async () => {
    setSource('loading');
    const r = await loadLessons();
    setLessons(r.lessons);
    setSource(r.source);
  }, []);

  useEffect(() => { if (authed) void refresh(); }, [authed, refresh]);

  if (authed === null) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!authed) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xl font-semibold text-slate-700">Admin login required</p>
      <p className="text-sm text-slate-500">Log in at <Link className="text-blue-600 underline" href="/admin">/admin</Link> first.</p>
    </main>
  );

  // Custom level order: most-used levels first (Adrian's business is mostly EM + AM + JC),
  // then S2/S1 at the bottom. Unknown levels go after everything else.
  // Within each level, newest first (already the server's order; we preserve it).
  const LEVEL_ORDER: Record<string, number> = { EM: 0, AM: 1, JC: 2, S2: 3, S1: 4 };
  const ordered = [...lessons].sort((a, b) => {
    const la = LEVEL_ORDER[a.level] ?? 99;
    const lb = LEVEL_ORDER[b.level] ?? 99;
    if (la !== lb) return la - lb;
    // Same level — keep server's updated_at desc by leaving original order
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  });
  const filtered = filter
    ? ordered.filter(l => l.name.toLowerCase().includes(filter.toLowerCase()) || l.level.toLowerCase().includes(filter.toLowerCase()))
    : ordered;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-lg font-semibold">📚 Lessons</span>
          <span className="text-xs text-slate-300">multi-topic teaching decks</span>
          {source === 'cache' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-200 rounded">offline · cached list</span>}
          <span className="flex-1" />
          <Link href="/admin/offline" className="text-xs text-slate-300 hover:text-white">⚙ Offline</Link>
          <Link href="/admin" className="text-xs text-slate-300 hover:text-white">← Admin hub</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Primary CTA row — large, prominent */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Lessons</h1>
            <p className="text-sm text-slate-500">{lessons.length} lesson{lessons.length === 1 ? '' : 's'} · build a teaching deck with refresher cards, worked examples, and practice questions</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold hover:bg-emerald-700 active:bg-emerald-800 shadow-sm hover:shadow-md transition"
          >
            <span className="text-xl leading-none">+</span> New lesson
          </button>
        </div>

        {/* Filter */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter by name or level…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* List */}
        {source === 'loading' && lessons.length === 0 ? (
          <p className="text-slate-400 text-sm italic">Loading lessons…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
            <p className="text-slate-500 mb-3">
              {lessons.length === 0 ? 'No lessons yet.' : 'No matches for your filter.'}
            </p>
            {lessons.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700"
              >
                Create your first lesson
              </button>
            )}
          </div>
        ) : (
          (() => {
            // Group filtered list by level, preserve level-order computed above
            const groups: Record<string, LocalLesson[]> = {};
            for (const l of filtered) { (groups[l.level] ||= []).push(l); }
            const levelKeys = Object.keys(groups).sort((a, b) => (LEVEL_ORDER[a] ?? 99) - (LEVEL_ORDER[b] ?? 99));
            return (
              <div className="space-y-6">
                {levelKeys.map(level => (
                  <div key={level}>
                    <div className="flex items-baseline gap-2 mb-2 px-1">
                      <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">{level}</span>
                      <span className="text-[11px] text-slate-400">{groups[level].length} lesson{groups[level].length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-2">
                      {groups[level].map(l => (
                        <Link key={l.id} href={`/admin/lessons/${l.id}`}
                          className="block bg-white rounded-lg border border-slate-200 hover:border-emerald-400 hover:shadow-sm transition px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-800">{l.name}</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded font-medium">{l.level}</span>
                            {l._dirty && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-medium" title="Created locally; syncs when you reconnect">queued</span>}
                            {l.topics.length > 0 && (
                              <span className="text-xs text-slate-500">{l.topics.length} topic{l.topics.length === 1 ? '' : 's'}</span>
                            )}
                            <span className="flex-1" />
                            <span className="text-xs text-slate-400">{new Date(l.updated_at).toLocaleDateString()}</span>
                          </div>
                          {l.description && <div className="text-xs text-slate-500 mt-1">{l.description}</div>}
                          {l.topics.length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-2">
                              {l.topics.slice(0, 6).map(t => (
                                <span key={t} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{t}</span>
                              ))}
                              {l.topics.length > 6 && <span className="text-xs text-slate-400">+{l.topics.length - 6} more</span>}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {showModal && (
        <NewLessonModal
          onClose={() => setShowModal(false)}
          onCreated={(lesson) => {
            setLessons(prev => [lesson, ...prev]);
            setShowModal(false);
            router.push(`/admin/lessons/${lesson.id}`);
          }}
        />
      )}
    </main>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────

function NewLessonModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (lesson: LocalLesson) => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('AM');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    if (!name.trim()) { setErr('Lesson name is required'); return; }
    setCreating(true); setErr('');
    try {
      const lesson = await addLesson({ name: name.trim(), level });
      onCreated(lesson);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center">
          <h2 className="text-lg font-semibold text-slate-800">New lesson</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Lesson name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="e.g. AM mock test prep — Trig identities"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Level</label>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="AM">AM — O-Level A Math</option>
              <option value="EM">EM — O-Level E Math</option>
              <option value="JC">JC — H2 Mathematics</option>
              <option value="S1">S1 — Secondary 1</option>
              <option value="S2">S2 — Secondary 2</option>
            </select>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <p className="text-xs text-slate-500">
            You can add topics, a description, and cards after creating. Works offline — lesson syncs to the server when you reconnect.
          </p>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 rounded-b-xl flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-100"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={creating || !name.trim()}
            className="px-5 py-2 bg-emerald-600 text-white rounded text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
          >{creating ? 'Creating…' : 'Create lesson'}</button>
        </div>
      </div>
    </div>
  );
}
