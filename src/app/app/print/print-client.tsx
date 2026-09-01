'use client';

// The Print-a-paper flow (SPEC-PRINT-PAPER.md). Pick a preset → (topics if
// needed) → Generate → the paper appears below with ⬇ Print and 📬 Hand it in.
// Data comes from GET /api/portal/print-paper so the allowance shown here and
// the one the POST enforces can never disagree.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MAX_TOPICS_PER_PAPER, MOCK_LEVELS, paperDuration } from '@/lib/print-paper';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

type Preset = 'mock' | 'topics' | 'weakspots';

type PaperRow = {
  id: string;
  preset: Preset;
  level: string;
  paper: string | null;
  title: string;
  total_marks: number;
  status: 'open' | 'submitted';
  created_at: string;
};

const PRESETS: { key: Preset; emoji: string; title: string; body: string }[] = [
  { key: 'mock', emoji: '📝', title: 'Mock exam', body: 'A full paper with a realistic topic mix — print it, sit it in one go, hand it in.' },
  { key: 'topics', emoji: '🎯', title: 'My topics', body: 'Pick the topics, we pick real past-paper questions for them.' },
  { key: 'weakspots', emoji: '🩹', title: 'Fix my weak spots', body: 'Built from your own marked papers — the topics where you dropped marks.' },
];

