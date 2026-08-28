// /app — Dashboard. Server component: assembles data directly via
// getDashboardData (same source as /api/portal/dashboard).
import { Suspense, cache } from 'react';
import Link from 'next/link';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getCurrentPass, isTuitionAccount, passEndingNudge } from '@/lib/portal-passes';
import { getDashboardData } from '@/lib/portal-dashboard';
import { getTodayCards } from '@/lib/portal-today';
import { isNotesAuthed } from '@/lib/notes-auth';
import { LEARN_OPEN_TO_STUDENTS } from '@/lib/learn-gate';
import { NOTES_OPEN_TO_STUDENTS, fullPortalVisible, viewingAsStudent } from '@/lib/portal-beta';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { assignmentHref, dueLabel, homeCardSummary, isPending } from '@/lib/assignments';
import { homeCounts } from '@/lib/portal-home-counts';
import { createServiceClient } from '@/lib/supabase-server';
import { loadPapersAndNotebook } from '@/lib/notebook-data';
import { buildPlan } from '@/lib/plan';
import { sgtToday } from '@/lib/notebook';
import { activeAnnouncement } from '@/lib/portal-announcement';
import PortalAnnouncementCard from '@/components/PortalAnnouncementCard';
import { SURFACES } from '@/lib/portal-theme';
import PortalIcon from '@/components/PortalIcon';

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
  // currentAccount, not currentStudent — this page never reads the Airtable
  // record, so it skips that serial round-trip (getDashboardData re-fetches
  // the student fields it needs inside its own parallel batch below).
  const account = await currentAccount();
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
  // rec… for tuition, acct:<uuid> for strangers — the key every portal-owned
  // Supabase table uses (lib/portal-auth.portalIdentity).
  const sid = portalIdentity(account);
  // The Airtable-backed lesson data (getDashboardData) is deliberately NOT
  // awaited here — it's the slowest fetch on the page (~0.5–1.5s cold), so it
  // streams in via the two <Suspense> islands below and the shell paints
  // immediately after login (Adrian, 2026-08-28: "still taking a bit of time
  // to load initially"). Everything awaited here is fast Supabase.
  const [todayCards, assignments, counts, focus, passNudge] = await Promise.all([
    learnVisible ? getTodayCards(account).catch(() => []) : Promise.resolve([]),
    // "From Adrian" assigned work (SPEC-ASSIGN.md) — fail-soft, hidden at zero.
    listStudentAssignments(sid).catch(() => []),
    // Live numbers on the Hand in / Marked tiles — fail-soft zeros.
    homeCounts(sid),
    // This week's focus (Adrian, 2026-08-28): the Plan TAB is gone — real
    // suggestions surface HERE, and only when they exist. Fail-soft.
    (async () => {
      try {
        const res = await loadPapersAndNotebook(createServiceClient(), sid, sgtToday());
        if (!res.ok) return [];
        return buildPlan(res.papers, res.entries.map(e => ({
          topic: e.topic, attempts: e.attempts,
          questionNumber: e.question_number, paperName: e.paper_name,
        }))).focus;
      } catch { return []; }
    })(),
    // ⏳ pass-ending nudge (HOME ONLY): a pass-riding account whose current
    // pass ends today/tomorrow gets one slim amber line to /app/pass. Tuition
    // accounts short-circuit on the pure isTuitionAccount check — zero DB
    // cost for them (this also nudges an offboarded ex-student on a paid
    // pass, who since the offboarding build rides passes like a stranger).
    // Fail-soft: a portal_passes hiccup never breaks Home.
    isTuitionAccount(account)
      ? Promise.resolve(null)
      : getCurrentPass(account.id).then(p => passEndingNudge(p, new Date())).catch(() => null),
  ]);
  const pendingWork = assignments.filter(a => isPending(a.status));
  const workSummary = homeCardSummary(assignments);
  const announcement = activeAnnouncement();

  // Home visual language (2026-08-22, lib/portal-theme.ts): soft elevated
  // cards, no hairline borders, and every destination wearing its own colour
  // — the same colour it has in the tab bar — so a student learns "amber =
  // practise, teal = hand in, violet = marked" without reading.
  const card = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5';
  const caption = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
  const P = SURFACES.practice, S = SURFACES.submit, M = SURFACES.marking, A = SURFACES.assignments, L = SURFACES.lesson, PL = SURFACES.plan, N = SURFACES.notes;

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-2xl font-bold text-navy pt-1 tracking-tight">Hi {(account.display_name || 'there').split(' ')[0]} 👋</h1>

      {/* ⏳ Trial/pass-ending nudge — HOME ONLY, strangers riding a pass that
          ends today/tomorrow (lib/portal-passes.passEndingNudge). One slim
          amber line, straight to the renew screen. */}
      {passNudge && (
        <Link
          href="/app/pass"
          className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100 active:scale-[0.99] transition"
        >
          <span aria-hidden className="shrink-0">⏳</span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold">Your {passNudge.kind} ends {passNudge.when}</span>
            {' '}— keep access: S$29 for 30 days
          </span>
          <span className="shrink-0 font-semibold text-amber-700">›</span>
        </Link>
      )}

      {/* Release announcement — HOME ONLY (Adrian, 2026-08-28: not on every
          tab). One card, dismissible, auto-expires via `until`. */}
      {announcement && (fullPortal || !announcement.fullPortalOnly) && (
        <PortalAnnouncementCard announcement={announcement} />
      )}

      {/* From Adrian — assigned work, at the top because it's the one thing
          Adrian specifically asked this student to do. Hidden when nothing is
          pending (done items live on /app/assignments + practice history /
          Marked papers). Up to 3 rows inline, then "see all". */}
      {workSummary && (
        <div className="bg-navy text-[hsl(45,100%,96%)] rounded-3xl shadow-[0_8px_24px_-8px_rgba(15,23,42,0.5)] overflow-hidden">
          <Link href="/app/assignments" className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 hover:opacity-90 active:opacity-75 transition-opacity">
            <span className="flex items-center gap-2.5 font-semibold">
              <span className={`flex items-center justify-center w-8 h-8 rounded-xl bg-white/10 ${A.tile.split(' ')[1]}`}><PortalIcon name={A.icon} className="w-4.5 h-4.5" /></span>
              From Adrian
            </span>
            <span className="text-[11px] font-bold bg-[hsl(43,90%,60%)] text-navy rounded-full px-2.5 py-1">{workSummary}</span>
          </Link>
          <ul className="divide-y divide-white/10">
            {pendingWork.slice(0, 3).map(a => {
              const due = dueLabel(a.due_on);
              return (
                <li key={a.id}>
                  <Link href={assignmentHref(a)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10">
                    <PortalIcon name={a.kind === 'question' ? 'pencil' : 'file-check'} className="w-4 h-4 opacity-80 shrink-0" />
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
                className="flex items-center gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 shadow-sm hover:opacity-90 active:scale-[0.99] transition"
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
            className="flex items-center justify-between gap-3 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-sm hover:opacity-90 active:scale-[0.99] transition"
          >
            <span>▶ Start learning</span>
            <span className="shrink-0 text-[hsl(43,90%,60%)] text-lg">›</span>
          </Link>
        )}
      </div>
      )}

      {/* Quick links — the surfaces that lost their phone tab slot in the
          six-tab squeeze (reading Notes, Requests) still need a thumb-reachable
          door; on desktop the nav also has them, harmless duplication. */}
      <div className="flex gap-2">
        <Link href="/app/notes" className={`${card} !py-3 flex-1 text-center text-sm font-semibold text-navy active:scale-95 transition-transform select-none`}>
          📖 Notes
        </Link>
        <Link href="/app/requests" className={`${card} !py-3 flex-1 text-center text-sm font-semibold text-navy active:scale-95 transition-transform select-none`}>
          🙋 Request materials
        </Link>
      </div>

      <Suspense fallback={<div className={`${card} !py-3.5 h-[68px] animate-pulse`} />}>
        <NextLessonAndStats account={account} fullPortal={fullPortal} card={card} caption={caption} />
      </Suspense>

      {/* Quick actions */}
      {fullPortal ? (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/app/practice" className="bg-navy text-[hsl(45,100%,96%)] rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:opacity-90 active:scale-[0.98] transition">
            ✏️ Practise a question
          </Link>
          {learnVisible ? (
            <Link href="/app/notes" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 active:scale-[0.98] transition">
              📚 Revision Notes
            </Link>
          ) : (
            <Link href="/app/submit" className="bg-white text-navy border border-navy/20 rounded-2xl p-4 text-center font-semibold text-sm shadow-sm hover:bg-navy/5 active:scale-[0.98] transition">
              📄 Submit a paper
            </Link>
          )}
        </div>
      ) : (
        /* Marking-only beta — the three doors, as a bento: Practise is the
           hero (solid amber, tall), Hand in and Marked stack beside it as
           white tiles with their own coloured icon squares and a live number
           each. Distinct shape + colour per door = the heuristic. */
        <div className="grid grid-cols-2 gap-3 auto-rows-fr">
          <Link href="/app/practice"
            className={`row-span-2 ${P.tile} rounded-3xl p-4 flex flex-col justify-between shadow-[0_8px_24px_-10px_rgba(245,158,11,0.8)] hover:brightness-105 active:scale-[0.99] transition`}>
            <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white/35"><PortalIcon name={P.icon} className="w-6 h-6" /></span>
            <span className="mt-6">
              <span className="block font-bold text-lg leading-tight">Practise</span>
              <span className="block text-[12px] leading-snug opacity-80 mt-1">One question at a time, marked on the spot</span>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold">Start <PortalIcon name="chevron-right" className="w-3.5 h-3.5" /></span>
            </span>
          </Link>
          <Link href="/app/submit"
            className={`${card} !p-4 flex items-center gap-3 hover:shadow-md active:scale-[0.99] transition`}>
            <span className={`flex items-center justify-center w-11 h-11 rounded-2xl shrink-0 ${S.tile}`}><PortalIcon name={S.icon} className="w-5.5 h-5.5" /></span>
            <span className="min-w-0">
              <span className="block font-bold text-navy text-sm leading-tight">Hand in a paper</span>
              <span className={`block text-[11px] mt-0.5 ${counts.beingMarked > 0 ? `${S.text} font-semibold` : 'text-slate-500'}`}>
                {counts.beingMarked > 0 ? `${counts.beingMarked} being marked` : 'Photograph the pages'}
              </span>
            </span>
          </Link>
          <Link href="/app/marking"
            className={`${card} !p-4 flex items-center gap-3 hover:shadow-md active:scale-[0.99] transition`}>
            <span className={`flex items-center justify-center w-11 h-11 rounded-2xl shrink-0 ${M.tile}`}><PortalIcon name={M.icon} className="w-5.5 h-5.5" /></span>
            <span className="min-w-0">
              <span className="block font-bold text-navy text-sm leading-tight">Marked papers</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {counts.marked > 0 ? `${counts.marked} paper${counts.marked === 1 ? '' : 's'} marked` : 'Nothing back yet'}
              </span>
            </span>
          </Link>
        </div>
      )}

      {/* This week's focus — renders ONLY when the plan derived real
          suggestions from this student's marked papers + notebook (Adrian,
          2026-08-28: no standing Plan tab; suggestions earn their place on
          Home or appear nowhere). The detail lives in My Notebook
          (/app/my-notes — /app/plan redirects there since 2026-08-28). */}
      {focus.length > 0 && (
        <div className={`${card} !p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${PL.tile}`}><PortalIcon name={PL.icon} className="w-4 h-4" /></span>
            <span className="font-bold text-navy text-sm">This week&apos;s focus</span>
            <Link href="/app/my-notes" className={`ml-auto text-[11px] font-semibold ${PL.text} hover:underline`}>My Notebook ›</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {focus.map(f => (
              <Link key={f.topic} href={`/app/practice?topic=${encodeURIComponent(f.topic)}`}
                className="text-sm bg-rose-50 text-rose-800 rounded-full px-3 py-1 hover:bg-rose-100 transition-colors">
                {f.topic} <span className="text-rose-500">›</span>
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Where your marked papers say the marks are going — tap one to practise it.</p>
        </div>
      )}

      {/* Revision Notes — re-opened to beta students 2026-08-27
          (NOTES_OPEN_TO_STUDENTS carve-out in lib/portal-beta.ts). The full
          portal already surfaces notes in its quick-actions grid above. */}
      {!fullPortal && NOTES_OPEN_TO_STUDENTS && (
        <Link href="/app/notes" className={`${card} !p-4 flex items-center gap-3 hover:shadow-md active:scale-[0.99] transition`}>
          <span className={`flex items-center justify-center w-11 h-11 rounded-2xl shrink-0 ${N.tile}`}><PortalIcon name={N.icon} className="w-5.5 h-5.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-navy text-sm leading-tight">Revision Notes</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">Read the notes first, then practise the topic</span>
          </span>
          <span className={`shrink-0 ${N.text}`}>›</span>
        </Link>
      )}

      <Suspense fallback={null}>
        <LessonRecap account={account} fullPortal={fullPortal} card={card} caption={caption} />
      </Suspense>
    </div>
  );
}


// ── Streaming islands ────────────────────────────────────────────────────────
// Both await the SAME per-request-deduped fetch (React cache() below — the
// module's own 60s Map cache doesn't dedupe two CONCURRENT misses), so the
// two islands cost one Airtable round trip between them — off the shell's
// critical path.
const dashboardOnce = cache(getDashboardData);

async function NextLessonAndStats({ account, fullPortal, card, caption }: {
  account: Awaited<ReturnType<typeof currentAccount>>; fullPortal: boolean; card: string; caption: string;
}) {
  const d = await dashboardOnce(account);
  const L = SURFACES.lesson;
  return (
    <>
      {/* Next lesson — information, not an action, so a slim row rather than
          a card that competes with the tiles below. */}
      <div className={`${card} !py-3.5 flex items-center gap-3`}>
        <span className={`flex items-center justify-center w-10 h-10 rounded-2xl shrink-0 ${L.tile}`}><PortalIcon name={L.icon} className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <p className={caption}>Next lesson</p>
          {d.nextLesson ? (
            <p className="text-base font-bold text-navy truncate">
              {friendlyDate(d.nextLesson.date)}
              <span className="ml-2 font-medium text-slate-500 text-sm">{d.nextLesson.slotLabel}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Nothing scheduled yet</p>
          )}
        </div>
        {d.nextLesson && d.nextLesson.type !== 'Regular' && (
          <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-semibold shrink-0">{d.nextLesson.type}</span>
        )}
        {d.nextLesson && (
          <Link href="/app/reschedule" className="shrink-0 text-xs font-semibold text-slate-500 hover:text-navy border border-black/10 rounded-full px-3 py-1.5">
            Change
          </Link>
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
    </>
  );
}

async function LessonRecap({ account, fullPortal, card, caption }: {
  account: Awaited<ReturnType<typeof currentAccount>>; fullPortal: boolean; card: string; caption: string;
}) {
  const d = await dashboardOnce(account);
  return (
    <>
      {/* Last lesson topics + homework */}
      {(d.lastTopics.length > 0 || d.homeworkAssigned) && (
        <div className={card}>
          <p className={`${caption} mb-2`}>Last lesson</p>
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
    </>
  );
}
