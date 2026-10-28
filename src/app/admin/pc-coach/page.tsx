'use client';
// /admin/pc-coach — 🎲 try the P&C coach (SPEC-SELF-LEARNING.md §4c, 28 Oct 2026).
// Paste or pick a P&C question → it is read into a spec (one model call; or edit the
// spec yourself) → the exact count, the method with its picture (checked against the
// count), and for a wrong number the arrangements counted twice or missed.
import { useEffect, useState } from 'react';
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
  const [typed, setTyped] = useState('120');
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

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4 bg-neutral-50 min-h-screen">
      <header>
        <h1 className="text-xl font-bold">🎲 P&amp;C coach — try it</h1>
        <p className="text-sm text-neutral-600">Paste a question, or pick one from the bank. You get the exact count, the method with its picture, and for a wrong number, what was counted twice or missed.</p>
        <p className="text-xs text-neutral-500 mt-1">Reading the words into a set-up is one model call (Sonnet 5.5, about US$0.01 a question). Everything after it — counting, the method, the help — uses no model. The learn steps never call a model. Learn steps: <a className="underline" href="/app/learn-step/pc-boxes">/app/learn-step/pc-boxes</a></p>
      </header>

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((s, i) => <button key={i} type="button" className="text-xs border rounded-full px-2 py-1 bg-neutral-50" onClick={() => { setQuestion(s); setBankAnswer(''); }}>Sample {i + 1}</button>)}
          <button type="button" className="text-xs border rounded-full px-2 py-1 bg-neutral-50" onClick={loadBank}>Pick from the bank…</button>
        </div>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm" />
        {bankAnswer && <div className="text-xs text-neutral-600">Bank answer for this part: <Md text={bankAnswer} /></div>}
        <label className="block text-sm">A student&apos;s number (to see where it went wrong):
          <input value={typed} onChange={e => setTyped(e.target.value)} inputMode="numeric" className="ml-2 border rounded-lg px-2 py-1 w-40" />
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run(false)} className="flex-1 bg-neutral-900 text-white rounded-lg py-2 disabled:opacity-50">{busy ? 'Working…' : 'Read and explain'}</button>
          <button type="button" disabled={busy || !specText} onClick={() => run(true)} className="flex-1 border rounded-lg py-2 disabled:opacity-50">Use the spec below (no model)</button>
        </div>
      </section>

      {bank && (
        <section className="bg-white rounded-xl shadow-sm p-4 space-y-2 max-h-96 overflow-y-auto">
          <div className="text-sm font-semibold">JC bank — P&amp;C ({bank.length}) · tap a part</div>
          {bank.map(b => (
            <div key={b.id} className="border-t pt-2 text-sm">
              <div className="text-xs text-neutral-500">{b.where}</div>
              <div className="text-neutral-800 line-clamp-3"><Md text={b.stem} /></div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(b.parts.length ? b.parts : [{ label: 'whole', text: '', answer: b.answer }]).map((p, i) => (
                  <button key={i} type="button" className="text-xs border rounded px-2 py-0.5 bg-neutral-50"
                    onClick={() => { setQuestion(`${b.stem}\n\n${p.text}`.trim()); setBankAnswer(p.answer); setBank(null); window.scrollTo({ top: 0 }); }}>
                    ({p.label})
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {res && (
        <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          {res.read && <div className="text-xs text-neutral-500">Read by {res.read.model} · US${res.read.cost.toFixed(3)}</div>}
          {res.error && <div className="text-sm text-rose-700">{res.error}</div>}
          {res.exact && (
            <div className="text-sm">
              <b>Exact count:</b> {res.exact.ok ? `${res.exact.count?.toLocaleString('en-US')} ways` : res.exact.reason}
              {res.exact.ok && <span className="text-xs text-neutral-500"> ({res.exact.how === 'positions' ? 'position by position' : 'every outcome listed'})</span>}
            </div>
          )}
          {res.explained && !res.explained.ok && <div className="text-sm text-amber-800">No method shown: {res.explained.reason}</div>}
          {res.explained?.ok && (
            <div className="space-y-2">
              {res.explained.boxes && (
                <div className="flex flex-wrap gap-3">
                  {res.explained.boxes.map((b, i) => (
                    <div key={i} className="flex flex-col items-center text-xs"><span className="text-neutral-500">{b.label}</span><span className="w-12 border-b-2 border-neutral-700" /><span>↑</span><b>{b.ways}</b></div>
                  ))}
                </div>
              )}
              {res.picture && <img src={res.picture} alt="method picture" className="max-w-full max-h-80" />}
              {!res.picture && <div className="text-xs text-neutral-500">No picture for this one (the figure library has no drawing for it, or could not be reached).</div>}
              {res.explained.lines?.map((l, i) => (
                <div key={i}><Tex tex={l.tex} />{l.why && <span className="text-xs text-neutral-500 ml-2">← {l.why}</span>}</div>
              ))}
              <div className="text-xs">{res.explained.checked ? '✓ The method agrees with the exact count.' : '⚠ Too big to count one by one: the method is NOT checked.'}</div>
            </div>
          )}
          {res.where && (
            <div className={`rounded-lg p-3 text-sm space-y-1 ${res.where.kind === 'right' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <div className="font-semibold">For {typed}:</div>
              {res.where.lines.map((l, i) => <div key={i}><Md text={l} /></div>)}
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-2">
        <div className="text-sm font-semibold">The set-up (spec) — edit and press &quot;Use the spec below&quot;</div>
        <textarea value={specText} onChange={e => setSpecText(e.target.value)} rows={10} className="w-full border rounded-lg px-3 py-2 font-mono text-xs" placeholder='{"mode":"row","items":["A","P","P","L","E"]}' />
      </section>
    </main>
  );
}
