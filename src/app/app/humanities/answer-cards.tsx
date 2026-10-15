// One row per handed-in answer — Home's recent list and the Answers page share it.
import Link from 'next/link';
import type { HumanitiesListRow } from '@/lib/humanities-runs';
import { levelLabel, marksLabel } from '@/lib/humanities-report';
import { GEOGRAPHY_MARKS_OPEN_TO_STUDENTS } from '@/lib/portal-beta';
import { questionById } from '@/lib/humanities-questions';
import { marksForLevels, printedMarks } from '@/lib/humanities-marks';
import { placeBand } from '@/lib/humanities-place';
import { skillLabel } from './skills';

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

export function AnswerCard({ row }: { row: HumanitiesListRow }) {
  const ctx = questionById(row.question_id);
  const read = row.status === 'marked' || row.status === 'held';
  // A point-marked answer (Geography) holds marks in the level fields, and 0 is a real result.
  // A Geography short question from school has no bank context: its type says it is point-marked.
  const points = ctx ? ctx.set.kind === 'points' : row.skill === 'geo_describe' || row.skill === 'geo_explain';
  // A marked answer: the settled level (and the exact mark when it is back), not the spread of the reads.
  const settled = row.status === 'marked' && row.level != null;
  const lo = settled ? row.level : row.level_lo, hi = settled ? row.level : row.level_hi;
  const marks = ctx?.question.marks ?? (row.own_title ? printedMarks(row.own_title) : null);
  const band = settled ? placeBand(row.skill, marks, row.level) : null;
  const state = read && points && lo != null && hi != null
    ? (GEOGRAPHY_MARKS_OPEN_TO_STUDENTS && row.levels_max ? marksLabel(lo, hi, row.levels_max) : 'Read — see what to add')
    : read && lo && hi && row.levels_max
    ? (row.report_mark != null && band ? `${row.report_mark} out of ${band.total} marks` : marksForLevels(row.skill, marks, lo, hi) ?? levelLabel(lo, hi, row.levels_max))
    : row.status === 'failed' ? 'Not read — hand it in again' : 'Being read…';
  return (
    <Link href={`/app/humanities/${row.id}`}
      className="block bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-navy">{skillLabel(row.skill)}</span>
        <span className="text-[12px] text-gray-500 shrink-0">{when(row.created_at)}</span>
      </div>
      <p className="text-[13px] text-gray-600 mt-0.5 line-clamp-2">{ctx?.question.question ?? row.own_title ?? row.question_id}</p>
      <p className={`text-[13px] font-semibold mt-1 ${read ? 'text-amber-800' : 'text-gray-500'}`}>{state}</p>
    </Link>
  );
}
