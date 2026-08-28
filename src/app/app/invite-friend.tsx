'use client';

// 🎟 Invite a friend — lives in the /app top bar (Adrian, 2026-08-28: "making
// it at the top right corner"). The trigger is a compact 🎟 button; tapping it
// drops a small sheet with the student's personal /join?ref=<account id> link,
// Copy, and native share. Pure client UI — the link is composed server-side in
// the layout via lib/portal-join.inviteLinkFor; no API involved.
import { useState } from 'react';

export default function InviteFriend({ link }: { link: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-navy active:scale-95 transition"
        aria-expanded={open}
      >
        <span aria-hidden>🎟</span>
        <span className="hidden sm:inline">Invite</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-8 z-50 w-[min(20rem,calc(100vw-2rem))] bg-white rounded-2xl border border-black/5 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-navy">🎟 Invite a friend</p>
            <p className="text-[13px] text-gray-600 leading-snug">
              Your friend gets 3 days free, then S$29 for 30 days — practice, mock papers and marking.
            </p>
            {/* Kept generic on purpose — the reward differs by account type. */}
            <p className="text-[13px] text-gray-600 leading-snug">
              You get a thank-you reward when they join 🎁
            </p>
            <p className="text-xs font-mono text-slate-500 bg-slate-50 border border-black/5 rounded-xl px-3 py-2 break-all select-all">
              {link}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex-1 border border-navy/20 text-navy rounded-xl py-2 text-sm font-semibold hover:bg-navy/5 active:scale-[0.98] transition"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={share}
                className="flex-1 bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2 text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition"
              >
                Share
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
