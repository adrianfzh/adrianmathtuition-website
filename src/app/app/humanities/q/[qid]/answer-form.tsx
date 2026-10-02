'use client';
// The typed-answer box (SPEC-HUMANITIES.md: typed only in H1). A live word count;
// POST /api/portal/humanities → the report page.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function wordsOf(t: string): number {
  const s = t.trim();
  return s ? s.split(/\s+/).length : 0;
}

export default function AnswerForm({ questionId, maxWords }: { questionId: string; maxWords: number }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wc = wordsOf(answer);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/humanities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      router.push(`/app/humanities/${j.id}`);
    } catch {
      setError('No connection — try again.'); setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <span className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold text-gray-500">Your answer</span>
          <span className={`text-[12px] ${wc > maxWords ? 'text-rose-700 font-semibold' : 'text-gray-400'}`}>{wc} words</span>
        </span>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={9}
          placeholder="Type your answer here."
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-navy" />
      </label>
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}
      <button type="button" onClick={submit} disabled={busy || wc < 3 || wc > maxWords}
        className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50">
        {busy ? 'Handing in…' : 'Get feedback'}
      </button>
    </div>
  );
}
