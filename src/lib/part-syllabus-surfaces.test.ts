// TRIPWIRE (SPEC-PART-SYLLABUS.md): every file that reads the maths question bank either
// goes through the one door (lib/part-syllabus.ts) or is listed below with the reason it
// does not need to. A new surface that reads the bank fails this test until someone
// decides which it is — so a part marked out of syllabus cannot leak through a page
// nobody remembered.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..');
const READS = /from\('questions'\)|rest\/v1\/questions|rpc\('(practice_next|practice_pool|practice_solution|practice_candidates|practice_exemplars|kiosk_pool)'/;
// The door itself, or one of the two shared loaders that apply it to every row they return.
const DOOR = /from '(@\/lib|\.)\/part-syllabus'|from '@\/lib\/(lesson-load|kiosk-pool)'/;

/** Files that read the bank and do NOT hand a part's text, marks, answer or solution to a student. */
const EXEMPT: Record<string, string> = {
  // ── admin views: Adrian sees every part (a marked one is greyed on /admin/questions)
  'app/admin/watch-it/page.tsx': 'admin view',
  'app/api/admin/bank-health/route.ts': 'admin counts',
  'app/api/admin/cards/bank-questions/route.ts': 'admin authoring view (he copies by hand)',
  'app/api/admin/lessons/bank/route.ts': 'admin authoring view',
  'app/api/admin/lessons/bank-semantic/route.ts': 'admin authoring view',
  'app/api/admin/lessons/bank-sync/route.ts': 'admin authoring view',
  'app/api/admin/lessons/question-meta/route.ts': 'admin authoring view',
  'app/api/admin/lessons/save-solution/route.ts': 'admin writes a solution',
  'app/api/admin/figures-bank/route.ts': 'admin figure tools — change one field of a part, keep the rest',
  'app/api/admin/qb-fix-render/route.ts': 'admin text fixes — keep every other key of a part',
  'app/api/admin/find-review/route.ts': 'admin review of Find a question',
  'app/api/admin/generated/route.ts': 'our own generated questions, admin review',
  'app/api/admin/practice-by-step/route.ts': 'admin list: stem text only, no parts',
  'app/api/admin/question-proposals/route.ts': 'inserts our own new questions',
  'app/api/admin/assignments/route.ts': 'reads id + deleted_at only',
  'app/api/admin/remediation/route.ts': 'parked admin tool',
  // ── counts, ids, figures: no part content
  'app/api/cron/auto-release-report/route.ts': 'counts',
  'app/api/cron/missing-papers/route.ts': 'which papers exist',
  'app/api/cron/practice-topup/route.ts': 'counts ids per topic',
  'app/api/agent/recrop/cut/route.ts': 'science figures',
  'app/api/agent/recrop/queue/route.ts': 'science figures',
  'app/api/agent/recrop/submit/route.ts': 'science figures',
  'app/api/bot/practice-pdf/route.ts': 'reads a figure by id; the text is the bot\'s own snapshot (bot repo list in the spec)',
  'app/api/portal/practice-history/route.ts': 'stem text + topics only, no parts',
  'app/api/portal/practice/report/route.ts': 'writes a report flag',
  'lib/practice-again-store.ts': 'ids only',
  'lib/sheet-sections-store.ts': 'stem text only',
  'lib/next-lesson-store.ts': 'Set papers: our own questions, listed not rendered',
  'lib/glance-store.ts': 'counts',
  'lib/solution-image-gate.ts': 'figure flags',
  'lib/serve-gate-store.ts': 'the gate itself: serveRefusal judges part marks (lib/serve-gate.ts)',
  // ── a real paper the student already holds: every part stays (the red line in the spec)
  'lib/score-forecast-store.ts': 'GCE paper marks by topic for the forecast',
  // ── the science bank is another database with its own rows; part marks are a maths-bank feature
  'lib/science-bank.ts': 'science bank',
  // ── health check: counts, plus the part-marks check itself
  'app/api/health-check/route.ts': 'health checks',
  // ── a model is shown bank questions as examples; the RPC returns no parts, so this one is
  //    closed in SQL (migrations/part_syllabus_keep_marks.sql, the note at its foot)
  'lib/learn/generate-practice.ts': 'exemplars RPC — closed in SQL, see the migration note',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('every reader of the question bank goes through the part-marks door', () => {
  const readers = walk(SRC).filter((f) => READS.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f).split(path.sep).join('/'));

  it('finds the readers', () => {
    expect(readers.length).toBeGreaterThan(30);
  });
  it('each one imports the door (or a module that applies it), or is listed with a reason', () => {
    const missing = readers.filter((f) => !EXEMPT[f] && !DOOR.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
    expect(missing, `These files read the question bank. Take their rows through studentRow()/studentRows() from lib/part-syllabus.ts, or add them to EXEMPT here with the reason:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
  it('the exempt list holds no file that has gone or no longer reads the bank', () => {
    const stale = Object.keys(EXEMPT).filter((f) => !readers.includes(f));
    expect(stale).toEqual([]);
  });
});
