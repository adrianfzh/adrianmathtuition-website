'use client';
// /admin/figures-check — ✅ Check fixes (30 Sep 2026). Only the repaired or
// redrawn figures, three answers: Approve · Not good enough (+ why) · Redraw.
// Adrian: "i only need the fixed diagrams or redrawn diagrams in front of me,
// then i click approve or a comment to say why it is still not good enough, or
// just redraw". Data + writes: /api/admin/figures-bank kind=check
// (lib/figure-check.ts).
//
// Two ways to work (Adrian, 30 Sep 2026: "do what you suggest, 6, 8, 3 and 1"):
//   Grid — 20 small pictures; tap only the bad ones, then "Approve the rest".
//   One at a time — keys: A approve · R redraw · N not good enough · ← → move.
// Both use the same one-tap reasons (REASON_CHIPS), small images from the
// Storage transform (sizedImageUrl), and load the next pictures ahead.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { REASON_CHIPS, reasonComment, sizedImageUrl } from '@/lib/figure-check';

type Item = {
  lane: 'solution' | 'question'; path: string; qid: string;
  level: string | null; school: string | null; year: number | null; paper: string | null; qnum: string | null;
  partLabel: string | null; beforeUrl: string; afterUrl: string;
  whatChanged: string | null; holdReason: string | null;
  /** A new drawing for a question that had none — no old one to show. */
  isNew?: boolean;
};
type Action = 'approve' | 'redo' | 'redraw';
/** A grid tile Adrian tapped as bad: the reasons, his words, or Redraw. */
type Bad = { chips: string[]; text: string; redraw: boolean };

const GRID_PAGE = 20;
const ONE_PAGE = 12;
const THUMB_W = 480;
const FULL_W = 1400;

function title(it: Item) {
  const bits = [it.school, it.year, it.paper ? `P${String(it.paper).replace(/^P(aper)?\s*/i, '')}` : null, it.qnum ? `Q${it.qnum}` : null, it.partLabel]
    .filter(Boolean).join(' ');
  return bits || it.qid.slice(0, 8);
}

async function post(it: Item, action: Action, comment: string): Promise<string | null> {
  try {
    const r = await fetch('/api/admin/figures-bank', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'check', lane: it.lane, path: it.path, questionId: it.qid, action, comment }),
    });
    const j = await r.json().catch(() => ({}));
    return !r.ok || !j.ok ? (j.error ?? `failed (${r.status})`) : null;
  } catch (e) { return String(e); }
}

/** Warm the browser cache so the next picture is already there. */
function preload(urls: string[]) {
  for (const u of urls) { const im = new Image(); im.src = u; }
}

/** The image exactly as stored: a grey mat, and a sharp outline hugging the
 *  picture's own edge — whatever is inside the line (a caption, a stray mark,
 *  a white margin) is IN the image (Adrian, 30 Sep 2026: "i can't tell if the
 *  caption is inside the image"). Tap to open it full size. */
function Picture({ src, alt }: { src: string; alt: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block rounded-xl bg-gray-300 p-3 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sizedImageUrl(src, FULL_W)} alt={alt} decoding="async"
        className="inline-block max-w-full max-h-[70vh] h-auto w-auto outline outline-2 outline-gray-900" />
      <span className="block pt-1.5 text-[11px] text-gray-600">The black line is the edge of the image · tap to open full size</span>
    </a>
  );
}

