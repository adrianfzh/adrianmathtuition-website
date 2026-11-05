'use client';

// 🧑‍🏫 Tutor portal home — sign in, then the tutor's students and this month's papers.
// SPEC-TUTOR-TOOLS.md §7. Words kept short and generic: no description of the service.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Student { id: string; name: string; level: string | null; papers: number }
interface Usage { used: number; cap: number; left: number; full: boolean }
interface Home { tutor: { name: string; email: string }; usage: Usage; students: Student[] }

export default function TutorHome() {
  const [home, setHome] = useState<Home | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch('/api/tutor/students', { cache: 'no-store' });
    if (r.status === 401) { setSignedOut(true); setHome(null); return; }
    setSignedOut(false);
    setHome(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (signedOut) return <SignIn onDone={load} />;
  if (!home) return <main className="p-6 text-slate-500">Loading…</main>;
  return <Dashboard home={home} reload={load} />;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/tutor/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (r.ok) onDone(); else setError((await r.json().catch(() => ({}))).error || 'Could not sign in.');
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
      <form onSubmit={go} className="space-y-3">
        <input className="w-full rounded-lg border px-3 py-2" type="email" autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full rounded-lg border px-3 py-2" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Dashboard({ home, reload }: { home: Home; reload: () => void }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [error, setError] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    const r = await fetch('/api/tutor/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, level }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not add.'); return; }
    setName(''); setLevel(''); reload();
  }
  async function signOut() {
    await fetch('/api/tutor/logout', { method: 'POST' });
    reload();
  }
  const u = home.usage;
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{home.tutor.name}</h1>
          <p className="text-sm text-slate-500">{home.tutor.email}</p>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 underline">Sign out</button>
      </header>

      <section className={`mb-6 rounded-xl border p-4 ${u.full ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
        <p className="text-lg font-semibold">{u.used} of {u.cap} papers this month</p>
        <p className="text-sm text-slate-600">{u.full ? 'This month’s papers are used. More open on the 1st.' : `${u.left} left this month.`}</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Your students</h2>
        {home.students.length === 0 && <p className="mb-3 text-sm text-slate-500">No students yet. Add one below.</p>}
        <ul className="divide-y rounded-xl border bg-white">
          {home.students.map(s => (
            <li key={s.id}>
              <Link href={`/tutor/s/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span><span className="font-medium">{s.name}</span>{s.level && <span className="ml-2 text-sm text-slate-500">{s.level}</span>}</span>
                <span className="text-sm text-slate-500">{s.papers} paper{s.papers === 1 ? '' : 's'} ›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={add} className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">Add a student</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded-lg border px-3 py-2" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="rounded-lg border px-3 py-2 sm:w-36" placeholder="Level (e.g. Sec 4)" value={level} onChange={e => setLevel(e.target.value)} />
          <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Add</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-slate-500">Only you can see your students’ names.</p>
      </form>
    </main>
  );
}
