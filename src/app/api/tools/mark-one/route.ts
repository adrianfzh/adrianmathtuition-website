import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  DAY_MS,
  DEFAULT_DAILY_LIMIT,
  checkRateLimit,
  clientIpFrom,
  rateLimitKeys,
  retryAfterSeconds,
} from '@/lib/tool-rate-limit';

// ── "Mark one question free" — SCAFFOLD, flagged off ─────────────────────────
//
// The taste endpoint behind the public model-solutions library: a visitor sends
// one question + their attempt and gets it marked, once a day. The grading
// hookup is a LATER task; today the handler runs the quota and then returns 501
// so the limiter, cookie and headers can be exercised end-to-end without any
// model spend.
//
// Gate: TOOLS_MARK_ONE_ENABLED must be exactly 'true'. Unset → 404 (not 403),
// so an unreleased endpoint is indistinguishable from a route that isn't there.
//
// TODO monitoring policy: per CLAUDE.md, every parent/student-facing surface
// gets a `timed(...)` entry in /api/health-check. Deliberately NOT added while
// the flag is off — a health check probing a 404 would alert forever. Add the
// health-check entry in the SAME change that flips TOOLS_MARK_ONE_ENABLED on
// and wires the real grading call.

export const runtime = 'nodejs';

const VISITOR_COOKIE = 'amt_tool_v';

// In-memory store: fine for a 1/day courtesy quota (a serverless instance holds
// it for its lifetime, and losing it just gifts a visitor one extra try). Move
// to a shared KV before the limit is load-bearing against real abuse.
const hitsByKey = new Map<string, number[]>();

function enabled(): boolean {
  return process.env.TOOLS_MARK_ONE_ENABLED === 'true';
}

export async function POST(req: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });

  const now = Date.now();
  const ip = clientIpFrom(req.headers.get('x-forwarded-for'));
  const existingVisitor = req.cookies.get(VISITOR_COOKIE)?.value || null;
  const visitorId = existingVisitor || randomUUID();
  const keys = rateLimitKeys(ip, visitorId);

  // Every key must have room; a block on any one blocks the request, and nothing
  // is written when it does.
  const decisions = keys.map((key) => ({
    key,
    decision: checkRateLimit(hitsByKey.get(key) ?? [], now),
  }));
  const blocked = decisions.find((d) => !d.decision.allowed);

  if (blocked) {
    const res = NextResponse.json(
      {
        error: 'daily_limit',
        message: `Free marking is limited to ${DEFAULT_DAILY_LIMIT} question a day. Try again tomorrow, or message Adrian on WhatsApp.`,
      },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(retryAfterSeconds(blocked.decision.retryAfterMs)));
    return res;
  }

  for (const { key, decision } of decisions) hitsByKey.set(key, decision.nextHits);

  // TODO: hand the question + attempt to the marking pipeline here and return
  // the marked result. Until then the quota has been spent honestly and the
  // caller is told plainly that nothing is wired up yet.
  const res = NextResponse.json(
    { error: 'not_enabled', message: 'not yet enabled' },
    { status: 501 },
  );
  if (!existingVisitor) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DAY_MS / 1000,
    });
  }
  return res;
}

export async function GET() {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ enabled: true, limitPerDay: DEFAULT_DAILY_LIMIT, ready: false });
}
