'use client';

// 🎁 Invite a friend — lives in the /app top bar (Adrian, 2026-08-28: "making
// it at the top right corner"). The trigger is a labelled chip at EVERY width
// (2026-08-29: the bare emoji was invisible on a phone), and the sheet renders
// through a portal to <body> — fixed bottom sheet on phones, centred card on
// larger screens. The old version positioned it absolutely inside the header,
// where an ancestor clipped it and the hero card stacked above it.
// Pure client UI — the link is composed server-side in the layout via
// lib/portal-join.inviteLinkFor; no API involved.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function InviteFriend({ link, tuition }: { link: string; tuition: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the visible link is still selectable */ }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AdrianMath',
          text: 'Practise with me on AdrianMath — real school paper questions, marked on the spot.',
          url: link,
        });
        return;
      } catch { return; /* user cancelled the share sheet — not a copy request */ }
    }
    copy();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-navy/20 bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5 active:scale-95 transition"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden>🎁</span>
        Invite
      </button>
      {open && mounted && createPortal(
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite a friend"
            className="fixed z-[90] inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[24rem] sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-bold text-navy">🎁 Invite a friend</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <p className="text-[13px] text-gray-600 leading-snug">
              Your friend gets 3 days free, then S$29 for 30 days — practice, mock papers and marking.
            </p>
            {/* The reward differs by account type (Adrian, 2026-08-29):
                tuition students get a real-world treat (manual, ping-driven);
                self-serve students get S$10 of pass time automatically. Both
                fire only when the friend PAYS — so a schoolmate who is
                already Adrian's student can never trigger one. */}
            <p className="text-[13px] text-gray-600 leading-snug">
              {tuition
                ? 'And when your friend gets their first pass, Adrian sends you a treat 🎁'
                : 'And when your friend gets their first pass, you get S$10 of pass time free 🎁'}
            </p>
            <p className="text-xs font-mono text-slate-500 bg-slate-50 border border-black/5 rounded-xl px-3 py-2 break-all select-all">
              {link}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex-1 border border-navy/20 text-navy rounded-xl py-2.5 text-sm font-semibold hover:bg-navy/5 active:scale-[0.98] transition"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={share}
                className="flex-1 bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition"
              >
                Share
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
