// /admin/question-clips — 🎬 every question clip, for Adrian to watch before students
// see any (SPEC-CLIP-PIPELINE.md §4 + §9: the first 20 are watched by him). One row per
// question: the question, the state, every check with ✓/✗, the minutes it took, what it
// cost, a ▶ link and his 👍 / 👎. Admin cookie only.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { MathMarkdown } from '@/lib/math-markdown';
import { listQuestionClips } from '@/lib/question-clip-store';
import { QUESTION_CLIPS_OPEN_TO_STUDENTS } from '@/lib/portal-beta';

export const dynamic = 'force-dynamic';

const CHECK_NAMES: Record<string, string> = {
  'photo-read': 'read off the photo', solves: 'two blind solves agree', same: 'same question — copied',
  pre: 'can be checked', plan: 'plan', maths: 'maths', read: 'blind read', rules: 'rules', board: 'board = plan',
  voice: 'voice', look: 'look on a phone', pictures: 'pictures read',
};

export default async function QuestionClipsAdmin() {
  if (!verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect('/admin');
  const rows = await listQuestionClips(300);
  const ids = rows.map(r => r.question_id);
  const texts = new Map<string, { question_text: string | null; school: string | null; year: number | null }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await getSupabaseAdmin().from('questions').select('id, question_text, school, year').in('id', ids.slice(i, i + 150));
    for (const q of data ?? []) texts.set(q.id, q);
  }
  const ready = rows.filter(r => r.status === 'ready');
  const watched = ready.filter(r => r.verdict);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-navy">🎬 Question clips</h1>
      <p className="mt-1 text-sm text-slate-500">
        A one-minute solution clip per question, made through every check. {ready.length} ready · {watched.length} watched by you ·{' '}
        {QUESTION_CLIPS_OPEN_TO_STUDENTS ? 'open to students.' : 'only you see them (QUESTION_CLIPS_OPEN_TO_STUDENTS is off).'}
      </p>
      <ul className="mt-5 space-y-4">
        {rows.map(r => {
          const q = texts.get(r.question_id);
          const checks = Object.entries(r.gate?.checks ?? {});
          return (
            <li key={r.question_id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.topic ?? '—'} · {r.source === 'photo' ? <a className="underline" href={`/app/marking/${r.origin?.run_id}`}>📷 photo, Q{r.origin?.question_number}</a> : <>{q?.school} {q?.year}</>}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : r.status === 'failed' ? 'bg-rose-100 text-rose-800' : r.status === 'refused' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{r.status}</span>
              </div>
              <div className="mt-2 text-sm"><MathMarkdown content={q?.question_text ?? r.question_text ?? ''} /></div>
              {checks.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  {checks.map(([k, c]) => <span key={k} className="mr-3" title={c.detail}>{c.ok ? '✓' : '✗'} {CHECK_NAMES[k] ?? k}</span>)}
                </p>
              )}
              {r.refuse_reason && <p className="mt-1 text-xs text-slate-500">Refused — {r.refuse_reason}</p>}
              {r.fail_reason && <p className="mt-1 text-xs text-rose-700">Failed — {r.fail_reason}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {r.seconds != null && <span>{Math.floor(r.seconds / 60)} min {r.seconds % 60} s</span>}
                {r.cost?.voice_usd != null && <span>voice US${r.cost.voice_usd.toFixed(2)}</span>}
                {r.verdict && <span>{r.verdict === 'good' ? '👍 good' : '👎 not good'}{r.note ? ` — ${r.note}` : ''}</span>}
                <a className="font-semibold text-navy underline" href={`/app/clip/q/${r.question_id}?back=/admin/question-clips`}>{r.status === 'ready' ? '▶ Watch' : 'Open'}</a>
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
