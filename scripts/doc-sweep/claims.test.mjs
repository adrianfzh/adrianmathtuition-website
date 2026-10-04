// The stale-doc sweeper's pure half (scripts/doc-sweep/claims.mjs). Run by `npm test`.
import { describe, it, expect } from 'vitest';
import {
  asPath, identifiersIn, routesIn, nearHistory, statedTimes, switchStates, switchTableClaims,
  workerTimes, routeResolves, judgeDoc, cronsIn,
} from './claims.mjs';

const ctx = (over = {}) => ({
  repo: 'web',
  pathExists: (p) => (['src/lib/sgt.ts', 'lib/sgt.ts'].includes(p) ? p : null),
  pathHistory: (p) => (p === 'ai/margin-diagram.js' ? { kind: 'renamed', to: 'lib/figures/margin-kit.js', toAsWritten: 'lib/figures/margin-kit.js', date: '2026-09-21' } : null),
  hasToken: (t) => ['sgtTodayISO', 'JOB_RHYTHMS', 'FIND_OPEN_TO_STUDENTS'].includes(t),
  isTable: (t) => t === 'job_runs',
  routeExists: (r) => r === '/api/job-log',
  skillExists: (n) => n === 'marking-review',
  modelKnown: (id) => id === 'claude-opus-5-5',
  crons: [{ path: '/api/send-invoices', schedule: '0 2 15 * *' }],
  switches: { FIND_OPEN_TO_STUDENTS: true },
  ...over,
});

describe('claim extraction', () => {
  it('reads repo paths and rejects prose, URLs and templates', () => {
    expect(asPath('src/lib/sgt.ts')).toBe('src/lib/sgt.ts');
    expect(asPath('lib/sgt.ts:42')).toBe('lib/sgt.ts');
    expect(asPath('docs/OPS.md#rhythms')).toBe('docs/OPS.md');
    expect(asPath('https://x.com/a.ts')).toBeNull();
    expect(asPath('runs/<id>/cover.png')).toBeNull();
    expect(asPath('two words.ts')).toBeNull();
    expect(asPath('~/dev/adrianmath-telegram-math-bot/lib/x.js')).toBe('@bot:lib/x.js');
  });
  it('reads identifiers from code-shaped spans only', () => {
    expect(identifiersIn('sgtTodayISO()')).toEqual(['sgtTodayISO']);
    expect(identifiersIn('MARKING_PEN_V2=1')).toEqual(['MARKING_PEN_V2']);
    expect(identifiersIn('result_json.handin_check')).toEqual(['result_json', 'handin_check']);
    expect(identifiersIn('a long prose span with many words')).toEqual([]);
    expect(identifiersIn('short')).toEqual([]);
  });
  it('reads routes, crons and SGT times', () => {
    expect(routesIn('POST `/api/admin/papers?x=1` and /app/marking/[id].')).toEqual(['/api/admin/papers', '/app/marking/[id]']);
    expect(routesIn('/app/worker/fly/learn.sh')).toEqual([]);
    expect(routesIn('`/api/admin/mark-triage/route.ts`')).toEqual(['/api/admin/mark-triage']);
    expect(cronsIn('`0 2 15 * *` UTC')).toEqual(['0 2 15 * *']);
    expect(statedTimes('4:15am + 4:15pm')).toEqual(['04:15', '16:15']);
    expect(statedTimes('nightly 5am')).toEqual(['05:00']);
    expect(statedTimes('04:15 and 16:15')).toEqual(['04:15', '16:15']);
  });
  it('knows a claim the doc names on purpose as gone', () => {
    expect(nearHistory('the old `lib/x.ts` was deleted on 21 Sep', 'lib/x.ts')).toBe(true);
    expect(nearHistory('Read `lib/x.ts` before touching marking.', 'lib/x.ts')).toBe(false);
    expect(nearHistory('| ~~`/api/x/y`~~ | — | NEVER EXISTED |', '/api/x/y')).toBe(true);
    expect(nearHistory('GONE: search, the clipper (`/api/portal/my-notes`, `lib/portal-notes`)', '/api/portal/my-notes')).toBe(true);
  });
});

