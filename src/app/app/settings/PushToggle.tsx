'use client';

// "🔔 Notify me when my marked paper is ready" — the web-push opt-in card on
// /app/settings. Enable: register /sw.js → ask permission → subscribe → POST
// /api/portal/push. Disable: unsubscribe → DELETE. State reflects the
// browser's actual subscription on load, not a stored preference.
//
// iPhone: Safari only exposes PushManager to web apps installed on the Home
// Screen (iOS 16.4+), so an un-installed visit shows the install hint instead
// of a toggle that could never work.
import { useEffect, useState } from 'react';
import { urlBase64ToUint8Array } from '@/lib/push-payload';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export default function PushToggle() {
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
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) {
          setEnabled(!!sub);
          setSupport('ok');
        }
      } catch {
        if (!cancelled) setSupport('ok');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg('');
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error('push key not configured');
      await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMsg(permission === 'denied'
          ? 'Notifications are blocked for this site — allow them in your browser settings, then try again.'
          : 'Notification permission was not granted.');
        return;
      }
      // `ready` waits for the worker to activate — subscribing on a
      // just-registered, not-yet-active worker throws in Chrome.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch('/api/portal/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        // Server didn't store it — undo the browser side so the toggle never
        // shows "on" for a subscription no push will ever reach.
        await sub.unsubscribe().catch(() => { /* best effort */ });
        throw new Error(`HTTP ${res.status}`);
      }
      setEnabled(true);
      setMsg('✓ On — you\'ll get a notification when a marked paper is released.');
    } catch {
      setMsg('Could not turn notifications on — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => { /* best effort */ });
        await fetch('/api/portal/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => { /* row self-cleans on the next expired send */ });
      }
      setEnabled(false);
      setMsg('Notifications are off.');
    } catch {
      setMsg('Could not turn notifications off — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Notifications</p>

      {support === 'none' ? (
        <p className="text-sm text-gray-600">
          On iPhone: open this site in Safari → Share →{' '}
          <span className="font-semibold">Add to Home Screen</span>, then turn this on from the
          installed app.
        </p>
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
