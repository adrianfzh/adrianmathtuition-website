// The colour-coded AM / EM / H2 pill on a student's paper card (SPEC-PORTAL-V2
// §1, Adrian: "a colour coded EM and AM pill"). "Other" and untagged papers get
// no pill — the text/tone come from lib/portal-subjects.subjectPill, so the
// student page, the tabs and the desk can never disagree on the letters.
//
// Server-safe (no hooks); Tailwind classes are literal so the JIT sees them.
import { subjectPill, type SubjectTone } from '@/lib/portal-subjects';

/** Soft (inactive / card) and solid (active tab) treatments per subject tone.
 *  The sciences (10 Sep 2026): physics blue, chemistry purple, biology green —
 *  the three the Bot Analytics chips use (physics was orange until 24 Sep 2026 —
 *  Adrian: it shouted beside the orange Science tile), so a colour means one subject
 *  everywhere. */
/** `strip` = the coloured edge on a paper card / the band on the paper page's
 *  header, `tint` = that header's wash (24 Sep 2026, Adrian: "per subject colour
 *  mockups"). Score chips and the red pen keep their own colours. */
export const SUBJECT_TONE: Record<Exclude<SubjectTone, 'other'>, { soft: string; solid: string; strip: string; tint: string }> = {
  am: { soft: 'bg-indigo-100 text-indigo-800', solid: 'bg-indigo-600 text-white', strip: 'bg-indigo-500', tint: 'bg-indigo-50/60 border-indigo-200/70' },
  em: { soft: 'bg-sky-100 text-sky-800', solid: 'bg-sky-600 text-white', strip: 'bg-sky-500', tint: 'bg-sky-50/60 border-sky-200/70' },
  h2: { soft: 'bg-fuchsia-100 text-fuchsia-800', solid: 'bg-fuchsia-600 text-white', strip: 'bg-fuchsia-500', tint: 'bg-fuchsia-50/60 border-fuchsia-200/70' },
  phy: { soft: 'bg-blue-100 text-blue-800', solid: 'bg-blue-600 text-white', strip: 'bg-blue-500', tint: 'bg-blue-50/60 border-blue-200/70' },
  chem: { soft: 'bg-purple-100 text-purple-800', solid: 'bg-purple-600 text-white', strip: 'bg-purple-500', tint: 'bg-purple-50/60 border-purple-200/70' },
  bio: { soft: 'bg-green-100 text-green-800', solid: 'bg-green-600 text-white', strip: 'bg-green-500', tint: 'bg-green-50/60 border-green-200/70' },
};

/** The tone record for a paper's subject, or null for Other / untagged. */
export function subjectTone(subject: string | null | undefined) {
  const pill = subjectPill(subject);
  return pill && pill.tone !== 'other' ? SUBJECT_TONE[pill.tone] : null;
}

/** The coloured edge down a paper card's left side; nothing for Other. */
export function SubjectEdge({ subject }: { subject: string | null | undefined }) {
  const tone = subjectTone(subject);
  return tone ? <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.strip}`} /> : null;
}

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
