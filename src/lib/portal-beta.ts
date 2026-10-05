// Marking-only beta (Adrian, 2026-08-21: "the only function that students can
// see now should be just uploading papers to mark and viewing their marked
// papers"). While MARKING_ONLY_BETA is on, a STUDENT session sees four
// surfaces inside the portal — /app/practice (added the same day at Adrian's
// request: topic → Standard/Advanced → question, marked line by line),
// /app/submit (hand a paper in), /app/marking (released marked papers) and
// /app/my-notes ("My Notebook" — the focus/retry/clippings page; it absorbed
// /app/plan on 2026-08-28, which now redirects there — marking-derived and
// released-only, so it belongs in this beta) — plus the dashboard shell and
// Settings. Learn, Notes and Reference are hidden from the nav/dashboard AND
// their routes redirect back to /app, so no link inside the portal leads
// anywhere else. The allowlist is enforced by construction: an allowed page
// simply never calls requireFullPortal().
//
// Escape hatch, same as learn-gate: Adrian's signed admin cookie in the same
// browser passes everything — that is how he previews the full portal through
// his test student account. Flip MARKING_ONLY_BETA to false to reopen the
// whole portal to students in one place.
//
// Server-only module (next/headers via notes-auth) — never import from client
// components; gate client pages through a sibling `layout.tsx` instead.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isNotesAuthed } from './notes-auth';
import type { ScienceAccess } from './science-levels';

export const MARKING_ONLY_BETA = true;

// Notes carve-out (Adrian, 2026-08-27: "add the notes back to the student
// portal now"). The /notes Fumadocs reader re-opens to students while the rest
// of the marking-only beta stays shut — Learn / Notebook / Reference are still
// bounced. Flip to false to hide notes again in one place; when
// MARKING_ONLY_BETA itself goes false this flag is moot (full portal already
// includes notes).
//
// CLOSED again 2026-08-29 (Adrian, phone review round 5: "let's hide it from
// students first") while the notes content is vetted — the sub-group names
// read as internal cluster jargon and descriptions carry raw ASCII math.
// Reopen by flipping back to true once the vetting layers land. The /notes
// layout ALSO consults this flag (a student session with the direct URL must
// see the closed card, not the reader) — the nav/Home gates alone don't cover
// a bookmark.
export const NOTES_OPEN_TO_STUDENTS = false;

// "View as student" — Adrian's admin cookie normally unlocks the full portal,
// which means his own phone can never show him what a student actually sees
// (bit on 2026-08-21: his Home showed Practice/Learn while students got the
// trimmed beta). Setting this cookie (toggle in the app shell) makes every
// gate treat him as a plain student until he switches back. Client-set, not
// signed — it only ever REMOVES access, so it needs no integrity.
export const VIEW_AS_STUDENT_COOKIE = 'portal_view_as_student';

export async function viewingAsStudent(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(VIEW_AS_STUDENT_COOKIE)?.value === '1';
}

/** True when the caller may see the full portal (flag off, or Adrian's admin cookie — unless he is viewing as a student). */
export async function fullPortalVisible(): Promise<boolean> {
  if (!MARKING_ONLY_BETA) return true;
  if (await viewingAsStudent()) return false;
  return isNotesAuthed();
}

// 📝 Practice is the student's TO-DO LIST (SPEC-PORTAL-V2 §3, Adrian 6 Sep
// 2026): work he assigned, Practice Again questions handed back from their own
// marked papers, questions they found. The open topic picker, the topic deep
// links and the timed set stay behind his admin cookie. This is its own flag,
// not a fullPortalVisible() delegate, for the same reason as the timed set
// below: ending the marking-only beta must not reopen the picker to students
// as a side effect. Flip to true to give students the picker back.
export const PRACTICE_PICKER_OPEN_TO_STUDENTS = false;

// Practice Again is the PDF sheet only (Adrian, 8 Sep 2026) — the in-app
// per-question hand-back is off. The flag lives in the pure file so the store
// can read it; re-exported here so every portal gate is findable in one place.
export { PRACTICE_AGAIN_HANDS_BACK_QUESTIONS } from './practice-again';

/** 'full' = the whole practice page (picker, topics, timed set — Adrian's admin
 *  cookie, or the flag); 'list' = the to-do list only, plus opening one of its
 *  items (`?assignment=`). */
export async function practiceAccess(): Promise<'full' | 'list'> {
  if (PRACTICE_PICKER_OPEN_TO_STUDENTS) return 'full';
  if (await viewingAsStudent()) return 'list';
  return (await isNotesAuthed()) ? 'full' : 'list';
}

