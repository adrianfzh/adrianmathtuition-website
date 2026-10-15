// /admin/humanities-marker — how the Humanities marker is doing, and what it has taught itself (15 Oct 2026,
// Adrian: "i want our own marker to self aware of whether it is doing a good job and to auto fix or auto
// improve if required"). Tiles first (one big number each), then the rules it learned (each can be turned
// off), then the answers its checker disagreed with, then the latest answers. lib/humanities-tracking.ts and
// lib/humanities-selfcheck.ts hold the counting. Real students only (the demo and preview accounts are left out).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionById, isPointsQuestion, SUBJECT_NAME } from '@/lib/humanities-questions';
import { markerStats, ourRange, pct, type TrackRow } from '@/lib/humanities-tracking';
import { printedMarks } from '@/lib/humanities-marks';
import { SKILL_LABEL } from '@/app/app/humanities/skills';
import { HUMANITIES_PREVIEW_IDENTITIES } from '@/lib/portal-beta';
import RuleSwitch from './rule-switch';

export const dynamic = 'force-dynamic';

const DAYS = 30;
const when = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const rangeText = (r: [number, number, number] | null) => (r ? `${r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`}/${r[2]}` : '—');
const STATUS: Record<string, string> = { live: 'Live', testing: 'Being tested', drafting: 'Being written', rejected: 'Dropped — the test did not show it helps', off: 'Turned off' };

export default async function HumanitiesMarkerPage() {
  if (!(await isNotesAuthed())) redirect('/admin');
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [{ data }, { data: audits }, { data: rules }, { count: banked }, { data: repeats }] = await Promise.all([
    sb.from('humanities_runs')
      .select('id, created_at, airtable_student_id, student_name, subject, skill, status, level_lo, level_hi, levels_max, reads, question_id, own_question')
      .eq('source', 'app').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    sb.from('humanities_audits').select('run_id, status, audit_level, verdict, why, missed_rule').gte('created_at', since),
    sb.from('humanities_rule_patches').select('id, skill, rule, status, test, created_at, decided_at').order('created_at', { ascending: false }).limit(40),
    sb.from('humanities_uploaded_questions').select('id', { count: 'exact', head: true }),
    sb.from('humanities_uploaded_questions').select('id').gt('times_seen', 1),
  ]);
  const auditBy = new Map((audits ?? []).map(a => [a.run_id, a]));
  const rows = (data ?? []).filter(r => !HUMANITIES_PREVIEW_IDENTITIES.includes(String(r.airtable_student_id))).map(r => {
    const own = r.own_question as { question?: string; marks?: number | null } | null;
    const bank = own ? null : questionById(String(r.question_id));
    const question = own?.question ?? bank?.question.question ?? String(r.question_id);
    const row: TrackRow & { own: boolean; question: string } = {
      id: r.id, created_at: r.created_at, student_name: r.student_name, subject: r.subject, skill: r.skill, status: r.status,
      level_lo: r.level_lo, level_hi: r.level_hi, levels_max: r.levels_max, reads: r.reads,
      marks: own?.marks ?? bank?.question.marks ?? printedMarks(question),
      points: own ? r.skill === 'geo_describe' || r.skill === 'geo_explain' : !!bank && isPointsQuestion(bank.question),
      own: !!own, question,
    };
    return row;
  });
  const s = markerStats(rows);
  const checked = rows.map(r => auditBy.get(r.id)).filter(a => a?.status === 'done');
  const agreed = checked.filter(a => a!.verdict === 'agree').length;
  const off = rows.filter(r => { const a = auditBy.get(r.id); return a?.status === 'done' && a.verdict !== 'agree'; });
  const live = (rules ?? []).filter(r => r.status === 'live').length;
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
        <p className="text-sm text-gray-600">Students&apos; answers, last {DAYS} days. Every marked answer gets a second, independent check; when the checks keep finding the same mistake, the marker writes itself a rule, tests it, and uses it only if the test shows it helps.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tile(String(s.answers), 'Answers handed in', `${s.read} marked · ${s.failed} not marked`)}
        {tile(pct(s.agreedFirst, s.read), 'Two reads agreed', 'the marker agrees with itself')}
        {tile(pct(agreed, checked.length), 'The checker agreed', `${checked.length} answers checked`)}
        {tile(String(live), 'Rules learned, live', `${(rules ?? []).length} tried in all`)}
      </div>
      <p className="text-sm text-gray-600"><span className="font-semibold text-navy">{banked ?? 0}</span> school questions kept from students&apos; uploads (no student details; used for marking only){repeats?.length ? `, ${repeats.length} sent by more than one student` : ''}.</p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Rules the marker taught itself</h2>
        {(rules ?? []).length === 0
          ? <p className="text-sm text-gray-600">None yet. A rule is tried once the checker finds the same kind of mistake three times on one question type.</p>
          : (rules ?? []).map(r => {
            const score = (r.test as { score?: { seededBase: number; seededPatched: number; seededN: number; missedBase: number; missedPatched: number; missedN: number } } | null)?.score;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-black/10 px-4 py-3 flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">{SKILL_LABEL[r.skill] ?? r.skill} · {STATUS[r.status] ?? r.status} · {when(r.decided_at ?? r.created_at)}</p>
                  <p className="text-sm text-navy">{r.rule ?? '(being written)'}</p>
                  {score && <p className="text-xs text-gray-500 mt-0.5">Test — practice answers {score.seededPatched}/{score.seededN} right (was {score.seededBase}) · students&apos; missed answers {score.missedPatched}/{score.missedN} (was {score.missedBase})</p>}
                </div>
                {(r.status === 'live' || r.status === 'off') && <RuleSwitch id={r.id} live={r.status === 'live'} />}
              </div>
            );
          })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Where the checker disagreed</h2>
        {off.length === 0
          ? <p className="text-sm text-gray-600">None yet.</p>
          : off.map(r => {
            const a = auditBy.get(r.id)!;
            return (
              <Link key={r.id} href={`/app/humanities/${r.id}`} className="block bg-white rounded-2xl border border-rose-200 px-4 py-3 hover:border-rose-400">
                <p className="text-xs text-gray-500">{when(r.created_at)} · {r.student_name ?? 'A student'} · {SUBJECT_NAME[r.subject as keyof typeof SUBJECT_NAME] ?? r.subject} · {SKILL_LABEL[r.skill] ?? r.skill}{r.own ? ' · from school' : ''}</p>
                <p className="text-sm text-navy line-clamp-2">{r.question}</p>
                <p className="text-sm mt-1"><span className="font-semibold">We gave {r.level_lo === r.level_hi ? r.level_lo : `${r.level_lo}–${r.level_hi}`}</span> · <span className="font-semibold">Checker {a.audit_level}</span> · <span className="text-rose-700">{a.verdict === 'delivered_high' ? 'we were high' : 'we were low'}</span></p>
                {a.why && <p className="text-xs text-gray-600 mt-0.5">{a.why}</p>}
              </Link>
            );
          })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Latest answers</h2>
        <div className="bg-white rounded-2xl border border-black/10 divide-y divide-black/5">
          {rows.slice(0, 60).map(r => {
            const a = auditBy.get(r.id);
            return (
              <Link key={r.id} href={`/app/humanities/${r.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-amber-50">
                <span className="w-28 shrink-0 text-xs text-gray-500">{when(r.created_at)}</span>
                <span className="w-32 shrink-0 truncate">{r.student_name ?? '—'}</span>
                <span className="flex-1 min-w-0 truncate text-gray-700">{SKILL_LABEL[r.skill] ?? r.skill}{r.own ? ' · from school' : ''} — {r.question}</span>
                <span className="w-20 shrink-0 text-right">{r.status === 'marked' || r.status === 'held' ? rangeText(ourRange(r)) : r.status}</span>
                <span className="w-20 shrink-0 text-right text-xs">{a?.status === 'done' ? (a.verdict === 'agree' ? <span className="text-emerald-700">checked ✓</span> : <span className="text-rose-700">checker: {a.audit_level}</span>) : a ? 'checking' : ''}</span>
              </Link>
            );
          })}
          {rows.length === 0 && <p className="px-4 py-3 text-sm text-gray-600">No answers yet.</p>}
        </div>
      </section>
    </div>
  );
}
