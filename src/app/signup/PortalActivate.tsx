'use client';

// Portal-invite branch of /signup (?token=xxx&portal=1).
// Parent opens the emailed link → sees what data is stored → ticks consent →
// helps the student set email + password → account created → signed in.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-client';

type TokenState =
  | { status: 'loading' }
  | { status: 'invalid'; reason: string }
  | { status: 'valid'; studentName: string };

export default function PortalActivate({ token }: { token: string }) {
  const router = useRouter();
  const [tok, setTok] = useState<TokenState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/activate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => setTok(d.valid
        ? { status: 'valid', studentName: d.studentName }
        : { status: 'invalid', reason: d.reason || 'This link is not valid.' }))
      .catch(() => setTok({ status: 'invalid', reason: 'Could not check this link — try again.' }));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    if (!consent) return setError('Please tick the consent box to continue.');
    setBusy(true);
    const res = await fetch('/api/portal/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, password, consent }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Something went wrong — try again.');
      setBusy(false);
      return;
    }
    // Account created — sign the student in and enter the app.
    const { error: signInErr } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
    router.replace(signInErr ? '/login' : '/app');
  }

  const card = 'max-w-md w-full bg-white rounded-2xl shadow-md border border-black/5 p-8';

  if (tok.status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[hsl(45,100%,97%)]">
        <div className={card}><p className="text-sm text-gray-500 text-center">Checking your invite…</p></div>
      </main>
    );
  }

  if (tok.status === 'invalid') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[hsl(45,100%,97%)]">
        <div className={`${card} text-center`}>
          <div className="text-3xl mb-3">⏰</div>
          <h1 className="text-lg font-bold text-navy mb-2">This invite link isn&apos;t usable</h1>
          <p className="text-sm text-gray-600 mb-4">{tok.reason}</p>
          <p className="text-sm text-gray-600">
            Already set up? <Link href="/login" className="text-navy underline underline-offset-2">Log in</Link>.
            Otherwise, message Adrian for a fresh invite.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[hsl(45,100%,97%)]">
      <div className={card}>
        <h1 className="text-xl font-bold text-navy mb-2">Set up {tok.studentName}&apos;s portal account</h1>
        <p className="text-sm text-gray-600 mb-5">
          The AdrianMath portal gives {tok.studentName} practice questions from real school papers,
          instant marking feedback, and revision notes — in a private account only they can see.
        </p>

        <div className="rounded-xl bg-[hsl(45,80%,96%)] border border-amber-200/60 p-4 mb-5 text-[13px] text-gray-700 leading-relaxed">
          <p className="font-semibold text-navy mb-1">For parents — what we store and why</p>
          <p>
            {tok.studentName}&apos;s name, level, login email, practice attempts and feedback are stored
            to power the practice loop and progress tracking. Work is graded by an AI service without
            {' '}{tok.studentName}&apos;s name attached. You can request an export or full deletion at any
            time from Settings. Full details: <Link href="/privacy" target="_blank" className="text-navy underline underline-offset-2">privacy policy</Link>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email" required autoComplete="email"
            placeholder={`${tok.studentName}'s login email`}
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
          />
          <input
            type="password" required autoComplete="new-password"
            placeholder="Choose a password (min 8 characters)"
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
          />
          <input
            type="password" required autoComplete="new-password"
            placeholder="Repeat password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
          />
          <label className="flex items-start gap-2.5 text-[13px] text-gray-700 pt-1 cursor-pointer">
            <input
              type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#1F2A5C]"
            />
            <span>
              I am {tok.studentName}&apos;s parent/guardian and I consent to AdrianMath storing and
              processing {tok.studentName}&apos;s data as described in the{' '}
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
        </form>
      </div>
    </main>
  );
}