// ⏱ Exam-prep timed sets (2026-09-02): /app/practice shows a timed-set entry
// alongside the Home "Next exam" countdown, but the row stays admin-preview
// until Adrian has run one himself. Deliberately its own flag, not a
// fullPortalVisible() delegate: ending the marking-only beta must not open
// timed sets to students as a side effect. Flip to true to release the row.
export const EXAM_PREP_OPEN_TO_STUDENTS = false;

/** True when the caller may see the timed-set entry (flag on, or Adrian's admin preview — unless viewing as a student). */
export async function examPrepVisible(): Promise<boolean> {
  if (EXAM_PREP_OPEN_TO_STUDENTS) return true;
  if (await viewingAsStudent()) return false;
  return isNotesAuthed();
}

/**
 * Call at the top of any server component (page or layout) that is NOT part of
 * the marking-only surface. Students land back on the dashboard; Adrian passes.
 */
export async function requireFullPortal(): Promise<void> {
  if (!(await fullPortalVisible())) redirect('/app');
}

// Home "Last lesson" card (topics covered + homework from the Airtable
// Lessons log). Adrian, 2026-09-02: "gate keep last lesson topics first — the
// students won't have any last lessons" — the beta cohort's lessons aren't
// logged with topics yet, so the card would only ever be empty or wrong.
// Admin cookie sees it; flip to true to open it.
export const LAST_LESSON_OPEN_TO_STUDENTS = false;

// Science practice (2026-09-02, Adrian: "can we have physics questions
// practice too? … gatekeep from students first"): the physics bank in the
// separate science project reaches the practice picker as a 'PHY' level
// (lib/science-levels + lib/science-bank). Closed to students until this
// flips; once open, a student needs 'Physics' in Airtable Students.Subjects
// (the option doesn't exist yet — add it via typecast when opening). Adrian's
// admin cookie previews every science level.
// Opened 1 Oct 2026 (Adrian: "option 2 …" — the Science Practise tab): the gate
// is the student's own science choice (portal_accounts.prefs.sciences), not an
// Airtable subject; see lib/practice practiceLevelAllowed. CLOSED AGAIN the same
// evening before the promote (Adrian: "gate keep science practice first") — Adrian's
// cookie and the preview student still see it; flip to true to open.
// OPEN since 3 Oct 2026 (Adrian: "open practice tab for chemistry calculations and mcq
// (do not show the source)"): MCQ by topic for the sciences a student takes. The
// school / year / paper never leave the server (lib/science-bank toPayload: source null).
// CLOSED again later on 3 Oct 2026 (Adrian: "close the mcq practice first - we need to
// check the questions are okay - figures are okay?") until the MCQ rows and their
// figures have been checked. Adrian's cookie and the preview student still see it.
// OPEN AGAIN 5 Oct 2026 — TOPIC BY TOPIC (below): the tab shows a student only the topics on
// SCIENCE_PRACTICE_OPEN_TOPICS, each opened after its MCQs passed the blind-solve check.
export const SCIENCE_PRACTICE_OPEN_TO_STUDENTS = true;
// TOPIC BY TOPIC (5 Oct 2026, Adrian: "our priority will be mcqs … we can open up topics one
// by one" and "i don't have to see it, a model does the checking — just make sure it is good").
// A student is shown and served ONLY the topics listed here, by the practice level key
// (PHY / CHEM / BIO) and the bank's topic name exactly as `questions.topics` spells it.
// A topic goes on the list only after its MCQs passed the blind-solve check (≥ 98 % of the
// servable MCQs agree with the stored key after fixes, and ≥ 30 servable) — docs/MARKING.md
// §The Science tab. Adrian's admin cookie still sees every topic (lib/science-practice
// scienceTopicOpen; the gate is lib/practice scienceTopicGate). MCQ only: Structured has its
// own switch above.
export const SCIENCE_PRACTICE_OPEN_TOPICS: Readonly<Record<string, readonly string[]>> = {
  // Each line: opened 5 Oct 2026 after the check — checked / passed first time / after fixes.
  PHY: [
    'Kinematics',                        // 131 checked, 128 first time; 2 stems repaired, 1 hidden (option graphs missing), 2 near-copies hidden
    'Forces',                            // 150 of 152 checked, 145 first time; 1 stem repaired, 2 hidden (missing figure, two correct options)
    'Turning Effect of Forces',          // 41 checked, 40 first time; 1 hidden (key depends on wording)
    'Pressure',                          // 80 checked, 79 first time; 1 hidden (needs a figure that is not stored)
  ],
  CHEM: [
    'Chemical Calculations',             // 150 of 448 checked (sample), 150 passed
    'Salts',                             // 150 of 371 checked, 147 first time; 1 key corrected (two blind solves + its own worked solution), 2 hidden (ambiguous)
    'The Periodic Table',                // 150 of 345 checked, 146 first time; 3 hidden (contested key, wrong period in stem, garbled formula)
    'Acids and Bases',                   // all 307 checked (two runs), 297 first time; 9 hidden (missing figure, two correct options, ambiguous)
  ],
  BIO: [
    'Cell Structure and Organisation',   // 69 checked, 69 passed; 3 near-copies hidden
    'Movement of Substances',            // 82 checked, 79 first time; 3 hidden (no correct option / ambiguous key), 5 near-copies hidden
    'Enzymes',                           // 60 checked, 57 first time; 3 hidden (garbled statement, two plausible answers)
    'Nutrition in Humans',               // 77 checked, 77 passed
    'Nutrition in Plants',               // 43 checked, 40 first time; 3 hidden (option figures missing, ambiguous stem)
  ],
};

