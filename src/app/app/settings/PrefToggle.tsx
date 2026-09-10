'use client';

// One Settings switch bound to a `portal_accounts.prefs` boolean (SPEC-NOTEBOOK-V2
// §0: every feature that adds a control a student did not ask for is opt-in,
// off by default, one switch here). Saves through the whitelisted
// /api/portal/settings route and refreshes the server tree so the page that
// reads the pref picks it up on its next render. The switch owns no other
// state — the feature it gates derives everything on the server.
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-fetch';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

export default function PrefToggle({ pref, heading, label, description, onMessage, offMessage, initial, also }: {
  /** The prefs key — must be in lib/portal-prefs.ts PORTAL_PREF_KEYS. */
  pref: string;
  /** The small caption above the row ("My Notebook", "Home"). */
  heading: string;
  /** The row's own words, next to the switch. */
  label: string;
  /** What the switch does, in full — shown under the row. */
  description: ReactNode;
  onMessage: string;
  offMessage: string;
  initial: boolean;
  /** Extra keys written with every flip (e.g. a one-time notice's seen flag). */
  also?: Record<string, boolean>;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function flip() {
    const next = !on;
    setBusy(true);
    setMsg('');
    try {
      await portalFetch('/api/portal/settings', { json: { prefs: { ...(also ?? {}), [pref]: next } } });
      setOn(next);
      setMsg(next ? onMessage : offMessage);
      router.refresh();
    } catch {
      setMsg('Could not save — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card} data-pref={pref} data-pref-state={on ? 'on' : 'off'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{heading}</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700">{label}</p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={busy}
          onClick={flip}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-navy' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      <p className="text-[12px] text-gray-500 mt-1.5">{description}</p>
      {msg && (
        <p className={`text-sm mt-1.5 ${msg.startsWith('✓') ? 'text-green-700' : 'text-gray-600'}`}>{msg}</p>
      )}
    </div>
  );
}
