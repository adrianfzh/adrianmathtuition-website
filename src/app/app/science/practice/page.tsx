// 🧪 /app/science/practice — the Science family's Practise tab (Adrian, 1 Oct 2026:
// "option 2, but there is no need to show the number of questions").
//
// One tab per science the student takes (their own choice from the Science tab's
// first-visit picker; Adrian's cookie sees all three), an MCQ | Structured switch on
// top, then the plain topic list, no counts ("Practise what you lost" was pulled the
// same day — too complicated for now; lib/science-practice lostTopics keeps the rule). A topic opens the existing practice page
// (/app/practice?level=PHY&topic=…&mode=mcq): an MCQ is marked by comparing the
// letter, no model, no cap. Structured stays behind Adrian's cookie until the
// practice grader has been checked against science scheme answers
// (lib/portal-beta scienceStructuredPracticeOpen). Rules: lib/science-practice.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { scienceMarkingOpen, sciencePracticeAccess, scienceStructuredPracticeOpen, viewingAsStudent } from '@/lib/portal-beta';
import { sessionAccount } from '@/lib/portal-auth';
import { SCIENCE_SUBJECTS, SCIENCE_SUBJECT_LABEL, studentSciences, type ScienceSubject } from '@/lib/portal-prefs';
import { scienceLevelForSubject } from '@/lib/science-levels';
import { scienceConfigured, scienceServedTopicCounts } from '@/lib/science-bank';
import { parsePracticeKind, sciencePracticeHref, skillsFor, topicsForKind, type PracticeKind } from '@/lib/science-practice';
import { SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS } from '@/lib/portal-beta';
import { mergedOpenTopics } from '@/lib/science-practice';
import PortalIcon from '@/components/PortalIcon';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const pill = (on: boolean) => `text-xs font-semibold rounded-full px-3 py-1.5 border transition ${on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-black/10 hover:border-black/30'}`;

export default async function SciencePracticePage({ searchParams }: { searchParams: Promise<{ s?: string; mode?: string }> }) {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const sp = await searchParams;
  const jar = await cookies();
  const isAdmin = !(await viewingAsStudent()) && verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value ?? '');
  const access = await sciencePracticeAccess();
  if (access === 'closed') redirect('/app/science');
  const account = await sessionAccount();
  if (!account && !isAdmin) redirect('/login');

  // Which sciences: the student's own choice; Adrian sees all three.
  const choice = studentSciences(account?.prefs);
  const subjects: ScienceSubject[] = isAdmin ? [...SCIENCE_SUBJECTS] : (choice?.subjects ?? []);
  if (subjects.length === 0) redirect('/app/science?choose=1');
  const subject: ScienceSubject = subjects.find(s => s === sp.s) ?? subjects[0];
  const structuredOpen = await scienceStructuredPracticeOpen();
  const kind: PracticeKind = structuredOpen ? parsePracticeKind(sp.mode) : 'mcq';
  const lvl = scienceLevelForSubject(subject);
  const levelKey = lvl?.key ?? 'PHY';

  // The bank's topics for this science, and the student's live mistakes in it.
  // The pool (5 Oct 2026): a Combined Science student practises the Combined Science bank,
  // a pure-science student the pure one; students see only rows that passed the check.
  const preview = access === 'preview';
  const combined = !!choice?.combined && !isAdmin;
  const serve = { open: preview ? null : mergedOpenTopics(SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS), combined, checkedOnly: !preview };
  const counts = scienceConfigured() ? await scienceServedTopicCounts(levelKey, serve).catch(() => []) : [];
  // Topic by topic (5 Oct 2026): a student sees only the open topics; Adrian's cookie sees all.
  const topics = topicsForKind(counts, kind);
  const href = (s: ScienceSubject, k: PracticeKind) => `/app/science/practice?s=${s}${k === 'structured' ? '&mode=structured' : ''}`;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 bg-amber-500 text-white"><PortalIcon name="pencil" className="w-5 h-5" /></span>
        <h1 className="text-xl font-bold text-navy">Practice</h1>
      </div>

      {subjects.length > 1 && (
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Which science?">
          {subjects.map(s => <Link key={s} href={href(s, kind)} role="tab" aria-selected={s === subject} className={pill(s === subject)}>{SCIENCE_SUBJECT_LABEL[s]}</Link>)}
        </div>
      )}

      {structuredOpen && (
        <div className="inline-flex rounded-xl border border-black/10 overflow-hidden text-xs font-semibold" role="radiogroup" aria-label="MCQ or structured?">
          <Link href={href(subject, 'mcq')} role="radio" aria-checked={kind === 'mcq'} className={`px-4 py-2 ${kind === 'mcq' ? 'bg-navy text-white' : 'bg-white text-gray-600'}`}>MCQ</Link>
          <Link href={href(subject, 'structured')} role="radio" aria-checked={kind === 'structured'} className={`px-4 py-2 ${kind === 'structured' ? 'bg-navy text-white' : 'bg-white text-gray-600'}`}>Structured</Link>
        </div>
      )}
      {!structuredOpen && <p className="text-xs text-gray-500">Multiple-choice questions, marked the moment you answer.</p>}

      {/* "Practise what you lost" (the topics of the student's live science mistakes) was
          here on 1 Oct 2026 and came out the same day — Adrian: "too complicated for now (we can
          add it later)". lib/science-practice lostTopics keeps the rule; render it here to bring it back. */}

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Topics</p>
        {topics.length === 0 && (combined
          // Combined Science has its own switch (5 Oct 2026): until its questions pass the check, say so plainly.
          ? <div className={`${CARD} p-4 text-sm text-gray-600`}>Practice for Combined Science is coming soon. We are checking the questions first.</div>
          : <div className={`${CARD} p-4 text-sm text-gray-600`}>No {kind === 'mcq' ? 'multiple-choice' : 'structured'} questions for {SCIENCE_SUBJECT_LABEL[subject]} yet.</div>)}
        {topics.map(t => {
          const skills = skillsFor(levelKey, t, kind);
          // A topic with skills opens in place: pick one skill, or all of them mixed.
          if (skills.length > 0) return (
            <details key={t} className={`${CARD} group`}>
              <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy">{t}</span>
                  <span className="block text-xs text-gray-500">Choose one skill, or mix them</span>
                </span>
                <span aria-hidden className="text-gray-300 transition group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-black/5 divide-y divide-black/5">
                {skills.map((s, i) => (
                  <Link key={s.slug} href={sciencePracticeHref(levelKey, t, kind, s.slug)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(45,100%,99%)]">
                    <span aria-hidden className="w-5 text-xs font-semibold text-gray-400 tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-sm text-navy">{s.label}</span>
                    <span aria-hidden className="text-gray-300">›</span>
                  </Link>
                ))}
                <Link href={sciencePracticeHref(levelKey, t, kind)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(45,100%,99%)]">
                  <span aria-hidden className="w-5" />
                  <span className="flex-1 text-sm font-semibold text-navy">All skills, mixed</span>
                  <span aria-hidden className="text-gray-300">›</span>
                </Link>
              </div>
            </details>
          );
          return (
            <Link key={t} href={sciencePracticeHref(levelKey, t, kind)} className={`${CARD} flex items-center justify-between gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] active:scale-[0.99] transition`}>
              <span className="text-sm font-semibold text-navy">{t}</span>
              <span aria-hidden className="text-gray-300">›</span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