// COMBINED SCIENCE, its own switch (5 Oct 2026, Adrian: "if combined science questions aren't
// ready yet, then switch off for combined science students first > then work on combined
// science questions (do the checks) once ready, open the switch for combined science
// students"). A Combined Science student (prefs.combined_science) practises ONLY the Combined
// Science bank (CS_PHYS / CS_CHEM / CS_BIO + _NA) and ONLY the topics listed here — never the
// pure pool. Empty = the tab tells them practice for Combined Science is coming soon. A topic
// goes on after ITS Combined Science MCQs pass the same check as the pure ones.
// Opened 5 Oct 2026 after the check (every servable Combined Science MCQ of the topic blind-solved
// by Opus, figures looked at, copies hidden): checked · served now.
export const SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS: Readonly<Record<string, readonly string[]>> = {
  PHY: [
    'Kinematics',                // 78 checked, 75 first time · 73 served
    'Forces',                    // 84 checked, 80 first time · 77 served
    'Turning Effect of Forces',  // 49 checked, 44 first time · 40 served
    'Pressure',                  // 37 checked, 37 first time · 37 served
  ],
  CHEM: [
    'Chemical Calculations',     // 72 checked, 69 first time · 69 served
    'Acids and Bases',           // 146 checked, 143 first time · 139 served
    'Salts',                     // 99 checked, 97 first time · 97 served
    'The Periodic Table',        // 131 checked, 128 first time · 128 served
  ],
  // Biology: every Combined Science topic has fewer than 30 servable MCQs (14–22) — not open.
  BIO: [],
};
// 🎚 Core · Exam · Challenge · Mixed on a science MCQ run (5 Oct 2026, Adrian left the science
// call to the sessions: "for sciences you will have to decide"). Mixed is the default; a level
// shows only when the topic has ≥ 30 questions at it (lib/science-practice levelsOffered); the
// levels come from practice_difficulty (lib/practice-difficulty). Adrian's cookie and the
// preview student always see it.
export const SCIENCE_LEVELS_OPEN_TO_STUDENTS = false;
export function scienceLevelsAllowedFor(identity: string | null | undefined): boolean {
  if (SCIENCE_LEVELS_OPEN_TO_STUDENTS) return true;
  return !!identity && SCIENCE_PREVIEW_IDENTITIES.includes(identity);
}
// Structured science practice = write an answer, get it MARKED, then the scheme (Adrian,
// 1 Oct 2026: "they must practice right? then we mark? … no point just giving the answers
// straight away"). The practice grader has not been checked against science scheme
// answers yet, so Structured stays behind Adrian's cookie until the seeded check passes;
// MCQ is open. Only rows with a solution are served (scienceNext kind).
export const SCIENCE_STRUCTURED_PRACTICE_OPEN_TO_STUDENTS = false;
export async function scienceStructuredPracticeOpen(): Promise<boolean> {
  if (SCIENCE_STRUCTURED_PRACTICE_OPEN_TO_STUDENTS) return true;
  return !(await viewingAsStudent()) && (await isNotesAuthed());
}

