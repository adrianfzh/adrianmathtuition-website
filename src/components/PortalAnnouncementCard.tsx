'use client';

// The dismissible "we added something new" card (lib/portal-announcement.ts).
// Starts hidden and only appears client-side once localStorage confirms this
// device hasn't dismissed this id — no SSR flash, no hydration mismatch.
// Private-mode localStorage failures degrade to "show it" (the ✕ still hides
// it for the rest of the page's life via state).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { announcementKey, type PortalAnnouncement } from '@/lib/portal-announcement';

export default function PortalAnnouncementCard({ announcement }: { announcement: PortalAnnouncement }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = !!window.localStorage.getItem(announcementKey(announcement.id)); } catch { dismissed = false; }
    if (!dismissed) setOpen(true);
  }, [announcement.id]);

  function dismiss() {
    setOpen(false);
    try { window.localStorage.setItem(announcementKey(announcement.id), '1'); } catch { /* private mode — hides for this visit only */ }
  }

  if (!open) return null;

  return (
    <div className="mb-4 rounded-2xl border border-[hsl(43,80%,80%)] bg-[hsl(45,100%,94%)] p-4 shadow-sm" role="status">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{announcement.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy text-sm">
            <span className="uppercase tracking-wider text-[10px] font-extrabold text-amber-700 mr-2">New</span>
            {announcement.title}
          </p>
          <p className="text-[13px] text-gray-700 mt-1 leading-relaxed">{announcement.body}</p>
          {announcement.cta && (
            <Link
              href={announcement.cta.href}
              onClick={dismiss}
              className="inline-block mt-2.5 text-[13px] font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-2"
            >
              {announcement.cta.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 -mt-1 -mr-1 text-gray-400 hover:text-navy px-2 py-1 text-sm"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