function Chips({ picked, onToggle }: { picked: string[]; onToggle: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {REASON_CHIPS.map((c, i) => (
        <button key={c} type="button" onClick={() => onToggle(c)}
          className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${picked.includes(c) ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-300 text-gray-700'}`}>
          <span className="opacity-60 mr-1">{i + 1}</span>{c}
        </button>
      ))}
    </div>
  );
}

const toggle = (xs: string[], c: string) => (xs.includes(c) ? xs.filter(x => x !== c) : [...xs, c]);

/* ───────────────────────── Grid ───────────────────────── */

function Tile({ it, bad, focused, err, onTap, onBad }: {
  it: Item; bad: Bad | undefined; focused: boolean; err: string | undefined;
  onTap: () => void; onBad: (b: Bad | undefined) => void;
}) {
  return (
    <div className={`rounded-xl bg-white border-2 p-2 space-y-2 ${bad ? 'border-amber-500' : focused ? 'border-navy' : 'border-transparent'} shadow-sm`}>
      <button type="button" onClick={onTap} className="block w-full rounded-lg bg-gray-300 p-2 text-center relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sizedImageUrl(it.afterUrl, THUMB_W)} alt={title(it)} loading="lazy" decoding="async"
          className="inline-block max-w-full max-h-48 h-auto w-auto outline outline-2 outline-gray-900" />
        {bad && <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-600 text-white text-[11px] font-bold px-2 py-0.5">{bad.redraw ? '✏️ Redraw' : '✗ Bad'}</span>}
      </button>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-navy truncate">{title(it)}</p>
        <a href={it.afterUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-gray-500 underline">full size</a>
      </div>
      {it.isNew && <p className="text-[11px] text-violet-700">{it.lane === 'solution' ? 'New solution drawing' : 'New question drawing'}</p>}
      {it.holdReason && <p className="text-[11px] text-amber-700 line-clamp-2">⚠ {it.holdReason}</p>}
      {bad && (
        <div className="space-y-1.5">
          <Chips picked={bad.chips} onToggle={c => onBad({ ...bad, chips: toggle(bad.chips, c), redraw: false })} />
          <input value={bad.text} onChange={e => onBad({ ...bad, text: e.target.value, redraw: false })}
            placeholder="Anything else? (optional)" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
          <div className="flex gap-1.5">
            <button type="button" onClick={() => onBad({ ...bad, redraw: !bad.redraw })}
              className={`flex-1 rounded-lg border px-2 py-1 text-[12px] font-semibold ${bad.redraw ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-300'}`}>✏️ Redraw from scratch</button>
            <button type="button" onClick={() => onBad(undefined)} className="rounded-lg border border-gray-200 px-2 py-1 text-[12px] font-semibold text-gray-600">It&apos;s fine</button>
          </div>
        </div>
      )}
      {err && <p className="text-[11px] text-rose-700">{err}</p>}
    </div>
  );
}

function Grid({ items, onGone, nextThumbs }: { items: Item[]; onGone: (paths: string[]) => void; nextThumbs: string[] }) {
  const [bad, setBad] = useState<Record<string, Bad>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [focus, setFocus] = useState(0);

  useEffect(() => { preload(nextThumbs); }, [nextThumbs]);

  const setOne = useCallback((path: string, b: Bad | undefined) => setBad(m => {
    const n = { ...m }; if (b) n[path] = b; else delete n[path]; return n;
  }), []);

  // Keys: ← → ↑ ↓ move · space or X marks the picture bad · 1–6 a reason on it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
      const it = items[focus];
      if (e.key === 'ArrowRight') setFocus(f => Math.min(items.length - 1, f + 1));
      else if (e.key === 'ArrowLeft') setFocus(f => Math.max(0, f - 1));
      else if (e.key === 'ArrowDown') setFocus(f => Math.min(items.length - 1, f + cols));
      else if (e.key === 'ArrowUp') setFocus(f => Math.max(0, f - cols));
      else if (it && (e.key === ' ' || e.key.toLowerCase() === 'x')) setOne(it.path, bad[it.path] ? undefined : { chips: [], text: '', redraw: false });
      else if (it && /^[1-6]$/.test(e.key)) {
        const c = REASON_CHIPS[Number(e.key) - 1];
        const b = bad[it.path] ?? { chips: [], text: '', redraw: false };
        setOne(it.path, { ...b, chips: toggle(b.chips, c), redraw: false });
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, focus, bad, setOne]);

  const badItems = items.filter(it => bad[it.path]);
  const unclear = badItems.filter(it => { const b = bad[it.path]; return !b.redraw && !reasonComment(b.chips, b.text); });
  const good = items.filter(it => !bad[it.path]);

  async function run() {
    setBusy('sending'); setErrs({});
    const jobs: Array<{ it: Item; action: Action; comment: string }> = [
      ...good.map(it => ({ it, action: 'approve' as Action, comment: '' })),
      ...badItems.map(it => {
        const b = bad[it.path];
        return { it, action: (b.redraw ? 'redraw' : 'redo') as Action, comment: reasonComment(b.chips, b.text) };
      }),
    ];
    const gone: string[] = []; const failed: Record<string, string> = {};
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const e = await post(j.it, j.action, j.comment);
        if (e) failed[j.it.path] = e; else gone.push(j.it.path);
      }
    }));
    setErrs(failed);
    setBad(m => Object.fromEntries(Object.entries(m).filter(([p]) => !gone.includes(p))));
    setBusy('');
    onGone(gone);
  }

  return (
    <>
      <p className="text-[12px] text-gray-500">Tap only the bad ones. Keys: arrows move · space marks bad · 1–6 a reason.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it, i) => (
          <Tile key={it.path} it={it} bad={bad[it.path]} focused={i === focus} err={errs[it.path]}
            onTap={() => { setFocus(i); setOne(it.path, bad[it.path] ? undefined : { chips: [], text: '', redraw: false }); }}
            onBad={b => setOne(it.path, b)} />
        ))}
      </div>
      {items.length > 0 && (
        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-[#f4f6fa]/95 backdrop-blur border-t border-black/5">
          <button type="button" disabled={!!busy || unclear.length > 0} onClick={run}
            className="w-full rounded-xl bg-emerald-600 text-white font-semibold py-3 disabled:opacity-40">
            {busy ? 'Sending…'
              : badItems.length === 0 ? `✓ Approve all ${good.length}`
              : `✓ Approve the rest (${good.length}) · send back ${badItems.length}`}
          </button>
          {unclear.length > 0 && <p className="pt-1.5 text-[12px] text-amber-700 text-center">Pick a reason or Redraw on {unclear.length === 1 ? 'the picture' : `${unclear.length} pictures`} marked bad.</p>}
        </div>
      )}
    </>
  );
}