/** 'preview' = Adrian's admin cookie (every science level), 'open' = flag on (by subject), else 'closed'. */
export async function sciencePracticeAccess(): Promise<ScienceAccess> {
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'preview';
  return SCIENCE_PRACTICE_OPEN_TO_STUDENTS ? 'open' : 'closed';
}

// Science MARKING for students (2026-09-02, Adrian: "build 1 and 2 now" — know
// the subject, and a flag, off). A student's hand-in is marked with the subject
// brain ONLY when this is on AND the student is enrolled in that subject
// (lib/mark-subject-for-student resolveHandinSubject is the gate). Off = every
// student hand-in is marked as math, exactly as before this shipped. Flip only
// once the calibration board shows the ±2 gate met for the subject. Adrian's
// admin cookie previews it regardless.
export const MARK_SUBJECT_OPEN_TO_STUDENTS = false;
export async function markSubjectAccess(): Promise<import('./mark-subject-for-student').MarkSubjectAccess> {
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'preview';
  return MARK_SUBJECT_OPEN_TO_STUDENTS ? 'open' : 'closed';
}

// 🧪 The Science tab (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026, Adrian: "i can
// let students submit science papers to mark for free, but give a disclaimer …
// two tabs (math, then science) at the top"). While this is on, every signed-in
// student sees the Math | Science switcher, and /app/science/submit marks a
// physics / chemistry / biology hand-in with that subject's brain — no enrolment
// check, its own daily slot, the disclaimer on the form and on every science
// paper. Flip to false to hide the tab and shut the door (the routes bounce to
// /app); Adrian's admin cookie previews it regardless. Independent of
// MARK_SUBJECT_OPEN_TO_STUDENTS above, which is the enrolment-gated maths door.
//
// OFF since 10 Sep 2026 evening (Adrian: "gate keep the science tab from
// students first — students should only just be able to see just math as
// usual"): the first calibration pass showed physics lenient on weak scripts
// and biology a few marks generous with the scheme. Students see the maths app
// exactly as before; Adrian's admin cookie still sees the Science tab. Flip to
// true to open it.
export const SCIENCE_MARKING_OPEN_TO_STUDENTS = false;

/**
 * True when the caller may use the Science tab: the code flag, or Adrian's
 * admin preview (unless viewing as a student), or — since 11 Sep 2026 — the
 * 🧪 release switch on /admin/mark-paper (Airtable Settings
 * `science_marking_open`, lib/marking-settings.ts, 30 s cache): Adrian tests
 * through the student portal first and releases with one tap, no deploy. An
 * unreadable row means closed.
 */
export async function scienceMarkingOpen(): Promise<boolean> {
  if (SCIENCE_MARKING_OPEN_TO_STUDENTS) return true;
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return true;
  // The demo student Adrian tests through sees the tab while it is closed to
  // everyone else (11 Sep 2026: "i will see test through student portal myself first").
  try {
    const { sessionAccount, portalIdentity } = await import('./portal-auth');
    const acct = await sessionAccount().catch(() => null);
    if (acct && SCIENCE_PREVIEW_IDENTITIES.includes(portalIdentity(acct))) return true;
  } catch { /* fall through to the switch */ }
  try {
    const { getScienceOpenSetting } = await import('./marking-settings');
    return (await getScienceOpenSetting()).on;
  } catch {
    return false;
  }
}

/** Portal identities that see the Science tab while the release switch is off — the demo student (portal-teste@example.com). */
export const SCIENCE_PREVIEW_IDENTITIES: readonly string[] = ['recNjZkA3Z41nhwwK'];

// ✍️ Essay marking — the Languages family (SPEC-ESSAY-MARKING.md, 12 Sep 2026,
// Adrian: "start"). E1 = English continuous writing, typed hand-in, the full
// report, PREVIEW IDENTITY ONLY until the calibration gate passes (consistency,
// ranking against each teacher's class set, anchors — all in the spec). Flip to
// true to open the Languages tab to every signed-in student; Adrian's admin
// cookie previews it regardless.
export const ESSAY_MARKING_OPEN_TO_STUDENTS = false;
/** Portal identities that see the Languages tab while it is closed — the same demo student as science. */
export const ESSAY_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;

export async function essayMarkingOpen(): Promise<boolean> {
  if (ESSAY_MARKING_OPEN_TO_STUDENTS) return true;
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return true;
  try {
    const { sessionAccount, portalIdentity } = await import('./portal-auth');
    const acct = await sessionAccount().catch(() => null);
    if (acct && ESSAY_PREVIEW_IDENTITIES.includes(portalIdentity(acct))) return true;
  } catch { /* closed */ }
  return false;
}

