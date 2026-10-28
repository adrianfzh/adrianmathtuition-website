'use client';
// /admin/pc-coach — 🎲 try the P&C coach (SPEC-SELF-LEARNING.md §4c, 28 Oct 2026).
// Paste or pick a P&C question → it is read into a spec (one model call; or edit the
// spec yourself) → the exact count, the method with its picture (checked against the
// count), and for a wrong number the arrangements counted twice or missed.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { MathMarkdown } from '@/lib/math-markdown';

type BankRow = { id: string; where: string; stem: string; parts: { label: string; text: string; answer: string }[]; answer: string };
type Line = { tex: string; why?: string };
type Result = {
  spec?: unknown; error?: string;
  read?: { model: string; cost: number; error?: string } | null;
  exact?: { ok: boolean; count?: number; reason?: string; how?: string };
  explained?: { ok: boolean; lines?: Line[]; total?: number; checked?: boolean; reason?: string; boxes?: { label: string; ways: number }[] };
  picture?: string | null;
  where?: { kind: string; lines: string[] } | null;
};

const INLINE = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };
const Tex = ({ tex }: { tex: string }) => <MathMarkdown content={`$${tex}$`} components={INLINE} />;
const Md = ({ text }: { text: string }) => <MathMarkdown content={text} components={INLINE} />;

const SAMPLES = [
  "How many ways can the letters of the word 'APPLE' be arranged?",
  'Find the number of ways in which the letters of the word REARRANGE can be arranged if the three R’s are separated.',
  'How many ways can a committee of 4 men and 5 ladies be selected from 8 men and 7 ladies?',
  'In how many ways can 3 boys and 6 girls sit at a round table if the 3 boys must sit together?',
];

