// 🔒 The weekly leak test (Phase G, made automatic 5 Oct 2026).
//
// PLAN-PORTAL-SOLO R1: "one child's work visible to another ends the product".
// The August audit was a one-off by hand; this runs every week as the demo
// student (portal-teste@example.com) and tries the obvious ways to see someone
// else's work:
//   1. every table and view the database exposes, read straight with the public
//      key — once signed out, once with the demo student's own login. Any row
//      that is not public content and not the demo student's own is a leak;
//   2. the app's own doors (API routes, /api/files, the paper pages) asked for
//      ANOTHER student's paper, essay, answer, assignment and file — each must
//      answer "not found" / "not allowed", signed in as the demo student AND
//      signed out.
// Only GET requests: a test that found a leak must not also change the data.
// Pure judging rules here (tested); lib/leak-test-store.ts does the requests.

/** Tables / views whose rows anyone may read — content, never a student's. */
export const PUBLIC_READ: readonly string[] = [
  'content_snippets', // published swipe cards
  'sections_meta',
  'subgroups',
  'technique_tags',
  'question_technique_tags',
  'rubrics',
  'explanations', // read by id on /explain; chat_id is column-revoked from anon (5 Oct 2026)
  'bank_topics', 'qb_filter_index', 'qb_answer_conflicts', 'paper_index', // security-invoker views over the bank
];

/** Columns that tie a row to ONE student. */
export const OWNER_COLUMNS = ['user_id', 'airtable_student_id', 'student_id', 'account_id', 'identity', 'portal_account_id'] as const;

export interface Self { uid: string; identity: string }

/**
 * One table read straight from the database. `self` = null for the signed-out
 * read. A problem string when rows came back that the caller must not see.
 */
export function judgeTableRead(table: string, rows: Record<string, unknown>[], self: Self | null): string | null {
  if (!rows.length || PUBLIC_READ.includes(table)) return null;
  const who = self ? 'the test student' : 'a signed-out visitor';
  if (!self) return `${table}: ${rows.length} row(s) readable by ${who}`;
  const mine = (r: Record<string, unknown>) => {
    if (table === 'portal_accounts') return r.id === self.uid;
    const owners = OWNER_COLUMNS.filter((c) => c in r);
    if (!owners.length) return false; // a row with no owner column is not "theirs" — it should not be readable at all
    return owners.some((c) => r[c] === self.uid || r[c] === self.identity || r[c] === `acct:${self.uid}`);
  };
  const foreign = rows.filter((r) => !mine(r)).length;
  return foreign ? `${table}: ${foreign} row(s) of someone else readable by ${who}` : null;
}

export interface Probe {
  label: string; // plain words: "another student's marked paper PDF"
  path: string; // GET path on the site, with the other student's id in it
  page?: boolean; // a page rather than an API route
  /**
   * For a page: text that appears ONLY in the other student's thing (e.g. their
   * paper's name). A streamed page can answer 200 even when it then shows "not
   * found", so a page fails on a 2xx only when this text is in the body.
   */
  marker?: string | null;
}

/** One door asked for another student's thing. A problem when it answered with their data. */
export function judgeProbe(p: Probe, status: number, signedIn: boolean, body = ''): string | null {
  const who = signedIn ? 'the test student' : 'a signed-out visitor';
  if (status < 200 || status >= 300) return null;
  if (p.page) {
    const m = (p.marker || '').trim();
    if (m.length < 6 || !body.includes(m)) return null;
  }
  return `${p.label} (${p.path}) opened for ${who} — HTTP ${status}`;
}

/** The logbook / Telegram line. */
export function leakTestLine(problems: string[], tables: number, probes: number): string {
  if (!problems.length) {
    return `Leak test: ok — ${tables} tables read as a signed-out visitor and as the test student, ${probes} doors asked for another student's work; nothing came back.`;
  }
  const shown = problems.slice(0, 5).join('; ');
  return `🚨 Leak test FAILED (${problems.length}): ${shown}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`;
}
