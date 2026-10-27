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

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPdfjs } from '@/lib/pdf-pages';
import { findQuestionPage } from '@/lib/annotate/side-panel';

export type SideKind = 'paper' | 'solutions';

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

  const shell: React.CSSProperties = beside
    ? { width: '50%', flex: 'none', borderLeft: '1px solid #d1d5db', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%', zIndex: 20, background: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, boxShadow: '0 -8px 28px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'annotate-sheet-in 180ms ease-out' };
  const tab = (on: boolean): React.CSSProperties => ({ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid ' + (on ? '#111827' : '#d1d5db'), background: on ? '#111827' : '#fff', color: on ? '#fff' : '#111827', fontSize: 14, fontWeight: 700, cursor: 'pointer' });

  return (
    <div data-side-panel style={shell} onPointerDown={(e) => e.stopPropagation()}>
      <style>{'@keyframes annotate-sheet-in{from{transform:translateY(30%);opacity:.4}to{transform:none;opacity:1}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>
        <button style={tab(kind === 'paper')} onClick={() => onKind('paper')}>📄 Paper</button>
        <button style={tab(kind === 'solutions')} onClick={() => onKind('solutions')}>✅ Solutions</button>
        <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Page {page + 1}{questions.length ? ` · Q${questions.join(', Q')}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button aria-label="Close the panel" style={{ ...tab(false), width: 40, padding: 0 }} onClick={onClose}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {infoErr ? <p style={{ padding: 16, color: '#b91c1c', fontSize: 14 }}>Could not load the paper: {infoErr}</p>
          : !info ? <p style={{ padding: 16, color: '#6b7280', fontSize: 14 }}>Loading…</p>
          : kind === 'solutions'
            ? <iframe key={`${runId}-${page}`} title="Worked solutions" src={`/api/admin/annotate-side/solutions?runId=${encodeURIComponent(runId)}&page=${page}`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#fff' }} />
            : info.paperUrl ? <PaperPdf url={info.paperUrl} questions={questions} />
            : <PrintedQuestions questions={questions} prompts={info.prompts} />}
      </div>
    </div>
  );
}

/** No question paper uploaded (a self-contained worksheet): the questions as the marker read them. */
function PrintedQuestions({ questions, prompts }: { questions: string[]; prompts: Record<string, string> }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px 40px', fontSize: 16, lineHeight: 1.6, color: '#111' }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>No question paper was sent with this one — the questions are printed on the student&rsquo;s pages. As the marker read them:</p>
      {questions.length === 0 && <p style={{ color: '#6b7280' }}>No question was marked on this page.</p>}
      {questions.map((q) => (
        <div key={q} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#1c3a5e' }}>Question {q}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{prompts[q] || '—'}</div>
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
        const bytes = new Uint8Array(await (await fetch(url, { credentials: 'include' })).arrayBuffer());
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
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
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
  return (
    <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#eef0f3', padding: 8 }}>
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
