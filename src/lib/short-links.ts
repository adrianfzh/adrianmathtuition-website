// 🎬 Short-video links — adrianmathtuition.com/s/<code> (5 Nov 2026, SPEC-CLIP-PIPELINE.md §10).
//
// Each "common trap" Short (data/shorts/<slug>.json, made by scripts/shorts/) carries its own
// link in its YouTube description, so Adrian can see which Short brought people to the site.
// The link counts the visit (table short_link_clicks — code, time, the site it came from, a robot
// guess; nothing personal) and sends the visitor on with UTM tags on the address.
//
// WHERE IT SENDS PEOPLE: SHORT_LINK_DESTINATION. Today the home page — the free practice for a
// stranger (SPEC-PLANS.md free tier) is still switched off on the main site. When
// PLANS_OPEN_TO_STUDENTS opens, point this at the free sign-up.
import perp from '../../data/shorts/trap-perpendicular-gradient.json';
import vector from '../../data/shorts/trap-vector-ratio.json';
import sets from '../../data/shorts/trap-sets-exactly-one.json';
import prop from '../../data/shorts/trap-inverse-square.json';
import percent from '../../data/shorts/trap-reverse-percentage.json';
import cubes from '../../data/shorts/trap-hcf-cubes.json';
import tangent from '../../data/shorts/trap-tangent-sign.json';
import below from '../../data/shorts/trap-curve-below-axis.json';
import trig from '../../data/shorts/trap-divide-by-sin.json';
import ineq from '../../data/shorts/trap-multiply-by-x.json';

export const SHORT_LINK_DESTINATION = '/';
export const SHORT_LINK_COOKIE = 'am_short';
export const SHORT_LINK_CAMPAIGN = 'common-traps';

export interface ShortInfo { slug: string; code: string; level: string; topic: string; title: string }

export const SHORTS: ShortInfo[] = [perp, vector, sets, prop, percent, cubes, tangent, below, trig, ineq]
  .map(s => ({ slug: s.slug, code: s.code, level: s.level, topic: s.topic, title: s.youtube.title }));

const CODE_RE = /^[a-z0-9]{2,12}$/;

export function shortByCode(code: string): ShortInfo | null {
  const c = String(code || '').toLowerCase();
  if (!CODE_RE.test(c)) return null;
  return SHORTS.find(s => s.code === c) ?? null;
}

/** Where a visit to /s/<code> goes: the destination with UTM tags (an unknown code: home, untagged). */
export function shortLinkTarget(code: string, destination = SHORT_LINK_DESTINATION): string {
  const s = shortByCode(code);
  if (!s) return '/';
  const q = new URLSearchParams({ utm_source: 'youtube', utm_medium: 'shorts', utm_campaign: SHORT_LINK_CAMPAIGN, utm_content: s.code });
  return `${destination}${destination.includes('?') ? '&' : '?'}${q.toString()}`;
}

/** A rough robot guess from the user agent (link previews, crawlers) — the agent itself is never kept. */
export function looksLikeBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|preview|facebookexternalhit|slurp|whatsapp|telegram|discord|curl|wget|python|headless/i.test(userAgent);
}

/** The visit came from this site's host only ("m.youtube.com"), never the full address. */
export function refererHost(referer: string | null): string | null {
  if (!referer) return null;
  try { return new URL(referer).host.slice(0, 100) || null; } catch { return null; }
}
