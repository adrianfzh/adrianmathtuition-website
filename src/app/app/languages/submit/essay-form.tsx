'use client';
// The essay hand-in form (SPEC-ESSAY-MARKING.md §What the student hands in, E1:
// typed or pasted text). Kind, the question as set, the essay; a live word
// count against the syllabus range; POST /api/portal/essays → the report page.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type KindOption = { key: string; label: string; length_words: string; blurb: string };

function wordsOf(t: string): number {
  const s = t.trim();
  return s ? s.split(/\s+/).length : 0;
}

export default function EssayForm({ kinds, slotUsed }: { kinds: KindOption[]; slotUsed: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]?.key ?? 'continuous_writing');
  const [question, setQuestion] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wc = wordsOf(text);
  const chosen = kinds.find(k => k.key === kind);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/essays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, question, text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      router.push(`/app/languages/${j.id}`);
    } catch {
      setError('No connection — try again.'); setBusy(false);
    }
  }

  if (slotUsed) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
        <p className="text-sm text-gray-700">You have used today&apos;s essays. The next one goes in tomorrow.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm space-y-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-gray-500">What kind of writing</span>
          <select value={kind} onChange={e => setKind(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm text-navy">
            {kinds.map(k => <option key={k.key} value={k.key}>{k.label} · {k.length_words} words</option>)}
          </select>
          {chosen && <span className="block text-[12px] text-gray-500 mt-1">{chosen.blurb}</span>}
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold text-gray-500">The question, exactly as set</span>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
            placeholder="e.g. Write about a time when you were wrong about someone."
            className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm text-navy" />
          <span className="block text-[11px] text-gray-400 mt-1">Without it, only the language can be marked — not whether the essay answered the task.</span>
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold text-gray-500">Your essay</span>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={16}
            placeholder="Paste or type the whole essay, paragraphs and all."
            className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm text-navy leading-relaxed" />
          <span className={`block text-[11px] mt-1 ${wc && chosen && (wc < Number(chosen.length_words.split('–')[0]) * 0.8) ? 'text-amber-700' : 'text-gray-400'}`}>
            {wc} words{chosen ? ` · the paper asks for ${chosen.length_words}` : ''}
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}

      <button type="button" onClick={submit} disabled={busy || wc < 80}
        className="w-full bg-violet-600 text-white rounded-3xl px-4 py-3.5 font-semibold shadow-[0_8px_24px_-10px_rgba(124,58,237,0.8)] disabled:opacity-50 hover:brightness-105 active:scale-[0.98] transition">
        {busy ? 'Handing in…' : 'Hand in for marking'}
      </button>
      <p className="text-[12px] text-gray-500 px-1">
        It is read twice, to be sure, and comes back in a minute or two: every slip marked on your own words, the
        three habits to fix first, whether it answered the question, and a band range — never a mark out of 30.
      </p>
    </div>
  );
}
