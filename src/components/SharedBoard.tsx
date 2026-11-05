'use client';
// 🧑‍🏫 The shared board (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026: "a unlimited digital canvas
// (whiteboard) that tutors and tutees can write on" → "yes, build it").
//
// Like one big sheet of paper on the table between tutor and student, each on their own
// screen. The pen is the one students already write on their marked papers with
// (app/marking/StudentInk): MY layer is the editable one, the other side's layer is drawn
// under it and arrives live. Pages never run out (lib/shared-board displayPageCount).
//
// Live: a Supabase broadcast channel (name from the server, unguessable) carries only the
// pages that changed; the database is the truth (each side saves its own layer a moment
// after each stroke) and a slow poll catches anything the channel missed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import StudentInk from '@/app/app/marking/StudentInk';
import type { InkPages } from '@/lib/student-ink';
import { uploadStudentFile } from '@/lib/student-files-client';
import { resizeToJpeg } from '@/lib/spread-split';
import { heicFilesToJpeg } from '@/lib/heic-browser';
import { pdfToPageImages } from '@/lib/pdf-pages';
import { applyPatch, BLANK_PAGE_URL, changedPages, displayPageCount, pollMayReplace, shareText, versionWhen, VERSION_WHY, type BoardRole, type VersionReason } from '@/lib/shared-board';

type Version = { id: string; created_at: string; reason: VersionReason; tutor_strokes: number; student_strokes: number };

type StoredPage = { index: number; ref: string | null; url: string | null };
type Opened = {
  id: string; role: BoardRole; title: string; tutorName: string; studentName: string | null;
  pages: StoredPage[];
  mine: InkPages; other: InkPages; otherAt: string | null;
  channel: string; rt: { url: string | null; key: string | null };
  link?: string; linkOn?: boolean;
};

