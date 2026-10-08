// 🎚 The worker's job switches (Adrian, 2 Oct 2026: "put toggles for pdf extraction, twins
// extraction and whatever other worker jobs there are together with the toggles for
// accounts … have a page just for toggles"). One Airtable `Settings` row, `worker_jobs`,
// holds a JSON map { <job key>: { on, at, by } } — the slot-accounts shape. The Fly
// worker's scheduler (bot `worker/fly/jobs.sh`) reads `off` every two minutes and starts
// no new run of a job that is off; a run already in flight finishes.
//
// Fail OPEN: a job with no entry is on, an unreadable row is "all on", and a worker that
// cannot reach the site keeps the last list it read (everything on at boot).
// Marking seats and sheet slots are NOT here on purpose — marking must never be parked
// by a stray tap; its switches are "Mac plan only" and the per-account ones.
// Pure; tested. The Airtable I/O lives in worker-jobs-store.ts.

export const WORKER_JOBS_SETTING = 'worker_jobs';

export type WorkerJobGroup = 'lanes' | 'filing' | 'reviews' | 'requests';
export interface WorkerJob {
  /** The scheduler's name for the job — what `off` carries. Lanes share one key. */
  key: string;
  label: string;
  /** One plain line: what it does. */
  what: string;
  /** When it runs. */
  when: string;
  group: WorkerJobGroup;
}

export const WORKER_JOB_GROUPS: readonly { key: WorkerJobGroup; title: string; hint: string }[] = [
  { key: 'lanes', title: 'Heavy lanes', hint: 'Run all day behind marking and use the most plan usage.' },
  { key: 'filing', title: 'Filing', hint: 'Puts each extracted question under one sub-skill.' },
  { key: 'reviews', title: 'Daily reviews', hint: 'One run a day each, early morning.' },
  { key: 'requests', title: 'On request', hint: 'Start only when something is waiting.' },
];

