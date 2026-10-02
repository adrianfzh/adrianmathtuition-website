// One row per handed-in answer — Home's recent list and the Answers page share it.
import Link from 'next/link';
import type { HumanitiesListRow } from '@/lib/humanities-runs';
import { levelLabel } from '@/lib/humanities-report';
import { questionById } from '@/lib/humanities-questions';
import { skillLabel } from './skills';

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

export function AnswerCard({ row }: { row: HumanitiesListRow }) {
  const ctx = questionById(row.question_id);
  const read = row.status === 'marked' || row.status === 'held';
  const state = read && row.level_lo && row.level_hi && row.levels_max
    ? levelLabel(row.level_lo, row.level_hi, row.levels_max)
    : row.status === 'failed' ? 'Not read — hand it in again' : 'Being read…';
  return (
    <Link href={`/app/humanities/${row.id}`}
      className="block bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-navy">{skillLabel(row.skill)}</span>
        <span className="text-[12px] text-gray-500 shrink-0">{when(row.created_at)}</span>
      </div>
      <p className="text-[13px] text-gray-600 mt-0.5 line-clamp-2">{ctx?.question.question ?? row.question_id}</p>
      <p className={`text-[13px] font-semibold mt-1 ${read ? 'text-amber-800' : 'text-gray-500'}`}>{state}</p>
    </Link>
  );
}
