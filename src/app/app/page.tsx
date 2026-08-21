// /app — Dashboard. Server component: assembles data directly via
// getDashboardData (same source as /api/portal/dashboard).
import Link from 'next/link';
import { currentStudent } from '@/lib/portal-auth';
import { getDashboardData } from '@/lib/portal-dashboard';
import { getTodayCards } from '@/lib/portal-today';
import { isNotesAuthed } from '@/lib/notes-auth';
import { LEARN_OPEN_TO_STUDENTS } from '@/lib/learn-gate';
import { fullPortalVisible, viewingAsStudent } from '@/lib/portal-beta';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { assignmentHref, dueLabel, homeCardSummary, isPending } from '@/lib/assignments';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

function friendlyDate(dateStr: string): string {
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 8 * 3600_000 + DAY_MS).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export default async function DashboardPage() {
  const { account } = await currentStudent();
  // Marking-only beta (lib/portal-beta.ts): students get a calm dashboard —
  // next lesson, last lesson's topics/homework, and three doors: Practise
  // (its own page since 2026-08-21 — embedding the whole topic→tier→question
  // flow here made Home feel cluttered), Submit a paper, Marked papers. The
  // week-stats and recent-practice cards only render for the full portal
  // (Adrian's admin cookie, unless he is "viewing as student").
  const fullPortal = await fullPortalVisible();
  // Learn units aren't released to students — the "start here" stack (which
  // deep-links into /app/learn) only renders for Adrian's admin cookie.
  const learnVisible = LEARN_OPEN_TO_STUDENTS || ((await isNotesAuthed()) && !(await viewingAsStudent()));
  const [d, todayCards, assignments] = await Promise.all([
    getDashboardData(account),
    learnVisible ? getTodayCards(account).catch(() => []) : Promise.resolve([]),
    // "From Adrian" assigned work (SPEC-ASSIGN.md) — fail-soft, hidden at zero.
    listStudentAssignments(account.airtable_student_id).catch(() => []),
  ]);
  const pendingWork = assignments.filter(a => isPending(a.status));
  const workSummary = homeCardSummary(assignments);

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Hi {d.firstName} 👋</h1>

      {/* From Adrian — assigned work, at the top because it's the one thing
          Adrian specifically asked this student to do. Hidden when nothing is
          pending (done items live on /app/assignments + practice history /
          Marked papers). Up to 3 rows inline, then "see all". */}
      {workSummary && (
        <div className="bg-navy text-[hsl(45,100%,96%)] rounded-2xl shadow-sm overflow-hidden">
          <Link href="/app/assignments" className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 hover:opacity-90">
            <span className="font-semibold">📬 From Mr Fong</span>
            <span className="text-[11px] font-semibold bg-[hsl(43,90%,60%)] text-navy rounded-full px-2 py-0.5">{workSummary}</span>
          </Link>
          <ul className="divide-y divide-white/10">
            {pendingWork.slice(0, 3).map(a => {
              const due = dueLabel(a.due_on);
              return (
                <li key={a.id}>
                  <Link href={assignmentHref(a)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                    <span aria-hidden>{a.kind === 'question' ? '✏️' : '📄'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{a.title}</span>
                      <span className="block text-[11px] opacity-75 truncate">
                        {a.status === 'submitted' ? 'Being marked' : [a.topic, due].filter(Boolean).join(' · ') || 'Tap to start'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[hsl(43,90%,60%)]">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {pendingWork.length > 3 && (
            <Link href="/app/assignments" className="block text-center text-xs py-2 opacity-80 hover:opacity-100 border-t border-white/10">
              See all {pendingWork.length} →
            </Link>
          )}
        </div>
      )}

      {/* Today stack — personalised "start here" learn cards.
          BETA GATE: hidden for students during the marking-only beta. The
          non-learn fallback used to link to the revision-notes reader
          (/notes) — that reader IS built and live, it's just not surfaced in
          the portal yet. When notes graduates out of beta, restore the notes
          entry-point here (and the Browse-notes tile below). */}
      {learnVisible && (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Start here</p>
        {todayCards.length > 0 ? (
          <div className="space-y-2">
            {todayCards.map((c, i) => (
              <Link
                key={`${c.subject}|${c.topic}|${i}`}
                href={`/app/learn?topic=${encodeURIComponent(c.topic)}&subject=${encodeURIComponent(c.subject)}`}
                className="flex items-center gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 shadow-sm hover:opacity-90 transition-opacity"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[hsl(45,100%,96%)] truncate">{c.topic}</span>
                  <span className="mt-1 inline-block text-[11px] font-medium bg-[hsl(43,90%,60%)] text-navy rounded-full px-2 py-0.5">
                    {c.chip}
                  </span>
                </span>
                <span className="shrink-0 text-[hsl(43,90%,60%)] text-lg">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href="/app/learn"
            className="flex items-center justify-between gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-sm hover:opacity-90 transition-opacity"
          >
            <span>▶ Start learning</span>
            <span className="shrink-0 text-[hsl(43,90%,60%)] text-lg">›</span>
          </Link>
        )}
      </div>
      )}

      {/* Next lesson */}
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Next lesson</p>
        {d.nextLesson ? (
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold text-navy">
              {friendlyDate(d.nextLesson.date)}
              <span className="ml-2 font-semibold text-gray-600 text-base">{d.nextLesson.slotLabel}</span>
            </p>
            {d.nextLesson.type !== 'Regular' && (
              <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5 font-medium">{d.nextLesson.type}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No upcoming lesson scheduled.</p>
        )}
      </div>

      {/* Week stats — the "lessons done / coming up" pills were dropped on
          Adrian's request (2026-08-21); only the practice count remains, and
          only on the full portal. */}
      {fullPortal && (
        <div className={`${card} flex items-baseline gap-2`}>
          <p className="text-2xl font-bold text-navy">{d.attemptsThisWeek}</p>
          <p className="text-xs text-gray-500">questions practised this week</p>
        </div>
      )}

      {/* Last lesson topics + homework */}
      {(d.lastTopics.length > 0 || d.homeworkAssigned) && (
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Last lesson</p>
          {d.lastTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {d.lastTopics.map(t => (
                <span key={t} className="text-xs bg-[hsl(45,80%,94%)] text-navy rounded-full px-2.5 py-1">{t}</span>
              ))}
            </div>
          )}
          {d.homeworkAssigned && (
            <p className="text-sm text-gray-700"><span className="font-semibold text-navy">Homework:</span> {d.homeworkAssigned}</p>
          )}
        </div>
      )}

      {/* Quick actions */}
      {fullPortal ? (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/app/practice" className="bg-navy text-[hsl(45,100%,96%)] rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:opacity-90 transition-opacity">
            ✏️ Practise a question
          </Link>
          {learnVisible ? (
            <Link href="/app/notes" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 transition-colors">
              📚 Revision Notes
            </Link>
          ) : (
            <Link href="/app/submit" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 transition-colors">
              📄 Submit a paper
            </Link>
          )}
        </div>
      ) : (
        /* Marking-only beta: the three things a student can do here. */
        <div className="space-y-3">
          <Link href="/app/practice"
            className="block bg-navy text-[hsl(45,100%,96%)] rounded-2xl p-5 shadow-sm hover:opacity-90 transition-opacity">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-base">✏️ Practise a topic</div>
                <div className="text-xs opacity-80 mt-1">Pick a topic · Standard or Advanced · get your working marked line by line</div>
              </div>
              <span className="text-xl opacity-80" aria-hidden>→</span>
            </div>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/app/submit" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 transition-colors">
              📷 Submit a paper
            </Link>
            <Link href="/app/marking" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 transition-colors">
              📄 My marked papers
            </Link>
          </div>
        </div>
      )}

      {/* Recent activity — full portal only */}
      {fullPortal && (
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent practice</p>
        {d.recentAttempts.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing yet — hit <span className="font-semibold text-navy">Practise a question</span> to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {d.recentAttempts.map((a, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {a.verdict === 'correct' ? '✅' : a.verdict === 'wrong' ? '❌' : a.verdict === 'partial' ? '🟡' : '📝'}{' '}
                  Practice question <span className="text-gray-400">via {a.via}</span>
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(a.attemptedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
