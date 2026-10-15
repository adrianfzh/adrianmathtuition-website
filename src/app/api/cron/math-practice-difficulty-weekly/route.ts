// GET /api/cron/math-practice-difficulty-weekly — Mondays 9am SGT (0 1 * * 1 UTC), 15 Oct 2026.
// The weekly line to Adrian about maths practice levels students' results moved — the same
// handler as the nightly job with ?weekly=1 (see ../math-practice-difficulty/route.ts).
import { GET as nightly } from '../math-practice-difficulty/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  u.searchParams.set('weekly', '1');
  return nightly(new Request(u, { headers: req.headers }));
}