/* ─────────────────────── One at a time ─────────────────────── */

function One({ it, onDone, onMove, pos, count }: {
  it: Item; onDone: () => void; onMove: (d: number) => void; pos: number; count: number;
}) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [showBefore, setShowBefore] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => { if (asking) box.current?.focus(); }, [asking]);

  const comment = reasonComment(chips, text);
  const act = useCallback(async (action: Action) => {
    if (busy) return;
    if (action === 'redo' && !comment) return;
    setBusy(action); setErr('');
    const e = await post(it, action, action === 'redo' ? comment : '');
    if (e) { setErr(e); setBusy(''); return; }
    onDone();
  }, [busy, comment, it, onDone]);

  // Keys: A approve · R redraw · N not good enough (the reasons, then Enter) ·
  // 1–6 a reason (while the box is empty) · Enter sends · Esc back · ← → move. The next card comes up by itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (typing) {
        if (e.key === 'Enter') { e.preventDefault(); act('redo'); }
        else if (e.key === 'Escape') { setAsking(false); (e.target as HTMLElement).blur(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a' && !asking) act('approve');
      else if (k === 'r' && !asking) act('redraw');
      else if (k === 'n') setAsking(true);
      else if (asking && /^[1-6]$/.test(k)) setChips(c => toggle(c, REASON_CHIPS[Number(k) - 1]));
      else if (asking && k === 'enter') act('redo');
      else if (k === 'escape') setAsking(false);
      else if (k === 'arrowright') onMove(1);
      else if (k === 'arrowleft') onMove(-1);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, asking, onMove]);

  return (
    <article className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold text-navy">{title(it)}</p>
        <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${it.lane === 'solution' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
          {it.isNew ? (it.lane === 'solution' ? 'New solution drawing' : 'New question drawing') : it.lane === 'solution' ? 'Solution figure' : 'Question figure'}{it.level ? ` · ${it.level}` : ''}
        </span>
      </div>

      <Picture src={it.afterUrl} alt="the fixed figure" />
      {it.whatChanged && <p className="text-[12px] text-gray-500">{it.whatChanged.replace(/^#B\d+-\d+\s*·?\s*/, '')}</p>}
      {it.holdReason && <p className="text-[12px] text-amber-700">⚠ {it.holdReason}</p>}

      {it.isNew ? (
        <p className="text-[12px] text-gray-500">New — {it.lane === 'solution' ? 'this answer' : 'this question'} had no drawing before.</p>
      ) : (<>
        <button type="button" onClick={() => setShowBefore(v => !v)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-2">
          {showBefore ? 'Hide the old one' : 'Show the old one'}
        </button>
        {showBefore && <Picture src={it.beforeUrl} alt="the figure before" />}
      </>)}

      {asking ? (
        <div className="space-y-2">
          <Chips picked={chips} onToggle={c => setChips(x => toggle(x, c))} />
          <input ref={box} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              // An empty box: 1–6 picks a reason instead of typing the digit.
              if (!text && /^[1-6]$/.test(e.key)) { e.preventDefault(); setChips(c => toggle(c, REASON_CHIPS[Number(e.key) - 1])); }
            }}
            placeholder="Anything else? (optional)" className="w-full rounded-xl border border-gray-200 p-2.5 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={!comment || !!busy} onClick={() => act('redo')}
              className="flex-1 rounded-xl bg-amber-600 text-white font-semibold py-2.5 disabled:opacity-40">{busy === 'redo' ? 'Sending…' : 'Send back ↵'}</button>
            <button type="button" onClick={() => { setAsking(false); setChips([]); setText(''); }} className="rounded-xl border border-gray-200 px-4 font-semibold text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!!busy} onClick={() => act('approve')}
            className="rounded-xl bg-emerald-600 text-white font-semibold py-2.5 disabled:opacity-40">{busy === 'approve' ? '…' : '✓ Approve'} <span className="opacity-60 text-[11px]">A</span></button>
          <button type="button" disabled={!!busy} onClick={() => setAsking(true)}
            className="rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-semibold py-2.5 disabled:opacity-40">💬 Not good <span className="opacity-60 text-[11px]">N</span></button>
          <button type="button" disabled={!!busy} onClick={() => act('redraw')}
            className="rounded-xl bg-white text-navy border border-gray-300 font-semibold py-2.5 disabled:opacity-40">{busy === 'redraw' ? '…' : '✏️ Redraw'} <span className="opacity-60 text-[11px]">R</span></button>
        </div>
      )}
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      <div className="flex items-center justify-between text-[12px] text-gray-500">
        <button type="button" disabled={pos === 0} onClick={() => onMove(-1)} className="font-semibold disabled:opacity-30">← Back</button>
        <span>{pos + 1} of {count} on this page</span>
        <button type="button" disabled={pos >= count - 1} onClick={() => onMove(1)} className="font-semibold disabled:opacity-30">Skip →</button>
      </div>
    </article>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function FiguresCheckPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'grid' | 'one'>('grid');
  const [items, setItems] = useState<Item[]>([]);
  const [ahead, setAhead] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [sentBack, setSentBack] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gone, setGone] = useState(0);
  const [pos, setPos] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);
  useEffect(() => {
    try { const m = localStorage.getItem('figures_check_mode'); if (m === 'one' || m === 'grid') setMode(m); } catch { /* fine */ }
  }, []);

  const size = mode === 'grid' ? GRID_PAGE : ONE_PAGE;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/admin/figures-bank?kind=check&page=0&pageSize=${size}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `failed (${r.status})`);
      setItems(j.items ?? []); setTotal(j.total ?? 0); setSentBack(j.sentBack ?? 0); setGone(0); setPos(0);
      // The page after this one, to warm its pictures while Adrian works here.
      fetch(`/api/admin/figures-bank?kind=check&page=1&pageSize=${size}`).then(x => x.json())
        .then(k => setAhead(k.items ?? [])).catch(() => setAhead([]));
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, [size]);
  useEffect(() => { if (authed) load(); }, [authed, load]);
  // A finished batch brings the next one by itself (Adrian, 2 Oct 2026); the button
  // stays only for a load that came back empty, so this can never loop.
  useEffect(() => {
    if (authed && !loading && items.length === 0 && gone > 0 && total - gone > 0) load();
  }, [authed, loading, items.length, gone, total, load]);

  // One at a time: the next three pictures are fetched before they are needed.
  useEffect(() => {
    if (mode !== 'one') return;
    const next = [...items.slice(pos + 1, pos + 4), ...ahead.slice(0, Math.max(0, pos + 4 - items.length))];
    preload(next.map(it => sizedImageUrl(it.afterUrl, FULL_W)));
  }, [mode, items, ahead, pos]);

  const nextThumbs = ahead.map(it => sizedImageUrl(it.afterUrl, THUMB_W));
  const removeDone = useCallback((paths: string[]) => {
    setGone(g => g + paths.length);
    setItems(xs => xs.filter(x => !paths.includes(x.path)));
  }, []);

  if (authed === null) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (!authed) return (
    <form className="p-6 max-w-sm mx-auto space-y-3" onSubmit={async e => { e.preventDefault(); setAuthed(await loginAdminSession(pw)); }}>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password" className="w-full rounded-xl border p-2.5" />
      <button className="w-full rounded-xl bg-navy text-white font-semibold py-2.5">Sign in</button>
    </form>
  );

  const left = Math.max(0, total - gone);
  const current = items[Math.min(pos, items.length - 1)];
  function pickMode(m: 'grid' | 'one') {
    if (m === mode) return;
    try { localStorage.setItem('figures_check_mode', m); } catch { /* fine */ }
    setMode(m);
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className={`${mode === 'grid' ? 'max-w-6xl' : 'max-w-2xl'} mx-auto px-4 py-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <a href="/admin/figures-bank" className="text-sm font-semibold text-navy">← Figures</a>
          {sentBack > 0 && <span className="text-[12px] text-gray-500">{sentBack} sent back, waiting for a redo</span>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-navy">Check fixed figures</h1>
          <div className="flex rounded-xl bg-white border border-gray-200 p-0.5 text-[13px] font-semibold">
            {(['grid', 'one'] as const).map(m => (
              <button key={m} type="button" onClick={() => pickMode(m)}
                className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-navy text-white' : 'text-gray-600'}`}>{m === 'grid' ? 'Grid' : 'One at a time'}</button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-600">{left === 0 && !loading ? 'Nothing to check.' : `${left} to check.`}</p>
        {error && <p className="text-sm text-rose-700">{error}</p>}

        {mode === 'grid' && items.length > 0 && <Grid items={items} onGone={removeDone} nextThumbs={nextThumbs} />}
        {mode === 'one' && current && (
          <One key={current.path} it={current} pos={Math.min(pos, items.length - 1)} count={items.length}
            onDone={() => removeDone([current.path])}
            onMove={d => setPos(p => Math.max(0, Math.min(items.length - 1, p + d)))} />
        )}

        {!loading && items.length === 0 && left > 0 && (
          <button type="button" onClick={load} className="w-full rounded-xl bg-navy text-white font-semibold py-3">Next {Math.min(size, left)} ›</button>
        )}
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
      </div>
    </div>
  );
}