/** Every job the Fly worker's scheduler starts, in the order the page lists them. Add a line when a job is added THERE. */
export const WORKER_JOBS: readonly WorkerJob[] = [
  { key: 'extract', group: 'lanes', label: '📄 PDF extraction', what: 'Papers in the Extraction Inbox become questions in the bank.', when: 'every 15 min while papers wait · up to 8 lanes' },
  { key: 'twins', group: 'lanes', label: '👯 Twins', what: 'Writes our own twin of school questions, per sub-skill.', when: 'every 15 min · up to 8 lanes' },
  { key: 'science-twins', group: 'lanes', label: '🧪 Science twins', what: 'Writes our own science MCQs, three for every sub-skill (open practice topics first); each one that passes every check goes into practice.', when: 'every 15 min when marking is quiet · up to 3 a run' },
  { key: 'file-subgroups', group: 'filing', label: '🗂 Sub-skill filing · maths', what: 'Files topic-tagged maths questions under a sub-skill.', when: '04:15 and 16:15' },
  { key: 'file-subgroups-science', group: 'filing', label: '🧪 Sub-skill filing · science', what: 'Files physics, chemistry and biology questions under a sub-skill. Combined Science first on ten of the twelve runs.', when: 'every 2 hours at :15' },
  { key: 'nightly-builder', group: 'reviews', label: '🌙 Nightly builder', what: 'Builds one idea you approved in the build list on its own copy, runs every test, and asks you in the morning whether to ship it.', when: '01:30 · message 07:30' },
  { key: 'qb-topup', group: 'requests', label: '🌙 Bank top-up', what: 'Writes the questions practice ran short of (the top-up requests), each one through the checks before it goes in.', when: '03:30 · up to 6 requests' },
  { key: 'missing-figures', group: 'reviews', label: '🖼 Missing-figure sweep', what: 'Finds bank questions whose figure was never stored and sends their paper back to have it cropped or redrawn.', when: '03:00 · up to 20 papers' },
  { key: 'extraction-learn', group: 'reviews', label: '📜 Extraction learner', what: 'Reads the extraction notes, applies safe rules, asks you about filing rules.', when: '06:50' },
  { key: 'figure-fitness', group: 'reviews', label: '🖼 Figure check', what: 'Judges newly added question figures before they are shown.', when: '03:10' },
  { key: 'subject-retag', group: 'reviews', label: '🏷 Subject retag', what: 'Fixes the subject label on the last two days of bot questions.', when: '04:10' },
  { key: 'day-review', group: 'reviews', label: '🌅 Day review', what: 'Reads yesterday\'s bot answers and sends you the digest.', when: '05:00' },
  { key: 'find-review', group: 'reviews', label: '🔍 Find review', what: 'Checks yesterday\'s Find-a-question matches.', when: '05:30' },
  { key: 'bot-review', group: 'reviews', label: '🤖 Bot review', what: 'Turns the day review\'s findings into fixes and proposals.', when: '05:45' },
  { key: 'marking-review', group: 'reviews', label: '🔎 Marked-page reader', what: 'Looks at yesterday\'s marked pages as the student saw them.', when: '06:15' },
  { key: 'marking-fix', group: 'reviews', label: '🛠 Marking fixer', what: 'Fixes what the page reader found, on the bench.', when: '06:45' },
  { key: 'marking-learn', group: 'reviews', label: '🎓 Learn from my corrections', what: 'Reads the marks and notes you changed; a mistake you fixed twice or more becomes a proposed fix for you to ship.', when: '07:15' },
  { key: 'doc-sweep', group: 'reviews', label: '🧹 Stale-doc sweep', what: 'Finds instructions in the docs that no longer match the code; fixes the obvious ones and asks you about the rest.', when: 'Sundays 07:20' },
  { key: 'progress-notes', group: 'reviews', label: '📝 Progress notes', what: 'Writes the progress note on each student card that has new work: how they are doing, why, next steps — numbers from the data only.', when: '17:05' },
  { key: 'morning-brief', group: 'reviews', label: '☀️ Morning brief', what: 'One message each morning: what happened overnight, what broke, and the few things only you can decide. It only reads and sends; it changes nothing.', when: '07:45' },
  { key: 'worksheets', group: 'requests', label: '📝 Telegram worksheets', what: 'Builds the worksheets asked for with /ws.', when: 'checks every 10 min' },
  { key: 'proposals', group: 'requests', label: '🚢 Ship or drop a proposal', what: 'Acts on "ship proposal …" sent from Telegram.', when: 'checks every minute' },
  { key: 'flagjudge', group: 'requests', label: '🤔 Flag judge', what: 'Settles a student\'s flag the first check could not.', when: 'checks every minute' },
  { key: 'flag-review', group: 'requests', label: '🚩 Same-day flag review', what: 'When a student\'s flag shows the bot was wrong, finds why the same day and proposes the fix.', when: 'checks every 10 min' },
  { key: 'plan-reads', group: 'requests', label: '✍️ Answer reader', what: 'Reads the English practice answers students hand in, on the plan (no paid key).', when: 'checks every minute' },
];

export interface WorkerJobState { on: boolean; at: string | null; by: string | null }
export type WorkerJobMap = Record<string, WorkerJobState>;

const KNOWN = new Set(WORKER_JOBS.map(j => j.key));
export function isWorkerJob(key: unknown): key is string { return typeof key === 'string' && KNOWN.has(key); }

/** The Airtable Value string → the map. Unknown keys are dropped; anything unreadable = everything on. */
export function parseWorkerJobs(value: unknown): WorkerJobMap {
  try {
    const o = JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
    const out: WorkerJobMap = {};
    for (const [k, v] of Object.entries(o)) {
      if (!isWorkerJob(k) || !v || typeof v !== 'object') continue;
      const s = v as Record<string, unknown>;
      out[k] = { on: s.on !== false, at: typeof s.at === 'string' ? s.at : null, by: typeof s.by === 'string' ? s.by : null };
    }
    return out;
  } catch {
    return {};
  }
}

/** The job keys that are OFF — what the worker reads. */
export function offJobs(map: WorkerJobMap): string[] {
  return Object.entries(map).filter(([, s]) => !s.on).map(([k]) => k).sort();
}

/** Flip one job; the rest of the map is kept as it was. */
export function withWorkerJob(map: WorkerJobMap, key: string, on: boolean, by: string, at = new Date().toISOString()): WorkerJobMap {
  return { ...map, [key]: { on, at, by } };
}

export interface WorkerJobRow extends WorkerJob, WorkerJobState {}
export function workerJobRows(map: WorkerJobMap): WorkerJobRow[] {
  return WORKER_JOBS.map(j => ({ ...j, ...(map[j.key] ?? { on: true, at: null, by: null }) }));
}
