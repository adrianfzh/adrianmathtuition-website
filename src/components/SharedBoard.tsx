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
import { applyPatch, applyStickerOp, BLANK_PAGE_URL, BOARD_PAPERS, changedPages, displayPageCount, paperUrl, placeSticker, pollMayReplace, shareText, versionWhen, VERSION_WHY, type BoardRole, type PaperGroup, type StickerOp, type VersionReason } from '@/lib/shared-board';
import BoardStickers, { type ShownSticker } from '@/components/BoardStickers';
import { strokesToSvg } from '@/lib/annotate/layer';
import BoardSummaryView from '@/components/BoardSummaryView';

type Version = { id: string; created_at: string; reason: VersionReason; tutor_strokes: number; student_strokes: number };

type StoredPage = { index: number; ref: string | null; url: string | null };
type Opened = {
  id: string; role: BoardRole; title: string; tutorName: string; studentName: string | null;
  pages: StoredPage[];
  mine: InkPages; other: InkPages; otherAt: string | null;
  stickers: ShownSticker[];
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
  const [stickers, setStickers] = useState<ShownSticker[]>([]);
  const stickersRef = useRef<ShownSticker[]>([]); stickersRef.current = stickers;
  /** "Move photos": the stickers take the touch, the pen rests. */
  const [arrange, setArrange] = useState(false);
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  /** The student's summary (6 Nov 2026) — the student makes it, the tutor reads it. */
  const [showSummary, setShowSummary] = useState(false);
  /** 🗂 Page thumbnails (5 Nov 2026): every page small, tap one to jump to it. */
  const [thumbs, setThumbs] = useState<Record<number, { w: number; h: number }> | null>(null);
  const fileMode = useRef<'pages' | 'sticker'>('pages');
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
    // Stickers: keep the address already drawn when the photo is the same one.
    setStickers(old => (b.stickers ?? []).map(n => { const o = old.find(x => x.id === n.id); return o && o.ref === n.ref && o.url ? { ...n, url: o.url } : n; }));
    if (pagesOnly) return;
    setBoard(b); setOther(b.other ?? {}); setMineCount(b.mine ?? {});
    sent.current = b.mine ?? {}; otherAtRef.current = b.otherAt;
  }, [api, auth.headers]);
  useEffect(() => { void open(); }, [open]);
  // Opened from a search result (…#page-4): go to that page once the pages are on screen.
  const jumped = useRef(false);
  useEffect(() => {
    if (!board || jumped.current) return;
    const m = /^#page-(\d+)$/.exec(window.location.hash);
    if (!m) { jumped.current = true; return; }
    const t = setTimeout(() => { jumped.current = true; jumpTo(Number(m[1])); }, 600);
    return () => clearTimeout(t);
  }, [board]);

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
    // A sticker added, moved, resized or removed on the other screen: the whole (small) list arrives.
    ch.on('broadcast', { event: 'stickers' }, ({ payload }) => {
      if (!payload || payload.from === board.role || !Array.isArray(payload.list)) return;
      lastLiveAt.current = Date.now();
      setStickers(payload.list as ShownSticker[]);
    });
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
      const j = await r.json().catch(() => null) as { pageCount: number; stickerStamp?: string; other?: InkPages; otherAt: string | null } | null;
      if (!j) return;
      const stamp = stickersRef.current.map(x => `${x.id}:${x.x},${x.y},${x.w},${x.h}`).join('|');
      if (j.stickerStamp !== undefined && j.stickerStamp !== stamp && pollMayReplace(lastLiveAt.current, Date.now())) { void open(true); return; }
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

  // ── ＋ Add: a template page (paper, maths, organise) ──────────────────────
  async function addPaper(key: string) {
    setAdding(false); setMsg(''); setBusy('Adding the page…');
    try {
      const r = await fetch(api('page'), { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, paper: key }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not add the page.');
      await open(true);
      void chan.current?.send({ type: 'broadcast', event: 'pages', payload: {} });
      setTimeout(() => document.getElementById(`page-${j.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(''); }
  }

  // ── photo stickers ────────────────────────────────────────────────────────
  /** The page most in view (the pen's pages carry id="page-N"), and its size in page pixels. */
  const pageInView = (): { index: number; box: { w: number; h: number } } | null => {
    const mid = window.innerHeight / 2;
    let best: { index: number; d: number; el: HTMLElement } | null = null;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[id^="page-"]'))) {
      const r = el.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      const index = Number(el.id.slice(5));
      if (Number.isInteger(index) && (!best || d < best.d)) best = { index, d, el };
    }
    if (!best) return null;
    const m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(best.el.style.aspectRatio || '');
    return { index: best.index, box: m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1000, h: 1414 } };
  };
  const sendStickers = (list: ShownSticker[]) => { if (role) void chan.current?.send({ type: 'broadcast', event: 'stickers', payload: { from: role, list } }); };
  const postSticker = async (change: StickerOp) => {
    const r = await fetch(api('sticker'), { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: boardId, change }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not save the photo.');
    return j as { sticker?: ShownSticker | null };
  };
  async function addSticker(file: File) {
    const at = pageInView();
    if (!at) return;
    const [jpg] = await heicFilesToJpeg([file], s => setBusy(s));
    setBusy('Adding the photo…');
    const up = await resizeToJpeg(jpg);
    const dims = await new Promise<{ w: number; h: number }>(res => {
      const u = URL.createObjectURL(up); const im = new Image();
      im.onload = () => { res({ w: im.naturalWidth || 4, h: im.naturalHeight || 3 }); URL.revokeObjectURL(u); };
      im.onerror = () => { res({ w: 4, h: 3 }); URL.revokeObjectURL(u); };
      im.src = u;
    });
    const res = await uploadStudentFile(api('upload-token', `filename=${encodeURIComponent(up.name || 'photo.jpg')}`), up, { contentType: up.type || 'image/jpeg', headers: auth.headers });
    const id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
    const sticker = { id, page: at.index, url: res.url, ...placeSticker(at.box, dims) };
    const j = await postSticker({ op: 'add', sticker });
    const shown: ShownSticker = j.sticker ?? { ...sticker, ref: res.url };
    const next = [...stickersRef.current.filter(x => x.id !== id), shown];
    setStickers(next); sendStickers(next);
    setArrange(true);                         // straight into "Move photos" so it can be placed
  }
  const lastMoveSent = useRef(0);
  const onStickerMove = useCallback((id: string, b: { x: number; y: number; w: number; h: number }) => {
    const now = Date.now();
    if (now - lastMoveSent.current < 120) return;
    lastMoveSent.current = now;
    sendStickers(stickersRef.current.map(x => (x.id === id ? { ...x, ...b } : x)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  async function onStickerCommit(id: string, b: { x: number; y: number; w: number; h: number }) {
    const next = applyStickerOp(stickersRef.current, { op: 'update', id, ...b }) as ShownSticker[] | null;
    if (!next) return;
    setStickers(next); sendStickers(next);
    try { await postSticker({ op: 'update', id, ...b }); } catch (e) { setMsg((e as Error).message); }
  }
  async function onStickerDelete(id: string) {
    if (!window.confirm('Remove this photo from the page?')) return;
    const next = stickersRef.current.filter(x => x.id !== id);
    setStickers(next); sendStickers(next);
    try { await postSticker({ op: 'delete', id }); } catch (e) { setMsg((e as Error).message); }
  }
  const pageExtra = useCallback((index: number, box: { w: number; h: number }) => (
    <BoardStickers list={stickers} page={index} box={box} arrange={arrange}
      onMove={onStickerMove} onCommit={(id, b) => void onStickerCommit(id, b)} onDelete={id => void onStickerDelete(id)} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [stickers, arrange, onStickerMove]);

  function pickFiles(mode: 'pages' | 'sticker') {
    fileMode.current = mode; setAdding(false);
    if (photoRef.current) {
      photoRef.current.accept = mode === 'sticker' ? 'image/*' : 'image/*,application/pdf';
      photoRef.current.multiple = mode === 'pages';
      photoRef.current.click();
    }
  }
  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    if (fileMode.current === 'pages') return addPhoto(list);
    setMsg('');
    try { await addSticker(list[0]); } catch (e) { setMsg((e as Error).message || 'Could not add the photo.'); }
    finally { setBusy(''); if (photoRef.current) photoRef.current.value = ''; }
  }

  // ── the tutor's own saved boards ─────────────────────────────────────────
  async function saveTemplate() {
    const title = window.prompt('Name this template (your writing, the pages and photos are kept — never the student\'s writing):', board?.title ?? '');
    if (title == null) return;
    setBusy('Saving the template…'); setMsg('');
    try {
      const r = await fetch('/api/tutor/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId, title }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the template.');
      setBusy(`Saved as “${j.title}” — start a new board from it on the student's page.`);
      setTimeout(() => setBusy(''), 4000);
      return;
    } catch (e) { setMsg((e as Error).message); }
    setBusy('');
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

  /** Scroll so page `i` sits just under the sticky header. */
  function jumpTo(i: number) {
    const el = document.getElementById(`page-${i}`);
    if (!el) return;
    const head = document.querySelector('[data-board-header]')?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - head - 8, behavior: 'smooth' });
  }
  function openThumbs() {
    if (thumbs) { setThumbs(null); return; }
    // Each page's shape, as the pen measured it (its aspect-ratio), so writing and stickers sit right in the small copy.
    const boxes: Record<number, { w: number; h: number }> = {};
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[id^="page-"]'))) {
      const m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(el.style.aspectRatio || '');
      if (m) boxes[Number(el.id.slice(5))] = { w: Number(m[1]), h: Number(m[2]) };
    }
    setAdding(false); setShowVersions(false); setShare(false);
    setThumbs(boxes);
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
      <header data-board-header className="sticky top-0 z-20 -mx-2 sm:-mx-4 mb-3 border-b bg-slate-50/95 px-3 sm:px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {back && <a href={back.href} className="text-sm text-slate-500 shrink-0" aria-label={back.label}>‹</a>}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={board.title}>{board.title}</h1>
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${here ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`} role="status" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${here ? 'bg-emerald-500' : live === 'live' ? 'bg-slate-400' : 'bg-amber-500'}`} aria-hidden />
            {here ? `${otherName.split(/\s+/)[0]} is here` : live === 'connecting' ? 'Connecting…' : live === 'live' ? `${otherName.split(/\s+/)[0]} not here yet` : 'Updates every few seconds'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => setAdding(a => !a)} aria-expanded={adding} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">＋ Add</button>
          <input ref={photoRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => void onFiles(e.target.files)} />
          {stickers.length > 0 && (
            <button type="button" onClick={() => setArrange(a => !a)} aria-pressed={arrange}
              className={`rounded-lg border px-3 py-1.5 text-sm ${arrange ? 'border-sky-600 bg-sky-600 text-white font-semibold' : 'bg-white'}`}>{arrange ? 'Done' : 'Move photos'}</button>
          )}
          <button type="button" onClick={openThumbs} aria-expanded={!!thumbs} className={`rounded-lg border px-3 py-1.5 text-sm ${thumbs ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>Pages</button>
          {board.role === 'student' && (
            <button type="button" onClick={() => setShowSummary(true)} className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-800">Summary</button>
          )}
          {board.role === 'tutor' && (
            <button type="button" onClick={() => { setShare(x => !x); setMore(false); }} className="rounded-lg border bg-white px-3 py-1.5 text-sm" aria-expanded={share}>
              {board.linkOn ? 'Share' : 'Link off'}
            </button>
          )}
          <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} aria-label="More" className={`rounded-lg border px-3 py-1.5 text-sm ${more ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>More</button>
        </div>
        {more && (
          // The less-used buttons, folded away so the phone keeps its writing space (5 Nov 2026).
          <div className="mt-2 flex flex-wrap gap-2 rounded-xl border bg-white p-2" data-more>
            <button type="button" disabled={!!busy} onClick={() => { setMore(false); void downloadPdf(); }} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Download PDF</button>
            <button type="button" onClick={() => { setMore(false); setShowVersions(true); void loadVersions(); }} className="rounded-lg border px-3 py-1.5 text-sm">Earlier versions</button>
            {board.role === 'tutor' && <button type="button" onClick={() => { setMore(false); setShowSummary(true); }} className="rounded-lg border px-3 py-1.5 text-sm">Student’s summary</button>}
            {board.role === 'tutor' && <button type="button" disabled={!!busy} onClick={() => { setMore(false); void saveTemplate(); }} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Save as template</button>}
          </div>
        )}
        {busy && <p className="mt-1 text-xs text-slate-500">{busy}</p>}
        {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
        {arrange && <p className="mt-1 text-xs text-sky-800">Drag a photo to move it. Drag its blue corner to make it bigger or smaller. ✕ removes it. The pen rests until you tap Done.</p>}
        {thumbs && (
          <div className="mt-2 max-h-[55vh] overflow-y-auto rounded-xl border bg-white p-3" data-thumbs>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pages.map(p => {
                const box = thumbs[p.index] ?? { w: 1000, h: 1414 };
                const layers = [other[p.index], mineCount[p.index]].filter(l => l && l.strokes?.length);
                return (
                  <button key={p.index} type="button" onClick={() => { setThumbs(null); setTimeout(() => jumpTo(p.index), 50); }} className="text-center" aria-label={`Go to page ${p.index + 1}`} data-thumb={p.index}>
                    <span className="relative block overflow-hidden rounded-md border bg-white" style={{ aspectRatio: `${box.w} / ${box.h}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-fill" />
                      {stickers.filter(st => st.page === p.index && st.url).map(st => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={st.id} src={st.url!} alt="" className="absolute object-fill"
                          style={{ left: `${(st.x / box.w) * 100}%`, top: `${(st.y / box.h) * 100}%`, width: `${(st.w / box.w) * 100}%`, height: `${(st.h / box.h) * 100}%` }} />
                      ))}
                      {layers.map((l, k) => (
                        <svg key={k} viewBox={`0 0 ${l!.w} ${l!.h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden
                          dangerouslySetInnerHTML={{ __html: strokesToSvg(l!.strokes) }} />
                      ))}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-600">{p.index + 1}{p.index === pages.length - 1 ? ' · empty' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {adding && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border bg-white p-3" data-add-menu>
            <p className="text-sm font-semibold">From your files</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => pickFiles('pages')} className="rounded-lg border px-2 py-2 text-left text-sm"><span className="font-semibold">Photo or PDF</span><br /><span className="text-xs text-slate-500">as new pages at the end</span></button>
              <button type="button" onClick={() => pickFiles('sticker')} className="rounded-lg border px-2 py-2 text-left text-sm"><span className="font-semibold">Photo on this page</span><br /><span className="text-xs text-slate-500">a sticker you can move and resize</span></button>
            </div>
            {(['Paper', 'Maths', 'Organise'] as PaperGroup[]).map(g => (
              <div key={g} className="mt-3">
                <p className="text-sm font-semibold">{g === 'Paper' ? 'A new page of paper' : g === 'Maths' ? 'Maths pages' : 'Organise'}</p>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {BOARD_PAPERS.filter(p => p.group === g).map(p => (
                    <button key={p.key} type="button" onClick={() => void addPaper(p.key)} className="text-center" data-paper={p.key}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={paperUrl(p.key)} alt="" className="w-full rounded-md border bg-white" style={{ aspectRatio: '1000 / 1414' }} />
                      <span className="mt-0.5 block text-[11px] leading-tight text-slate-600">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
            <button type="button" onClick={() => setShowVersions(false)} className="float-right ml-2 text-xs text-slate-500 underline">Close</button>
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
      {showSummary && <BoardSummaryView role={board.role} api={api} headers={auth.headers} onClose={() => setShowSummary(false)} />}
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
        readOnly={arrange}
        pageExtra={pageExtra}
      />
    </main>
  );
}
