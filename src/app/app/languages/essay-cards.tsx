// The Languages family's shared pieces (SPEC-ESSAY-MARKING.md, 12 Sep 2026):
// one essay's card in a list, the "being read" list, and the disclaimer line.
import Link from 'next/link';
import type { EssayListRow } from '@/lib/essay-runs';
import { ESSAY_KINDS, type EssayKind } from '@/lib/essay-rubric';
import { ESSAY_STATUS_WORDS } from '@/lib/essay-report';
import { codeLabel } from '@/lib/essay-codes';

export function kindLabel(kind: string): string {
  return (ESSAY_KINDS as Record<string, { label: string }>)[kind]?.label ?? kind.replace(/_/g, ' ');
}

export function essayTitle(row: Pick<EssayListRow, 'question' | 'essay_kind'>): string {
  const q = (row.question ?? '').trim().replace(/\s+/g, ' ');
  if (q) return q.length > 90 ? q.slice(0, 87) + '…' : q;
  return kindLabel(row.essay_kind);
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

/** The band range as the card shows it — a range, never a number. */
export function totalLine(bands: Record<string, unknown> | null): string | null {
  const total = bands && (bands as { total?: { min?: number; max?: number; out_of?: number } }).total;
  if (!total || typeof total.min !== 'number' || typeof total.max !== 'number') return null;
  return `${total.min}–${total.max} of ${total.out_of ?? 30}`;
}

export function EssayCard({ row, href }: { row: EssayListRow; href?: string }) {
  const marked = row.status === 'marked';
  const habits = row.code_counts
    ? Object.entries(row.code_counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];
  return (
    <Link
      href={href ?? `/app/languages/${row.id}`}
      className="block bg-white rounded-3xl border border-black/5 shadow-sm px-4 py-3.5 hover:border-violet-200 active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">{kindLabel(row.essay_kind)} · {whenLabel(row.created_at)}</p>
          <p className="text-sm font-semibold text-navy leading-snug mt-0.5 truncate">{essayTitle(row)}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-bold rounded-full px-2 py-1 ${
          marked ? 'bg-violet-50 text-violet-800' : row.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
          {marked ? (totalLine(row.bands) ?? 'Marked') : ESSAY_STATUS_WORDS[row.status]}
        </span>
      </div>
      {marked && habits.length > 0 && (
        <p className="text-[12px] text-gray-500 mt-1.5">
          {habits.map(([code, n]) => `${codeLabel(row.subject, code)} ×${n}`).join(' · ')}
        </p>
      )}
      {marked && row.word_count != null && (
        <p className="text-[11px] text-gray-400 mt-0.5">{row.word_count} words</p>
      )}
    </Link>
  );
}

export function EssayDisclaimer() {
  return (
    <p className="text-[12px] text-gray-500 px-1">
      An examiner-style read against the SEAB band descriptors — not your teacher&apos;s mark. Two teachers can differ
      by a band on the same essay; the feedback is the part to use.
    </p>
  );
}
