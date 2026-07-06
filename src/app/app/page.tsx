// /app — Dashboard. Server component: assembles data directly via
// getDashboardData (same source as /api/portal/dashboard).
import Link from 'next/link';
import { currentStudent } from '@/lib/portal-auth';
import { getDashboardData } from '@/lib/portal-dashboard';

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
  const d = await getDashboardData(account);

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Hi {d.firstName} 👋</h1>

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

      {/* Week stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${card} text-center`}>
          <p className="text-2xl font-bold text-navy">{d.attemptsThisWeek}</p>
          <p className="text-xs text-gray-500 mt-0.5">questions practised this week</p>
        </div>
        <div className={`${card} text-center`}>
          <p className="text-2xl font-bold text-navy">{d.weekLessons.completed}</p>
          <p className="text-xs text-gray-500 mt-0.5">lessons done this week</p>
        </div>
        <div className={`${card} text-center`}>
          <p className="text-2xl font-bold text-navy">{d.weekLessons.upcoming}</p>
          <p className="text-xs text-gray-500 mt-0.5">lessons coming up</p>
        </div>
      </div>

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
      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/practice" className="bg-navy text-[hsl(45,100%,96%)] rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:opacity-90 transition-opacity">
          ✏️ Practise a question
        </Link>
        <Link href="/app/notes" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 transition-colors">
          📚 Browse notes
        </Link>
      </div>

      {/* Recent activity */}
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
    </div>
  );
}
