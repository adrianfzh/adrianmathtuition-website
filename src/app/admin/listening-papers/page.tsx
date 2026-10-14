// /admin/listening-papers — 🎧 every English listening paper, for Adrian (SPEC-ENGLISH-ORAL-LISTENING.md
// §More papers). The pile per level, this month's count against the cap, and each paper: kept, waiting
// for its recording, thrown away by a check (why), or retired by students' results (why).
// Read-only. Admin cookie.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isNotesAuthed } from '@/lib/notes-auth';
import { listeningStock, paperList } from '@/lib/english-listening-store';
import { LISTENING_LEVELS, VOICE_NEW_PAPERS } from '@/lib/english-listening-papers';

export const dynamic = 'force-dynamic';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short' });
const WORD: Record<string, string> = { ready: 'Ready', checked: 'Waiting for its recording', rejected: 'Thrown away', retired: 'Retired' };
const TINT: Record<string, string> = { ready: 'text-emerald-700', checked: 'text-amber-700', rejected: 'text-neutral-400', retired: 'text-red-600' };

export default async function ListeningPapersAdmin() {
  if (!(await isNotesAuthed())) redirect('/admin');
  const [stock, papers] = await Promise.all([listeningStock(), paperList()]);
  const name = (l: string) => LISTENING_LEVELS.find(x => x.level === l)?.name ?? l;
  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/admin" className="text-xs text-neutral-500">‹ Admin</Link>
        <h1 className="text-xl font-bold text-neutral-800">🎧 Listening papers</h1>
        <p className="text-sm text-neutral-500">Made ahead on the plan, checked, then recorded. {VOICE_NEW_PAPERS ? 'Recording is on.' : 'Recording is OFF — kept papers wait for their recording.'}</p>
      </div>
      <section className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-3 gap-3 text-center">
        {stock.levels.map(l => (
          <div key={l.level}>
            <p className="text-2xl font-bold text-neutral-800">{l.ready}</p>
            <p className="text-xs text-neutral-500">{name(l.level)} ready{l.checked ? ` · ${l.checked} waiting` : ''}</p>
            {l.fewestLeft !== null && <p className="text-[11px] text-neutral-400">keenest student: {l.fewestLeft} left</p>}
          </div>
        ))}
      </section>
      <p className="text-sm text-neutral-600">This month: <b>{stock.madeThisMonth}</b> papers made of the limit of <b>{stock.monthlyCap}</b> (thrown-away ones count). One a day at most because of any one student.</p>
      <section className="bg-white rounded-xl shadow-sm divide-y divide-neutral-100">
        {papers.map(p => {
          const why = p.status === 'retired' ? p.checks?.retired?.reason : p.status === 'rejected' ? (p.checks?.problems ?? []).slice(0, 3).join(' · ') : null;
          return (
            <div key={p.id} className="p-3 text-sm">
              <div className="flex items-baseline gap-2">
                {p.status === 'ready' || p.status === 'checked'
                  ? <Link href={`/app/languages/listening/paper/${p.id}`} className="font-mono text-neutral-800 underline underline-offset-2">{p.id}</Link>
                  : <span className="font-mono text-neutral-500">{p.id}</span>}
                <span className="text-neutral-600">{name(p.level)}</span>
                <span className={`font-semibold ${TINT[p.status]}`}>{WORD[p.status]}</span>
                <span className="ml-auto text-xs text-neutral-400">{p.made_by} · {day(p.created_at)}</span>
              </div>
              {why && <p className="text-xs text-neutral-500 mt-1">{why}</p>}
            </div>
          );
        })}
        {papers.length === 0 && <p className="p-3 text-sm text-neutral-500">No papers yet.</p>}
      </section>
    </main>
  );
}
