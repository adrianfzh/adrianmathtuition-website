'use client';
// "Forgot something?" — the Socratic recall companion. A floating button on
// /app/learn opens a full-screen sheet chat grounded in Adrian's KB (see
// /api/portal/recall). First reply nudges the student to attempt recall; the
// next reveals Adrian's explanation + tappable links back into the learning
// units. History lives in sessionStorage so it survives navigation within the
// tab but resets on a fresh visit.
import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeKatex];
const STORE_KEY = 'recall_chat_history';

type UnitLink = { id: string; title: string; kind: string };
type Turn = { role: 'user' | 'assistant'; content: string; units?: UnitLink[] };

const KIND_ICON: Record<string, string> = {
  core: '📘', example: '📐', check: '⚡', autopsy: '🔍', try: '✏️',
};

export default function RecallChat() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore history for this browser tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) setTurns(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(turns)); } catch { /* ignore */ }
  }, [turns]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      inputRef.current?.focus();
    });
  }, [open, turns, sending]);

  const send = useCallback(async () => {
    const text = input.trim().slice(0, 500);
    if (!text || sending) return;
    setError(null);
    const nextTurns: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
    setInput('');
    setSending(true);
    try {
      // Send the trailing conversation (server clamps to 10 turns / 500 chars).
      const payload = nextTurns.map(t => ({ role: t.role, content: t.content }));
      const res = await fetch('/api/portal/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Something went wrong. Try again.');
        setSending(false);
        return;
      }
      setTurns([...nextTurns, { role: 'assistant', content: data.reply || '', units: data.units || [] }]);
    } catch {
      setError('Network error — try again.');
    } finally {
      setSending(false);
    }
  }, [input, sending, turns]);

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <>
      {/* Floating launcher — bottom-right, above the mobile tab bar */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Forgot something? Ask the recall tutor"
          className="fixed z-50 right-4 bottom-20 sm:bottom-6 flex items-center gap-2 rounded-full bg-navy text-[hsl(45,100%,96%)] pl-4 pr-5 py-3 shadow-lg shadow-navy/25 hover:opacity-95 active:scale-95 transition"
        >
          <span className="text-lg leading-none">💬</span>
          <span className="text-sm font-semibold">Forgot something?</span>
        </button>
      )}

      {/* Full-screen sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[hsl(45,100%,98%)]">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-14 border-b border-black/5 bg-white/90 backdrop-blur-md">
            <div className="min-w-0">
              <p className="font-semibold text-navy leading-tight">Recall tutor</p>
              <p className="text-[11px] text-gray-400 leading-tight">Grounded in Adrian&rsquo;s class notes</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {turns.length > 0 && (
                <button onClick={reset} className="text-xs text-gray-500 hover:text-navy px-2 py-1 rounded-lg">
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-navy w-9 h-9 flex items-center justify-center rounded-full text-xl"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {turns.length === 0 && (
              <div className="max-w-md mx-auto text-center pt-10">
                <p className="text-4xl mb-3">💭</p>
                <p className="text-navy font-semibold">Forgot how to do something?</p>
                <p className="text-sm text-gray-500 mt-1">
                  Tell me the topic you&rsquo;re stuck on — e.g. &ldquo;I forgot how to find the remainder&rdquo;.
                  I&rsquo;ll nudge you first, then walk you through it using Adrian&rsquo;s notes.
                </p>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    t.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-navy text-[hsl(45,100%,96%)] px-4 py-2.5 text-sm whitespace-pre-wrap'
                      : 'max-w-[90%] rounded-2xl rounded-bl-md bg-white border border-black/5 shadow-sm px-4 py-3'
                  }
                >
                  {t.role === 'user' ? (
                    t.content
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none text-slate-800 recall-prose">
                        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
                          {t.content}
                        </ReactMarkdown>
                      </div>
                      {t.units && t.units.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {t.units.map(u => (
                            <Link
                              key={u.id}
                              href={`/app/learn/${u.id}`}
                              onClick={() => setOpen(false)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full bg-[hsl(43,90%,95%)] text-navy border border-[hsl(43,70%,80%)] px-3 py-1.5 hover:bg-[hsl(43,90%,90%)] transition"
                            >
                              <span>{KIND_ICON[u.kind] || '📘'}</span>
                              <span className="truncate max-w-[10rem]">{u.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white border border-black/5 shadow-sm px-4 py-3 text-sm text-gray-400">
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center">
                <p className="text-xs text-red-500 bg-red-50 rounded-full px-3 py-1">{error}</p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-black/5 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2 max-w-2xl mx-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, 500))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder="What are you stuck on?"
                className="flex-1 resize-none rounded-2xl border border-gray-200 bg-[hsl(45,100%,99%)] px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-navy/40 max-h-32"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="shrink-0 rounded-full bg-navy text-[hsl(45,100%,96%)] w-11 h-11 flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
