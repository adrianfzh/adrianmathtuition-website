'use client';

// 🎟 Invite a friend — the slim row near the top of /app Home (every student,
// beta included). Expands into a small card with the student's personal
// /join?ref=<account id> link, Copy, and native share (navigator.share where
// the platform has it, copy otherwise). Pure client UI — the link is composed
// server-side on Home via lib/portal-join.inviteLinkFor; no API involved.
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
    <div className="bg-white rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:scale-[0.99] transition"
      >
        <span className="shrink-0">🎟</span>
        <span className="flex-1 text-sm font-semibold text-navy">Invite a friend</span>
        <span className={`shrink-0 text-slate-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[13px] text-gray-600 leading-snug">
            Your friend gets practice, mock papers and marking — S$29 for 30 days.
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
      )}
    </div>
  );
}
