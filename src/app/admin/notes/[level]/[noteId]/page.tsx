'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAdminSession } from '@/lib/admin-client';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2', 'em': 'EM', 'am': 'AM', 'jc': 'JC',
};

export default function NoteViewerPage({
  params,
}: {
  params: Promise<{ level: string; noteId: string }>;
}) {
  const { level, noteId } = use(params);
  const router = useRouter();
  const levelLabel = SLUG_TO_LABEL[level] ?? level.toUpperCase();

  const [authed, setAuthed] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [title, setTitle]   = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (!ok) { router.replace('/admin'); return; }
      setAuthed(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/admin-notes/${noteId}`)
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
      .then(data => { setPdfUrl(data.pdfUrl); setTitle(data.title); })
      .catch(e => setError(e.message ?? 'Failed to load'));
  }, [authed, noteId]);

  // Auto-open PDF in new tab once URL is known — window.open in useEffect
  // is treated as user-initiated on most browsers since we're responding to navigation
  useEffect(() => {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank');
  }, [pdfUrl]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
        .bar {
          position: sticky; top: 0; z-index: 10; background: #1e3a5f; color: #fff;
          display: flex; align-items: center; gap: 10px; padding: 12px 16px;
        }
        .bar a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 13px; white-space: nowrap; }
        .bar-title { flex: 1; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bar-btn {
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
          color: #fff; padding: 6px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .bar-btn:active { opacity: 0.75; }
        .body { max-width: 480px; margin: 0 auto; padding: 24px 16px; }
        .card {
          background: #fff; border-radius: 14px; padding: 24px 20px;
          border: 1px solid #e2e8f0; text-align: center;
        }
        .hint { font-size: 13px; color: #64748b; line-height: 1.6; margin-top: 8px; }
        .open-btn {
          display: block; width: 100%; margin-top: 16px;
          background: #1e3a5f; color: #fff; border: none; border-radius: 10px;
          padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .open-btn:active { opacity: 0.8; }
      `}</style>

      <div className="bar">
        <a href={`/admin/notes/${level}`}>← {levelLabel}</a>
        {title && <span className="bar-title">{title}</span>}
        {pdfUrl && (
          <button className="bar-btn" onClick={() => window.open(pdfUrl, '_blank')}>
            Open PDF ↗
          </button>
        )}
      </div>

      <div className="body">
        {error ? (
          <div className="card" style={{ color: '#ef4444' }}>❌ {error}</div>
        ) : !pdfUrl ? (
          <div className="card">⏳ Loading…</div>
        ) : (
          <div className="card">
            <div style={{ fontSize: 32 }}>🖨️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{title}</div>
            <div className="hint">
              PDF opened in a new tab.<br />
              Tap <strong>Share → Print</strong> in that tab to print all pages.
            </div>
            <button className="open-btn" onClick={() => window.open(pdfUrl, '_blank')}>
              Open again ↗
            </button>
          </div>
        )}
      </div>
    </>
  );
}
