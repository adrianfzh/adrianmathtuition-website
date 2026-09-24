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
 *  mockups"). Score chips and the red pen keep their own colours. The "Where your
 *  marks went" cover wears the same tone as a band + tag (25 Sep 2026) — its hexes
 *  are in lib/front-page-html.ts coverSubject; change a colour in both. */
export const SUBJECT_TONE: Record<Exclude<SubjectTone, 'other'>, { soft: string; solid: string; strip: string; tint: string }> = {
  // The maths (25 Sep 2026, Adrian: E Math sky and Physics blue "look almost the
  // same"; "navy blue for Amath"; teal "looks similar to green"): A Math is navy —
  // Tailwind blue-900, not the app's own navy, so a card's edge never reads as
  // chrome — as a wash of itself rather than blue-100, which is Physics's; E Math
  // is amber, the one warm colour that sits beside neither the sciences nor the
  // red pen. H2 has no row: a JC paper is plain (portal-subjects subjectPill).
  am: { soft: 'bg-blue-900/10 text-blue-900', solid: 'bg-blue-900 text-white', strip: 'bg-blue-900', tint: 'bg-blue-900/[0.06] border-blue-900/20' },
  em: { soft: 'bg-amber-100 text-amber-800', solid: 'bg-amber-700 text-white', strip: 'bg-amber-500', tint: 'bg-amber-50/60 border-amber-200/70' },
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

/** The plain pill for a subject with no tone (H2 since 25 Sep 2026); "Other" itself shows nothing. */
const PLAIN_PILL = 'bg-gray-100 text-gray-600';

export default function PaperSubjectPill({ subject, className = '' }: { subject: string | null | undefined; className?: string }) {
  const pill = subjectPill(subject);
  if (!pill || pill.text === 'Other') return null;
  return (
    <span
      title={`${subject} paper`}
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 tracking-wide ${pill.tone === 'other' ? PLAIN_PILL : SUBJECT_TONE[pill.tone].soft} ${className}`}
    >
      {pill.text}
    </span>
  );
}