export default function PrintClient({ levels, initialPreset }: { levels: { key: string; label: string }[]; initialPreset?: Preset }) {
  const [preset, setPreset] = useState<Preset>(initialPreset ?? 'mock');
  const [level, setLevel] = useState(levels[0]?.key ?? 'EM');
  const [paper, setPaper] = useState<'P1' | 'P2'>('P1');
  const [count, setCount] = useState(8);
  const [allTopics, setAllTopics] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cap, setCap] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<string | null>(null); // paperId just generated

  const mockAvailable = (MOCK_LEVELS as readonly string[]).includes(level);

  const refresh = useCallback(async () => {
    try {
      const d = await portalFetch<{ papers?: PaperRow[]; remaining?: number | null; cap?: number }>('/api/portal/print-paper');
      setPapers(d.papers || []); setRemaining(d.remaining ?? null); setCap(d.cap ?? 2);
    } catch { /* list stays as-is */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Topic list for the picker, per level (same endpoint the practice flow uses).
  useEffect(() => {
    if (preset !== 'topics') return;
    let gone = false;
    (async () => {
      try {
        const d = await portalFetch<{ topics?: { topic: string }[] }>(`/api/portal/practice/topics?level=${encodeURIComponent(level)}`);
        if (!gone) setAllTopics((d.topics || []).map(t => t.topic));
      } catch { if (!gone) setAllTopics([]); }
    })();
    return () => { gone = true; };
  }, [preset, level]);
  useEffect(() => { setTopics([]); }, [level]);
  useEffect(() => { if (!mockAvailable && preset === 'mock') setPreset('topics'); }, [mockAvailable, preset]);

  function toggleTopic(t: string) {
    setTopics(prev => prev.includes(t)
      ? prev.filter(x => x !== t)
      : prev.length >= MAX_TOPICS_PER_PAPER ? prev : [...prev, t]);
  }

  async function generate() {
    if (busy) return;
    setBusy(true); setError(''); setMade(null);
    try {
      const d = await portalFetch<{ paperId: string }>('/api/portal/print-paper', {
        json: {
          preset, level,
          ...(preset === 'mock' ? { paper } : { count }),
          ...(preset === 'topics' ? { topics } : {}),
        },
        fallback: 'Could not generate the paper — try again.',
      });
      setMade(d.paperId);
      await refresh();
    } catch (e) {
      setError(portalMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = !busy && (remaining === null || remaining > 0)
    && (preset !== 'topics' || topics.length > 0);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">Print a paper</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {remaining === null
            ? 'Real past-paper questions, printed with working space and an answer key.'
            : remaining > 0
              ? `🎟️ ${remaining} of ${cap} paper prints left this week — renews Monday.`
              : `🎟️ This week's ${cap} paper prints are used — a fresh allowance opens on Monday.`}
        </p>
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRESETS.filter(p => p.key !== 'mock' || mockAvailable).map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`text-left rounded-xl border p-3 transition-colors ${preset === p.key ? 'border-navy bg-[hsl(45,100%,96%)]' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <span className="block text-lg" aria-hidden>{p.emoji}</span>
              <span className="block text-sm font-bold text-navy mt-0.5">{p.title}</span>
              <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">{p.body}</span>
            </button>
          ))}
        </div>

        {levels.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {levels.map(l => (
              <button
                key={l.key} type="button" onClick={() => setLevel(l.key)}
                className={`text-[13px] font-semibold rounded-full px-3 py-1.5 border ${level === l.key ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'border-gray-200 text-gray-600'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        {preset === 'mock' && (
          <div className="flex items-center gap-1.5">
            {(['P1', 'P2'] as const).map(p => (
              <button
                key={p} type="button" onClick={() => setPaper(p)}
                className={`text-[13px] font-semibold rounded-full px-3 py-1.5 border ${paper === p ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'border-gray-200 text-gray-600'}`}
              >
                {p === 'P1' ? 'Paper 1' : 'Paper 2'}
              </button>
            ))}
            {/* Real exam duration for the chosen paper (O-Level 2 h 15 min,
                H2 3 hours) — same DURATIONS table the printed cover reads, so
                they can never disagree. */}
            <span className="text-[12px] text-gray-400 ml-1">⏱ {paperDuration(level, paper) ?? 'About 2 hours'} — sit it in one go.</span>
          </div>
        )}

        {preset !== 'mock' && (
          <div className="flex items-center gap-2 text-[13px] text-gray-600">
            <label htmlFor="print-count" className="font-semibold">Questions:</label>
            <select
              id="print-count" value={count} onChange={e => setCount(Number(e.target.value))}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
            >
              {[6, 8, 10, 12].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {preset === 'topics' && (
          <div>
            <p className="text-[13px] font-semibold text-gray-700 mb-1.5">
              Topics <span className="font-normal text-gray-400">(up to {MAX_TOPICS_PER_PAPER})</span>
            </p>
            {allTopics.length === 0 ? (
              <p className="text-[13px] text-gray-400">Loading topics…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                {allTopics.map(t => (
                  <button
                    key={t} type="button" onClick={() => toggleTopic(t)}
                    className={`text-[12px] rounded-full px-2.5 py-1 border ${topics.includes(t) ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'border-gray-200 text-gray-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {preset === 'weakspots' && (
          <p className="text-[13px] text-gray-500">
            We rank the topics from your marked papers and notebook re-attempts, weakest first, and build the sheet from those.
          </p>
        )}

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

        <button
          type="button" onClick={generate} disabled={!canGenerate}
          className="w-full text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 disabled:opacity-40"
        >
          {busy ? 'Building your paper…' : '🖨️ Generate paper'}
        </button>
      </div>

      {papers.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-bold text-navy mb-2">Your papers</p>
          <ul className="divide-y divide-black/5">
            {papers.map(p => (
              <li key={p.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy truncate">
                    {p.title}
                    {made === p.id && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">New</span>}
                  </p>
                  <p className="text-[12px] text-gray-500">
                    {p.total_marks} marks · {new Date(p.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    {p.status === 'submitted' && ' · 📬 handed in'}
                  </p>
                </div>
                <a
                  href={`/api/portal/print-paper/pdf?id=${p.id}`}
                  className="text-[13px] font-semibold text-navy rounded-lg px-2.5 py-1.5 border border-black/10"
                >
                  ⬇ Print
                </a>
                {p.status === 'open' && (
                  <Link
                    href={`/app/submit?paper=${p.id}`}
                    className="text-[13px] font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-lg px-2.5 py-1.5"
                  >
                    📬 Hand it in
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-2">
            Do it on paper, then hand it in — marking already knows every question on the sheet, so your weak topics update precisely.
          </p>
        </div>
      )}
    </div>
  );
}
