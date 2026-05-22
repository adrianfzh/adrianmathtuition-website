'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CardsPreviewPage() {
  return (
    <Suspense>
      <CardsPreviewInner />
    </Suspense>
  );
}
import { topicSlug } from '@/lib/topic-slug';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://nempslbewxtlikfzachi.supabase.co';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbXBzbGJld3h0bGlrZnphY2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzI3OTEsImV4cCI6MjA4OTkwODc5MX0.OsJAL6-yE0_z90HxpQSs0w1Jib5p1skwiPlJGze-ISI';

const LEVELS: { code: string; label: string; full: string; gradient: string }[] = [
  { code: 'AM', label: 'AM', full: 'O-Level Additional Math', gradient: 'from-emerald-500 to-teal-600' },
  { code: 'EM', label: 'EM', full: 'O-Level E-Math',          gradient: 'from-sky-500 to-blue-600' },
  { code: 'JC', label: 'JC', full: 'JC H2 Math',              gradient: 'from-violet-500 to-fuchsia-600' },
  { code: 'S1', label: 'S1', full: 'Secondary 1',             gradient: 'from-amber-500 to-orange-600' },
  { code: 'S2', label: 'S2', full: 'Secondary 2',             gradient: 'from-rose-500 to-pink-600' },
];

const KIND_META: Record<string, { icon: string; label: string; chip: string }> = {
  refresher:      { icon: '🧠', label: 'Refresher',       chip: 'bg-emerald-100 text-emerald-800' },
  worked_example: { icon: '💡', label: 'Worked Examples', chip: 'bg-blue-100 text-blue-800' },
  practice:       { icon: '✏️', label: 'Practice',        chip: 'bg-orange-100 text-orange-800' },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicCounts {
  topic: string;
  refresher: number;
  worked_example: number;
  practice: number;
  total: number;
}

// ── Cookie helper ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── Supabase fetch helpers ────────────────────────────────────────────────────

async function supaFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function fetchTopicsForLevel(level: string): Promise<TopicCounts[]> {
  const rows = await supaFetch<{ topic: string; content_kind: string }[]>(
    `content_snippets?level=eq.${level}&is_published=eq.true&select=topic,content_kind`
  );
  const map: Record<string, TopicCounts> = {};
  for (const r of rows) {
    if (!map[r.topic]) map[r.topic] = { topic: r.topic, refresher: 0, worked_example: 0, practice: 0, total: 0 };
    if (r.content_kind === 'refresher') map[r.topic].refresher++;
    else if (r.content_kind === 'worked_example') map[r.topic].worked_example++;
    else if (r.content_kind === 'practice') map[r.topic].practice++;
    map[r.topic].total++;
  }
  return Object.values(map).sort((a, b) => a.topic.localeCompare(b.topic));
}

async function fetchLevelCounts(): Promise<Record<string, number>> {
  const rows = await supaFetch<{ level: string }[]>(`content_snippets?is_published=eq.true&select=level`);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.level] = (counts[r.level] ?? 0) + 1;
  return counts;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CardsPreviewInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const level = sp.get('level') ?? '';

  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    setAuthed(!!pw);
  }, []);

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!authed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xl font-semibold text-slate-700">Admin login required</p>
        <p className="text-sm text-slate-500">Log in at <a className="text-blue-600 underline" href="/admin">/admin</a> first, then return here.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <TopBar level={level} onNav={(href) => router.push(href)} />
      {!level && <LevelPicker />}
      {level && <TopicPicker level={level} />}
    </main>
  );
}

// ── Top bar / breadcrumbs ─────────────────────────────────────────────────────

function TopBar({ level, onNav }: { level: string; onNav: (href: string) => void }) {
  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
      <div className="max-w-5xl mx-auto flex items-center gap-2 text-sm">
        <button onClick={() => onNav('/admin/cards-preview')} className="font-semibold hover:text-emerald-300">
          📚 Cards Preview
        </button>
        {level && (
          <>
            <span className="text-slate-400">/</span>
            <span className="text-emerald-300 font-medium">{level}</span>
          </>
        )}
        <span className="flex-1" />
        <a href="/admin" className="text-xs text-slate-300 hover:text-white">← Admin hub</a>
      </div>
    </div>
  );
}

// ── Level picker ──────────────────────────────────────────────────────────────

function LevelPicker() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLevelCounts().then((c) => { setCounts(c); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Pick a level</h1>
      <p className="text-sm text-slate-500 mb-6">Browse live swipe-card decks. Click a topic to open the public revise page.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {LEVELS.map((l) => {
          const count = counts[l.code] ?? 0;
          return (
            <button
              key={l.code}
              onClick={() => router.push(`/admin/cards-preview?level=${l.code}`)}
              className={`bg-gradient-to-br ${l.gradient} text-white rounded-xl px-6 py-8 shadow-md hover:shadow-lg hover:scale-[1.02] transition text-left`}
            >
              <div className="text-4xl font-bold">{l.label}</div>
              <div className="text-sm opacity-90 mt-1">{l.full}</div>
              <div className="text-xs opacity-75 mt-3">
                {loading ? '…' : `${count} card${count === 1 ? '' : 's'}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Topic picker — each topic links straight to /revise/{level}/{slug}/worked-examples ───

function TopicPicker({ level }: { level: string }) {
  const [topics, setTopics] = useState<TopicCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchTopicsForLevel(level).then((t) => { setTopics(t); setLoading(false); }).catch(() => setLoading(false));
  }, [level]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return topics;
    const q = filter.toLowerCase();
    return topics.filter((t) => t.topic.toLowerCase().includes(q));
  }, [topics, filter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-800 flex-1">{level} topics</h1>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="px-3 py-1.5 border border-slate-300 rounded text-sm w-48"
        />
      </div>
      {loading && <p className="text-slate-400 text-sm">Loading topics…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-slate-400 text-sm italic">No published cards yet for {level}.</p>
      )}
      <div className="space-y-2">
        {filtered.map((t) => {
          const href = `/revise/${level.toLowerCase()}/${topicSlug(t.topic)}/worked-examples`;
          return (
            <a
              key={t.topic}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg border border-slate-200 hover:border-emerald-400 hover:shadow-sm transition px-4 py-3 flex items-center gap-3"
            >
              <span className="flex-1 font-medium text-slate-800">{t.topic}</span>
              <Pill label={`${t.refresher}`} kind="refresher" />
              <Pill label={`${t.worked_example}`} kind="worked_example" />
              <Pill label={`${t.practice}`} kind="practice" />
              <span className="text-xs text-emerald-600 ml-2">Open →</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ label, kind }: { label: string; kind: keyof typeof KIND_META }) {
  const m = KIND_META[kind];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${m.chip}`} title={m.label}>
      {m.icon} {label}
    </span>
  );
}
