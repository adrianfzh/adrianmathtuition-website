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
  // Set 2 (25 Sep 2026, Adrian picked it from three sets after "for orange, why
  // not the same colour here?" and "should be coherent with the overall app"):
  // one colour per subject, and the card's edge (strip) and the tag (solid) are
  // that SAME colour — A Math royal blue (blue-700), E Math orange (orange-400,
  // dark text on the tag: white fails contrast on it), Physics cyan, Chemistry
  // purple-500, Biology green-600. Beside the app's own slate / amber notice /
  // emerald done / rose lost marks none of the five is a state colour. H2 has no
  // row: a JC paper is plain (portal-subjects subjectPill).
  am: { soft: 'bg-blue-700/10 text-blue-800', solid: 'bg-blue-700 text-white', strip: 'bg-blue-700', tint: 'bg-blue-700/[0.06] border-blue-700/20' },
  em: { soft: 'bg-orange-100 text-orange-800', solid: 'bg-orange-400 text-orange-950', strip: 'bg-orange-400', tint: 'bg-orange-50/70 border-orange-200/70' },
  phy: { soft: 'bg-cyan-100 text-cyan-800', solid: 'bg-cyan-600 text-white', strip: 'bg-cyan-600', tint: 'bg-cyan-50/70 border-cyan-200/70' },
  chem: { soft: 'bg-purple-100 text-purple-800', solid: 'bg-purple-500 text-white', strip: 'bg-purple-500', tint: 'bg-purple-50/60 border-purple-200/70' },
  bio: { soft: 'bg-green-100 text-green-800', solid: 'bg-green-600 text-white', strip: 'bg-green-600', tint: 'bg-green-50/60 border-green-200/70' },
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
