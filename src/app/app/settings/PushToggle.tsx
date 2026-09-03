'use client';

// "🔔 Notify me when my marked paper is ready" — the web-push opt-in card on
// /app/settings. Enable: ask permission → register /sw.js → subscribe → POST
// /api/portal/push. Disable: unsubscribe → DELETE. State reflects the
// browser's actual subscription on load, not a stored preference.
//
// The enable/disable flow itself lives in lib/portal-push-client.ts since
// 2026-09-03 — the Home push nudge (components/PushNudgeCard.tsx) runs the
// identical steps; this file only maps outcomes to the toggle's messages.
//
// iPhone: Safari only exposes PushManager to web apps installed on the Home
// Screen (iOS 16.4+), so an un-installed visit shows the install steps
// (components/InstallCard InstallSteps — the same words as everywhere else)
// instead of a toggle that could never work.
import { useEffect, useState } from 'react';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/portal-push-client';
import { InstallSteps } from '@/components/InstallCard';
import { useInstallStore } from '@/components/portal-install-store';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

export default function PushToggle() {
  const snap = useInstallStore();
  const [support, setSupport] = useState<'checking' | 'ok' | 'none'>('checking');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setSupport('none');
        return;
      }
      const sub = await currentPushSubscription();
      if (!cancelled) {
        setEnabled(!!sub);
        setSupport('ok');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg('');
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setEnabled(true);
      setMsg('✓ On — you\'ll get a notification when a marked paper is released.');
    } else if (r.reason === 'denied') {
      setMsg('Notifications are blocked for this site — allow them in your browser settings, then try again.');
    } else if (r.reason === 'default') {
      setMsg('Notification permission was not granted.');
    } else {
      setMsg('Could not turn notifications on — try again.');
    }
  }

  async function disable() {
    setBusy(true);
    setMsg('');
    try {
      await disablePush();
      setEnabled(false);
      setMsg('Notifications are off.');
    } catch {
      setMsg('Could not turn notifications off — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card} data-push-toggle={support}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Notifications</p>

      {support === 'none' ? (
        <>
          <p className="text-sm text-gray-600">
            {snap.platform === 'ios'
              ? 'On iPhone, notifications only work from the installed app — add AdrianMath to your Home Screen, then turn this on from there.'
              : 'This browser can’t show notifications for the portal — install AdrianMath on your phone and turn them on from there.'}
          </p>
          {snap.ready && <InstallSteps snap={snap} />}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-700">🔔 Notify me when my marked paper is ready</p>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Notify me when my marked paper is ready"
              disabled={busy || support === 'checking'}
              onClick={enabled ? disable : enable}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-navy' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>
          {msg && (
            <p className={`text-sm mt-1.5 ${msg.startsWith('✓') ? 'text-green-700' : 'text-gray-600'}`}>{msg}</p>
          )}
        </>
      )}
    </div>
  );
}
