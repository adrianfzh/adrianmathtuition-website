'use client';

// "Decide here" — the four things waiting on Adrian, decided on /admin itself (6 Nov 2026,
// Adrian: "can we just put all this on admin itself, then i will act on it (don't put on
// telegram)" … "and put them all on main admin page (not separate pages)"). lib/decide.ts
// says what each button does; GET/POST /api/admin/decide does it. Each group is closed until
// tapped, so the dashboard stays short; a "Needs you" chip opens its group (#decide-…).

import { useCallback, useEffect, useState } from 'react';
import Tex from './Tex';

type Rule = { slug: string; title: string; plainWords: string; why: string; redraft: boolean; papers: number; tap: string | null; busy: boolean };
type Ship = { slug: string; at: string; why: string; retry: boolean; ask: string };
type Paper = { id: string; file: string; failed: boolean; why: string; notes: string };
type Question = {
  id: number; level: string; topics: string[] | null; question_text: string; answer: string | null; solution: string | null;
  marks: number | null; skill: string | null; verification: { ok: boolean; method: string } | null;
};
type Data = { rules: Rule[]; ships: Ship[]; shipsBusy: { slug: string; words: string | null }[]; papers: Paper[]; papersTotal: number; questions: Question[]; questionsTotal: number };

export const DECIDE_GROUPS = ['rules', 'ships', 'papers', 'questions'] as const;
type Group = (typeof DECIDE_GROUPS)[number];

const PAGE = { papers: 10, questions: 5 };

