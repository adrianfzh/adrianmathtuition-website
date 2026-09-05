// /app/practice for a STUDENT — the to-do list (SPEC-PORTAL-V2 §3).
//
// Adrian, 6 Sep 2026: a student's Practice tab is their to-do list and nothing
// else — (1) work he assigned, (2) Practice Again questions handed back from
// their own marked papers, (3) questions they found with Find a question. The
// open topic picker and the timed set stay behind his admin cookie
// (lib/portal-beta practiceAccess); the page swaps this in for a 'list' caller.
//
// Server component. One service-role read scoped by the student's identity
// (lib/portal-assignments — held and revoked rows are excluded in the query),
// then the subject gate (lib/portal-subjects via lib/practice-todo) and the
// grouping/ordering, all pure and tested. Each item opens the page the
// assignment already had: a question (bank or worker-written) in the practice
// grader, a worksheet on its own page with the Submit button.
import Link from 'next/link';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { listStudentAssignments, paperNamesForStudent } from '@/lib/portal-assignments';
import { assignmentHref, dueLabel, isOverdue } from '@/lib/assignments';
import {
  groupPracticeTodo, sourceRunIds, todoStateLabel, todoSubtitle, todoTotals, visibleToStudent,
  type TodoState,
} from '@/lib/practice-todo';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

const CHIP: Record<TodoState, string> = {
  todo: 'bg-[hsl(45,80%,94%)] text-navy',
  done: 'bg-blue-50 text-blue-700',
  marked: 'bg-emerald-50 text-emerald-800',
};

function sentOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

function summaryLine(t: Record<TodoState, number>): string | null {
  const parts: string[] = [];
  if (t.todo) parts.push(`${t.todo} to do`);
  if (t.done) parts.push(`${t.done} being marked`);
  if (t.marked) parts.push(`${t.marked} marked`);
  return parts.length ? parts.join(' · ') : null;
}

export default async function PracticeTodo({ account }: { account: Pick<PortalAccount, 'id' | 'airtable_student_id' | 'level' | 'subjects'> }) {
  const identity = portalIdentity(account);
  // rec… for tuition, acct:<uuid> for strangers — the identity predicate rides
  // the query; the subject gate is applied here on the rows that came back.
  const all = await listStudentAssignments(identity).catch(() => []);
  const rows = all.filter(r => visibleToStudent(r, account));
  const paperNames = await paperNamesForStudent(identity, sourceRunIds(rows));
  const sections = groupPracticeTodo(rows).filter(s => s.items.length > 0);
  const summary = summaryLine(todoTotals(sections));

  return (
    <div className="space-y-5 pb-24 sm:pb-4">
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <h1 className="text-xl font-bold text-navy">Practice</h1>
        {summary && <p className="text-xs text-gray-500">{summary}</p>}
      </div>

      {sections.length === 0 && (
        <div className={`${CARD} p-5 space-y-2`}>
          <p className="text-sm font-semibold text-navy">Nothing to practise yet.</p>
          <p className="text-sm text-gray-600">
            This is your to-do list. Work Adrian sends you, Practice Again questions from your marked papers,
            and questions you find all land here — and you get them marked line by line.
          </p>
          <p className="text-xs text-gray-400">
            Handed a paper in? Your marked copy and its practice arrive together in <Link href="/app/marking" className="underline">Papers</Link>.
          </p>
        </div>
      )}

      {sections.map(s => (
        <section key={s.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              <span aria-hidden className="mr-1.5">{s.icon}</span>{s.title}
            </p>
            {s.counts.todo > 0 && <span className="text-[11px] text-gray-400">{s.counts.todo} to do</span>}
          </div>
          {s.items.map(r => {
            const due = r.source === 'adrian' || !r.source ? dueLabel(r.due_on) : null;
            const overdue = due ? isOverdue(r) : false;
            const subtitle = todoSubtitle(r, r.source_run_id ? paperNames.get(r.source_run_id) ?? null : null);
            return (
              <Link key={r.id} href={assignmentHref(r)} className={`${CARD} block p-4 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl leading-none mt-0.5" aria-hidden>{r.kind === 'worksheet' ? '📄' : '✏️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy truncate">{r.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                      {subtitle && <span>{subtitle}</span>}
                      <span>{subtitle ? '· ' : ''}{sentOn(r.created_at)}</span>
                      {due && r.state === 'todo' && <span className={overdue ? 'text-amber-700' : ''}>· {due}</span>}
                    </div>
                    {r.note && s.key === 'adrian' && <p className="text-sm text-gray-700 mt-2 italic">“{r.note}”</p>}
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ${CHIP[r.state]}`}>{todoStateLabel(r.state, r)}</span>
                </div>
              </Link>
            );
          })}
        </section>
      ))}

      {sections.length > 0 && (
        <p className="text-[11px] text-gray-400">
          Questions are marked line by line right away. Worksheets come back in <Link href="/app/marking" className="underline">Papers</Link> once marked.
        </p>
      )}
    </div>
  );
}
