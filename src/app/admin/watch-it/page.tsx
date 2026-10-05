// /admin/watch-it — ▶ every Watch it clip, for Adrian to look through before
// students see any (5 Oct 2026, "gate keep it to me, then show me the
// results"). One row per question that has a clip: the question, the bank's
// worked solution folded, and the same ▶ Watch it button a practice page shows.
// Admin cookie only; the clips themselves come from /api/portal/science/watch.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { getScienceClient } from '@/lib/science-bank';
import { MathMarkdown } from '@/lib/math-markdown';
import { watchSpecFor } from '@/lib/watch-it-store';
import kinematics from '../../../../data/watch-it/kinematics.json';
import chemicalCalculations from '../../../../data/watch-it/chemical-calculations.json';
import WatchIt from '../../app/practice/watch-it';
import { WATCH_IT_OPEN_TO_STUDENTS } from '@/lib/portal-beta';

export const dynamic = 'force-dynamic';

const TOPICS: { name: string; ids: string[] }[] = [
  { name: 'Kinematics', ids: Object.keys(kinematics) },
  { name: 'Chemical Calculations', ids: Object.keys(chemicalCalculations) },
];

type Row = { id: string; question_text: string | null; solution: string | null; answer: string | null; school: string | null; year: number | null };

export default async function WatchItGallery({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  if (!verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect('/admin');
  const sp = await searchParams;
  const pick = TOPICS.find(t => t.name === sp.topic) ?? TOPICS[0];
  const rows = new Map<string, Row>();
  for (let i = 0; i < pick.ids.length; i += 150) {
    const { data } = await getScienceClient().from('questions').select('id, question_text, solution, answer, school, year').in('id', pick.ids.slice(i, i + 150));
    for (const r of (data ?? []) as Row[]) rows.set(r.id, r);
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-navy">▶ Watch it — every clip</h1>
      <p className="mt-1 text-sm text-slate-500">
        Animated worked solutions under a science MCQ&apos;s solution. {WATCH_IT_OPEN_TO_STUDENTS ? 'Open to students.' : 'Only you see them — WATCH_IT_OPEN_TO_STUDENTS is off.'}
      </p>
      <nav className="mt-4 flex gap-2">
        {TOPICS.map(t => (
          <a key={t.name} href={`/admin/watch-it?topic=${encodeURIComponent(t.name)}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.name === pick.name ? 'bg-navy text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {t.name} · {t.ids.length}
          </a>
        ))}
      </nav>
      <ol className="mt-5 space-y-4">
        {pick.ids.map((id, i) => {
          const r = rows.get(id);
          const spec = watchSpecFor(id);
          return (
            <li key={id} className="rounded-2xl border border-slate-200 bg-white p-4" data-qid={id}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {i + 1}. {r?.school ?? '—'} {r?.year ?? ''} · {spec?.kind === 'graph' ? 'graph' : 'mole chain'} · answer {spec?.answer}
              </p>
              <div className="prose prose-sm mt-1 max-w-none text-slate-800"><MathMarkdown content={r?.question_text ?? '(question not found)'} /></div>
              <details className="mt-2 text-sm text-slate-600">
                <summary className="cursor-pointer text-slate-500">Worked solution</summary>
                <div className="prose prose-sm mt-1 max-w-none"><MathMarkdown content={r?.solution ?? ''} /></div>
              </details>
              <WatchIt questionId={id} known />
            </li>
          );
        })}
      </ol>
    </main>
  );
}