export default function DecideHere({ onChange }: { onChange?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Group | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [shown, setShown] = useState({ papers: PAGE.papers, questions: PAGE.questions });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/decide', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d); setError('');
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    // a "Needs you" chip links to #decide-<group>: open that group and bring it into view
    const fromHash = () => {
      const g = window.location.hash.replace('#decide-', '') as Group;
      if (DECIDE_GROUPS.includes(g)) { setOpen(g); setTimeout(() => document.getElementById(`decide-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => { clearInterval(id); window.removeEventListener('hashchange', fromHash); };
  }, [load]);

  // while a Ship / Change / Drop is with the worker, look again every few seconds
  const working = !!data && (data.rules.some(r => r.busy) || data.shipsBusy.length > 0);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [working, load]);

  async function send(key: string, body: Record<string, unknown>, url = '/api/admin/decide', method = 'POST') {
    if (busy) return;
    setBusy(key);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      setSaid(s => ({ ...s, [key]: r.ok ? (d.message || 'Done.') : `❌ ${d.error || `failed (${r.status})`}` }));
      if (r.ok) { setChangeFor(null); setNote(''); await load(); onChange?.(); }
    } catch { setSaid(s => ({ ...s, [key]: '❌ Connection error' })); }
    finally { setBusy(null); }
  }

  if (error && !data) return <div className="dh-err">Could not read what is waiting for you: {error}</div>;
  if (!data) return null;
  const counts: Record<Group, number> = { rules: data.rules.length, ships: data.ships.length + data.shipsBusy.length, papers: data.papersTotal, questions: data.questionsTotal };
  if (!DECIDE_GROUPS.some(g => counts[g] > 0)) return null;

  const head = (g: Group, emoji: string, title: string, sub: string) => counts[g] > 0 && (
    <button className={`dh-head${open === g ? ' on' : ''}`} onClick={() => setOpen(o => (o === g ? null : g))} aria-expanded={open === g}>
      <span className="dh-e" aria-hidden>{emoji}</span>
      <span className="dh-t">{title}<small>{sub}</small></span>
      <b className={g === 'ships' ? 'red' : ''}>{counts[g]}</b>
      <span className="dh-chev" aria-hidden>{open === g ? '▴' : '▾'}</span>
    </button>
  );
  const msg = (key: string) => said[key] && <div className={`dh-said${said[key].startsWith('❌') ? ' bad' : ''}`}>{said[key]}</div>;

  return (
    <section className="dh" aria-label="Decide here">
      <style>{CSS}</style>
      <h2 className="dh-h">Decide here</h2>
      {error && <div className="dh-err">Could not refresh: {error}</div>}

      <div id="decide-rules">
        {head('rules', '📜', 'Extraction rules', 'A new rule for how papers are filed')}
        {open === 'rules' && (
          <div className="dh-list">
            {data.rules.map(r => (
              <div key={r.slug} className="dh-card">
                <div className="dh-card-t">{r.title}</div>
                {r.plainWords && <p className="dh-p">{r.plainWords}</p>}
                {r.why && <details className="dh-more"><summary>What happened</summary><p className="dh-p small">{r.why}</p></details>}
                {r.papers > 0 && <div className="dh-note">If you ship it, {r.papers} paper{r.papers === 1 ? '' : 's'} go back in the queue.</div>}
                {r.redraft ? <div className="dh-said">✏️ Being rewritten with your change. It comes back here tomorrow morning.</div>
                  : r.busy || (r.tap && r.tap.startsWith('✅')) ? <div className="dh-said">{r.tap}</div>
                  : (
                    <>
                      {r.tap && <div className="dh-said bad">{r.tap}</div>}
                      {changeFor === r.slug && (
                        <textarea className="dh-note-in" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What should be different? In your own words." rows={3} />
                      )}
                      <div className="dh-btns">
                        {changeFor === r.slug ? (
                          <>
                            <button className="dh-b" onClick={() => { setChangeFor(null); setNote(''); }}>Cancel</button>
                            <button className="dh-b go" disabled={!note.trim() || busy === r.slug} onClick={() => send(r.slug, { kind: 'rule', slug: r.slug, action: 'change', note })}>Send change</button>
                          </>
                        ) : (
                          <>
                            <button className="dh-b no" disabled={busy === r.slug} onClick={() => { if (confirm('Drop this rule? The workers keep working as they do today.')) send(r.slug, { kind: 'rule', slug: r.slug, action: 'drop' }); }}>🗑 Drop</button>
                            <button className="dh-b" disabled={busy === r.slug} onClick={() => { setChangeFor(r.slug); setNote(''); }}>✏️ Change</button>
                            <button className="dh-b go" disabled={busy === r.slug} onClick={() => send(r.slug, { kind: 'rule', slug: r.slug, action: 'ship' })}>{busy === r.slug ? 'Sending…' : '✅ Ship'}</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                {msg(r.slug)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="decide-ships">
        {head('ships', '🚧', 'Changes that did not go live', 'You tapped Ship, but it did not go through')}
        {open === 'ships' && (
          <div className="dh-list">
            {data.shipsBusy.map(s => <div key={s.slug} className="dh-card"><div className="dh-card-t mono">{s.slug}</div><div className="dh-said">{s.words}</div></div>)}
            {data.ships.map(s => (
              <div key={s.slug} className="dh-card">
                <div className="dh-card-t mono">{s.slug}</div>
                <p className="dh-p">{s.why}</p>
                <div className="dh-btns">
                  <button className="dh-b no" disabled={busy === s.slug} onClick={() => { if (confirm('Drop this change for good?')) send(s.slug, { kind: 'ship', slug: s.slug, action: 'drop' }); }}>🗑 Drop</button>
                  {s.retry
                    ? <button className="dh-b go" disabled={busy === s.slug} onClick={() => send(s.slug, { kind: 'ship', slug: s.slug, action: 'ship' })}>{busy === s.slug ? 'Sending…' : '↻ Try again'}</button>
                    : <button className="dh-b" onClick={async () => { try { await navigator.clipboard.writeText(s.ask); setSaid(x => ({ ...x, [s.slug]: 'Copied. Paste it to a Claude session.' })); } catch { setSaid(x => ({ ...x, [s.slug]: s.ask })); } }}>📋 Copy for a session</button>}
                </div>
                {msg(s.slug)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="decide-papers">
        {head('papers', '📄', 'Papers put aside', 'The workers stopped and want you to look')}
        {open === 'papers' && (
          <div className="dh-list">
            <div className="dh-help">“Fine as it is” keeps the questions already filed and closes it. “Try again” sends the paper back to the workers.</div>
            {data.papers.slice(0, shown.papers).map(p => (
              <div key={p.id} className="dh-card">
                <div className="dh-card-t">{p.file}</div>
                <p className="dh-p">{p.failed ? '⚠️ ' : ''}{p.why}</p>
                <details className="dh-more"><summary>The workers’ notes</summary><p className="dh-p small pre">{p.notes}</p></details>
                <div className="dh-btns">
                  <button className="dh-b" disabled={busy === p.id} onClick={() => send(p.id, { kind: 'paper', id: p.id, action: 'requeue' })}>↻ Try again</button>
                  <button className="dh-b go" disabled={busy === p.id} onClick={() => send(p.id, { kind: 'paper', id: p.id, action: 'done' })}>✓ Fine as it is</button>
                </div>
                {msg(p.id)}
              </div>
            ))}
            {data.papers.length > shown.papers && <button className="dh-more-b" onClick={() => setShown(s => ({ ...s, papers: s.papers + PAGE.papers }))}>Show more ({data.papersTotal - shown.papers} left)</button>}
          </div>
        )}
      </div>

      <div id="decide-questions">
        {head('questions', '🧮', 'Questions to vet', 'Written by the practice sheets')}
        {open === 'questions' && (
          <div className="dh-list">
            {data.questions.slice(0, shown.questions).map(q => {
              const key = `q${q.id}`;
              return (
                <div key={q.id} className="dh-card">
                  <div className="dh-tags"><span>{q.level}</span>{(q.topics || []).map(t => <span key={t} className="grey">{t}</span>)}{q.marks != null && <span className="grey">[{q.marks}]</span>}</div>
                  <Tex style={{ fontSize: 15, lineHeight: 1.7, display: 'block' }}>{q.question_text}</Tex>
                  {q.answer && <div className="dh-ans">[Ans: <Tex>{q.answer}</Tex>]</div>}
                  {q.solution && <details className="dh-more"><summary>Worked solution</summary><Tex style={{ fontSize: 13.5, lineHeight: 1.7, display: 'block', marginTop: 6 }}>{q.solution}</Tex></details>}
                  {!q.verification?.ok && <div className="dh-note">⚠ Answer not checked yet, so it cannot be published.</div>}
                  <div className="dh-btns">
                    <button className="dh-b no" disabled={busy === key} onClick={() => send(key, { id: q.id, action: 'reject' }, '/api/admin/question-proposals', 'PATCH')}>✕ Reject</button>
                    <button className="dh-b go" disabled={busy === key || !q.verification?.ok} onClick={() => send(key, { id: q.id, action: 'publish' }, '/api/admin/question-proposals', 'PATCH')}>{busy === key ? 'Publishing…' : '✓ Publish'}</button>
                  </div>
                  {msg(key)}
                </div>
              );
            })}
            {data.questions.length > shown.questions && <button className="dh-more-b" onClick={() => setShown(s => ({ ...s, questions: s.questions + PAGE.questions }))}>Show more ({data.questionsTotal - shown.questions} left)</button>}
          </div>
        )}
      </div>
    </section>
  );
}

const CSS = `
.dh { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.dh-h { font-size: 16px; font-weight: 700; margin: 4px 0 2px; }
.dh-err { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.dh > div[id] { scroll-margin-top: 70px; }
.dh-head { width: 100%; display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px 14px; cursor: pointer; text-align: left; color: #111827; font: inherit; }
.dh-head.on { border-color: #9ca3af; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px; }
.dh-e { font-size: 22px; flex: none; }
.dh-t { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; display: flex; flex-direction: column; }
.dh-t small { font-size: 12.5px; font-weight: 500; color: #6b7280; }
.dh-head b { font-size: 20px; font-weight: 800; color: #e79e00; font-variant-numeric: tabular-nums; }
.dh-head b.red { color: #d03b3b; }
.dh-chev { color: #9ca3af; font-size: 13px; flex: none; }
.dh-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0 6px; }
.dh-help { font-size: 13px; color: #4b5563; padding: 0 4px; }
.dh-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; min-width: 0; }
.dh-card-t { font-size: 15px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.dh-card-t.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13.5px; }
.dh-p { font-size: 14px; color: #374151; line-height: 1.5; margin: 6px 0 0; overflow-wrap: anywhere; }
.dh-p.small { font-size: 13px; color: #4b5563; }
.dh-p.pre { white-space: pre-wrap; }
.dh-more { margin-top: 6px; }
.dh-more summary { font-size: 13px; font-weight: 600; color: #1e3a5f; cursor: pointer; }
.dh-note { font-size: 13px; color: #92400e; margin-top: 8px; }
.dh-note-in { width: 100%; box-sizing: border-box; margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font: inherit; font-size: 14px; resize: vertical; }
.dh-btns { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 10px; }
.dh-b { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 9px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; }
.dh-b.go { background: #047857; border-color: #047857; color: #fff; }
.dh-b.no { color: #b91c1c; border-color: #fca5a5; }
.dh-b:disabled { opacity: .45; cursor: default; }
.dh-said { font-size: 13.5px; color: #047857; margin-top: 8px; font-weight: 600; }
.dh-said.bad { color: #b91c1c; }
.dh-more-b { background: none; border: 1px dashed #d1d5db; border-radius: 10px; padding: 10px; font-size: 14px; color: #374151; cursor: pointer; }
.dh-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.dh-tags span { font-size: 12px; font-weight: 700; color: #1e3a5f; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 999px; padding: 2px 9px; }
.dh-tags span.grey { color: #6b7280; background: #f3f4f6; border-color: #e5e7eb; font-weight: 600; }
.dh-ans { font-size: 13.5px; color: #b45309; margin-top: 6px; }
`;
