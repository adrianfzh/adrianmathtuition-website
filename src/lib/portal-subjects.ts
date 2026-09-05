// The subject gate (SPEC-PORTAL-V2.md §2, Adrian 6 Sep 2026): a student sees only the
// subjects on their account. E Math only → E Math. Both → both. JC → H2 Math.
//
// `portal_accounts.subjects` is the Airtable Students "Subjects" multi-select copied at
// activation ("E Math", "A Math", "IP Math", "Math"); `level` is the Airtable level
// ("Sec 4", "JC1", …). Pure — every student read filters through these.

export const PAPER_SUBJECTS = ['A Math', 'E Math', 'H2 Math'] as const;
export type PaperSubject = (typeof PAPER_SUBJECTS)[number];

export type SubjectAccount = { subjects?: readonly string[] | null; level?: string | null; airtable_student_id?: string | null };

const isJc = (level: unknown) => /(jc|j[12]|h2)/i.test(String(level ?? ''));

function fromToken(raw: string): PaperSubject[] {
  const t = raw.trim().toLowerCase();
  if (!t) return [];
  if (/^(a[ -]?math|am|additional)/.test(t)) return ['A Math'];
  if (/^(e[ -]?math|em|elementary)/.test(t)) return ['E Math'];
  if (/^(h2|jc|a[ -]?level)/.test(t)) return ['H2 Math'];
  // "IP Math" and plain "Math" cover the whole O-Level family.
  if (/^(ip[ -]?math|math(s|ematics)?)$/.test(t)) return ['E Math', 'A Math'];
  return [];
}

/**
 * The subjects an account may see, in display order. A JC account is H2 whatever
 * the tokens say. An account with no subjects listed (a stranger, or an old
 * activation) sees the whole family for its level — today's behaviour, nothing
 * hidden by accident.
 */
export function allowedSubjects(account: SubjectAccount | null | undefined): PaperSubject[] {
  if (!account) return [...PAPER_SUBJECTS];
  if (isJc(account.level)) return ['H2 Math'];
  const set = new Set<PaperSubject>();
  for (const s of account.subjects ?? []) for (const x of fromToken(String(s))) set.add(x);
  if (!set.size) return ['E Math', 'A Math'];
  return PAPER_SUBJECTS.filter(s => set.has(s));
}

/** Does this account see papers/questions of `subject`? "Other" is shown to everyone
 *  (it counts in no tile). */
export function subjectAllowed(account: SubjectAccount | null | undefined, subject: string | null | undefined): boolean {
  if (!subject || subject === 'Other') return true;
  return (allowedSubjects(account) as string[]).includes(subject);
}

/** Short pill text + colour class per subject (Adrian: "a colour coded EM and AM pill"). */
export function subjectPill(subject: string | null | undefined): { text: string; tone: 'am' | 'em' | 'h2' | 'other' } | null {
  switch (subject) {
    case 'A Math': return { text: 'AM', tone: 'am' };
    case 'E Math': return { text: 'EM', tone: 'em' };
    case 'H2 Math': return { text: 'H2', tone: 'h2' };
    case 'Other': return { text: 'Other', tone: 'other' };
    default: return null;
  }
}

/** The paper-name half of the bot's rule (lib/paper-subject.js), for the hand-in form's
 *  preselect and for stamping a run the site creates before the bot marks it. */
export function paperSubjectFromName(name: string | null | undefined): PaperSubject | null {
  const s = String(name ?? '');
  if (/(^|[^a-z])(am|a[ -]?math|amath|add(itional)?[ -]?math(s|ematics)?)([^a-z]|$)/i.test(s)) return 'A Math';
  if (/(^|[^a-z])(em|e[ -]?math|emath|elementary[ -]?math(s|ematics)?)([^a-z]|$)/i.test(s)) return 'E Math';
  if (/(^|[^a-z])(h2|h1|jc[12]?|a[ -]?level)([^a-z]|$)/i.test(s)) return 'H2 Math';
  return null;
}
