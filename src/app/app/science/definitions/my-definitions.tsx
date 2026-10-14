'use client';
// 📌 My definitions — the student's own list at the top of the definitions page
// (14 Oct 2026). Type a term, tap Add; ✕ removes one. /api/portal/definitions.
import { useEffect, useState } from 'react';
import { splitBold } from '@/lib/science-definitions';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

type Item = { id: string; term: string; text: string; formula: string | null };

export default function MyDefinitions({ subject, example }: { subject: 'physics' | 'biology'; example: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetch(`/api/portal/definitions?subject=${subject}`)
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(j => setItems(Array.isArray(j.items) ? j.items : []))
      .catch(() => setItems([]));
  }, [subject]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = term.trim();
    if (!t || busy) return;
    setBusy(true); setNote('');
    try {
      const r = await fetch('/api/portal/definitions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, term: t }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.item) {
        setItems(prev => [j.item, ...(prev ?? []).filter(x => x.id !== j.item.id)]);
        setTerm('');
        if (j.already) setNote('Already in My definitions.');
      } else {
        setNote(j.message || 'We could not add that just now. Try again in a minute.');
      }
    } catch {
      setNote('We could not add that just now. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const before = items;
    setItems(prev => (prev ?? []).filter(x => x.id !== id));
    const r = await fetch('/api/portal/definitions', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!r || !r.ok) { setItems(before); setNote('Could not remove that. Try again.'); }
  }

  return (
    <section className={`${CARD} px-4 py-3`} aria-label="My definitions">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-blue-700">My definitions</h2>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <input
          value={term} onChange={e => setTerm(e.target.value)} maxLength={60}
          placeholder={`Add a term — ${example}`} aria-label="A term to add"
          className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button type="submit" disabled={busy || !term.trim()}
          className="shrink-0 rounded-2xl bg-navy px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-40">
          {busy ? 'Finding…' : 'Add'}
        </button>
      </form>
      {note && <p className="mt-2 text-[14px] text-gray-600" role="status">{note}</p>}
      {items && items.length === 0 && !note && (
        <p className="mt-2 text-[13px] text-gray-400">Add a term to keep its definition here.</p>
      )}
      {items && items.length > 0 && (
        <dl className="mt-1 divide-y divide-gray-100">
          {items.map(x => (
            <div key={x.id} className="py-2.5 flex gap-2">
              <div className="min-w-0 flex-1">
                <dt className="text-[15px] font-bold text-navy">{x.term}</dt>
                <dd className="mt-0.5 text-[15px] leading-relaxed text-gray-700">
                  {splitBold(x.text).map((r, i) => r.bold
                    ? <strong key={i} className="font-semibold text-navy bg-amber-100/70 rounded px-0.5">{r.text}</strong>
                    : <span key={i}>{r.text}</span>)}
                </dd>
                {x.formula && <dd className="mt-1 text-[14px] font-mono text-gray-500">{x.formula}</dd>}
              </div>
              <button type="button" onClick={() => remove(x.id)} aria-label={`Remove ${x.term}`}
                className="shrink-0 self-start w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-[16px]">
                ✕
              </button>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
