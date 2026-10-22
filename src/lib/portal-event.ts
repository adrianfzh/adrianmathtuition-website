// Fire-and-forget client telemetry into portal_event_log via POST
// /api/portal/event — the install card + push nudge funnel (kinds bounded in
// lib/install-prompt.ts PORTAL_CLIENT_EVENT_KINDS). Same shape as the lesson
// player's beacons: deduped per page load, keepalive so a tap that navigates
// away still lands, every failure (network, or Adrian's account-less admin
// session getting a 401) silently dropped. Telemetry must never make a card
// stutter.
import type { PortalClientEventKind } from './install-prompt';
import type { FixEventDetail, FixEventKind } from './fix-one-events';

const sent = new Set<string>();

/** `detail` only for the kinds that carry one (Fix one); the dedupe key includes it. */
export function logPortalEvent(kind: PortalClientEventKind): void;
export function logPortalEvent(kind: FixEventKind, detail: FixEventDetail): void;
export function logPortalEvent(kind: PortalClientEventKind | FixEventKind, detail?: FixEventDetail): void {
  const key = detail ? `${kind}|${JSON.stringify(detail)}` : kind;
  if (typeof window === 'undefined' || sent.has(key)) return;
  sent.add(key);
  fetch('/api/portal/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(detail ? { kind, detail } : { kind }),
    keepalive: true,
  }).catch(() => { /* best effort */ });
}
