'use client';

import { useState, useEffect, use } from 'react';
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

  const [pw, setPw] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [title, setTitle] = useState('');
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) { router.replace('/admin'); return; }
    setPw(cookie);
  }, [router]);

  useEffect(() => {
    if (!pw) return;
    fetch(`/api/admin-notes/${noteId}`, { headers: { Authorization: `Bearer ${pw}` } })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
      .then(data => { setPdfUrl(data.pdfUrl); setTitle(data.title); })
      .catch(e => setFetchError(e.message ?? 'Failed to load note'));
  }, [pw, noteId]);

  // Open PDF directly — on iOS this uses the native PDF viewer which prints all pages
  function openForPrint() {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank');
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }

        .v-bar {
          position: sticky; top: 0; z-index: 20;
          background: #1e3a5f; color: #fff;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px;
        }
        .v-back { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 13px; white-space: nowrap; flex-shrink: 0; }
        .v-title { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .v-body { max-width: 480px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 16px; }

        .v-print-card {
          background: #1e3a5f;
          border-radius: 16px;
          padding: 28px 24px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          cursor: pointer; border: none; width: 100%;
          color: #fff; font-family: inherit;
          box-shadow: 0 4px 20px rgba(30,58,95,0.35);
          transition: opacity 0.15s;
        }
        .v-print-card:active { opacity: 0.8; }
        .v-print-icon { font-size: 40px; }
        .v-print-label { font-size: 20px; font-weight: 700; }
        .v-print-hint { font-size: 13px; color: rgba(255,255,255,0.65); text-align: center; line-height: 1.5; }

        .v-preview-card {
          background: #fff; border-radius: 14px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .v-preview-label {
          padding: 10px 14px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8;
          border-bottom: 1px solid #f1f5f9;
        }

        .v-error { text-align: center; padding: 40px 16px; color: #ef4444; font-size: 15px; }
        .v-loading { text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 15px; }
      `}</style>

      {/* Header */}
      <div className="v-bar">
        <a href={`/admin/notes/${level}`} className="v-back">← {levelLabel}</a>
        {title && <span className="v-title">{title}</span>}
      </div>

      <div className="v-body">
        {fetchError ? (
          <div className="v-error">❌ {fetchError}</div>
        ) : !pdfUrl ? (
          <div className="v-loading">Loading…</div>
        ) : (
          <>
            {/* Big print button */}
            <button className="v-print-card" onClick={openForPrint}>
              <span className="v-print-icon">🖨️</span>
              <span className="v-print-label">Print</span>
              <span className="v-print-hint">Opens PDF · tap Share → Print for all pages</span>
            </button>

            {/* Preview */}
            <div className="v-preview-card">
              <div className="v-preview-label">Preview</div>
              <iframe
                src={pdfUrl}
                style={{ width: '100%', height: '70vh', border: 'none', display: 'block' }}
                title={title}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