export default function SharedBoard({ boardId, linkKey, back }: { boardId?: string; linkKey?: string; back?: { href: string; label: string } }) {
  const auth = useMemo(() => ({
    q: boardId ? `id=${encodeURIComponent(boardId)}` : '',
    headers: (linkKey ? { 'x-board-key': linkKey } : {}) as Record<string, string>,
  }), [boardId, linkKey]);
  const api = useCallback((op: string, extra = '') => `/api/board/${op}?${[auth.q, extra].filter(Boolean).join('&')}`, [auth.q]);

  const [board, setBoard] = useState<Opened | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredPage[]>([]);
  const [other, setOther] = useState<InkPages>({});
  const [mineCount, setMineCount] = useState<InkPages>({});
  const [live, setLive] = useState<'connecting' | 'live' | 'off'>('connecting');
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [share, setShare] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  /** Bumped after an earlier version comes back: the pen mounts again on the restored layer. */
  const [gen, setGen] = useState(0);
  // A phone has no Pencil: one finger writes from the start. Read once, before the pen mounts.
  const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches);
  const storedLen = useRef(0);

  const otherAtRef = useRef<string | null>(null);
  const lastLiveAt = useRef(0);
  const sent = useRef<InkPages>({});
  const chan = useRef<RealtimeChannel | null>(null);
  const role = board?.role;

  const open = useCallback(async (pagesOnly = false) => {
    const r = await fetch(api('open'), { headers: auth.headers, cache: 'no-store' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { if (!pagesOnly) setFailed(j.error || 'Could not open the board — check your connection and reload.'); return; }
    const b = j as Opened;
    // A page whose stored reference did not change keeps the address it already drew (a fresh signature would reload it).
    setStored(old => b.pages.map(p => { const o = old[p.index]; return o && o.ref === p.ref && o.url ? o : p; }));
    storedLen.current = b.pages.length;
    if (pagesOnly) return;
    setBoard(b); setOther(b.other ?? {}); setMineCount(b.mine ?? {});
    sent.current = b.mine ?? {}; otherAtRef.current = b.otherAt;
  }, [api, auth.headers]);
  useEffect(() => { void open(); }, [open]);

  // ── live channel ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!board?.rt.url || !board.rt.key) { setLive('off'); return; }
    const sb = createClient(board.rt.url, board.rt.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = sb.channel(board.channel, { config: { broadcast: { self: false }, presence: { key: board.role } } });
    ch.on('broadcast', { event: 'ink' }, ({ payload }) => {
      if (!payload || payload.from === board.role) return;
      lastLiveAt.current = Date.now();
      setOther(o => applyPatch(o, payload.patch ?? {}));
    });
    ch.on('broadcast', { event: 'pages' }, () => { void open(true); });
    // The other side brought an earlier version back: read the board again and start the pen on it.
    ch.on('broadcast', { event: 'restored' }, () => { void settle().then(() => open()).then(() => setGen(g => g + 1)); });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setHere(Object.keys(st).some(k => k !== board.role));
    });
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') { setLive('live'); void ch.track({ role: board.role, at: Date.now() }); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive('off');
    });
    chan.current = ch;
    return () => { chan.current = null; void sb.removeChannel(ch); };
  }, [board?.id, board?.channel, board?.role, board?.rt.url, board?.rt.key, open]);

  // ── the slow poll: faster when the live channel is down ─────────────────────
  useEffect(() => {
    if (!board) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      const since = otherAtRef.current ? `since=${encodeURIComponent(otherAtRef.current)}` : '';
      const r = await fetch(api('poll', since), { headers: auth.headers, cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json().catch(() => null) as { pageCount: number; other?: InkPages; otherAt: string | null } | null;
      if (!j) return;
      if (j.other && pollMayReplace(lastLiveAt.current, Date.now())) { setOther(j.other); otherAtRef.current = j.otherAt; }
      if (j.pageCount !== storedLen.current) void open(true);
    };
    const t = setInterval(() => void tick(), live === 'live' ? 8000 : 2500);
    return () => { stop = true; clearInterval(t); };
  }, [board, api, auth.headers, live, open]);

  // ── my layer: save it, and send the pages that changed ──────────────────────
  const save = useCallback(async (pages: InkPages, opts: { keepalive: boolean }) => {
    const r = await fetch(api('ink'), {
      method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, keepalive: opts.keepalive,
      body: JSON.stringify({ id: boardId, pages }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Could not save'); }
  }, [api, auth.headers, boardId]);
  // The pen saves a moment (1.2 s) after the last stroke; a restore waits for that save, or it would overwrite the version brought back.
  const lastChangeAt = useRef(0);
  const settle = () => new Promise<void>(r => setTimeout(r, Math.max(0, lastChangeAt.current + 2500 - Date.now())));
  const onChange = useCallback((pages: InkPages) => {
    lastChangeAt.current = Date.now();
    setMineCount(pages);
    const patch = changedPages(sent.current, pages);
    sent.current = pages;
    if (Object.keys(patch).length && chan.current && role) void chan.current.send({ type: 'broadcast', event: 'ink', payload: { from: role, patch } });
  }, [role]);

  const count = displayPageCount(stored.length, mineCount, other);
  const pages = useMemo(() => Array.from({ length: count }, (_, i) => ({ index: i, url: stored[i]?.url || BLANK_PAGE_URL })), [count, stored]);

  // ── photo of a question ─────────────────────────────────────────────────────
  const photoRef = useRef<HTMLInputElement>(null);
  async function addPhoto(list: FileList | null) {
    if (!list?.length) return;
    setMsg('');
    try {
      // A PDF becomes one page per PDF page (Adrian, 5 Nov 2026: "annotate pdfs?") — the same reader the hand-in uses.
      const raw: File[] = [];
      for (const f of Array.from(list).slice(0, 5)) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          setBusy(`Reading ${f.name}…`);
          raw.push(...(await pdfToPageImages(f, (d, t) => setBusy(`Reading ${f.name} — page ${d} of ${t}…`))).slice(0, 20));
        } else raw.push(f);
      }
      const files = await heicFilesToJpeg(raw.slice(0, 20), s => setBusy(s));
      let last = -1;
      for (const [n, f] of files.entries()) {
        setBusy(files.length > 1 ? `Adding page ${n + 1} of ${files.length}…` : 'Adding the photo…');
        const up = await resizeToJpeg(f);
        const res = await uploadStudentFile(api('upload-token', `filename=${encodeURIComponent(up.name || 'photo.jpg')}`), up, { contentType: up.type || 'image/jpeg', headers: auth.headers });
        const r = await fetch(api('photo'), { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, url: res.url }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not add the photo.');
        last = j.index;
      }
      await open(true);
      void chan.current?.send({ type: 'broadcast', event: 'pages', payload: {} });
      if (last >= 0) setTimeout(() => document.getElementById(`page-${last}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (e) { setMsg((e as Error).message || 'Could not add the photo.'); }
    finally { setBusy(''); if (photoRef.current) photoRef.current.value = ''; }
  }

  async function downloadPdf() {
    setBusy('Making the PDF…'); setMsg('');
    try {
      const r = await fetch(api('pdf'), { headers: auth.headers, cache: 'no-store' });
      if (!r.ok) throw new Error('Could not make the PDF — try again.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${board?.title || 'board'}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(''); }
  }

  async function linkAction(action: 'new-link' | 'link-off' | 'link-on') {
    if (action === 'new-link' && !window.confirm('Make a new link? The old link stops working.')) return;
    const r = await fetch('/api/tutor/boards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Could not change the link.'); return; }
    if (action === 'new-link') { await open(); return; }   // a new link = a new live channel
    setBoard(b => b ? { ...b, link: j.link, linkOn: j.linkOn } : b);
  }

  async function loadVersions() {
    setVersions(null);
    const r = await fetch(api('versions'), { headers: auth.headers, cache: 'no-store' }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    setVersions(j?.versions ?? []);
  }

  async function restore(v: Version, which: 'mine' | 'both') {
    const what = which === 'both' ? 'everyone’s writing' : 'your writing';
    if (!window.confirm(`Bring back ${what} from ${versionWhen(v.created_at)}? Today’s board is kept as a copy, so you can undo this.`)) return;
    setBusy('Bringing it back…'); setMsg('');
    try {
      await settle();
      const r = await fetch(api('restore'), { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, versionId: v.id, which }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not bring it back.');
      void chan.current?.send({ type: 'broadcast', event: 'restored', payload: {} });
      await open();
      setGen(g => g + 1);
      setShowVersions(false);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(''); }
  }

  if (failed) return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-lg font-semibold">This board is not open</p>
      <p className="mt-2 text-sm text-slate-600">{failed}</p>
      {back && <a className="mt-4 inline-block underline" href={back.href}>{back.label}</a>}
    </main>
  );
  if (!board) return <main className="p-6 text-slate-500">Opening the board…</main>;

  const otherName = board.role === 'tutor' ? (board.studentName ?? 'Student') : board.tutorName;
  const otherLabel = board.role === 'tutor' ? `${(board.studentName ?? 'student').split(/\s+/)[0]}'s writing` : `${board.tutorName.split(/\s+/)[0]}'s writing`;
  const wa = board.link ? `https://wa.me/?text=${encodeURIComponent(shareText(board.studentName ?? '', board.link))}` : '';

  return (
    <main className="mx-auto max-w-3xl px-2 sm:px-4 pb-40">
      <header className="sticky top-0 z-20 -mx-2 sm:-mx-4 mb-3 border-b bg-slate-50/95 px-3 sm:px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {back && <a href={back.href} className="text-sm text-slate-500 shrink-0" aria-label={back.label}>‹</a>}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={board.title}>{board.title}</h1>
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${here ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`} role="status" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${here ? 'bg-emerald-500' : live === 'live' ? 'bg-slate-400' : 'bg-amber-500'}`} aria-hidden />
            {here ? `${otherName.split(/\s+/)[0]} is here` : live === 'connecting' ? 'Connecting…' : live === 'live' ? `${otherName.split(/\s+/)[0]} not here yet` : 'Updates every few seconds'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => photoRef.current?.click()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">＋ Photo or PDF</button>
          <input ref={photoRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => void addPhoto(e.target.files)} />
          <button type="button" disabled={!!busy} onClick={() => void downloadPdf()} className="rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-50">Download PDF</button>
          <button type="button" onClick={() => { setShowVersions(v => !v); if (!showVersions) void loadVersions(); }} aria-expanded={showVersions} className="rounded-lg border bg-white px-3 py-1.5 text-sm">Earlier versions</button>
          {board.role === 'tutor' && (
            <button type="button" onClick={() => setShare(s => !s)} className="rounded-lg border bg-white px-3 py-1.5 text-sm" aria-expanded={share}>
              {board.linkOn ? 'Share with student' : 'Link is off'}
            </button>
          )}
        </div>
        {busy && <p className="mt-1 text-xs text-slate-500">{busy}</p>}
        {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
        {share && board.role === 'tutor' && (
          <div className="mt-2 rounded-xl border bg-white p-3 text-sm">
            {board.linkOn ? (
              <>
                <p className="text-slate-600">Send this private link to {board.studentName ?? 'your student'}. Whoever has it can write on this board — no login needed.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">Send on WhatsApp</a>
                  <button type="button" className="rounded-lg border px-3 py-1.5" onClick={() => { void navigator.clipboard?.writeText(board.link!).then(() => setMsg(''), () => setMsg('Copy failed — press and hold the link to copy it.')); setBusy('Link copied'); setTimeout(() => setBusy(''), 1500); }}>Copy link</button>
                </div>
                <p className="mt-2 break-all text-xs text-slate-500">{board.link}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button type="button" className="underline text-slate-600" onClick={() => void linkAction('link-off')}>Switch the link off</button>
                  <button type="button" className="underline text-slate-600" onClick={() => void linkAction('new-link')}>Make a new link</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-600">The link is off. Nobody but you can open this board.</p>
                <button type="button" className="mt-2 rounded-lg border px-3 py-1.5" onClick={() => void linkAction('link-on')}>Switch the link on</button>
              </>
            )}
          </div>
        )}
        {showVersions && (
          <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-xl border bg-white p-3 text-sm" data-versions>
            <p className="text-slate-600">The board keeps a copy every 10 minutes of writing, and just before anyone rubs out a lot. Bringing one back keeps today’s board as a copy too, so you can always undo it.</p>
            {versions === null && <p className="mt-2 text-slate-500">Loading…</p>}
            {versions && versions.length === 0 && <p className="mt-2 text-slate-500">No earlier versions yet — the first is kept after 10 minutes of writing.</p>}
            <ul className="mt-2 divide-y">
              {(versions ?? []).map(v => {
                const mineN = board.role === 'tutor' ? v.tutor_strokes : v.student_strokes;
                const otherN = board.role === 'tutor' ? v.student_strokes : v.tutor_strokes;
                return (
                  <li key={v.id} className="py-2">
                    <p className="font-medium">{versionWhen(v.created_at)}{VERSION_WHY[v.reason] && <span className="font-normal text-slate-500"> · {VERSION_WHY[v.reason]}</span>}</p>
                    <p className="text-xs text-slate-500">Your writing: {mineN} line{mineN === 1 ? '' : 's'} · {otherName.split(/\s+/)[0]}: {otherN} line{otherN === 1 ? '' : 's'}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button type="button" disabled={!!busy} className="rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50" onClick={() => void restore(v, 'mine')}>Bring back my writing</button>
                      {board.role === 'tutor' && <button type="button" disabled={!!busy} className="rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50" onClick={() => void restore(v, 'both')}>Bring back both</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </header>
      {phone && <p className="mb-2 px-1 text-xs text-slate-500">One finger writes. Two fingers move the page.</p>}
      <StudentInk
        key={`${board.id}:${board.channel}:${gen}`}
        runId={`board-${board.id}`}
        pages={pages}
        initial={board.mine}
        other={{ pages: other, label: otherLabel }}
        editor={board.role === 'tutor' ? 'adrian' : 'student'}
        save={save}
        onChange={onChange}
        heading={board.role === 'tutor' ? `With ${board.studentName ?? 'your student'}` : `With ${board.tutorName}`}
        otherNote={false}
        fingerWritesDefault={phone}
        typeTool
      />
    </main>
  );
}
