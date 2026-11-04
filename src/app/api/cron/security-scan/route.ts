// GET /api/cron/security-scan — 🔐 the weekly security-and-privacy check (4 Nov 2026,
// Adrian: "do it"). Rules and wording → lib/security-scan.ts; fetching → lib/security-scan-store.ts.
//
// Called by the bot's 5:45 morning fixer on Mondays (bot repo .claude/skills/bot-review/SKILL.md
// §1f) with the worker's admin token; the fixer puts `lines` into its digest, so this route
// sends nothing itself. Silence (`lines: []`) when nothing is new.
//
//   ?dry=1 → read and compare, but do not save this run as the new list (no stamp).
//
// Stamps job_runs `security-scan` with meta.keys = this run's findings — next week's
// "last list". A failure stamps ok=false and answers 500 with a plain error.
// Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { reportLines, resolvedKeys, scanSummary, toReport } from '@/lib/security-scan';
import { lastKeys, scanProject } from '@/lib/security-scan-store';
import { cronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const [maths, science, prev] = await Promise.all([scanProject('maths'), scanProject('science'), lastKeys()]);
    const now = [...maths, ...science];
    const report = toReport(now, prev);
    const resolved = resolvedKeys(now, prev);
    const summary = scanSummary(now, report, resolved, prev === null)
      + (dry ? ' (dry run — nothing saved)' : '');
    if (!dry) {
      await logJobRun('security-scan', true, summary, {
        keys: now.map((f) => f.key),
        reported: report.map((f) => f.key),
        resolved,
      });
    }
    return NextResponse.json({
      ok: true, dry, firstRun: prev === null, summary,
      lines: reportLines(report),
      report, resolved,
      counts: { error: now.filter((f) => f.level === 'ERROR').length, warn: now.filter((f) => f.level === 'WARN').length, privacy: now.filter((f) => f.level === 'PRIVACY').length },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry) await logJobRun('security-scan', false, `the weekly security check could not run: ${msg}`.slice(0, 300));
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
