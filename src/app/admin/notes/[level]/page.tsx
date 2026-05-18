'use client';

import { useState, useEffect, useRef, use } from 'react';
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

interface Note {
  id: string;
  title: string;
  pdfUrl: string;
  uploadedAt: string;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotesLevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = use(params);
  const router = useRouter();
  const levelLabel = SLUG_TO_LABEL[level] ?? level.toUpperCase();

  const [pw, setPw] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) {
      router.replace('/admin');
      return;
    }
    setPw(cookie);
  }, [router]);

  useEffect(() => {
    if (pw) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw]);

  async function fetchNotes() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin-notes?level=${encodeURIComponent(level)}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('level', level);
      const res = await fetch('/api/admin-notes/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pw}` },
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error ?? 'Upload failed');
      }
      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('Uploaded!');
      fetchNotes();
    } catch (e: unknown) {
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin-notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Deleted');
      fetchNotes();
    } catch {
      showToast('Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <style>{css}</style>
      <div className="notes-wrap">
        {/* Header */}
        <div className="notes-header">
          <div className="notes-header-inner">
            <a href="/admin/notes" className="notes-back">← Notes</a>
            <span className="notes-title">{levelLabel} Notes</span>
          </div>
        </div>

        <div className="notes-body">
          {/* Upload section */}
          <div className="notes-card">
            <div className="notes-section-label">Upload New Note</div>
            <form onSubmit={handleUpload}>
              <div className="upload-file-row">
                <label className="upload-file-btn">
                  {file ? file.name : 'Choose PDF…'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <input
                className="notes-input"
                type="text"
                placeholder="e.g. Quadratic Functions — Worked Examples"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={uploading}
              />
              {uploadMsg && <div className="notes-error">{uploadMsg}</div>}
              <button
                type="submit"
                className="notes-upload-btn"
                disabled={uploading || !file || !title.trim()}
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
          </div>

          {/* Notes list */}
          <div className="notes-card">
            <div className="notes-section-label">Notes for {levelLabel}</div>
            {loading ? (
              <div className="notes-loading">Loading…</div>
            ) : error ? (
              <div className="notes-error">{error}</div>
            ) : notes.length === 0 ? (
              <div className="notes-empty">No notes yet for {levelLabel}. Upload the first one above.</div>
            ) : (
              <ul className="notes-list">
                {notes.map(note => (
                  <li key={note.id} className="notes-row">
                    <div className="notes-row-info">
                      <div className="notes-row-title">{note.title}</div>
                      <div className="notes-row-meta">{relativeTime(note.uploadedAt)}</div>
                    </div>
                    <div className="notes-row-actions">
                      <a href={`/admin/notes/${level}/${note.id}`} className="notes-view-btn">
                        View
                      </a>
                      <button
                        className="notes-delete-btn"
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        aria-label="Delete note"
                      >
                        {deletingId === note.id ? '…' : '🗑'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && <div className="notes-toast">{toast}</div>}
      </div>
    </>
  );
}

const css = `
.notes-wrap {
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: 32px;
}
.notes-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.notes-header-inner {
  max-width: 620px;
  margin: 0 auto;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.notes-back {
  font-size: 13px;
  color: #2563eb;
  text-decoration: none;
  white-space: nowrap;
}
.notes-back:hover { text-decoration: underline; }
.notes-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}
.notes-body {
  max-width: 620px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.notes-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
}
.notes-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
.upload-file-row { margin-bottom: 10px; }
.upload-file-btn {
  display: inline-block;
  padding: 9px 16px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-file-btn:hover { background: #e5e7eb; }
.notes-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  padding: 10px 14px;
  font-size: 14px;
  color: #111827;
  outline: none;
  margin-bottom: 10px;
}
.notes-input:focus { border-color: #1e3a5f; }
.notes-upload-btn {
  width: 100%;
  background: #1e3a5f;
  color: #fff;
  border: none;
  border-radius: 9px;
  padding: 12px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.notes-upload-btn:disabled { opacity: 0.4; cursor: default; }
.notes-error {
  font-size: 13px;
  color: #ef4444;
  margin-bottom: 8px;
}
.notes-loading {
  font-size: 14px;
  color: #9ca3af;
  padding: 12px 0;
}
.notes-empty {
  font-size: 14px;
  color: #9ca3af;
  padding: 8px 0;
}
.notes-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.notes-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid #f3f4f6;
  gap: 12px;
}
.notes-row:last-child { border-bottom: none; }
.notes-row-info { flex: 1; min-width: 0; }
.notes-row-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notes-row-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.notes-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.notes-view-btn {
  display: inline-block;
  padding: 6px 14px;
  background: #1e3a5f;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 7px;
  text-decoration: none;
  transition: opacity 0.15s;
}
.notes-view-btn:hover { opacity: 0.85; }
.notes-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  border-radius: 6px;
  color: #6b7280;
  transition: background 0.1s;
}
.notes-delete-btn:hover { background: #fee2e2; }
.notes-delete-btn:disabled { opacity: 0.4; cursor: default; }
.notes-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #111827;
  color: #fff;
  padding: 10px 22px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  z-index: 100;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
`;
