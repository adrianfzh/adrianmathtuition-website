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

  // Upload state — supports single or bulk
  interface PendingFile {
    file: File;
    title: string;
    status: 'pending' | 'uploading' | 'done' | 'error';
    error?: string;
  }
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function fileNameToTitle(name: string) {
    return name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setPendingFiles(selected.map(f => ({
      file: f,
      title: fileNameToTitle(f.name),
      status: 'pending' as const,
    })));
  }

  function updateTitle(idx: number, val: string) {
    setPendingFiles(prev => prev.map((pf, i) => i === idx ? { ...pf, title: val } : pf));
  }

  // Drag-and-drop
  const [dragging, setDragging] = useState(false);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (!dropped.length) return;
    setPendingFiles(dropped.map(f => ({
      file: f,
      title: fileNameToTitle(f.name),
      status: 'pending' as const,
    })));
  }

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename(note: Note) {
    setRenamingId(note.id);
    setRenameValue(note.title);
    setTimeout(() => renameInputRef.current?.select(), 30);
  }

  async function commitRename(id: string) {
    const val = renameValue.trim();
    if (!val) { setRenamingId(null); return; }
    try {
      await fetch(`/api/admin-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ title: val }),
      });
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title: val } : n));
      showToast('Renamed');
    } catch {
      showToast('Rename failed');
    }
    setRenamingId(null);
  }

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
    if (!pendingFiles.length || uploading) return;
    setUploading(true);
    let anyDone = false;
    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      if (!pf.title.trim()) {
        setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: 'Title required' } : p));
        continue;
      }
      setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'uploading' } : p));
      try {
        const fd = new FormData();
        fd.append('file', pf.file);
        fd.append('title', pf.title.trim());
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
        setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
        anyDone = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
      }
    }
    setUploading(false);
    if (anyDone) {
      fetchNotes();
      // Clear completed files after a short delay so user sees the ✅
      setTimeout(() => {
        setPendingFiles(prev => prev.filter(p => p.status !== 'done'));
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
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
            <div className="notes-section-label">Upload Notes</div>
            <form onSubmit={handleUpload}>
              {/* Drop zone / file picker */}
              <div
                className={`drop-zone${dragging ? ' drop-zone-active' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <label className="drop-zone-label">
                  <span className="drop-zone-icon">📄</span>
                  <span className="drop-zone-text">
                    {dragging
                      ? 'Drop PDFs here'
                      : pendingFiles.length === 0
                        ? <>Drag &amp; drop PDFs here, or <span className="drop-zone-browse">browse</span></>
                        : `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} selected — drop more to replace`}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={onFilesSelected}
                    disabled={uploading}
                  />
                </label>
              </div>

              {/* Per-file title rows */}
              {pendingFiles.length > 0 && (
                <div className="bulk-file-list">
                  {pendingFiles.map((pf, i) => (
                    <div key={i} className="bulk-file-row">
                      <div className="bulk-file-name">
                        {pf.status === 'done' && <span className="bulk-status">✅</span>}
                        {pf.status === 'uploading' && <span className="bulk-status bulk-spin">⏳</span>}
                        {pf.status === 'error' && <span className="bulk-status bulk-err">❌</span>}
                        <span className="bulk-fname">{pf.file.name}</span>
                        {pf.error && <span className="bulk-err-msg">{pf.error}</span>}
                      </div>
                      <input
                        className="notes-input"
                        type="text"
                        placeholder="Title"
                        value={pf.title}
                        onChange={e => updateTitle(i, e.target.value)}
                        disabled={uploading || pf.status === 'done'}
                        style={{ marginBottom: 0, marginTop: 4 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="notes-upload-btn"
                disabled={uploading || pendingFiles.length === 0}
              >
                {uploading
                  ? `Uploading ${pendingFiles.filter(p => p.status === 'done').length}/${pendingFiles.length}…`
                  : pendingFiles.length > 1
                    ? `Upload All (${pendingFiles.length})`
                    : 'Upload'}
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
                    {/* Tappable area → opens viewer + auto-prints */}
                    <a href={`/admin/notes/${level}/${note.id}`} className="notes-row-tap">
                      <div className="notes-row-title">{note.title}</div>
                      <div className="notes-row-meta">{relativeTime(note.uploadedAt)}</div>
                    </a>
                    {/* Edit / delete — stop propagation so tapping these doesn't navigate */}
                    <div className="notes-row-actions">
                      <button
                        className="notes-rename-btn"
                        onClick={e => { e.preventDefault(); startRename(note); }}
                        aria-label="Rename"
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        className="notes-delete-btn"
                        onClick={e => { e.preventDefault(); handleDelete(note.id); }}
                        disabled={deletingId === note.id}
                        aria-label="Delete note"
                      >
                        {deletingId === note.id ? '…' : '🗑'}
                      </button>
                    </div>
                    {/* Inline rename — shown as overlay when active */}
                    {renamingId === note.id && (
                      <div className="rename-overlay" onClick={e => e.stopPropagation()}>
                        <input
                          ref={renameInputRef}
                          className="rename-input"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(note.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(note.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                        />
                      </div>
                    )}
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
  position: relative;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f3f4f6;
  min-height: 64px;
}
.notes-row:last-child { border-bottom: none; }
.notes-row:active { background: #f9fafb; }
.notes-row-title {
  font-size: 15px;
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
.notes-row-tap {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  text-decoration: none;
  color: inherit;
  padding: 14px 0 14px 16px;
}
.notes-row-tap:active { opacity: 0.6; }
.notes-rename-btn {
  background: none; border: none; cursor: pointer;
  font-size: 16px; padding: 6px; border-radius: 6px;
  color: #9ca3af; transition: background 0.1s;
}
.notes-rename-btn:hover { background: #f3f4f6; }
.rename-overlay {
  position: absolute; inset: 0;
  background: #fff; border-radius: 10px;
  display: flex; align-items: center; padding: 0 12px;
  z-index: 2;
}
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
/* Rename */
.rename-input {
  width: 100%;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  padding: 4px 8px;
  outline: none;
  font-family: inherit;
  background: #f0f4f8;
}
.rename-hint {
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s;
}
.notes-row-title:hover .rename-hint { opacity: 1; }
.notes-row-title { cursor: pointer; }
/* Drop zone */
.drop-zone {
  border: 2px dashed #d1d5db;
  border-radius: 10px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  margin-bottom: 12px;
}
.drop-zone:hover { border-color: #1e3a5f; background: #f0f4f8; }
.drop-zone-active { border-color: #1e3a5f !important; background: #e8f0f8 !important; }
.drop-zone-label { cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.drop-zone-icon { font-size: 28px; }
.drop-zone-text { font-size: 14px; color: #6b7280; }
.drop-zone-browse { color: #1e3a5f; font-weight: 600; text-decoration: underline; }
/* Bulk upload */
.bulk-file-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.bulk-file-row {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
}
.bulk-file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.bulk-fname {
  font-size: 12px;
  color: #6b7280;
  word-break: break-all;
}
.bulk-status { font-size: 14px; flex-shrink: 0; }
.bulk-err { color: #dc2626; }
.bulk-err-msg { font-size: 11px; color: #dc2626; }
`;
