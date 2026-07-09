'use client';
// /app/reference — student Formulas & Methods reference (AM/EM), from
// method_templates + formula_ref. Reached via the Learn header link.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Method = { subject: string; topic: string | null; questionType: string; method: string; watchOut: string | null };
type Formula = { subject: string; area: string; result: string; statement: string; givenStatus: string | null };
type Data = { subjects: string[]; methods: Method[]; formulae: Formula[] };

const SUBJECT_LABEL: Record<string, string> = { AM: 'A Math', EM: 'E Math' };

const BADGE: Record<string, { label: string; cls: string }> = {
  given:    { label: 'given in exam', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  memorise: { label: 'memorise',      cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  derive:   { label: 'derive',        cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function ReferencePage() {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');
  const [subject, setSubject] = useState<string | null>(null);
  const [mustOnly, setMustOnly] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/portal/reference')
      .then((r) => { if (r.status === 401) { setStatus('locked'); return null; } return r.json(); })
      .then((d: Data | null) => { if (!d) return; setData(d); setSubject(d.subjects[0] ?? null); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  const methods = useMemo(
    () => (data?.methods ?? []).filter((m) => (!subject || m.subject === subject)
      && (!q.trim() || m.questionType.toLowerCase().includes(q.trim().toLowerCase()))),
    [data, subject, q],
  );
  const formulae = useMemo(() => {
    let f = (data?.formulae ?? []).filter((x) => !subject || x.subject === subject);
    if (mustOnly) f = f.filter((x) => x.givenStatus === 'memorise' || x.givenStatus === 'derive');
    const byArea = new Map<string, Formula[]>();
    for (const x of f) { const k = x.area || 'General'; if (!byArea.has(k)) byArea.set(k, []); byArea.get(k)!.push(x); }
    return [...byArea.entries()];
  }, [data, subject, mustOnly]);

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm';

  if (status === 'loading') return <div className={`${card} p-5`}><p className="text-sm text-gray-400">Loading reference…</p></div>;
  if (status === 'locked') return <div className={`${card} p-5`}><p className="text-sm text-gray-500">Please sign in.</p></div>;
  if (status === 'error') return <div className={`${card} p-5`}><p className="text-sm text-red-500">Couldn’t load. Please retry.</p></div>;
  if (!data || data.subjects.length === 0) {
    return (
      <div className="space-y-3 pb-24 sm:pb-4">
        <Header />
        <div className={`${card} p-5`}><p className="text-sm text-gray-500">Method &amp; formula reference for your subjects is coming soon.</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Header />

      {data.subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.subjects.map((s) => (
            <button key={s} onClick={() => setSubject(s)}
              className={`text-sm rounded-full px-4 py-1.5 font-semibold transition-colors ${
                s === subject ? 'bg-navy text-[hsl(45,100%,96%)]' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'}`}>
              {SUBJECT_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {/* Formulas */}
      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Formulas</h2>
          <button onClick={() => setMustOnly((v) => !v)}
            className={`text-xs font-semibold rounded-full px-3 py-1 border transition-colors ${
              mustOnly ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-gray-500 border-gray-200'}`}>
            {mustOnly ? 'Showing: must-memorise' : 'Show: must-memorise only'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">🟢 given = printed on your exam formula sheet · 🟡 memorise = know it cold · ⬜ derive</p>
        <div className="space-y-4">
          {formulae.map(([area, items]) => (
            <div key={area}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{area}</p>
              <div className="divide-y divide-gray-50">
                {items.map((f) => {
                  const b = f.givenStatus ? BADGE[f.givenStatus] : null;
                  return (
                    <div key={f.result} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{f.result}</p>
                        {f.statement && <p className="text-[13px] text-gray-500 font-mono leading-snug break-words">{f.statement}</p>}
                      </div>
                      {b && <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {formulae.length === 0 && <p className="text-sm text-gray-400">No formulas for this filter.</p>}
        </div>
      </section>

      {/* Methods */}
      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Methods by question type</h2>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search question types…"
          className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 mb-3 outline-none focus:border-navy/40" />
        <div className="space-y-2.5">
          {methods.map((m, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-3">
              <p className="text-sm font-bold text-navy">{m.questionType}</p>
              <p className="text-[13px] text-gray-700 mt-1 leading-snug">{m.method}</p>
              {m.watchOut && (
                <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2">
                  ⚠ watch: {m.watchOut}
                </p>
              )}
            </div>
          ))}
          {methods.length === 0 && <p className="text-sm text-gray-400">No matching question types.</p>}
        </div>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between pt-1">
      <h1 className="text-xl font-bold text-navy">Formulas &amp; Methods</h1>
      <Link href="/app/learn" className="text-sm text-gray-500 hover:text-navy">‹ Learn</Link>
    </div>
  );
}
