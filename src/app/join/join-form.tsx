'use client';

// Stranger signup form for /join — mirrors the tuition activate flow
// (signup/PortalActivate.tsx): same PDPA "what's stored" box, same explicit
// consent checkbox, same create-then-signInWithPassword handoff. Extra fields
// for strangers: name (no Airtable record to read it from) and level (drives
// the practice pickers via portal_accounts.level).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import { JOIN_LEVELS } from '@/lib/portal-join';

export default function JoinForm({ refId, trial }: { refId: string | null; trial: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!level) return setError('Pick your level.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    if (!consent) return setError('Please tick the agreement box to continue.');
    setBusy(true);
    const res = await fetch('/api/portal/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, level, email, password, consent, ref: refId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Something went wrong — try again.');
      setBusy(false);
      return;
    }
    // Account created — sign in and enter the app. A referred signup starts a
    // 3-day trial pass and lands straight inside the portal; without one, the
    // /app layout gate sends the new account on to /app/pass for the 30-day
    // pass.
    const { error: signInErr } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
    router.replace(signInErr ? '/login' : '/app');
  }

  const input = 'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30';

  return (
    <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6">
      <h2 className="text-base font-bold text-navy mb-4">Create your account</h2>

      <div className="rounded-xl bg-[hsl(45,80%,96%)] border border-amber-200/60 p-4 mb-4 text-[13px] text-gray-700 leading-relaxed">
        <p className="font-semibold text-navy mb-1">What&apos;s stored and why</p>
        <p>
          Your name, level, login email, practice attempts and marking feedback are stored to power
          the practice loop and progress tracking. Work is graded by an AI service without your
          name attached. You (or your parents) can ask for an export or full deletion at any time.
          Full details: <Link href="/privacy" target="_blank" className="text-navy underline underline-offset-2">privacy policy</Link> —
          worth showing your parents too.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text" required autoComplete="name"
          placeholder="Your name"
          value={name} onChange={e => setName(e.target.value)}
          className={input}
        />
        <select
          required value={level} onChange={e => setLevel(e.target.value)}
          className={`${input} ${level ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <option value="" disabled>Your level</option>
          {JOIN_LEVELS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <input
          type="email" required autoComplete="email"
          placeholder="Your login email"
          value={email} onChange={e => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password" required autoComplete="new-password"
          placeholder="Choose a password (min 8 characters)"
          value={password} onChange={e => setPassword(e.target.value)}
          className={input}
        />
        <input
          type="password" required autoComplete="new-password"
          placeholder="Repeat password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className={input}
        />
        <label className="flex items-start gap-2.5 text-[13px] text-gray-700 pt-1 cursor-pointer">
          <input
            type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#1F2A5C]"
          />
          <span>
            I&apos;ve read what&apos;s stored above and agree to AdrianMath storing and processing
            my data as described in the{' '}
            <Link href="/privacy" target="_blank" className="text-navy underline underline-offset-2">privacy policy</Link>.
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-[11px] text-gray-400 text-center">
          {trial
            ? 'Next: your first 3 days are free — then S$29 for 30 days.'
            : 'Next: pick up your 30-day pass (S$29) and you’re in.'}
        </p>
      </form>
    </div>
  );
}
