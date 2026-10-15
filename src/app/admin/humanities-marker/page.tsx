// /admin/humanities-marker — how the Humanities marker is doing on real students' answers (15 Oct 2026,
// Adrian: "can we keep track of how the marker does on humanities?"). Tiles first (one big number each),
// then the answers where the teacher's mark fell outside our range — his to look at — then the latest
// answers. lib/humanities-tracking.ts holds the counting. Students' own answers only (not the bench).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionById, isPointsQuestion } from '@/lib/humanities-questions';
import { markerStats, teacherVerdict, ourRange, pct, type TrackRow } from '@/lib/humanities-tracking';
import { printedMarks } from '@/lib/humanities-marks';
import { SUBJECT_NAME } from '@/lib/humanities-questions';
import { SKILL_LABEL } from '@/app/app/humanities/skills';
import { HUMANITIES_PREVIEW_IDENTITIES } from '@/lib/portal-beta';

export const dynamic = 'force-dynamic';

const DAYS = 30;
const when = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const rangeText = (r: [number, number, number] | null) => (r ? `${r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`}/${r[2]}` : '—');

export default async function HumanitiesMarkerPage() {
  if (!(await isNotesAuthed())) redirect('/admin');
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const { data } = await getSupabaseAdmin().from('humanities_runs')
    .select('id, created_at, airtable_student_id, student_name, subject, skill, status, level_lo, level_hi, levels_max, reads, question_id, own_question, teacher_mark, teacher_total')
    .eq('source', 'app').gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
  // Real students only: the demo student and Adrian's own test answers are left out.
  const rows: (TrackRow & { own: boolean; question: string })[] = (data ?? []).filter(r => !HUMANITIES_PREVIEW_IDENTITIES.includes(String(r.airtable_student_id))).map(r => {
    const own = r.own_question as { question?: string; marks?: number | null; skill?: string } | null;
    const bank = own ? null : questionById(String(r.question_id));
    const question = own?.question ?? bank?.question.question ?? String(r.question_id);
    return {
      id: r.id, created_at: r.created_at, student_name: r.student_name, subject: r.subject, skill: r.skill, status: r.status,
      level_lo: r.level_lo, level_hi: r.level_hi, levels_max: r.levels_max, reads: r.reads,
      marks: own?.marks ?? bank?.question.marks ?? printedMarks(question),
      points: own ? r.skill === 'geo_describe' || r.skill === 'geo_explain' : !!bank && isPointsQuestion(bank.question),
      teacher_mark: r.teacher_mark == null ? null : Number(r.teacher_mark), teacher_total: r.teacher_total,
      own: !!own, question,
    };
  });
  const s = markerStats(rows);
  const off = rows.filter(r => { const v = teacherVerdict(r); return v && v.verdict !== 'inside'; });
  const tile = (big: string, label: string, sub?: string) => (
    <div className="bg-white rounded-2xl border border-black/10 p-4">
      <p className="text-3xl font-bold text-navy">{big}</p>
      <p className="text-sm font-semibold text-gray-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div>
        <Link href="/admin" className="text-xs text-gray-500">‹ Admin</Link>
        <h1 className="text-2xl font-bold text-navy">Humanities marker</h1>
        <p className="text-sm text-gray-600">Students&apos; answers, last {DAYS} days.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tile(String(s.answers), 'Answers handed in', `${s.read} read · ${s.failed} not read`)}
        {tile(pct(s.agreedFirst, s.read), 'Two reads agreed', 'the marker agrees with itself')}
        {tile(String(s.teacher), "Teacher's marks in", 'typed in by students')}
        {tile(pct(s.inside, s.teacher), 'Teacher inside our range', `${s.weHigh} we were high · ${s.weLow} we were low`)}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">The teacher disagreed — yours to look at</h2>
        {off.length === 0
          ? <p className="text-sm text-gray-600">None yet.</p>
          : off.map(r => {
            const v = teacherVerdict(r)!;
            return (
              <Link key={r.id} href={`/app/humanities/${r.id}`} className="block bg-white rounded-2xl border border-rose-200 px-4 py-3 hover:border-rose-400">
                <p className="text-xs text-gray-500">{when(r.created_at)} · {r.student_name ?? 'A student'} · {SUBJECT_NAME[r.subject as keyof typeof SUBJECT_NAME] ?? r.subject} · {SKILL_LABEL[r.skill] ?? r.skill}{r.own ? ' · from school' : ''}</p>
                <p className="text-sm text-navy line-clamp-2">{r.question}</p>
                <p className="text-sm mt-1"><span className="font-semibold">Ours {rangeText(ourRange(r))}</span> · <span className="font-semibold">Teacher {r.teacher_mark}/{r.teacher_total}</span> · <span className="text-rose-700">{v.verdict === 'we-high' ? 'we were high' : 'we were low'} by {Math.round(v.gap * 10) / 10}</span></p>
              </Link>
            );
          })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Latest answers</h2>
        <div className="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          {rows.slice(0, 60).map(r => (
            <Link key={r.id} href={`/app/humanities/${r.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-amber-50">
              <span className="w-28 shrink-0 text-xs text-gray-500">{when(r.created_at)}</span>
              <span className="w-32 shrink-0 truncate">{r.student_name ?? '—'}</span>
              <span className="flex-1 min-w-0 truncate text-gray-700">{SKILL_LABEL[r.skill] ?? r.skill}{r.own ? ' · from school' : ''} — {r.question}</span>
              <span className="w-20 shrink-0 text-right">{r.status === 'marked' || r.status === 'held' ? rangeText(ourRange(r)) : r.status}</span>
              <span className="w-16 shrink-0 text-right text-gray-500">{r.teacher_mark != null ? `T ${r.teacher_mark}/${r.teacher_total}` : ''}</span>
            </Link>
          ))}
          {rows.length === 0 && <p className="px-4 py-3 text-sm text-gray-600">No answers yet.</p>}
        </div>
      </section>
    </div>
  );
}
