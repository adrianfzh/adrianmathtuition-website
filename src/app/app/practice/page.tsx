'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

// Retrieval-first practice (see PORTAL.md + the tiered-router spec): pick level +
// topic → serve an unseen REAL question from the bank → reveal solution. No auth,
// no generation yet; served via /api/portal/practice/* (service role). "Seen" is
// tracked client-side for now; wire to student_attempts once portal auth lands.

const LEVELS: { code: string; label: string }[] = [
  { code: 'S1', label: 'Sec 1' },
  { code: 'S2', label: 'Sec 2' },
  { code: 'S3_EM', label: 'Sec 3 E-Math' },
  { code: 'S3_AM', label: 'Sec 3 A-Math' },
  { code: 'EM', label: 'O-Level E-Math' },
  { code: 'EM_NA', label: 'E-Math (NA)' },
  { code: 'AM', label: 'O-Level A-Math' },
  { code: 'JC1', label: 'JC1 H2 Math' },
  { code: 'JC2', label: 'JC2 H2 Math' },
];

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

type Question = { id: string; markdown: string; marks: number | null; source: string | null; hasSolution: boolean };

// Admin-only during testing — reuses the existing admin-password cookie. Swap for
// portal student auth once /app auth lands (see PORTAL.md).
function getCookie(n: string) { if (typeof document === 'undefined') return ''; const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${n}=([^;]*)`)); return m ? decodeURIComponent(m[1]) : ''; }
function setCookie(n: string, v: string, d: number) { document.cookie = `${n}=${encodeURIComponent(v)}; expires=${new Date(Date.now() + d * 864e5).toUTCString()}; path=/; SameSite=Strict`; }

export default function PracticePage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  const [level, setLevel] = useState('AM');
  const [topics, setTopics] = useState<{ topic: string; n: number }[]>([]);
  const [topic, setTopic] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [q, setQ] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<string[]>([]);

  const [solution, setSolution] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);

  // Admin gate (testing only) — check saved cookie on mount
  useEffect(() => { const pw = getCookie('admin_pw') || getCookie('schedule_pw'); if (pw) { savedPw.current = pw; verify(pw); } }, []);
  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const r = await fetch('/api/portal/practice/topics?auth=check', { headers: { Authorization: `Bearer ${pw}` } });
      if (r.ok) { savedPw.current = pw; setCookie('admin_pw', pw, 30); setAuthed(true); } else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); } finally { setAuthLoading(false); }
  }

  // Load topics when level changes (once authed)
  useEffect(() => {
    if (!authed) return;
    setLoadingTopics(true); setTopic(''); setTopics([]); setQ(null); setExhausted(false);
    fetch(`/api/portal/practice/topics?level=${encodeURIComponent(level)}`, { headers: { Authorization: `Bearer ${savedPw.current}` } })
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []))
      .catch(() => setError('Could not load topics'))
      .finally(() => setLoadingTopics(false));
  }, [level, authed]);

  const fetchNext = useCallback(async (excludeIds: string[]) => {
    setLoading(true); setError(''); setSolution(null); setExhausted(false);
    try {
      const r = await fetch('/api/portal/practice/next', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
        body: JSON.stringify({ level, topic, exclude: excludeIds }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); return; }
      if (!d.question) { setExhausted(true); setQ(null); return; }
      setQ(d.question);
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }, [level, topic]);

  function start() { setSeen([]); fetchNext([]); }
  function tryAnother() {
    const nextSeen = q ? [...seen, q.id] : seen;
    setSeen(nextSeen);
    fetchNext(nextSeen);
  }
  async function showSolution() {
    if (!q) return;
    setSolLoading(true);
    try {
      const r = await fetch(`/api/portal/practice/solution?id=${q.id}`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      const d = await r.json();
      setSolution(r.ok ? d.markdown : '_Could not load the solution._');
    } catch { setSolution('_Could not load the solution._'); }
    finally { setSolLoading(false); }
  }

  // Admin test harness for Stage 2 generation (not part of the student flow).
  const [gen, setGen] = useState<any>(null);
  const [genLoading, setGenLoading] = useState(false);
  async function testGenerate() {
    if (!topic) return;
    setGenLoading(true); setGen(null);
    try {
      const r = await fetch('/api/portal/practice/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
        body: JSON.stringify({ level, topic, maxRetries: 1, cache: false }),
      });
      setGen(await r.json());
    } catch { setGen({ ok: false, error: 'connection error' }); }
    finally { setGenLoading(false); }
  }

  if (!authed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-7 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h1 className="text-lg font-bold text-slate-800">Practice (testing)</h1>
          <p className="text-xs text-slate-400 mb-5">Admin password required — not open to students yet.</p>
          <form onSubmit={(e) => { e.preventDefault(); setAuthError(''); verify(password); }}>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(''); }} placeholder="Admin password" autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-2" />
            {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
            <button type="submit" disabled={authLoading || !password}
              className="w-full bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">
              {authLoading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Practice</h1>
      <p className="text-sm text-slate-500 mb-5">Pick a topic and work through real exam questions. Reveal the worked solution when you&apos;re ready.</p>

      {/* Picker */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-2xl p-4 mb-5">
        <label className="flex flex-col text-xs font-semibold text-slate-500 gap-1">
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 min-w-[160px]">
            {LEVELS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-500 gap-1 flex-1 min-w-[200px]">
          Topic
          <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={loadingTopics || !topics.length}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 w-full disabled:bg-slate-50">
            <option value="">{loadingTopics ? 'Loading…' : topics.length ? 'Choose a topic…' : 'No topics'}</option>
            {topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic} ({t.n})</option>)}
          </select>
        </label>
        <button onClick={start} disabled={!topic || loading}
          className="bg-slate-800 text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40">
          {q || exhausted ? 'Restart topic' : 'Start'}
        </button>
        <button onClick={testGenerate} disabled={!topic || genLoading} title="Admin: generate + code-verify one question (Stage 2)"
          className="bg-white border border-violet-300 text-violet-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
          {genLoading ? 'Generating…' : '🧪 Test generate'}
        </button>
      </div>

      {/* Stage 2 generation test result (admin) */}
      {gen && (
        <div className={`border rounded-2xl p-5 mb-5 ${gen.ok ? 'bg-violet-50 border-violet-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex justify-between items-center mb-2 text-xs">
            <span className="font-bold uppercase tracking-wide text-slate-500">🧪 Generated (test){gen.ms ? ` · ${(gen.ms / 1000).toFixed(0)}s` : ''}{typeof gen.attempts === 'number' ? ` · ${gen.attempts} attempt${gen.attempts === 1 ? '' : 's'}` : ''}</span>
            <span className={`font-bold ${gen.ok ? 'text-violet-700' : 'text-rose-600'}`}>{gen.ok ? '✓ VERIFIED' : '✗ REJECTED'}</span>
          </div>
          {gen.ok ? (
            <>
              <div className="prose prose-sm max-w-none text-slate-800"><ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{gen.question?.question || ''}</ReactMarkdown></div>
              <div className="mt-3 text-sm text-slate-700"><b>Answer:</b> {gen.question?.answer}</div>
              <div className="mt-1 text-xs text-emerald-700">code-computed: {gen.verify?.computedAnswer} · wellPosed:{String(gen.verify?.wellPosed)} matches:{String(gen.verify?.matches)}</div>
              {gen.question?.solution && <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer text-slate-500">solution</summary><div className="prose prose-sm max-w-none mt-1"><ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{gen.question.solution}</ReactMarkdown></div></details>}
            </>
          ) : (
            <div className="text-sm text-rose-700">{gen.reason || gen.error || 'failed'}{gen.lastVerify ? ` — computed ${gen.lastVerify.computedAnswer} vs claimed (mismatch); ${gen.lastVerify.reason || ''}` : ''}</div>
          )}
          <div className="mt-3 text-[11px] text-slate-400">Not saved to the bank (test mode). Not shown to students.</div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Finding a question…</p>}

      {exhausted && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          You&apos;ve seen every question we have for this topic. Try another topic, or hit <b>Restart topic</b> to go again.
        </div>
      )}

      {q && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3 text-xs text-slate-400">
            <span>{q.source || 'Practice question'}</span>
            {q.marks ? <span className="font-semibold">{q.marks} mark{q.marks === 1 ? '' : 's'}</span> : null}
          </div>

          <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed">
            <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{q.markdown}</ReactMarkdown>
          </div>

          {solution !== null && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">Worked solution</div>
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{solution}</ReactMarkdown>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            {solution === null && (
              <button onClick={showSolution} disabled={solLoading}
                className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {solLoading ? 'Loading…' : '🔎 Show solution'}
              </button>
            )}
            <button onClick={tryAnother} disabled={loading}
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
              🔄 Try another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
