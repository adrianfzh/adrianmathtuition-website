'use client';

// 📄 Paper / ✅ Solutions beside the page in ✏️ Annotate (27 Oct 2026, SPEC-ANNOTATE §21 —
// Adrian: "Able to have the question paper or the solution side by side when annotating?
// Used to have this in the marking desk, then marking desk was gone." … "Yes").
//
// Landscape iPad: half the screen, beside the page. Portrait: a sheet from the bottom that
// closes with ✕. It follows the page being annotated: the paper scrolls to where that page's
// first question starts; the solutions show that page's questions.
//
// The paper is drawn on <canvas>, never <img>: while the pen is open every <img> on the page
// is hidden (the Live Text guard in AnnotateOverlay). Pages are drawn only near the view and
// let go when far away — a whole paper of full-size bitmaps is what gets an iPad tab killed.
// The solutions are a page of their own in a frame (/api/admin/annotate-side/solutions).
//
// Both at once (Adrian, 2 Nov 2026: "possible to have them side by side (so both can be seen
// at once) … with handles to resize them"): the panel shows the paper AND the solutions,
// split by a handle — side by side in the portrait sheet, one above the other beside the
// page in landscape. 📄 / ✅ in the header show just one; the choice and the split are kept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPdfjs } from '@/lib/pdf-pages';
import { findQuestionPage } from '@/lib/annotate/side-panel';

export type SideKind = 'paper' | 'solutions' | 'both';

