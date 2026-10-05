'use client';

// 💡 Suggest something (5 Oct 2026). A quiet row on Home and in Settings; one tap
// opens a short sheet from the bottom: "What would help you for your exams?", a
// box (500 characters), the student's own subjects as optional chips, Send. After
// sending: "Thanks — we read every one." Rules in lib/suggestions.ts; the door is
// POST /api/portal/suggestions. Shown only when suggestionsOpen() (lib/portal-beta).

import { useEffect, useRef, useState } from 'react';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { MAX_SUGGESTION_CHARS } from '@/lib/suggestions';

export default function SuggestCard({ subjects, variant = 'home' }: { subjects: string[]; variant?: 'home' | 'settings' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<string | null>(subjects.length === 1 ? subjects[0] : null);
  const [state, setState] = useState<{ busy: boolean; sent: boolean; error: string }>({ busy: false, sent: false, error: '' });
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => box.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  function openSheet() {
    setState({ busy: false, sent: false, error: '' });
    setOpen(true);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || state.busy) return;
    setState({ busy: true, sent: false, error: '' });
    try {
      await portalFetch('/api/portal/suggestions', { json: { text, subject } });
      setText('');
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: portalMessage(err) });
    }
  }

  const row = variant === 'home'
    ? 'w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 active:scale-[0.99] transition'
    : 'w-full flex items-center gap-3 bg-white rounded-2xl border border-black/5 shadow-sm px-5 py-4 text-left hover:bg-slate-50 transition';

  return (
    <>
      <button type="button" onClick={openSheet} className={row}>
        <span aria-hidden className="text-lg shrink-0">💡</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-navy">Suggest something</span>
          <span className="block text-xs text-slate-500">What would help you for your exams?</span>
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="suggest-title">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 id="suggest-title" className="text-base font-bold text-navy">What would help you for your exams?</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            {state.sent ? (
              <div className="py-4 text-center">
                <p className="text-2xl mb-2" aria-hidden>🙏</p>
                <p className="text-sm font-semibold text-navy">Thanks — we read every one.</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-4 bg-navy text-[hsl(45,100%,96%)] rounded-xl px-5 py-2 text-sm font-semibold">Done</button>
              </div>
            ) : (
              <form onSubmit={send}>
                <textarea
                  ref={box}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_SUGGESTION_CHARS))}
                  maxLength={MAX_SUGGESTION_CHARS}
                  rows={4}
                  placeholder="e.g. more practice on vectors, a summary of trig identities"
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-navy/30 resize-none"
                />
                <p className="text-right text-[11px] text-slate-400 mt-0.5">{text.length}/{MAX_SUGGESTION_CHARS}</p>

                {subjects.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-1" role="group" aria-label="Subject (optional)">
                    {subjects.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={subject === s}
                        onClick={() => setSubject(subject === s ? null : s)}
                        className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${subject === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-300'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {state.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}

                <button
                  type="submit"
                  disabled={!text.trim() || state.busy}
                  className="mt-3 w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                >
                  {state.busy ? 'Sending…' : 'Send'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
