'use client';

// /admin/lessons — list lessons, create new
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Lesson {
  id: string;
  name: string;
  level: string;
  topics: string[];
  description: string | null;
  is_archived: boolean;
  updated_at: string;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function LessonsListPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const cookiePw = getCookie('admin_pw') || getCookie('schedule_pw');
    setPw(cookiePw);
    setAuthed(!!cookiePw);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch('/api/admin/lessons', { headers: { Authorization: `Bearer ${pw}` } })
      .then(r => r.json())
      .then(d => setLessons(d.lessons ?? []));
  }, [authed, pw]);

  async function createLesson(name: string, level: string) {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ name, level }),
      });
      const d = await res.json();
      if (d.lesson) router.push(`/admin/lessons/${d.lesson.id}`);
    } finally { setCreating(false); }
  }

  if (authed === null) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!authed) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xl font-semibold text-slate-700">Admin login required</p>
      <p className="text-sm text-slate-500">Log in at <a className="text-blue-600 underline" href="/admin">/admin</a> first.</p>
    </main>
  );

  const filtered = filter
    ? lessons.filter(l => l.name.toLowerCase().includes(filter.toLowerCase()) || l.level.toLowerCase().includes(filter.toLowerCase()))
    : lessons;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-lg font-semibold">📚 Lessons</span>
          <span className="text-xs text-slate-300">multi-topic teaching decks</span>
          <span className="flex-1" />
          <a href="/admin" className="text-xs text-slate-300 hover:text-white">← Admin hub</a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Filter by name or level…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm"
          />
          <CreateLessonInline onCreate={createLesson} disabled={creating} />
        </div>

        {filtered.length === 0 && (
          <p className="text-slate-400 text-sm italic">{lessons.length === 0 ? 'No lessons yet. Create one to get started.' : 'No matches.'}</p>
        )}

        <div className="space-y-2">
          {filtered.map(l => (
            <a key={l.id} href={`/admin/lessons/${l.id}`}
               className="block bg-white rounded-lg border border-slate-200 hover:border-emerald-400 hover:shadow-sm transition px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-800">{l.name}</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded font-medium">{l.level}</span>
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
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

function CreateLessonInline({ onCreate, disabled }: { onCreate: (name: string, level: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('AM');
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700">
        + New lesson
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input type="text" placeholder="Lesson name" value={name} onChange={e => setName(e.target.value)}
             className="px-3 py-2 border border-slate-300 rounded text-sm" autoFocus />
      <select value={level} onChange={e => setLevel(e.target.value)}
              className="px-2 py-2 border border-slate-300 rounded text-sm">
        <option>AM</option><option>EM</option><option>JC</option><option>S1</option><option>S2</option>
      </select>
      <button disabled={!name.trim() || disabled} onClick={() => onCreate(name.trim(), level)}
              className="px-3 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
        Create
      </button>
      <button onClick={() => { setOpen(false); setName(''); }} className="px-2 py-2 text-slate-500 text-sm">✕</button>
    </div>
  );
}
