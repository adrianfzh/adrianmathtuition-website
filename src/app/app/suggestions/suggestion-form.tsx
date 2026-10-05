'use client';

// The form on /app/suggestions: one box, "Stay anonymous", Submit, a thank-you.
// POST /api/portal/suggestions; rules in lib/suggestions.ts.

import { useState } from 'react';
import Link from 'next/link';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { MAX_SUGGESTION_CHARS } from '@/lib/suggestions';

export default function SuggestionForm() {
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [state, setState] = useState<{ busy: boolean; sent: boolean; error: string }>({ busy: false, sent: false, error: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || state.busy) return;
    setState({ busy: true, sent: false, error: '' });
    try {
      await portalFetch('/api/portal/suggestions', { json: { text, anonymous } });
      setText('');
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: portalMessage(err) });
    }
  }

  const card = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5';

  if (state.sent) {
    return (
      <div className={`${card} text-center py-8`}>
        <p className="text-3xl mb-2" aria-hidden>🙏</p>
        <p className="text-base font-semibold text-navy">Thank you — we read every one.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => setState({ busy: false, sent: false, error: '' })}
            className="text-sm font-semibold text-navy border border-navy/30 rounded-xl px-4 py-2">Send another</button>
          <Link href="/app" className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={card}>
      <label htmlFor="suggestion" className="block text-base font-semibold text-navy mb-2">What would help you for your exams?</label>
      <textarea
        id="suggestion"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_SUGGESTION_CHARS))}
        maxLength={MAX_SUGGESTION_CHARS}
        rows={6}
        placeholder="e.g. more practice on vectors, a summary of trig identities"
        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-navy/30 resize-none"
      />
      <p className="text-right text-[11px] text-slate-400 mt-0.5">{text.length}/{MAX_SUGGESTION_CHARS}</p>

      <label className="mt-1 flex items-center gap-2.5 text-sm text-navy select-none">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-5 h-5 accent-[#1e3a5f]" />
        Stay anonymous
      </label>
      {anonymous && <p className="text-xs text-slate-500 mt-1 ml-7">Your name is not saved with it.</p>}

      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}

      <button type="submit" disabled={!text.trim() || state.busy}
        className="mt-4 w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40">
        {state.busy ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}
