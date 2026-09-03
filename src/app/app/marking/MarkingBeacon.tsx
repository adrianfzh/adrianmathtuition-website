'use client';

// Portal activity visibility (2026-09-03): a tiny, invisible beacon for
// /app/marking. Renders nothing — it only fires two telemetry POSTs to
// /api/portal/event (see that route for the allow-list + write path):
//   - 'marking:view' once on mount (the student opened the Marked tab)
//   - 'marking:open' whenever they click an anchor tagged
//     data-track="marking:open" (opening a marked-script PDF)
// `keepalive: true` lets the request survive the tab navigating away to open
// the PDF. Failures are swallowed — this must never be able to break the page.
import { useEffect } from 'react';

function postEvent(kind: 'marking:view' | 'marking:open') {
  try {
    fetch('/api/portal/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* fire-and-forget */ }
}

export default function MarkingBeacon() {
  useEffect(() => {
    postEvent('marking:view');

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-track="marking:open"]')) postEvent('marking:open');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
