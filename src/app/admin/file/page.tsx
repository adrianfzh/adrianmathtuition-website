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

  const btn: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#111827', color: '#fff',
        padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button type="button" onClick={back} style={{ ...btn, background: '#374151', color: '#fff' }}>← Back</button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
          {file?.name || ''}
        </span>
        <button type="button" onClick={save} disabled={!canSave}
          style={{ ...btn, background: '#2563eb', color: '#fff', opacity: canSave ? 1 : 0.5 }}>📤 Save / Send</button>
      </div>
      <div style={{ padding: 10, maxWidth: 1000, margin: '0 auto' }}>
        {state === 'loading' && <p style={{ textAlign: 'center', color: '#374151', marginTop: 40 }}>Opening…</p>}
        {state === 'failed' && <p style={{ textAlign: 'center', color: '#b91c1c', marginTop: 40 }}>Could not open this file.</p>}
        {imgUrl && <img src={imgUrl} alt={file?.name || ''} style={{ width: '100%', height: 'auto', background: '#fff' }} />}
        <div ref={holder} />
        {pages.total > 0 && pages.done < pages.total && (
          <p style={{ textAlign: 'center', color: '#374151' }}>Page {pages.done + 1} of {pages.total}…</p>
        )}
      </div>
    </div>
  );
}

export default function AdminFilePage() {
  return <Suspense fallback={null}><Viewer /></Suspense>;
}
