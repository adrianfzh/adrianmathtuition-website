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
  'find-review-empty': '2026-10-08',    // the Find-a-question digest on a day with no finds (33 of 41 runs)
  'desk-reminder': '2026-10-08',        // 🗂 "N marked papers waiting on the desk" at 08:00 — the brief shows the number
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