// 📜 Humanities — instant feedback on a typed source-based answer
// (SPEC-HUMANITIES.md, H1 built 2 Oct 2026): our own Social Studies source sets,
// a level RANGE and the one lift, never a mark. CLOSED until the seeded bench
// passes and Adrian has read the level schemes; the demo student and Adrian's
// admin cookie see it. Flip to true to open the Humanities tab to every student.
export const HUMANITIES_OPEN_TO_STUDENTS = false;
export const HUMANITIES_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;

export async function humanitiesOpen(): Promise<boolean> {
  if (HUMANITIES_OPEN_TO_STUDENTS) return true;
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return true;
  try {
    const { sessionAccount, portalIdentity } = await import('./portal-auth');
    const acct = await sessionAccount().catch(() => null);
    if (acct && HUMANITIES_PREVIEW_IDENTITIES.includes(portalIdentity(acct))) return true;
  } catch { /* closed */ }
  return false;
}

// 🧭 "Which method?" drills + ✍️ the statistics write-up trainer for JC H2 students
// (5 Oct 2026, Adrian: "build the which method drills and stats trainer";
// SPEC-H2-TOOLS.md). CLOSED: Adrian's cookie and the demo student see them; flip one
// to open it to every JC1/JC2 student (lib/h2-tools h2ToolVisible). Doors: a "JC
// drills" section on the Practice tab, /app/practice/methods and /app/practice/stats.
export const H2_METHOD_DRILLS_OPEN_TO_STUDENTS = false;
export const H2_STATS_TRAINER_OPEN_TO_STUDENTS = false;
// 📈 The graph-sketch checker (5 Oct 2026, Adrian: "build … the graph sketch checker";
// SPEC-SKETCH-CHECK.md): photograph a sketch, the red pen checks every asymptote,
// intercept and turning point is drawn and labelled and the shape is right, with the
// correct sketch beside it. CLOSED: Adrian's cookie and the demo student see it; flip
// to open it to every JC1/JC2 student. Doors: a row in the Practice tab's "JC drills"
// section, /app/practice/sketch, /api/portal/sketch-check.
export const H2_SKETCH_CHECK_OPEN_TO_STUDENTS = false;
export const H2_TOOLS_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;
/** May the current viewer use this H2 tool? `account` = the student session, when there is one. */
export async function h2ToolOpen(tool: 'methods' | 'stats' | 'sketch', account?: { id: string; airtable_student_id?: string | null; level?: string | null } | null): Promise<boolean> {
  const { h2ToolVisible } = await import('./h2-tools');
  // Adrian's admin cookie always passes — also while "View as student" is on, so he can try
  // the tools from his student view whatever level that account is (5 Oct 2026).
  const isAdmin = await isNotesAuthed();
  const { portalIdentity } = await import('./portal-auth');
  return h2ToolVisible({
    open: tool === 'methods' ? H2_METHOD_DRILLS_OPEN_TO_STUDENTS : tool === 'stats' ? H2_STATS_TRAINER_OPEN_TO_STUDENTS : H2_SKETCH_CHECK_OPEN_TO_STUDENTS,
    isAdmin, identity: account ? portalIdentity(account) : null, level: account?.level ?? null,
    previewIdentities: H2_TOOLS_PREVIEW_IDENTITIES,
  });
}

// 🔍 Find a question (/app/find, SPEC-PORTAL-V2 §4, 6 Sep 2026): photo or typed
// question → a genuinely similar bank question or a made-for-you one, straight
// into Practice. It replaced the students' "Request materials" door on Home, so
// it is part of the marking-only surface. Flip to false to hide the page from
// students in one place; Adrian's admin cookie still sees it.
export const FIND_OPEN_TO_STUDENTS = true;

// 📷 Practice photo (SPEC-PRACTICE-PHOTO.md, 23 Sep 2026): the Practice tab
// becomes a photo page — a photographed question is filed under a sub-skill and
// a bank seed is RE-SKINNED into a new question on the student's list. Was
// closed to students until Adrian had read the first ones on /admin/generated;
// OPEN since 1 Oct 2026 (Adrian: "we can flip the switch for Practice tab then").
export const PRACTICE_PHOTO_OPEN_TO_STUDENTS = true;
export const PRACTICE_PHOTO_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;

