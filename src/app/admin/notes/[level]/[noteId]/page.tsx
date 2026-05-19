'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2',
  's3-em': 'S3 EM', 's3-am': 'S3 AM',
  's4-em': 'S4 EM', 's4-am': 'S4 AM',
  'jc1': 'JC1', 'jc2': 'JC2',
};

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function NoteViewerPage({
  params,
}: {
  params: Promise<{ level: string; noteId: string }>;
}) {
  const { level, noteId } = use(params);
  const router = useRouter();
  const levelLabel = SLUG_TO_LABEL[level] ?? level.toUpperCase();

  const [pw, setPw] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [title, setTitle] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [printState, setPrintState] = useState<'loading' | 'ready' | 'printing' | 'done'>('loading');
  const hasPrinted = useRef(false);

  // Auth check
  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) { router.replace('/admin'); return; }
    setPw(cookie);
  }, [router]);

  // Fetch note
  useEffect(() => {
    if (!pw) return;
    fetch(`/api/admin-notes/${noteId}`, { headers: { Authorization: `Bearer ${pw}` } })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
      .then(data => { setPdfUrl(data.pdfUrl); setTitle(data.title); })
      .catch(e => setFetchError(e.message ?? 'Failed to load note'));
  }, [pw, noteId]);

  // Auto-print: fetch PDF as blob (same-origin) → iframe.contentWindow.print() → all pages print
  async function triggerPrint() {
    const frame = document.getElementById('pdf-frame') as HTMLIFrameElement | null;
    // First try: iframe.contentWindow.print() — works when same-origin (blob URL)
    try {
      if (frame?.contentWindow) {
        frame.contentWindow.print();
        setPrintState('done');
        return;
      }
    } catch { /* cross-origin or unsupported — fall through */ }
    // Fallback: window.print() (may only print visible page on some browsers)
    window.print();
    setPrintState('done');
  }

  function onIframeLoad() {
    if (hasPrinted.current) return;
    hasPrinted.current = true;
    setPrintState('printing');
    setTimeout(triggerPrint, 600);
  }

  // Fetch PDF as blob → set iframe to same-origin blob URL so all pages print
  useEffect(() => {
    if (!pdfUrl) return;
    let blobUrl = '';
    fetch(pdfUrl)
      .then(r => r.blob())
      .then(blob => {
        blobUrl = URL.createObjectURL(blob);
        const frame = document.getElementById('pdf-frame') as HTMLIFrameElement | null;
        if (frame) {
          hasPrinted.current = false; // reset so onIframeLoad fires again with blob URL
          frame.src = blobUrl;
        }
      })
      .catch(() => { /* keep original pdfUrl if fetch fails */ });
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [pdfUrl]);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pdf-frame { position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; }
          body > *:not(#pdf-frame) { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #111827; }

        .v-bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 20;
          background: #1e3a5f; color: #fff;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px;
        }
        .v-back {
          color: rgba(255,255,255,0.75); text-decoration: none;
          font-size: 13px; white-space: nowrap; flex-shrink: 0;
        }
        .v-back:hover { color: #fff; }
        .v-title {
          flex: 1; min-width: 0;
          font-size: 15px; font-weight: 700;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .v-btn {
          padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
          border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0;
        }
        .v-btn-print { background: #fff; color: #1e3a5f; }
        .v-btn-open { background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3); }
        .v-btn:active { opacity: 0.75; }

        .v-status {
          position: fixed; top: 56px; left: 0; right: 0; z-index: 10;
          text-align: center; padding: 10px 16px;
          font-size: 14px; font-weight: 500;
          background: #f0f9ff; color: #0369a1; border-bottom: 1px solid #bae6fd;
        }
        .v-status.done { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
        .v-status.error { background: #fef2f2; color: #991b1b; border-color: #fecaca; }

        #pdf-frame {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          border: none;
          /* Pushed down by header — overridden at print */
        }
        .v-frame-wrap {
          position: fixed;
          top: 56px; left: 0; right: 0; bottom: 0;
        }
        .v-frame-wrap iframe { width: 100%; height: 100%; border: none; display: block; }
      `}</style>

      {/* Sticky header — hidden at print */}
      <div className="v-bar no-print">
        <a href={`/admin/notes/${level}`} className="v-back">← {levelLabel}</a>
        {title && <span className="v-title">{title}</span>}
        <button className="v-btn v-btn-open" onClick={() => window.open(pdfUrl, '_blank')} style={{ display: pdfUrl ? undefined : 'none' }}>
          Open ↗
        </button>
        <button className="v-btn v-btn-print" onClick={triggerPrint} disabled={!pdfUrl}>
          🖨 Print
        </button>
      </div>

      {/* Status banner */}
      {!fetchError && (
        <div className={`v-status no-print${printState === 'done' ? ' done' : ''}`}>
          {printState === 'loading' && '⏳ Loading PDF…'}
          {printState === 'printing' && '🖨 Opening print dialog…'}
          {printState === 'done' && '✅ Print dialog opened — tap Print again if needed'}
        </div>
      )}
      {fetchError && (
        <div className="v-status error no-print">❌ {fetchError}</div>
      )}

      {/* PDF frame */}
      {pdfUrl && (
        <div className="v-frame-wrap">
          <iframe
            id="pdf-frame"
            src={pdfUrl}
            title={title}
            onLoad={onIframeLoad}
          />
        </div>
      )}
    </>
  );
}