type Info = { paperUrl: string | null; byPage: Record<string, string[]>; prompts: Record<string, string>; paperName: string | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AnnotateSidePanel({ runId, photoIndex, kind, beside, onKind, onClose }: {
  runId: string; photoIndex: number; kind: SideKind; beside: boolean;
  onKind: (k: SideKind) => void; onClose: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [infoErr, setInfoErr] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/annotate-side?runId=${encodeURIComponent(runId)}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); if (live) setInfo(d); })
      .catch((e) => { if (live) setInfoErr((e as Error).message); });
    return () => { live = false; };
  }, [runId]);

  // Follow the page, but not on every flick of a scroll: settle first.
  const [page, setPage] = useState(photoIndex);
  useEffect(() => { const t = setTimeout(() => setPage(photoIndex), 350); return () => clearTimeout(t); }, [photoIndex]);
  const questions = info?.byPage[String(page)] ?? [];

  // Drag the handle to make the panel bigger or smaller (Adrian, 2 Nov 2026): beside the
  // page it is the left edge (wider / narrower), as a sheet it is the top edge (taller /
  // shorter). The size is kept on this iPad for next time.
  const [size, setSize] = useState(() => readSize(beside));
  useEffect(() => { setSize(readSize(beside)); }, [beside]);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const parent = shellRef.current?.parentElement;
    if (!parent) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const box = parent.getBoundingClientRect();
    let frame = 0; let last = size;
    const move = (ev: PointerEvent) => {
      const pct = beside ? ((box.right - ev.clientX) / box.width) * 100 : ((box.bottom - ev.clientY) / box.height) * 100;
      last = clampSize(beside, pct);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(last));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(frame);
      setSize(last); setDragging(false);
      try { localStorage.setItem(sizeKey(beside), String(Math.round(last))); } catch { /* private mode */ }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  // ONE frame per paper (3 Nov 2026): the whole paper's solutions load once, and a page change
  // just tells the frame which section to show. A new frame per page (its own KaTeX, fonts and
  // model calls each time) was a fresh document for every page scrolled past — an iPad
  // scrolling through 17 pages died of it.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const showPage = useCallback((p: number) => {
    try { frameRef.current?.contentWindow?.postMessage({ type: 'show-page', page: p }, window.location.origin); } catch { /* frame not ready */ }
  }, []);
  useEffect(() => { showPage(page); }, [page, showPage]);
  const solutionsView = (
    <iframe key={runId} ref={frameRef} title="Worked solutions" src={`/api/admin/annotate-side/solutions?runId=${encodeURIComponent(runId)}&page=all`}
      onLoad={() => showPage(page)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#fff' }} />
  );
  const paperView = !info ? null
    : info.paperUrl ? <PaperPdf url={info.paperUrl} questions={questions} />
    : <PrintedQuestions runId={runId} questions={questions} prompts={info.prompts} />;

  const shell: React.CSSProperties = beside
    ? { width: `${size}%`, flex: 'none', position: 'relative', touchAction: 'pan-x pan-y', borderLeft: '1px solid #d1d5db', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { position: 'absolute', left: 0, right: 0, bottom: 0, height: `${size}%`, touchAction: 'pan-x pan-y', zIndex: 20, background: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, boxShadow: '0 -8px 28px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'annotate-sheet-in 180ms ease-out' };
  const tab = (on: boolean): React.CSSProperties => ({ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid ' + (on ? '#111827' : '#d1d5db'), background: on ? '#111827' : '#fff', color: on ? '#fff' : '#111827', fontSize: 14, fontWeight: 700, cursor: 'pointer' });

  return (
    <div ref={shellRef} data-side-panel style={shell} onPointerDown={(e) => e.stopPropagation()}>
      <style>{'@keyframes annotate-sheet-in{from{transform:translateY(30%);opacity:.4}to{transform:none;opacity:1}}'}</style>
      <div role="separator" aria-orientation={beside ? 'vertical' : 'horizontal'} aria-label="Drag to resize the panel" title="Drag to resize"
        onPointerDown={onHandleDown}
        style={beside
          ? { position: 'absolute', left: -14, top: 0, bottom: 0, width: 28, zIndex: 5, cursor: 'col-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }
          : { height: 22, flex: 'none', cursor: 'row-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={beside
          ? { width: 8, height: 64, borderRadius: 4, background: dragging ? '#111827' : '#9ca3af', boxShadow: '0 0 0 2px #fff' }
          : { width: 64, height: 6, borderRadius: 3, background: dragging ? '#111827' : '#9ca3af' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: beside ? '8px 10px 8px 18px' : '0 10px 8px', borderBottom: '1px solid #e5e7eb' }}>
        <button style={tab(kind === 'paper')} onClick={() => onKind('paper')}>📄 Paper</button>
        <button style={tab(kind === 'both')} onClick={() => onKind('both')} title="Paper and solutions together">📄 + ✅</button>
        <button style={tab(kind === 'solutions')} onClick={() => onKind('solutions')}>✅ Solutions</button>
        <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Page {page + 1}{questions.length ? ` · Q${questions.join(', Q')}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button aria-label="Close the panel" style={{ ...tab(false), width: 40, padding: 0 }} onClick={onClose}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', pointerEvents: dragging ? 'none' : undefined }}>
        {infoErr ? <p style={{ padding: 16, color: '#b91c1c', fontSize: 14 }}>Could not load the paper: {infoErr}</p>
          : !info ? <p style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>Loading…</p>
          : kind === 'both'
            ? <Split stacked={beside} paper={paperView} solutions={solutionsView} />
            : kind === 'solutions' ? solutionsView : paperView}
      </div>
    </div>
  );
}

const sizeKey = (beside: boolean) => (beside ? 'annotate-side-width' : 'annotate-side-height');
/** Percent of the screen: beside the page 25–80 % wide, as a sheet 30–92 % tall. */
function clampSize(beside: boolean, pct: number): number {
  return beside ? Math.min(80, Math.max(25, pct)) : Math.min(92, Math.max(30, pct));
}
function readSize(beside: boolean): number {
  try {
    const v = Number(localStorage.getItem(sizeKey(beside)));
    if (Number.isFinite(v) && v > 0) return clampSize(beside, v);
  } catch { /* private mode / server */ }
  return beside ? 50 : 72;
}

/** Paper and solutions together, split by a handle: one above the other (stacked, beside the
 *  page in landscape) or side by side (the portrait sheet). The split is kept on this iPad. */
function Split({ stacked, paper, solutions }: { stacked: boolean; paper: React.ReactNode; solutions: React.ReactNode }) {
  const key = stacked ? 'annotate-split-stacked' : 'annotate-split-side';
  const [pct, setPct] = useState(() => readSplit(key));
  useEffect(() => { setPct(readSplit(key)); }, [key]);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    let frame = 0; let last = pct;
    const move = (ev: PointerEvent) => {
      const raw = stacked ? ((ev.clientY - box.top) / box.height) * 100 : ((ev.clientX - box.left) / box.width) * 100;
      last = Math.min(85, Math.max(15, raw));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPct(last));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(frame);
      setPct(last); setDragging(false);
      try { localStorage.setItem(key, String(Math.round(last))); } catch { /* private mode */ }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const pane = (basis: number): React.CSSProperties => ({ flex: `0 0 ${basis}%`, position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', pointerEvents: dragging ? 'none' : undefined });
  return (
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: stacked ? 'column' : 'row' }}>
      <div style={pane(pct)}>{paper}</div>
      <div role="separator" aria-orientation={stacked ? 'horizontal' : 'vertical'} aria-label="Drag to share the space between the paper and the solutions" title="Drag to resize"
        onPointerDown={onDown}
        style={{ flex: 'none', [stacked ? 'height' : 'width']: 22, background: '#f3f4f6', borderTop: stacked ? '1px solid #d1d5db' : undefined, borderBottom: stacked ? '1px solid #d1d5db' : undefined, borderLeft: stacked ? undefined : '1px solid #d1d5db', borderRight: stacked ? undefined : '1px solid #d1d5db', cursor: stacked ? 'row-resize' : 'col-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={stacked
          ? { width: 64, height: 6, borderRadius: 3, background: dragging ? '#111827' : '#9ca3af' }
          : { width: 6, height: 64, borderRadius: 3, background: dragging ? '#111827' : '#9ca3af' }} />
      </div>
      <div style={{ ...pane(100 - pct), flex: '1 1 0' }}>{solutions}</div>
    </div>
  );
}
function readSplit(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v > 0) return Math.min(85, Math.max(15, v));
  } catch { /* private mode / server */ }
  return 50;
}

/** No question paper uploaded (a self-contained worksheet): the questions as the marker read them. */
function PrintedQuestions({ runId, questions, prompts }: { runId: string; questions: string[]; prompts: Record<string, string> }) {
  // The question with ALL its maths typeset, made once per question by a model (the extras
  // route); until it comes back, the quick in-house typesetting from the info call.
  const [typeset, setTypeset] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    for (const q of questions) {
      if (typeset[q]) continue;
      fetch('/api/admin/annotate-side/extras', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, q }) })
        .then((r) => r.json()).then((d) => { if (live && d?.questionHtml) setTypeset((m) => ({ ...m, [q]: d.questionHtml })); })
        .catch(() => {});
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, questions.join(',')]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '14px 16px 40px', fontSize: 16, lineHeight: 1.6, color: '#111' }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>No question paper was sent with this one — the questions are printed on the student&rsquo;s pages. As the marker read them:</p>
      {questions.length === 0 && <p style={{ color: '#6b7280' }}>No question was marked on this page.</p>}
      {questions.map((q) => (
        <div key={q} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#1c3a5e' }}>Question {q}</div>
          {/* Server-built HTML: the words escaped, the maths typeset (annotate-side-store plainPromptHtml). */}
          <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: typeset[q] || prompts[q] || '—' }} />
        </div>
      ))}
    </div>
  );
}

type PdfPage = { w: number; h: number; text: { str: string; x: number }[] };

function PaperPdf({ url, questions }: { url: string; questions: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<any>(null);
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [err, setErr] = useState('');
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
        const out: PdfPage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const pg = await doc.getPage(i);
          const vp = pg.getViewport({ scale: 1 });
          let text: { str: string; x: number }[] = [];
          try {
            const tc = await pg.getTextContent();
            text = (tc.items as any[]).map((t) => ({ str: String(t.str ?? ''), x: Array.isArray(t.transform) ? t.transform[4] / vp.width : 1 }));
          } catch { /* a scanned page has no text — the jump just falls back */ }
          out.push({ w: vp.width, h: vp.height, text });
        }
        if (!live) { doc.destroy?.(); return; }
        docRef.current = doc;
        setPages(out);
      } catch (e) { if (live) setErr((e as Error).message); }
    })();
    return () => { live = false; docRef.current?.destroy?.(); docRef.current = null; };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Settle first: while a handle is dragged the box changes every frame, and every change
    // redraws every page near the view.
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => setWidth(el.clientWidth), 150); });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [pages]);

  // Jump to where this page's first question starts.
  const target = useMemo(() => {
    if (!pages) return null;
    const texts = pages.map((p) => p.text);
    for (const q of questions) { const i = findQuestionPage(texts, q); if (i != null) return i; }
    return null;
  }, [pages, questions]);
  useEffect(() => {
    if (target == null || !scrollRef.current) return;
    const node = scrollRef.current.querySelector<HTMLElement>(`[data-pdf-page="${target}"]`);
    if (node) scrollRef.current.scrollTo({ top: node.offsetTop - 8, behavior: 'smooth' });
  }, [target, width]);

  if (err) return <p style={{ padding: 16, color: '#b91c1c', fontSize: 14 }}>Could not open the question paper: {err}</p>;
  if (!pages) return <p style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>Opening the question paper…</p>;
  const w = Math.max(200, width - 16);
  // overscroll contain: a swipe past the top stays in this pane instead of bouncing the
  // page and tripping Safari's reload (4 Nov 2026).
  return (
    <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', background: '#eef0f3', padding: 8 }}>
      {target == null && questions.length > 0 && (
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Could not find Q{questions[0]} in the paper&rsquo;s text — scroll to it.</p>
      )}
      {pages.map((p, i) => (
        <PdfCanvas key={i} index={i} doc={docRef} width={w} aspect={p.h / p.w} root={scrollRef} />
      ))}
    </div>
  );
}

/** One PDF page: drawn when it comes near the view, let go when it is far away. */
function PdfCanvas({ index, doc, width, aspect, root }: { index: number; doc: React.MutableRefObject<any>; width: number; aspect: number; root: React.RefObject<HTMLDivElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (!near || !doc.current || width <= 0) { c.width = 0; c.height = 0; return; }
    let cancelled = false;
    let task: any = null;
    (async () => {
      const pg = await doc.current.getPage(index + 1);
      if (cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp0 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: (width * dpr) / vp0.width });
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      task = pg.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [near, width, index, doc]);
  return (
    <div ref={boxRef} data-pdf-page={index} style={{ width, height: width * aspect, margin: '0 auto 8px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <span style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 11, color: '#9ca3af' }}>{index + 1}</span>
    </div>
  );
}