export async function practicePhotoOpen(): Promise<boolean> {
  if (PRACTICE_PHOTO_OPEN_TO_STUDENTS) return true;
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return true;
  try {
    const { sessionAccount, portalIdentity } = await import('./portal-auth');
    const acct = await sessionAccount().catch(() => null);
    if (acct && PRACTICE_PHOTO_PREVIEW_IDENTITIES.includes(portalIdentity(acct))) return true;
  } catch { /* closed */ }
  return false;
}

/**
 * 🧪 The Chemistry tab's qualitative-analysis flashcards (/app/science/qa and
 * the door on /app/science): Adrian's cookie only until he opens them
 * (25 Sep 2026: "for chem qualitative analysis — gate to admin only first").
 */
export const QA_FLASHCARDS_OPEN_TO_STUDENTS = false;

/**
 * 📖 The Physics tab's definitions page (/app/science/definitions and its door
 * on /app/science): Adrian's cookie only until he has read the list (3 Oct 2026).
 */
export const SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS = false;

/**
 * 🧬 Biology study pages (3 Oct 2026), each Adrian's cookie only until he has
 * read it: the Biology definitions list (/app/science/definitions?s=biology),
 * Processes in pictures (/app/science/processes) and, for every science,
 * Command words (/app/science/command-words).
 */
export const BIOLOGY_DEFINITIONS_OPEN_TO_STUDENTS = false;
export const BIOLOGY_PROCESSES_OPEN_TO_STUDENTS = false;
export const COMMAND_WORDS_OPEN_TO_STUDENTS = false;

// ▶ The one-minute explanation (1 Oct 2026): one lost-marks question replayed on the
// chalk board from the marker's own steps (lib/explain-clip). ADMIN-ONLY until Adrian
// has watched a few — flip this to open the door on every mistake card and on the
// paper's "Where you lost marks"; the preview student sees it meanwhile.
export const EXPLAIN_CLIP_OPEN_TO_STUDENTS = false;
export const EXPLAIN_CLIP_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;
export async function explainClipVisible(identity?: string | null): Promise<boolean> {
  if (EXPLAIN_CLIP_OPEN_TO_STUDENTS) return true;
  if (identity && EXPLAIN_CLIP_PREVIEW_IDENTITIES.includes(identity)) return true;
  const { cookies } = await import('next/headers');
  const { ADMIN_SESSION_COOKIE, verifyAdminSession } = await import('./admin-session');
  const admin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  return admin && !(await viewingAsStudent());
}

// ▶ Watch it — an animated worked solution under a science MCQ's solution
// (5 Oct 2026, Adrian: "build the watch it animations for kinematics and
// chemical calculations … gate keep it to me, then show me the results").
// ADMIN ONLY — unlike the explain clip, the preview student does NOT see it
// until Adrian says so. The route (/api/portal/science/watch) and the button
// both ask watchItVisible(); flip this to open it for every student.
export const WATCH_IT_OPEN_TO_STUDENTS = false;
export async function watchItVisible(): Promise<boolean> {
  if (WATCH_IT_OPEN_TO_STUDENTS) return true;
  const { cookies } = await import('next/headers');
  const { ADMIN_SESSION_COOKIE, verifyAdminSession } = await import('./admin-session');
  const admin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  return admin && !(await viewingAsStudent());
}

// 🪜 "Stuck? Next step" on a practice question (1 Oct 2026, from a student weak
// at trig identity proofs): the bank working one line per tap, and "next step
// from my line" on a photo of their working (lib/proof-ladder). ADMIN-ONLY plus
// the preview student until Adrian has tried it — flip this to open it for
// every student. The routes gate with `proofLadderAllowedFor`; the page passes
// the same answer to the client as a prop, the client never sees the flag.
export const PROOF_LADDER_OPEN_TO_STUDENTS = true; // Adrian, 1 Oct 2026: "open it to all students"
export const PROOF_LADDER_PREVIEW_IDENTITIES: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;
/** Pure: is this student (by Airtable id) allowed the ladder? Admin callers pass without it. */
export function proofLadderAllowedFor(identity: string | null | undefined): boolean {
  if (PROOF_LADDER_OPEN_TO_STUDENTS) return true;
  return !!identity && PROOF_LADDER_PREVIEW_IDENTITIES.includes(identity);
}
export async function proofLadderVisible(identity?: string | null): Promise<boolean> {
  if (proofLadderAllowedFor(identity)) return true;
  const { cookies } = await import('next/headers');
  const { ADMIN_SESSION_COOKIE, verifyAdminSession } = await import('./admin-session');
  const admin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  return admin && !(await viewingAsStudent());
}
