'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2', 'em': 'EM', 'am': 'AM', 'jc': 'JC',
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

  const [pw, setPw]             = useState('');
  const [pdfUrl, setPdfUrl]     = useState('');
  const [title, setTitle]       = useState('');
  const [fetchError, setFetchError] = useState('');
  const [status, setStatus]     = useState<'loading' | 'ready' | 'printing' | 'done'>('loading');
  const printed = useRef(false);

  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) { router.replace('/admin'); return; }
    setPw(cookie);
  }, [router]);

  useEffect(() => {
    if (!pw) return;
    fetch(`/api/admin-notes/${noteId}`, { headers: { Authorization: `Bearer ${pw}` } })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
      .then(data => { setPdfUrl(data.pdfUrl); setTitle(data.title); setStatus('ready'); })
      .catch(e => { setFetchError(e.message ?? 'Failed to load'); setStatus('done'); });
  }, [pw, noteId]);

  // Auto-print once PDF URL is known — give embed time to initialise
  useEffect(() => {
    if (!pdfUrl || printed.current) return;
    const t = setTimeout(() => {
      printed.current = true;
      setStatus('printing');
      window.print();
      setStatus('done');
    }, 800);
    return () => clearTimeout(t);
  }, [pdfUrl]);

  return (
    <>
      <style>{`
        @page { size: auto; margin: 0mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        /* Hide header at print — only the embed shows */
        @media print {
          .np { display: none !important; }
          embed {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important; height: 100vh !important;
          }
        }

        .bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 10;
          height: 52px;
          background: #1e3a5f; color: #fff;
          display: flex; align-items: center; gap: 10px; padding: 0 16px;
        }
        .bar a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 13px; white-space: nowrap; }
        .bar-title { flex: 1; font-size: 14px; font-weight: 700;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bar-btn {
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
          color: #fff; padding: 6px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
          font-family: inherit;
        }
        .bar-btn:active { opacity: 0.75; }

        .status-bar {
          position: fixed; top: 52px; left: 0; right: 0; z-index: 9;
          padding: 8px 16px; font-size: 13px; font-weight: 500; text-align: center;
        }
        .status-loading { background: #f0f9ff; color: #0369a1; }
        .status-printing { background: #fefce8; color: #a16207; }
        .status-done { background: #f0fdf4; color: #166534; }
        .status-error { background: #fef2f2; color: #991b1b; }

        embed {
          position: fixed;
          top: 52px; left: 0; right: 0;
          width: 100%; height: calc(100% - 52px);
          border: none; display: block;
        }
      `}</style>

      {/* Header */}
      <div className="bar np">
        <a href={`/admin/notes/${level}`}>← {levelLabel}</a>
        <span className="bar-title">{title}</span>
        <button className="bar-btn" onClick={() => { printed.current = false; window.print(); }}>
          🖨 Print
        </button>
      </div>

      {/* Status */}
      <div className={`status-bar np ${
        fetchError ? 'status-error'
        : status === 'loading' ? 'status-loading'
        : status === 'printing' ? 'status-printing'
        : 'status-done'}`}>
        {fetchError ? `❌ ${fetchError}`
         : status === 'loading'   ? '⏳ Loading PDF…'
         : status === 'printing'  ? '🖨 Opening print dialog…'
         : '✅ Print dialog opened — tap Print again if needed'}
      </div>

      {/* PDF — embed prints all pages, unlike iframe */}
      {pdfUrl && (
        <embed
          src={pdfUrl}
          type="application/pdf"
          width="100%"
          height="100%"
        />
      )}
    </>
  );
}
