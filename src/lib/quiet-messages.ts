// The Telegram messages to Adrian that are SWITCHED OFF (not deleted).
//
// Adrian, 8 Oct 2026, of the list of every message the system sends him: "are there duplicates
// or redundant ones or ones that are not useful? if there are, we can remove them" — and to the
// list put to him: "yes, remove the 12 and move the messages". Each line is one family that no longer sends. The work behind it
// carries on, and its numbers are in ☀️ the morning brief (bot repo docs/MORNING-BRIEF.md
// §Switched off, which holds the record and his words). The code that builds each message stays.
//
// TO TURN ONE BACK ON: delete its line and push. The bot's half: its lib/quiet-messages.js.
export const QUIET: Readonly<Record<string, string>> = Object.freeze({
  'handin-queued': '2026-10-08',        // 📥 / 🕒 "X handed in … queued for marking" — the marked-paper message for the same paper follows
  'scan-line': '2026-10-08',            // 📠 scanned and queued · 🏷 tagged · 📁 filed — the same paper is announced again when marked
  'find-review-empty': '2026-10-08',    // the Find-a-question digest on a day with nothing for Adrian — no finds (8 Oct), or no wrong match (16 Oct)
  'desk-reminder': '2026-10-08',
  'dropbox-tray': '2026-10-16',         // 🗑 / 🗄 "Dropbox tray: N paper folders removed / archived" — Adrian: "there is no need to send me this anymore"; the clean-up carries on        // 🗂 "N marked papers waiting on the desk" at 08:00 — the brief shows the number
  // Adrian, 6 Nov 2026: "can we just put all this on admin itself, then i will act on it (don't put on
  // telegram)" → "yes" — the questions to vet are decided in "Decide here" on /admin.
  'question-proposals-nudge': '2026-11-06', // 📥 Monday "questions waiting to be vetted"
  // Adrian, 6 Nov 2026: "Yes, do it all" — to the keep / shorten / stop list. Telegram to him keeps only
  // a person waiting on him, a money decision, something broken only he can fix, or something he asked
  // for. The work behind each line below carries on, and any fileForBrief copy still files.
  // Kept ON on purpose: 'sheet-needs-you' (a sheet held or failed — a student waits on him) and the 🗄 backup
  // alerts (their could-not-run path records nothing in job_runs, so the message is the only signal).
  'marking-stall': '2026-11-06',            // ⏸ "marking has stalled" (the 🔑/🗝 sign-in-ending line still sends)
  'leak-test-norun': '2026-11-06',          // 🔒 "the weekly leak test could not run" (a real leak still sends)
  'page-gap-selffix': '2026-11-06',         // 🔌 "the page-gap self-fix could not do its own work"
  'email-verify-off': '2026-11-06',         // ⚠️ "Email delivery verification is OFF"
  'retention': '2026-11-06',                // the retention clean-up report
  'offboarding': '2026-11-06',              // the inactive-account offboarding report
  'graduates-offboarded': '2026-11-06',     // 🎓 graduates offboarded
  'invoice-reminder-12th': '2026-11-06',    // invoice month shortened to ONE message ("Draft invoices ready")
  'pre-invoice-13th': '2026-11-06',         // the 13th "invoices tomorrow" reminder
  'payment-marking-reminder': '2026-11-06', // "mark the payments" reminder
  'payment-reminders-sent': '2026-11-06',   // "N overdue payment reminders sent"
  'invoices-delivered-ok': '2026-11-06',    // ✅ "Invoices delivered" when every one is fine (issues still send)
  'email-resent-echo': '2026-11-06',        // the echo after he re-sends an email from admin
  'weekly-cost': '2026-11-06',              // 💸 the weekly cost line
  'first-invoice-auto-emailed': '2026-11-06', // "first invoice emailed" (the FAILED version still sends)
  'public-signup-existing': '2026-11-06',   // a public sign-up for someone already enrolled (⚠️ invite failed still sends)
  'portal-activated': '2026-11-06',         // "X activated the portal"
  'discontinued-echo': '2026-11-06',        // echo after he discontinues a student
  'reinstated-echo': '2026-11-06',          // echo after he reinstates a student
  'holiday-optout-each': '2026-11-06',      // one line per holiday opt-out (the roll-up still sends)
  'portal-practice-digest': '2026-11-06',   // the portal practice digest
  'practice-done': '2026-11-06',            // "X finished a practice"
  'grade-json-retry': '2026-11-06',         // the marker's JSON retry note
  'practice-levels': '2026-11-06',          // the math practice difficulty changes
  'game-plan-finished': '2026-11-06',       // "X finished the game plan" (stuck on a step still sends)
  'referral-reward': '2026-11-06',          // 🎁 referral reward granted (the manual fallback still sends)
  'student-suggestion': '2026-11-06',       // a student's suggestion
  'practice-photo-reported': '2026-11-06',  // a student reported a practice photo
  'password-changed': '2026-11-06',         // "X changed their password"
  'handin-duplicate': '2026-11-06',         // marking per paper: duplicate hand-in
  'science-feedback': '2026-11-06',         // science marking feedback from a student
  'teacher-mark': '2026-11-06',             // the school teacher's mark entered by a student
  'tutor-marked-filed': '2026-11-06',       // a tutor-marked paper filed
  'practice-again-request': '2026-11-06',   // a practice-again request
  'photo-sheet': '2026-11-06',              // the photo practice sheet lines
  'self-study-sheet': '2026-11-06',         // the self-study sheet lines and files
  'sheet-release': '2026-11-06',            // the sheet released lines
  'sheet-revision': '2026-11-06',           // the sheet revision lines
  'sheet-auto-release': '2026-11-06',       // the sheet auto-release lines
  'release-retry': '2026-11-06',            // the auto-release retry sweep line
  'missing-marked-pages': '2026-11-06',     // missing marked pages lines
  'practice-again-closure': '2026-11-06',   // practice-again closure line
  'dropbox-not-filed': '2026-11-06',        // "Dropbox paper not filed" catch-up line
  'extraction-inbox': '2026-11-06',         // the extraction inbox lines
  'midnight-queue': '2026-11-06',           // the midnight daily queue line
  'practice-again-nudges': '2026-11-06',    // practice-again reminder nudges sent
  'humanities-held': '2026-11-06',          // humanities marks held
  'humanities-learned': '2026-11-06',       // humanities self-check learned
  'auto-release-report': '2026-11-06',      // the weekly auto-release report (the "switched OFF" version still sends)
  'missing-papers': '2026-11-06',           // the missing papers report
  'shadow-read-report': '2026-11-06',       // the shadow-read report
  'question-health': '2026-11-06',          // the weekly question health report
  'figure-needs': '2026-11-06',             // the weekly figure needs report
  'switch-echo': '2026-11-06',              // the echo after he flips a switch on admin himself
});

// RULE: a switched-off message is never a failed send. A job that stamps job_runs from the
// result of its send must stamp the run as fine when its family is quiet — or the health check
// alarms the next morning (9 Oct 2026, the desk reminder).

/** Is this family switched off? An unknown family is never quiet. */
export function isQuiet(family: string): boolean {
  return !!QUIET[family];
}

/** sendTelegram's stand-in for a switched-off family: sends nothing, answers "not sent". */
export async function unlessQuiet(family: string, send: () => Promise<boolean>): Promise<boolean> {
  return isQuiet(family) ? false : send();
}

/** Like unlessQuiet, but a switched-off family answers "fine" (true) — for a caller that stamps
 *  job_runs, remembers "told", or reports its send as done (the RULE above). */
export async function quietOk(family: string, send: () => Promise<boolean>): Promise<boolean> {
  return isQuiet(family) ? true : send();
}
