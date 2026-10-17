// One question from school (or one part) made ready to mark — shared by "Check my answer" (one question) and the
// whole paper (17 Oct 2026). Its type is worked out (wording rules → one short read), a repeat of a banked school
// question keeps the type and points list it had, and a Geography short question gets its list of points. Server-only.
import { checkOwn, isOwnPoints, type OwnQuestion } from './humanities-own';
import { writeOwnPoints, classifyOwnType } from './humanities-own-points';
import { guessSkill, OWN_SKILLS } from './humanities-own-guess';
import type { HumanitiesSubject } from './humanities-questions';
import { findUploaded } from './humanities-upload-bank';

export type Prepared = { ok: true; own: OwnQuestion } | { ok: false; status: number; error: string };

/** One question (or one part) ready to mark: its type worked out, a Geography short question's points written. */
export async function prepareOwn(input: Record<string, unknown>): Promise<Prepared> {
  const body = { ...input };
  // The type is worked out, never asked: the wording rules, then one short read when they find nothing.
  const subject = String(body.subject ?? '') as HumanitiesSubject;
  // A school question another student already sent is marked the same way: the type it was read as, and for a
  // Geography short question the same list of points (lib/humanities-upload-bank).
  const banked = subject in OWN_SKILLS ? await findUploaded(subject, String(body.question ?? ''), String(body.sources ?? '')).catch(() => null) : null;
  if (banked && OWN_SKILLS[subject].includes(banked.skill as never)) body.skill = banked.skill;
  if (subject in OWN_SKILLS && !OWN_SKILLS[subject].includes(String(body.skill ?? '') as never)) {
    const q = String(body.question ?? '');
    body.skill = guessSkill(subject, q) ?? await classifyOwnType(subject, q) ?? '';
    if (!body.skill) return { ok: false, status: 400, error: 'We could not tell what this question asks. Check the whole question is there.' };
  }
  const checked = checkOwn(body);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  let own = checked.own;
  if (isOwnPoints(own.skill) && banked?.points?.length && banked.skill === own.skill) {
    own = { ...own, points: banked.points, command: banked.command ?? 'explain', develop: !!banked.develop, rules: banked.rules ?? [], marks: own.marks ?? banked.marks };
  } else if (isOwnPoints(own.skill)) {
    // A Geography short question: write its list of creditable points first (lib/humanities-own-points).
    const pts = await writeOwnPoints(own);
    if (!pts) return { ok: false, status: 503, error: 'We could not set up the marking for this question. Try again in a minute.' };
    own = { ...own, ...pts };
  }
  return { ok: true, own };
}

