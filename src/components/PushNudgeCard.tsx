'use client';

// "Turn on notifications" — the one-tap push nudge on /app, the mirror image
// of the install card: it appears only INSIDE the installed app (standalone),
// only while the browser has never been asked (Notification.permission
// 'default'), students only, once per page load. The tap runs the SAME enable
// flow as the Settings toggle (lib/portal-push-client enablePush) — permission
// is requested inside the tap handler, never on load (browser rule, and
// manners). Denied → the browser remembers, the card is gone for good.
// Granted → subscribed → a ✓ for a moment, then gone. ✕ → 14-day rest.
import { useEffect, useState } from 'react';
import { claimHomePush, refreshInstallStore, snoozePushNudge, useInstallStore } from './portal-install-store';
import { enablePush } from '@/lib/portal-push-client';
import { logPortalEvent } from '@/lib/portal-event';

const HOME_CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-4';
const BTN = 'inline-flex items-center gap-1.5 text-[13px] font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-2 active:scale-[0.98] transition disabled:opacity-60';

export const PUSH_NUDGE_TITLE = 'Turn on notifications';
export const PUSH_NUDGE_BODY = 'We’ll tell you when your paper is marked — and when Adrian sends you work.';

function BellIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function PushNudgeCard({ adminViewer = false }: { adminViewer?: boolean }) {
  const snap = useInstallStore();
  // This instance's claim token — stable for its life, new on every mount.
  const [token] = useState(() => ({}));
  const mine = snap.homePushOwner === token;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [note, setNote] = useState('');

  const eligible = !adminViewer && snap.ready && snap.push === 'show';

  // Claim the once-per-page-load slot (store = external system; the claim
  // re-renders us with `mine` true — nothing is set inside the effect).
  useEffect(() => {
    if (!eligible || snap.homePushOwner !== null) return;
    claimHomePush(token);
    logPortalEvent('push:nudge-shown');
  }, [eligible, snap.homePushOwner, token]);

  // Keep the ✓ on screen for a beat after permission flips to granted (which
  // makes the store say 'decided' and would otherwise unmount the card).
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setHidden(true), 2500);
    return () => window.clearTimeout(t);
  }, [done]);

  if (!mine || hidden || !(eligible || done)) return null;

  async function turnOn() {
    setBusy(true);
    setNote('');
    const r = await enablePush();
    refreshInstallStore(); // Notification.permission may have changed
    setBusy(false);
    if (r.ok) {
      logPortalEvent('push:nudge-on');
      setNote('✓ On — we’ll ping you when a paper is back.');
      setDone(true);
      return;
    }
    if (r.reason === 'denied') {
      // The browser's permanent answer; the store now reads 'denied' →
      // 'decided' → not eligible → gone for good.
      logPortalEvent('push:nudge-denied');
      setHidden(true);
      return;
    }
    if (r.reason === 'default') {
      setNote('No worries — tap Turn on whenever you like.');
      return;
    }
    setNote('Couldn’t turn them on — try again from Settings.');
  }

  function dismiss() {
    logPortalEvent('push:nudge-dismissed');
    snoozePushNudge(); // → 'snoozed' → not eligible → gone
  }

  return (
    <div className={`${HOME_CARD} flex items-start gap-3`} role="status" data-push-nudge>
      <span aria-hidden className="flex items-center justify-center w-10 h-10 rounded-2xl bg-navy text-[hsl(43,90%,60%)] shrink-0">
        <BellIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy leading-tight">{PUSH_NUDGE_TITLE}</p>
        <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{PUSH_NUDGE_BODY}</p>
        {!done && (
          <button type="button" onClick={turnOn} disabled={busy} className={`${BTN} mt-2.5`}>
            <BellIcon className="w-4 h-4" /> {busy ? 'Turning on…' : 'Turn on'}
          </button>
        )}
        {note && <p className={`text-[13px] mt-1.5 ${note.startsWith('✓') ? 'text-green-700' : 'text-slate-600'}`}>{note}</p>}
      </div>
      {!done && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          title="Not now"
          className="shrink-0 -mt-1 -mr-1 text-slate-400 hover:text-navy px-2 py-1 text-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}
