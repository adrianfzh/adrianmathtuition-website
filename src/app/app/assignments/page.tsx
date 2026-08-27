// /app/assignments — everything Adrian has sent this student ("From Adrian").
// Pending first, then done. A question opens in the practice grader
// (/app/practice?assignment=); a worksheet opens its own page with the PDF and
// the Submit button. Server component, service-role read scoped by the
// student's Airtable id (lib/portal-assignments.ts).
import Link from 'next/link';
import { currentAccount } from '@/lib/portal-auth';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { assignmentHref, dueLabel, isOverdue, isPending, statusLabel } from '@/lib/assignments';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

function sentOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

export default async function AssignmentsPage() {
  const account = await currentAccount();
  const rows = await listStudentAssignments(account.airtable_student_id).catch(() => []);
  const pending = rows.filter(r => isPending(r.status));
  const done = rows.filter(r => !isPending(r.status));

  const Row = ({ r }: { r: (typeof rows)[number] }) => {
    const due = dueLabel(r.due_on);
    const overdue = isOverdue(r);
    const chip = r.status === 'marked'
      ? 'bg-emerald-50 text-emerald-800'
      : r.status === 'submitted' ? 'bg-blue-50 text-blue-700' : 'bg-[hsl(45,80%,94%)] text-navy';
    return (
      <Link href={assignmentHref(r)} className={`${CARD} block p-4 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none mt-0.5" aria-hidden>{r.kind === 'question' ? '✏️' : '📄'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-navy truncate">{r.title}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
              {r.topic && <span>{r.topic}</span>}
              {r.tier && <span>· {r.tier}</span>}
              <span>· sent {sentOn(r.created_at)}</span>
              {due && isPending(r.status) && <span className={overdue ? 'text-amber-700' : ''}>· {due}</span>}
            </div>
            {r.note && <p className="text-sm text-gray-700 mt-2 italic">“{r.note}”</p>}
          </div>
          <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ${chip}`}>{statusLabel(r)}</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-baseline justify-between pt-1">
        <h1 className="text-xl font-bold text-navy">📬 From Adrian</h1>
        <Link href="/app" className="text-sm text-gray-500 hover:text-navy">← Home</Link>
      </div>

      {rows.length === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          Nothing here yet. When Adrian sends you a question or a worksheet, it shows up here and on your Home page.
        </div>
      )}

      {pending.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">To do</p>
          {pending.map(r => <Row key={r.id} r={r} />)}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Done</p>
          {done.map(r => <Row key={r.id} r={r} />)}
        </section>
      )}

      <p className="text-[11px] text-gray-400">
        Questions are marked line by line right away. Worksheets come back in <Link href="/app/marking" className="underline">Marked papers</Link> once marked.
      </p>
    </div>
  );
}
