'use client';
// ✂️ Re-crops — science figures whose crop held the whole question (7 Oct 2026, Adrian:
// "yes run the rest … can i see the diagrams first before release?"). A batch prepared a
// tighter picture for each and kept the original. Each card shows the old crop beside the
// new one. Release = the question shows the new picture and opens to students when
// nothing else holds it; Keep hidden = nothing changes. "Release all" takes only the
// ones that passed every check.
//
// 9 Oct 2026 (Adrian: "buttons to click what's wrong … approve all in one page or tick them
// to approve? faster to approve in bulk"): the Ready view opens as a GRID of the new
// pictures, like /admin/figures-check — tap only the bad ones, pick what is wrong
// (lib/recrop-reasons), then one button approves the rest and keeps the bad ones hidden.

import { useCallback, useEffect, useState } from 'react';
import { RECROP_REASONS } from '@/lib/recrop-reasons';

type Item = {
  path: string; qid: string; final: string; why: string; fitness: string; furniture: string;
  before: string; after: string; subject: string; source: string; text: string; answer: string; quarantined: boolean;
};
type View = 'ready' | 'held' | 'stopped';

const PAGE = 20;
const border = '#e2e8f0';
const muted = '#64748b';
const VIEW_WORD: Record<View, string> = { ready: 'Ready', held: 'Cut, but held by the check', stopped: 'Not cut' };

