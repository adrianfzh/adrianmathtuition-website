// Fire-and-forget client telemetry into portal_event_log via POST
// /api/portal/event — the install card + push nudge funnel (kinds bounded in
// lib/install-prompt.ts PORTAL_CLIENT_EVENT_KINDS). Same shape as the lesson
// player's beacons: deduped per page load, keepalive so a tap that navigates
// away still lands, every failure (network, or Adrian's account-less admin
// session getting a 401) silently dropped. Telemetry must never make a card
// stutter.
import type { PortalClientEventKind } from './install-prompt';

const sent = new Set<string>();

export function logPortalEvent(kind: PortalClientEventKind): void {
  if (typeof window === 'undefined' || sent.has(kind)) return;
  sent.add(kind);
  fetch('/api/portal/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
    keepalive: true,
  }).catch(() => { /* best effort */ });
}
