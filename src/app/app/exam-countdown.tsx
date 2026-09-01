// Home "Next exam" countdown (2026-09-02). Server component — pure render of
// lib/portal-exams' UpcomingExam rows (fetched inside getDashboardData, so it
// streams in with the Next-lesson island). Hidden when the student has no
// dated upcoming exam inside the horizon; self-serve accounts never see it
// (no Airtable record → no exams).
//
// Doors out: each tested-topic chip opens the practice picker on that topic;
// the last row prefills a timed set with the exam's level + tested topics
// (mixed across the level when Adrian recorded none — a prelim tests all).
import Link from 'next/link';
import PortalIcon from '@/components/PortalIcon';
import {
  EXAM_TOPIC_CHIPS, countdownWords, examDateWords, examTitle, timedSetHref, topicPracticeHref,
  type UpcomingExam,
} from '@/lib/portal-exams';

export default function ExamCountdown({ exams, card, caption }: {
  exams: UpcomingExam[]; card: string; caption: string;
}) {
  if (!exams.length) return null;
  const next = exams[0];
  const soon = next.daysLeft <= 7;
  const imminent = next.daysLeft <= 1;
  const tone = imminent ? 'text-rose-600' : soon ? 'text-amber-600' : 'text-navy';
  const tile = imminent ? 'bg-rose-500 text-white' : soon ? 'bg-amber-400 text-navy' : 'bg-slate-200 text-navy';
  const topics = next.testedTopics;
  const shown = topics.slice(0, EXAM_TOPIC_CHIPS);
  const chip = 'text-xs bg-[hsl(45,80%,94%)] text-navy rounded-full px-2.5 py-1';

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className={`flex items-center justify-center w-10 h-10 rounded-2xl shrink-0 ${tile}`}>
          <PortalIcon name="calendar" className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={caption}>Next exam</p>
          <p className="text-base font-bold text-navy truncate">{examTitle(next)}</p>
          <p className="text-sm text-slate-500">
            {examDateWords(next.date)}{next.approx ? ' · date approx.' : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          {imminent ? (
            <p className={`text-lg font-black ${tone}`}>{countdownWords(next.daysLeft)}</p>
          ) : (
            <>
              <p className={`text-3xl font-black tabular-nums leading-none ${tone}`}>{next.daysLeft}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">days</p>
            </>
          )}
        </div>
      </div>

      {exams.length > 1 && (
        <ul className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
          {exams.slice(1).map(e => (
            <li key={e.id} className="text-xs text-slate-500 flex justify-between gap-2">
              <span className="truncate">{examTitle(e)}</span>
              <span className="shrink-0 tabular-nums">{examDateWords(e.date)} · {countdownWords(e.daysLeft)}</span>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] text-slate-400 mb-1.5">Tested topics — tap one to practise it</p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map(t => next.practiceLevel ? (
              <Link key={t} href={topicPracticeHref(next, t)} className={`${chip} active:scale-95 transition-transform`}>{t}</Link>
            ) : (
              <span key={t} className={chip}>{t}</span>
            ))}
            {topics.length > shown.length && (
              <span className="text-xs text-slate-400 px-1 py-1">+{topics.length - shown.length} more</span>
            )}
          </div>
        </div>
      )}

      <Link href={timedSetHref(next)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-navy">
        <span aria-hidden>⏱</span>
        <span className="flex-1">{topics.length ? 'Timed set on these topics' : 'Timed set at exam pace'}</span>
        <span aria-hidden className="text-slate-300">›</span>
      </Link>
    </div>
  );
}