export default function PcCoachPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [question, setQuestion] = useState(SAMPLES[0]);
  const [specText, setSpecText] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [bank, setBank] = useState<BankRow[] | null>(null);
  const [bankAnswer, setBankAnswer] = useState('');

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);

  const run = async (useSpec: boolean) => {
    setBusy(true); setRes(null);
    let spec: unknown = undefined;
    if (useSpec) {
      try { spec = JSON.parse(specText); } catch { setRes({ error: 'The spec is not valid JSON.' }); setBusy(false); return; }
    }
    const r = await fetch('/api/admin/pc-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, spec, typed }) });
    const j: Result = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    setRes(j);
    if (j.spec) setSpecText(JSON.stringify(j.spec, null, 1));
    setBusy(false);
  };
  const loadBank = async () => {
    const r = await fetch('/api/admin/pc-coach?bank=1');
    const j = await r.json().catch(() => ({}));
    setBank(j.rows ?? []);
  };

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto p-6">
        <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password" className="w-full border rounded-lg px-3 py-2" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2">Log in</button>
        </form>
      </main>
    );
  }

  const wrong = res?.where && res.where.kind !== 'right';
  const chip = 'text-sm border border-neutral-300 rounded-full px-3 py-1 bg-white active:bg-neutral-100';

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">🎲 P&amp;C coach</h1>
          <p className="text-sm text-neutral-600">Put in a P&amp;C question. You get the answer, the method with a picture, and where a wrong answer went wrong.</p>
        </header>

        <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Question</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s, i) => <button key={i} type="button" className={chip} onClick={() => { setQuestion(s); setBankAnswer(''); setRes(null); }}>Example {i + 1}</button>)}
              <button type="button" className={chip} onClick={loadBank}>📚 From the bank</button>
            </div>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4} className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900/20" />
            {bankAnswer && <div className="text-sm text-neutral-600">Answer in the bank: <Md text={bankAnswer} /></div>}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">A student&apos;s answer <span className="normal-case font-normal">(optional)</span></div>
            <input value={typed} onChange={e => setTyped(e.target.value)} inputMode="numeric" placeholder="e.g. 120" className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-neutral-900/20" />
          </div>
          <button type="button" disabled={busy || !question.trim()} onClick={() => run(false)} className="w-full bg-neutral-900 text-white font-semibold rounded-xl py-3 disabled:opacity-50">{busy ? 'Working it out…' : 'Explain'}</button>
        </section>

        {bank && (
          <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">From the bank · {bank.length} questions</div>
              <button type="button" className="text-sm text-neutral-500" onClick={() => setBank(null)}>Close</button>
            </div>
            <div className="text-sm text-neutral-500">Tap a part to load it.</div>
            <div className="max-h-[28rem] overflow-y-auto divide-y divide-neutral-100">
              {bank.map(b => (
                <div key={b.id} className="py-3 space-y-1.5">
                  <div className="text-xs text-neutral-500">{b.where}</div>
                  <div className="text-sm text-neutral-800 line-clamp-3"><Md text={b.stem} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {(b.parts.length ? b.parts : [{ label: 'whole', text: '', answer: b.answer }]).map((p, i) => (
                      <button key={i} type="button" className="text-sm border border-neutral-300 rounded-lg px-3 py-1 bg-white active:bg-neutral-100"
                        onClick={() => { setQuestion(`${b.stem}\n\n${p.text}`.trim()); setBankAnswer(p.answer); setBank(null); setRes(null); window.scrollTo({ top: 0 }); }}>
                        Part ({p.label})
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {res?.error && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-sm">{res.error}</div>}

        {res?.exact && (
          <section className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Answer</div>
            {res.exact.ok ? (
              <>
                <div className="text-4xl font-bold tracking-tight mt-1">{res.exact.count?.toLocaleString('en-US')}</div>
                <div className="text-sm text-neutral-600">ways</div>
              </>
            ) : <div className="text-sm text-amber-800 mt-1">Could not count this one: {res.exact.reason}</div>}
          </section>
        )}

        {res?.where && (
          <section className={`rounded-2xl border p-4 space-y-2 ${wrong ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className={`font-semibold ${wrong ? 'text-rose-900' : 'text-emerald-900'}`}>{wrong ? `✗ The student's ${typed}` : `✓ The student's ${typed} is right`}</div>
            {wrong && res.where.lines.map((l, i) => <div key={i} className="text-sm text-neutral-800 leading-relaxed"><Md text={l} /></div>)}
          </section>
        )}

        {res?.explained && !res.explained.ok && <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-sm">No method for this one yet: {res.explained.reason}</div>}

        {res?.explained?.ok && (
          <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Method</div>
              {res.explained.checked
                ? <span className="text-xs text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">✓ checked</span>
                : <span className="text-xs text-amber-800 bg-amber-50 rounded-full px-2 py-0.5">too big to check</span>}
            </div>
            {res.picture
              ? <div className="rounded-xl border border-neutral-100 bg-white p-2"><img src={res.picture} alt="The method as a picture" className="w-full h-auto" /></div>
              : res.explained.boxes && (
                <div className="flex flex-wrap gap-4 justify-center py-2">
                  {res.explained.boxes.map((b, i) => (
                    <div key={i} className="flex flex-col items-center text-sm"><span className="text-neutral-500">{b.label}</span><span className="w-14 border-b-2 border-neutral-700 mt-1" /><b className="mt-1">{b.ways}</b></div>
                  ))}
                </div>
              )}
            <ol className="space-y-3">
              {res.explained.lines?.map((l, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="min-w-0 overflow-x-auto">
                    {l.why && <div className="text-sm text-neutral-500">{l.why.charAt(0).toUpperCase() + l.why.slice(1)}</div>}
                    <div className="text-lg"><Tex tex={l.tex} /></div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <details className="bg-white rounded-2xl border border-neutral-200 p-4 group">
          <summary className="text-sm text-neutral-600 cursor-pointer select-none">For checking (advanced)</summary>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-neutral-600">Reading the words is one model call (about US$0.01 a question). Counting, the method and the help use no model. The student learn steps never call a model.</p>
            {res?.read && <p className="text-xs text-neutral-500">Last read: {res.read.model} · US${res.read.cost.toFixed(3)}</p>}
            <p><Link className="underline" href="/app/learn-step/pc-boxes">Open the learn steps →</Link></p>
            <div className="font-medium">The set-up the question was read into</div>
            <textarea value={specText} onChange={e => setSpecText(e.target.value)} rows={10} className="w-full border border-neutral-300 rounded-xl px-3 py-2 font-mono text-xs" placeholder='{"mode":"row","items":["A","P","P","L","E"]}' />
            <button type="button" disabled={busy || !specText} onClick={() => run(true)} className="w-full border border-neutral-300 rounded-xl py-2.5 disabled:opacity-50">Run with this set-up (no model)</button>
          </div>
        </details>
      </div>
    </main>
  );
}
