'use client';

// 📄 /admin/file?u=<same-site file link> — the admin app's own file viewer (30 Oct 2026,
// Adrian: "I want to be able to go into images and see the pdf, and from that pdf page be
// able to go back (a back button) and be able to save"). Inside the home-screen admin app
// a PDF opened the normal way fills the screen with no toolbar, so it is drawn here
// instead: every page as a picture (pinch to zoom), a ← Back button, and 📤 Save / Send
// to the share sheet (Dropbox, Files, WhatsApp…). components/AdminFileDoors.tsx sends
// the installed app's file taps here; a normal browser never comes here.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadPdfjs } from '@/lib/pdf-pages';
import { isShareableType, shareFileName } from '@/lib/admin-file-doors';

function sameSite(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch { return null; }
}

function Viewer() {
  const params = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pages, setPages] = useState({ done: 0, total: 0 });
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const href = sameSite(params.get('u'));
    if (!href) { setState('failed'); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(href);
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !isShareableType(type)) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        const f = new File([blob], shareFileName(href, window.location.origin, type), { type: blob.type || type });
        if (cancelled) return;
        setFile(f);
        if (f.type.startsWith('image/')) { setImgUrl(URL.createObjectURL(f)); setState('ready'); return; }
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        setPages({ done: 0, total: doc.numPages });
        setState('ready');
        const width = Math.min(window.innerWidth, 1000) * Math.min(window.devicePixelRatio || 1, 2.5);
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: width / vp1.width });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
          canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block';
          canvas.style.background = '#fff'; canvas.style.marginBottom = '10px'; canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,.15)';
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
          holder.current?.appendChild(canvas);
          setPages({ done: n, total: doc.numPages });
        }
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/admin/mark-paper';
  };
  const save = async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], title: file.name }); }
    catch { /* dismissed */ }
  };
  const canSave = !!file && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Safari-style bar (Adrian, 30 Oct 2026: "when you scroll up and down, then the apple
  // buttons to save … or go back automatically appears"): a home-screen app cannot show
  // Safari's own toolbar, so this is a look-alike — small ‹ and share icons that slide
  // away while you scroll down to read, and come back when you scroll up, reach the end,
  // or tap the page. At the TOP since 30 Oct 2026 (Adrian: "Can it be at the top?").
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
      if (y < 40 || atEnd || y < last - 6) setShown(true);
      else if (y > last + 6) setShown(false);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const icon: React.CSSProperties = { border: 'none', background: 'none', padding: '6px 14px', cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center' };
  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}
      onClick={(e) => { if (!(e.target as Element).closest('button')) setShown(true); }}>
      <div style={{
        position: 'fixed', left: 0, right: 0, top: 0, zIndex: 10,
        background: 'rgba(249,250,251,.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,.08)',
        padding: 'calc(4px + env(safe-area-inset-top)) 18px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transform: shown ? 'none' : 'translateY(-110%)', transition: 'transform .25s ease',
      }}>
        <button type="button" aria-label="Back" onClick={back} style={icon}>
          <svg width="14" height="24" viewBox="0 0 14 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 12l10 10" /></svg>
        </button>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pages.total > 0 && pages.done < pages.total ? `Page ${pages.done + 1} of ${pages.total}…` : ''}
        </span>
        <button type="button" aria-label="Save or send" onClick={save} disabled={!canSave} style={{ ...icon, opacity: canSave ? 1 : 0.35 }}>
          <svg width="22" height="28" viewBox="0 0 22 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2v15M6 7l5-5 5 5" /><path d="M7 11H3.5A1.5 1.5 0 0 0 2 12.5v12A1.5 1.5 0 0 0 3.5 26h15a1.5 1.5 0 0 0 1.5-1.5v-12a1.5 1.5 0 0 0-1.5-1.5H15" />
          </svg>
        </button>
      </div>
      <div style={{ padding: 'calc(56px + env(safe-area-inset-top)) 10px 24px', maxWidth: 1000, margin: '0 auto' }}>
        {state === 'loading' && <p style={{ textAlign: 'center', color: '#374151', marginTop: 40 }}>Opening…</p>}
        {state === 'failed' && <p style={{ textAlign: 'center', color: '#b91c1c', marginTop: 40 }}>Could not open this file.</p>}
        {imgUrl && <img src={imgUrl} alt={file?.name || ''} style={{ width: '100%', height: 'auto', background: '#fff' }} />}
        <div ref={holder} />
      </div>
    </div>
  );
}

export default function AdminFilePage() {
  return <Suspense fallback={null}><Viewer /></Suspense>;
}
