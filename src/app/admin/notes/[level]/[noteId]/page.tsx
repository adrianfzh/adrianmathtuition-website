'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1',
  's2': 'S2',
  's3-em': 'S3 EM',
  's3-am': 'S3 AM',
  's4-em': 'S4 EM',
  's4-am': 'S4 AM',
  'jc1': 'JC1',
  'jc2': 'JC2',
};

interface NoteDetail {
  id: string;
  title: string;
  pdfUrl: string;
  uploadedAt: string;
  level: string;
}

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
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) {
      router.replace('/admin');
      return;
    }
    setPw(cookie);
  }, [router]);

  useEffect(() => {
    if (!pw) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/admin-notes/${noteId}`, {
          headers: { Authorization: `Bearer ${pw}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setNote(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load note');
      } finally {
        setLoading(false);
      }
    })();
  }, [pw, noteId]);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-frame, #pdf-frame * { visibility: visible; }
          #pdf-frame { position: fixed; top: 0; left: 0; width: 100%; height: 100%; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        .viewer-wrap { min-height: 100vh; background: #f3f4f6; display: flex; flex-direction: column; }
        .viewer-header {
          position: sticky; top: 0; z-index: 10;
          background: #fff; border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; flex-wrap: wrap;
        }
        .viewer-back {
          font-size: 13px; color: #2563eb; text-decoration: none; white-space: nowrap;
        }
        .viewer-back:hover { text-decoration: underline; }
        .viewer-title {
          flex: 1; min-width: 0;
          font-size: 15px; font-weight: 700; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .viewer-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .viewer-btn {
          padding: 8px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;
          border: none; cursor: pointer; transition: opacity 0.15s;
        }
        .viewer-btn-print { background: #1e3a5f; color: #fff; }
        .viewer-btn-open {
          background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
        }
        .viewer-btn:hover { opacity: 0.85; }
        .viewer-content { flex: 1; display: flex; flex-direction: column; }
        .viewer-loading, .viewer-error {
          text-align: center; padding: 40px 16px; font-size: 15px; color: #9ca3af;
        }
        .viewer-error { color: #ef4444; }
      `}</style>

      <div className="viewer-wrap">
        {/* Sticky header */}
        <div className="viewer-header">
          <a href={`/admin/notes/${level}`} className="viewer-back">
            ← {levelLabel} Notes
          </a>
          {note && (
            <span className="viewer-title">{note.title}</span>
          )}
          <div className="viewer-actions">
            <button
              className="viewer-btn viewer-btn-print"
              onClick={() => window.print()}
              disabled={!note}
            >
              Print
            </button>
            {note && (
              <button
                className="viewer-btn viewer-btn-open"
                onClick={() => window.open(note.pdfUrl, '_blank')}
              >
                Open ↗
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="viewer-content">
          {loading ? (
            <div className="viewer-loading">Loading…</div>
          ) : error ? (
            <div className="viewer-error">{error}</div>
          ) : note ? (
            <iframe
              id="pdf-frame"
              src={note.pdfUrl}
              style={{ width: '100%', height: '82vh', border: 'none', display: 'block' }}
              title={note.title}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
