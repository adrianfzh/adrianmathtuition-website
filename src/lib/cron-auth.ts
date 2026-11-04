import { safeEqual } from '@/lib/safe-equal';

/**
 * The one door for scheduled jobs (every route in vercel.json `crons`, and the jobs the bot's
 * fixer calls each morning).
 *
 * Opens for:
 *   - `Authorization: Bearer <CRON_SECRET>` — what Vercel's cron sends when CRON_SECRET is set
 *     (it is, in Development, Preview and Production — checked 4 Nov 2026);
 *   - `Authorization: Bearer <ADMIN_PASSWORD>` — Adrian from the desk or a script.
 *
 * It does NOT accept the `x-vercel-cron: 1` header. Until 4 Nov 2026 the 49 cron routes each had
 * their own copy of this check and every copy took that header as proof the call came from
 * Vercel's scheduler. The header is not stripped at the edge — a plain curl with it got a 200
 * from production (marking-stall?dry=1) — so anyone could start the invoice run, the backups or
 * a 3 GB Puppeteer job. docs/REVIEW-2026-11-04.md A1. `cron-auth.test.ts` keeps the header out.
 */
export function cronAuth(req: { headers: { get(name: string): string | null } }): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET;
  const admin = process.env.ADMIN_PASSWORD;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}
