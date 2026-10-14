'use client';

// 🔔 The one notifications ask (14 Oct 2026, Adrian: ask "once, right after their
// first marked paper comes back, instead of on every Home visit" → "yes").
// Replaces the Home push nudge (components/PushNudgeCard, shown 329 times to 11
// students; 4 phones turned it on).
//
// Lives on the marked-paper page. Shows the first time a student opens a marked
// paper on a device where the tap can work (lib/install-prompt pushAskState —
// an iPhone tab has no notifications until the app is on the Home Screen, so the
// ask waits for that). The moment it shows, the ACCOUNT remembers
// (prefs.push_asked via /api/portal/settings), so it is asked once per student,
// not once per phone. "Not now" also marks this device. "Turn on" runs the SAME
// flow as the Settings toggle (lib/portal-push-client enablePush) — permission is
// requested inside the tap, never on load.
import { useEffect, useState } from 'react';
import { claimHomePush, dismissPushNudge, refreshInstallStore, useInstallStore } from './portal-install-store';
import { enablePush } from '@/lib/portal-push-client';
import { portalFetch } from '@/lib/portal-fetch';
import { logPortalEvent } from '@/lib/portal-event';
import { pushAskState } from '@/lib/install-prompt';

const BTN = 'inline-flex items-center text-[13px] font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-1.5 active:scale-[0.98] transition disabled:opacity-60';
const BTN_QUIET = 'inline-flex items-center text-[13px] font-semibold text-slate-500 hover:text-navy rounded-xl px-2.5 py-1.5';

export const PUSH_ASK_LINE = 'Get a ping when your next paper is marked?';

export default function PushAskCard({ askedOnAccount }: {
  /** prefs.push_asked, read on the server (lib/install-prompt pushAskedOnAccount). */
  askedOnAccount: boolean;
}) {
  const snap = useInstallStore();
  // This instance's claim token — stable for its life, new on every mount.
  const [token] = useState(() => ({}));
  const mine = snap.homePushOwner === token;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [note, setNote] = useState('');

  const eligible = snap.ready && pushAskState({
    adminViewer: false,
    supported: snap.pushSupported,
    permission: snap.pushPermission,
    askedOnAccount,
    dismissedOnDevice: snap.pushDismissed,
  }) === 'show';

  // Claim the slot (store = external system; nothing is set inside the effect)
  // and tell the account it has now been asked — once, best-effort.
  useEffect(() => {
    if (!eligible || snap.homePushOwner !== null) return;
    claimHomePush(token);
    logPortalEvent('push:nudge-shown');
    portalFetch('/api/portal/settings', { json: { prefs: { push_asked: true } } }).catch(() => { /* the device flag on "Not now" still holds */ });
  }, [eligible, snap.homePushOwner, token]);

  // Keep the ✓ on screen for a beat after permission flips to granted.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setHidden(true), 2500);
    return () => window.clearTimeout(t);
  }, [done]);

  if (!mine || hidden) return null;

  async function turnOn() {
    setBusy(true);
    setNote('');
    const r = await enablePush();
    refreshInstallStore(); // Notification.permission may have changed
    setBusy(false);
    if (r.ok) {
      logPortalEvent('push:nudge-on');
      setNote('✓ On. We’ll ping you when a paper is back.');
      setDone(true);
      return;
    }
    if (r.reason === 'denied') {
      logPortalEvent('push:nudge-denied');
      setHidden(true);
      return;
    }
    if (r.reason === 'default') {
      setNote('No problem. You can turn it on in Settings.');
      return;
    }
    setNote('That didn’t work. Try again in Settings.');
  }

  function notNow() {
    logPortalEvent('push:nudge-dismissed');
    dismissPushNudge();
    setHidden(true);
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white shadow-sm px-3 py-2.5" role="status" data-push-ask>
      <p className="text-sm font-semibold text-navy">🔔 {PUSH_ASK_LINE}</p>
      {!done && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={turnOn} disabled={busy} className={BTN}>{busy ? 'Turning on…' : 'Turn on'}</button>
          <button type="button" onClick={notNow} disabled={busy} className={BTN_QUIET}>Not now</button>
        </div>
      )}
      {note && <p className={`text-[13px] mt-1.5 ${note.startsWith('✓') ? 'text-green-700' : 'text-slate-600'}`}>{note}</p>}
    </div>
  );
}