describe('the live-system readers', () => {
  it('reads switch states and the CLAUDE.md table', () => {
    expect(switchStates('export const FIND_OPEN_TO_STUDENTS = true;\nexport const NOTES_OPEN_TO_STUDENTS = false;')).toEqual({ FIND_OPEN_TO_STUDENTS: true, NOTES_OPEN_TO_STUDENTS: false });
    const rows = switchTableClaims(['| `NOTES_OPEN_TO_STUDENTS` | closed | x |', '| `FIND_OPEN_TO_STUDENTS`, `X_OPEN_TO_STUDENTS` | **open** | y |']);
    expect(rows).toEqual([{ line: 1, name: 'NOTES_OPEN_TO_STUDENTS', open: false }, { line: 2, name: 'FIND_OPEN_TO_STUDENTS', open: true }, { line: 2, name: 'X_OPEN_TO_STUDENTS', open: true }]);
  });
  it('reads the worker scheduler times from jobs.sh and a sourced file', () => {
    const jobs = 'for spec in "day-review|05:00|" "day-review|17:00|" "bot-review|05:45|"; do';
    const learn = '  if due=$(due_epoch 07:15); then\n    [ -f "$SCHED/marking-learn.last" ] || echo';
    expect(workerTimes(jobs, [learn])).toEqual({ 'day-review': ['05:00', '17:00'], 'bot-review': ['05:45'], 'marking-learn': ['07:15'] });
  });
  it('resolves routes through dynamic segments and route groups', () => {
    const entries = [['api', 'admin', 'papers'], ['app', 'marking', '[id]'], ['(site)', 'notes', '[[...slug]]']];
    expect(routeResolves('/api/admin/papers', entries)).toBe(true);
    expect(routeResolves('/app/marking/abc', entries)).toBe(true);
    expect(routeResolves('/notes/s4/vectors', entries)).toBe(true);
    expect(routeResolves('/api/admin/nope', entries)).toBe(false);
  });
});

describe('judgeDoc', () => {
  it('flags a renamed path with its new name, and a missing route, name, model and cron', () => {
    const doc = [
      'Read `ai/margin-diagram.js` first.',
      'POST `/api/admin/missing` then `noSuchHelper()`.',
      'Uses `claude-opus-9-9` and `sgtTodayISO()` and `job_runs`.',
      '- `send-invoices` — `0 2 16 * *` UTC',
      'The old `lib/old.ts` was deleted.',
      '```', '`inFenceIgnored()`', '```',
    ].join('\n');
    const f = judgeDoc(doc, ctx());
    expect(f.map(x => [x.line, x.kind, x.claim])).toEqual([
      [1, 'path', 'ai/margin-diagram.js'],
      [2, 'name', 'noSuchHelper'],
      [2, 'route', '/api/admin/missing'],
      [3, 'model', 'claude-opus-9-9'],
      [4, 'cron', '`0 2 16 * *`'],
    ]);
    expect(f[0].fix).toEqual({ from: 'ai/margin-diagram.js', to: 'lib/figures/margin-kit.js' });
  });
  it('reads the line before as part of the same paragraph', () => {
    const doc = '- **Dead wiring deleted**: removed the cron job +\n  `/api/admin/missing` and the read.';
    expect(judgeDoc(doc, ctx())).toEqual([]);
  });
  it('flags a switch state and an old Desktop repo path', () => {
    const f = judgeDoc('`FIND_OPEN_TO_STUDENTS = false` · cd ~/Desktop/adrianmathtuition-website', ctx());
    expect(f.map(x => x.kind)).toEqual(['switch', 'path']);
    expect(f[1].fix.to).toBe('~/dev/adrianmathtuition-website');
  });
});
