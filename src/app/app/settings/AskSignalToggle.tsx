'use client';

// "💬 Count what I ask about" — the opt-in switch for the Notebook's
// Keeps-coming-up band (Adrian, 10 Sep 2026: a Settings toggle for student
// preferences, like Claude's). Saves `prefs.ask_signal` through the
// whitelisted /api/portal/settings route; the Notebook reads the flag on its
// next render (router.refresh() so the server tree picks the new value up).
// Nothing else changes when it flips — the lines are derived, never stored.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-fetch';
import { ASK_SIGNAL_MIN, ASK_SIGNAL_PREF } from '@/lib/ask-signal';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';

export default function AskSignalToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function flip() {
    const next = !on;
    setBusy(true);
    setMsg('');
    try {
      await portalFetch('/api/portal/settings', { json: { prefs: { [ASK_SIGNAL_PREF]: next } } });
      setOn(next);
      setMsg(next
        ? '✓ On — topics you keep asking about will show in My Notebook.'
        : 'Off — My Notebook only counts your marked papers and practice.');
      router.refresh();
    } catch {
      setMsg('Could not save — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card} data-ask-signal={on ? 'on' : 'off'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">My Notebook</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700">💬 Count what I ask about</p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Count what I ask about"
          disabled={busy}
          onClick={flip}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-navy' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      <p className="text-[12px] text-gray-500 mt-1.5">
        When this is on, a topic you ask about {ASK_SIGNAL_MIN}{' '}or more times in two weeks shows in My Notebook as
        &ldquo;keeps coming up&rdquo;. Asking isn&apos;t a mistake — it&apos;s only a nudge, and it fades by itself when you stop asking.
      </p>
      {msg && (
        <p className={`text-sm mt-1.5 ${msg.startsWith('✓') ? 'text-green-700' : 'text-gray-600'}`}>{msg}</p>
      )}
    </div>
  );
}
