// The colour-coded AM / EM / H2 pill on a student's paper card (SPEC-PORTAL-V2
// §1, Adrian: "a colour coded EM and AM pill"). "Other" and untagged papers get
// no pill — the text/tone come from lib/portal-subjects.subjectPill, so the
// student page, the tabs and the desk can never disagree on the letters.
//
// Server-safe (no hooks); Tailwind classes are literal so the JIT sees them.
import { subjectPill, type SubjectTone } from '@/lib/portal-subjects';

/** Soft (inactive / card) and solid (active tab) treatments per subject tone.
 *  The sciences (10 Sep 2026): physics orange, chemistry purple, biology green —
 *  the same three the bot's analytics chips use, so a colour means one subject
 *  everywhere. */
export const SUBJECT_TONE: Record<Exclude<SubjectTone, 'other'>, { soft: string; solid: string }> = {
  am: { soft: 'bg-indigo-100 text-indigo-800', solid: 'bg-indigo-600 text-white' },
  em: { soft: 'bg-sky-100 text-sky-800', solid: 'bg-sky-600 text-white' },
  h2: { soft: 'bg-fuchsia-100 text-fuchsia-800', solid: 'bg-fuchsia-600 text-white' },
  phy: { soft: 'bg-orange-100 text-orange-800', solid: 'bg-orange-600 text-white' },
  chem: { soft: 'bg-purple-100 text-purple-800', solid: 'bg-purple-600 text-white' },
  bio: { soft: 'bg-green-100 text-green-800', solid: 'bg-green-600 text-white' },
};

export default function PaperSubjectPill({ subject, className = '' }: { subject: string | null | undefined; className?: string }) {
  const pill = subjectPill(subject);
  if (!pill || pill.tone === 'other') return null;
  return (
    <span
      title={`${subject} paper`}
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 tracking-wide ${SUBJECT_TONE[pill.tone].soft} ${className}`}
    >
      {pill.text}
    </span>
  );
}