export default function RecropLane() {
  const [view, setView] = useState<View>('ready');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState({ ready: 0, held: 0, stopped: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [cardErr, setCardErr] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState('');
  const [mode, setMode] = useState<'grid' | 'cards'>('grid');
  /** Grid: the pictures he tapped as bad, each with the reasons he picked (none is allowed). */
  const [bad, setBad] = useState<Record<string, string[]>>({});
  const [showOld, setShowOld] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/admin/figures-bank?kind=recrop&view=${view}&page=${page}&pageSize=${PAGE}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? `failed (${r.status})`); return; }
      setItems(d.items ?? []); setBad({}); setShowOld({});
      if (d.totals) setTotals(d.totals);
      if (!(d.items ?? []).length && page > 0) setPage(0);
    } catch { setErr('network error'); } finally { setLoading(false); }
  }, [view, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (it: Item, action: 'release' | 'reject') => {
    if (busy || bulk) return;
    setBusy(it.path); setCardErr((e) => ({ ...e, [it.path]: '' }));
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'recrop', action, path: it.path }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setCardErr((e) => ({ ...e, [it.path]: d.step ? `${d.step}: ${d.error}` : (d.error ?? `failed (${r.status})`) })); return; }
      setItems((cur) => cur.filter((x) => x.path !== it.path));
      setTotals((t) => ({ ...t, [view]: Math.max(0, t[view] - 1) }));
    } catch { setCardErr((e) => ({ ...e, [it.path]: 'network error — nothing was written' })); }
    finally { setBusy(''); }
  };

  const releaseAll = async () => {
    if (busy || bulk || !totals.ready) return;
    if (!window.confirm(`Release all ${totals.ready} that passed every check? Each question will show its new picture.`)) return;
    let done = 0, opened = 0, failed = 0;
    setBulk('starting…');
    try {
      for (let guard = 0; guard < 80; guard++) {
        const r = await fetch('/api/admin/figures-bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'recrop', action: 'release-all' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { setErr(d.error ?? `failed (${r.status})`); break; }
        done += d.released ?? 0; opened += d.opened ?? 0; failed += (d.failed ?? []).length;
        setBulk(`${done} released, ${d.left ?? 0} to go…`);
        if (!d.left) break;
      }
      setBulk(`${done} released · ${opened} questions now open to students${failed ? ` · ${failed} could not be released (kept hidden)` : ''}`);
    } catch { setErr('network error — some may not have been released; reload to see what is left'); setBulk(''); }
    load();
  };

  const post = async (path: string, action: 'release' | 'reject', reasons?: string[]) => {
    const r = await fetch('/api/admin/figures-bank', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'recrop', action, path, ...(reasons?.length ? { reasons } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && d.ok !== false ? '' : (d.step ? `${d.step}: ${d.error}` : (d.error ?? `failed (${r.status})`));
  };

  /** Grid: approve every picture on the page he did not tap, keep the tapped ones hidden. */
  const sendPage = async () => {
    if (busy || working || !items.length) return;
    const list = items.filter((it) => it.after);
    let ok = 0, kept = 0; const errs: Record<string, string> = {};
    setBulk(`0 of ${list.length}…`);
    try {
      for (const it of list) {
        const isBad = it.path in bad;
        const e = await post(it.path, isBad ? 'reject' : 'release', bad[it.path]);
        if (e) errs[it.path] = e; else if (isBad) kept += 1; else ok += 1;
        setBulk(`${ok + kept + Object.keys(errs).length} of ${list.length}…`);
      }
      const nErr = Object.keys(errs).length;
      setBulk(`${ok} approved · ${kept} kept hidden${nErr ? ` · ${nErr} could not be saved (still below)` : ''}`);
    } catch { setErr('network error — some may not have been saved; the ones left are below'); setBulk(''); }
    await load();
    setCardErr(errs);
    window.scrollTo({ top: 0 });
  };
  const tapTile = (path: string) => setBad((b) => {
    const n = { ...b };
    if (path in n) delete n[path]; else n[path] = [];
    return n;
  });
  const tapReason = (path: string, reason: string) => setBad((b) => {
    const cur = b[path] ?? [];
    return { ...b, [path]: cur.includes(reason) ? cur.filter((x) => x !== reason) : [...cur, reason] };
  });

  const working = !!bulk && bulk.endsWith('…');
  const grid = view === 'ready' && mode === 'grid';
  const nBad = items.filter((it) => it.path in bad).length;
  const nGood = items.filter((it) => it.after).length - nBad;
  const total = totals[view];
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);
  const btn = (bg: string, fg: string, bd: string) => ({
    fontSize: 13.5, fontWeight: 700, color: fg, background: bg, border: `1px solid ${bd}`,
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {(['ready', 'held', 'stopped'] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setPage(0); }}
            style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              color: view === v ? '#fff' : '#374151', background: view === v ? '#0f766e' : '#fff',
              border: `1px solid ${view === v ? '#0f766e' : border}` }}>
            {VIEW_WORD[v]} · {totals[v]}
          </button>
        ))}
        {view === 'ready' && totals.ready > 0 && (
          <button disabled={!!busy || (!!bulk && bulk.endsWith('…'))} onClick={releaseAll} style={btn('#059669', '#fff', '#059669')}>Release all {totals.ready}</button>
        )}
        {view === 'ready' && (
          <button onClick={() => setMode((m) => (m === 'grid' ? 'cards' : 'grid'))}
            style={{ fontSize: 13, border: `1px solid ${border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>
            {mode === 'grid' ? 'One at a time, old beside new' : 'Back to the grid'}
          </button>
        )}
        <span style={{ fontSize: 13, color: muted, marginLeft: 'auto' }}>page {page + 1} / {lastPage + 1}</span>
        <button disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}
          style={{ fontSize: 13, border: `1px solid ${border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
        <button disabled={page >= lastPage || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0 }); }}
          style={{ fontSize: 13, border: `1px solid ${border}`, background: '#fff', borderRadius: 8, padding: '4px 12px', opacity: page >= lastPage ? 0.4 : 1 }}>Next →</button>
      </div>
      {bulk && <div style={{ fontSize: 13.5, color: '#065f46', background: '#ecfdf5', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{bulk}</div>}
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {!loading && !err && items.length === 0 && (
        <div style={{ color: muted, fontSize: 14, padding: 24, textAlign: 'center' }}>Nothing here.</div>
      )}
      {grid && items.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>
            These are the NEW pictures. Tap only the bad ones and say what is wrong. Then press the green button once.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, paddingBottom: 84 }}>
            {items.map((it) => {
              const isBad = it.path in bad;
              const old = !!showOld[it.path];
              return (
                <div key={it.path} style={{ background: '#fff', borderRadius: 12, padding: 8,
                  border: `2px solid ${isBad ? '#dc2626' : border}`, opacity: working ? 0.6 : 1 }}>
                  <button type="button" disabled={working} onClick={() => tapTile(it.path)} title={isBad ? 'Tap to mark it good again' : 'Tap if this picture is not good'}
                    style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: old ? '#f8fafc' : '#fff', cursor: 'pointer', position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={old ? it.before : it.after} alt="" loading="lazy" style={{ width: '100%', height: 230, objectFit: 'contain', display: 'block' }} />
                    {isBad && <span style={{ position: 'absolute', top: 6, right: 6, background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 9px' }}>✗ keep hidden</span>}
                    {old && <span style={{ position: 'absolute', top: 6, left: 6, background: '#334155', color: '#fff', fontSize: 12, borderRadius: 999, padding: '2px 9px' }}>old picture</span>}
                  </button>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 11.5, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      <b style={{ textTransform: 'capitalize', color: '#334155' }}>{it.subject}</b> {it.source}
                    </span>
                    <button type="button" onClick={() => setShowOld((o) => ({ ...o, [it.path]: !o[it.path] }))}
                      style={{ fontSize: 11.5, border: `1px solid ${border}`, background: old ? '#e2e8f0' : '#fff', borderRadius: 999, padding: '2px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {old ? 'show new' : 'show old'}
                    </button>
                  </div>
                  {isBad && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                      {RECROP_REASONS.map((r) => {
                        const on = (bad[it.path] ?? []).includes(r);
                        return (
                          <button key={r} type="button" disabled={working} onClick={() => tapReason(it.path, r)}
                            style={{ fontSize: 12, borderRadius: 999, padding: '3px 10px', cursor: 'pointer',
                              color: on ? '#fff' : '#b91c1c', background: on ? '#dc2626' : '#fff', border: '1px solid #dc2626' }}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {it.quarantined && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 4 }}>Quarantined — approving will not open it.</div>}
                  {cardErr[it.path] && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{cardErr[it.path]}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ position: 'sticky', bottom: 0, margin: '0 -4px', padding: '10px 4px', background: 'rgba(244,246,250,0.96)', borderTop: `1px solid ${border}` }}>
            <button type="button" disabled={working || !!busy} onClick={sendPage}
              style={{ width: '100%', fontSize: 15, fontWeight: 700, color: '#fff', background: '#059669', border: 'none', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', opacity: working ? 0.6 : 1 }}>
              {working ? `Saving ${bulk}` : nBad === 0 ? `✓ Approve all ${nGood} on this page` : `✓ Approve the rest (${nGood}) · keep ${nBad} hidden`}
            </button>
          </div>
        </>
      )}
      {!grid && items.map((it) => (
        <div key={it.path} style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{it.subject}</span>
            <span style={{ color: muted }}>{it.source}</span>
            {view !== 'ready' && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>{it.final}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: it.after ? '1fr 1fr' : '1fr', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>Now (hidden from students)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.before} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 420, display: 'block', border: `1px solid ${border}`, borderRadius: 6 }} />
            </div>
            {it.after && (
              <div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>New picture</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.after} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 420, display: 'block', border: `1px solid ${border}`, borderRadius: 6 }} />
              </div>
            )}
          </div>
          {(view !== 'ready' || it.furniture) && (
            <div style={{ fontSize: 13, color: '#334155', marginTop: 8 }}>
              {view !== 'ready' && <div>{it.why}</div>}
              {view === 'held' && it.fitness && <div>The check: {it.fitness}</div>}
              {it.furniture && <div style={{ color: muted }}>Cut away: {it.furniture}</div>}
            </div>
          )}
          <details style={{ fontSize: 13, color: '#334155', margin: '8px 0' }}>
            <summary style={{ cursor: 'pointer', color: muted }}>The question{it.answer ? ` · answer ${it.answer.slice(0, 40)}` : ''}</summary>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{it.text}</div>
          </details>
          {it.quarantined && <div style={{ fontSize: 12.5, color: '#b45309', marginBottom: 6 }}>This question is quarantined — releasing the picture will not open it.</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.after && <button disabled={!!busy || !!bulk && bulk.endsWith('…')} onClick={() => act(it, 'release')} style={btn('#059669', '#fff', '#059669')}>✓ Release the new picture</button>}
            <button disabled={!!busy || !!bulk && bulk.endsWith('…')} onClick={() => act(it, 'reject')} style={btn('#fff', '#b91c1c', '#b91c1c')}>{it.after ? 'Keep hidden' : 'Seen — keep hidden'}</button>
            {busy === it.path && <span style={{ fontSize: 13, color: muted, alignSelf: 'center' }}>saving…</span>}
          </div>
          {cardErr[it.path] && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{cardErr[it.path]}</div>}
        </div>
      ))}
    </div>
  );
}
