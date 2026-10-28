// The P&C coach's pictures: a `pc_arrange` spec (lib/pc-explain) drawn by the bot's
// figure library (bot lib/figures/margin/pc_arrange.js, through its /api/figure-render
// door — the same door the twin pipeline uses). The bot RECOMPUTES every count in the
// picture and refuses a spec whose numbers disagree, so a picture that comes back is
// right by construction. Fail-soft: no picture (null) when the bot is unreachable or
// refuses; the written working is always shown.
import { botInternalSecret } from './bot-secret';

const cache = new Map<string, string | null>();

/** The picture as an <img> data URL (an inline SVG would share ids with others on the page). */
export async function pcPicture(spec: Record<string, unknown> | null): Promise<string | null> {
  if (!spec) return null;
  const key = JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key)!;
  const base = (process.env.BOT_BASE_URL || '').trim().replace(/\/$/, '');
  const secret = botInternalSecret();
  if (!base || !secret) return null;
  try {
    const r = await fetch(`${base}/api/figure-render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ spec }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await r.json().catch(() => ({}));
    const svg = r.ok && j.ok && typeof j.svg === 'string' ? j.svg : null;
    const url = svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : null;
    if (cache.size > 500) cache.clear();
    if (url || r.status === 422 || j.ok === false) cache.set(key, url); // a refusal is final; a network error is retried
    return url;
  } catch {
    return null;
  }
}

/** Many pictures at once (a step's questions), in parallel. */
export async function pcPictures(specs: (Record<string, unknown> | null)[]): Promise<(string | null)[]> {
  return Promise.all(specs.map(pcPicture));
}
