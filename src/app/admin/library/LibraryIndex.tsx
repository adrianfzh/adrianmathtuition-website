'use client';
// The index itself: counts on top, filters, then Subject → Level → Year with one line per paper.
// Data: GET /api/admin/library; a paper's notes are fetched when its fold opens.
import { useEffect, useMemo, useState } from 'react';
import {
  filterLines, groupLines, summarise, summaryLine, statusText, bankText, noteLines,
  STATUS_LABEL, type IndexLine, type StatusCode, type SubjectSummary,
} from '@/lib/paper-index';

type Data = { lines: IndexLine[]; summary: SubjectSummary[]; builtAt: string; warnings: string[] };

const TONE: Record<StatusCode, string> = {
  banked: 'bg-emerald-100 text-emerald-800',
  older: 'bg-emerald-50 text-emerald-700',
  queue: 'bg-sky-100 text-sky-800',
  working: 'bg-indigo-100 text-indigo-800',
  decision: 'bg-amber-100 text-amber-900',
  hold: 'bg-gray-200 text-gray-700',
  skipped: 'bg-gray-100 text-gray-500',
};

function Notes({ ids }: { ids: string[] }) {
  const [notes, setNotes] = useState<Array<{ file: string | null; status: string | null; notes: string | null }> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/admin/library?notes=${ids.join(',')}`, { credentials: 'same-origin' })
      .then(r => r.json()).then(j => j.error ? setErr(j.error) : setNotes(j.notes)).catch(e => setErr(String(e)));
  }, [ids]);
  if (err) return <p className="text-xs text-red-600">{err}</p>;
  if (!notes) return <p className="text-xs text-gray-400">Reading…</p>;
  return (
    <div className="mt-1 space-y-2">
      {notes.map((n, i) => (
        <div key={i}>
          {notes.length > 1 && <p className="text-xs font-medium text-gray-600">{n.file} ({n.status})</p>}
          {noteLines(n.notes).map((t, j) => <p key={j} className="break-words text-xs leading-relaxed text-gray-600">{t}</p>)}
        </div>
      ))}
    </div>
  );
}

function Line({ l }: { l: IndexLine }) {
  const [open, setOpen] = useState(false);
  const bt = bankText(l);
  const files = [l.file ? 'paper file kept' : '', l.scheme ? 'scheme kept' : ''].filter(Boolean).join(' · ');
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-gray-900">{l.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${TONE[l.status]}`}>{statusText(l)}</span>
      </div>
      {(bt || files) && <p className="text-xs text-gray-500">{[bt, files].filter(Boolean).join(' · ')}</p>}
      {l.hasNotes && (
        <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs text-indigo-600">Notes</summary>
          {open && <Notes ids={l.sourceIds} />}
        </details>
      )}
    </li>
  );
}

export default function LibraryIndex() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/admin/library', { credentials: 'same-origin' })
      .then(r => r.json()).then(j => j.error ? setErr(j.error) : setData(j)).catch(e => setErr(String(e)));
  }, []);

  const lines = useMemo(() => data ? filterLines(data.lines, {
    subject, level, yearFrom: from ? Number(from) : null, yearTo: to ? Number(to) : null,
    status: status as StatusCode | 'banked-any' | '', q,
  }) : [], [data, subject, level, from, to, status, q]);
  const groups = useMemo(() => groupLines(lines), [lines]);
  const summary = useMemo(() => summarise(lines), [lines]);
  const subjects = useMemo(() => data ? [...new Set(data.lines.map(l => l.subject))] : [], [data]);
  const levels = useMemo(() => data ? [...new Set(data.lines.filter(l => !subject || l.subject === subject).map(l => l.level))] : [], [data, subject]);
  const narrowed = lines.length <= 150;

  if (err) return <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not read the index: {err}</p>;
  if (!data) return <p className="mt-6 text-sm text-gray-500">Reading the banks…</p>;

  const toggle = (k: string) => setOpenKeys(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const input = 'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="mt-4">
      <ul className="space-y-1 rounded-xl border border-gray-200 bg-white p-3">
        {summary.map(s => <li key={s.subject} className="text-sm text-gray-800">{summaryLine(s)}</li>)}
        {!summary.length && <li className="text-sm text-gray-500">No papers match.</li>}
      </ul>
      {data.warnings.map(w => <p key={w} className="mt-2 text-xs text-amber-700">{w}</p>)}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select className={input} value={subject} onChange={e => { setSubject(e.target.value); setLevel(''); }}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={input} value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {levels.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={input} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="banked-any">Banked (all)</option>
          {(Object.keys(STATUS_LABEL) as StatusCode[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input className={input} inputMode="numeric" placeholder="Year from" value={from} onChange={e => setFrom(e.target.value.replace(/\D/g, ''))} />
        <input className={input} inputMode="numeric" placeholder="Year to" value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ''))} />
        <input className={`${input} col-span-2 sm:col-span-1`} placeholder="Search school, year…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <p className="mt-2 text-xs text-gray-400">{lines.length} papers · read {new Date(data.builtAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</p>

      <div className="mt-3 space-y-3">
        {groups.map(g => (
          <section key={g.subject} className="rounded-xl border border-gray-200 bg-white">
            <h2 className="px-3 pt-3 text-base font-bold text-gray-900">{g.subject} <span className="text-sm font-normal text-gray-500">({g.count})</span></h2>
            {g.levels.map(lv => {
              const k = `${g.subject}|${lv.level}`;
              const open = narrowed || openKeys.has(k);
              return (
                <div key={k} className="border-t border-gray-100 first:border-t-0">
                  <button onClick={() => toggle(k)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-700">
                    <span>{lv.level} <span className="font-normal text-gray-500">({lv.count})</span></span>
                    <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && lv.years.map(y => (
                    <div key={y.year ?? 'none'}>
                      <p className="bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{y.year ?? 'No year'}</p>
                      <ul className="divide-y divide-gray-100">{y.lines.map(l => <Line key={l.id} l={l} />)}</ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
