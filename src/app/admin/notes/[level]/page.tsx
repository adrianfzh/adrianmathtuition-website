'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { put } from '@vercel/blob/client';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2',
  's3-em': 'S3 EM', 's3-am': 'S3 AM',
  's4-em': 'S4 EM', 's4-am': 'S4 AM',
  'jc1': 'JC1', 'jc2': 'JC2',
};

interface Note { id: string; title: string; pdfUrl: string; uploadedAt: string; }

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function fileNameToTitle(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
}

export default function NotesLevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = use(params);
  const router = useRouter();
  const levelLabel = SLUG_TO_LABEL[level] ?? level.toUpperCase();

  const [pw, setPw] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Upload
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; title: string; status: 'pending'|'uploading'|'done'|'error'; error?: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  // Auth
  useEffect(() => {
    const cookie = getCookie('admin_pw');
    if (!cookie) { router.replace('/admin'); return; }
    setPw(cookie);
  }, [router]);

  useEffect(() => { if (pw) fetchNotes(); }, [pw]);

  async function fetchNotes() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin-notes?level=${encodeURIComponent(level)}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally { setLoading(false); }
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  function startRename(note: Note) {
    setRenamingId(note.id); setRenameValue(note.title);
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
    } catch { showToast('Rename failed'); }
    setRenamingId(null);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Delete this note? Cannot be undone.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/admin-notes/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${pw}` },
      });
      showToast('Deleted');
      fetchNotes();
    } catch { showToast('Delete failed'); }
    finally { setDeletingId(null); }
  }

  // ── Upload ───────────────────────────────────────────────────────────────────
  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(files.map(f => ({ file: f, title: fileNameToTitle(f.name), status: 'pending' })));
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!dropped.length) return;
    setPendingFiles(dropped.map(f => ({ file: f, title: fileNameToTitle(f.name), status: 'pending' })));
    setUploadOpen(true);
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
        // Step 1: Get a short-lived client upload token from our server
        const tokenRes = await fetch(
          `/api/admin-notes/upload-token?level=${encodeURIComponent(level)}&filename=${encodeURIComponent(pf.file.name)}`,
          { headers: { Authorization: `Bearer ${pw}` } }
        );
        if (!tokenRes.ok) {
          const d = await tokenRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Token error HTTP ${tokenRes.status}`);
        }
        const { token, pathname } = await tokenRes.json();

        // Step 2: Upload directly from browser to Vercel Blob (no Next.js body limit)
        const blob = await put(pathname, pf.file, {
          access: 'public',
          token,
          multipart: pf.file.size > 5 * 1024 * 1024, // multipart for files > 5 MB
          contentType: 'application/pdf',
        });

        // Step 3: Register in Airtable
        const regRes = await fetch('/api/admin-notes/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
          body: JSON.stringify({ blobUrl: blob.url, blobPathname: blob.pathname, title: pf.title.trim(), level }),
        });
        if (!regRes.ok) {
          const d = await regRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Register error HTTP ${regRes.status}`);
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
      setTimeout(() => {
        setPendingFiles(prev => prev.filter(p => p.status !== 'done'));
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
    }
  }

  return (
    <>
      <style>{css}</style>
      <div className="nl-wrap" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>

        {/* Header */}
        <div className="nl-header">
          <a href="/admin/notes" className="nl-back">← Notes</a>
          <span className="nl-title">{levelLabel} Notes</span>
          <button className={`nl-edit-btn${editMode ? ' active' : ''}`} onClick={() => { setEditMode(e => !e); setRenamingId(null); }}>
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* Drag overlay */}
        {dragging && (
          <div className="nl-drag-overlay">
            <div className="nl-drag-msg">📄 Drop PDFs to upload</div>
          </div>
        )}

        <div className="nl-body">
          {/* Notes grid */}
          {loading ? (
            <div className="nl-loading">Loading…</div>
          ) : error ? (
            <div className="nl-error">{error}</div>
          ) : notes.length === 0 ? (
            <div className="nl-empty">No notes yet — upload below</div>
          ) : (
            <div className="nl-grid">
              {notes.map(note => (
                <div key={note.id} className="nl-card-wrap">
                  {renamingId === note.id ? (
                    <div className="nl-rename-wrap">
                      <input
                        ref={renameInputRef}
                        className="nl-rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(note.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(note.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    </div>
                  ) : editMode ? (
                    <div className="nl-card nl-card-edit">
                      <span className="nl-card-text">{note.title}</span>
                      <div className="nl-edit-actions">
                        <button className="nl-action-btn" onClick={() => startRename(note)}>✏️</button>
                        <button className="nl-action-btn nl-delete-btn" onClick={() => handleDelete(note.id)} disabled={deletingId === note.id}>
                          {deletingId === note.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <a href={`/admin/notes/${level}/${note.id}`} className="nl-card">
                      <span className="nl-card-text">{note.title}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload section — collapsed by default */}
          <div className="nl-upload-section">
            <button className="nl-upload-toggle" onClick={() => setUploadOpen(o => !o)}>
              {uploadOpen ? '▲ Hide upload' : '＋ Upload notes'}
            </button>

            {uploadOpen && (
              <form className="nl-upload-form" onSubmit={handleUpload}>
                <label className="nl-drop-zone">
                  <span className="nl-drop-icon">📄</span>
                  <span className="nl-drop-text">
                    {pendingFiles.length === 0
                      ? 'Drag & drop or tap to choose PDFs'
                      : `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} selected`}
                  </span>
                  <input ref={fileInputRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }} onChange={onFilesSelected} disabled={uploading} />
                </label>

                {pendingFiles.length > 0 && (
                  <div className="nl-file-list">
                    {pendingFiles.map((pf, i) => (
                      <div key={i} className="nl-file-row">
                        <div className="nl-file-status">
                          {pf.status === 'done' && '✅'}
                          {pf.status === 'uploading' && '⏳'}
                          {pf.status === 'error' && '❌'}
                          {pf.status === 'pending' && '📄'}
                          <span className="nl-fname">{pf.file.name}</span>
                          <span className="nl-fsize">({(pf.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                          {pf.error && <span className="nl-ferr">{pf.error}</span>}
                        </div>
                        <input
                          className="nl-title-input"
                          type="text"
                          placeholder="Title"
                          value={pf.title}
                          onChange={e => setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))}
                          disabled={uploading || pf.status === 'done'}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button type="submit" className="nl-upload-btn" disabled={uploading || pendingFiles.length === 0}>
                  {uploading
                    ? `Uploading ${pendingFiles.filter(p => p.status === 'done').length}/${pendingFiles.length}…`
                    : pendingFiles.length > 1 ? `Upload All (${pendingFiles.length})` : 'Upload'}
                </button>
              </form>
            )}
          </div>
        </div>

        {toast && <div className="nl-toast">{toast}</div>}
      </div>
    </>
  );
}

const css = `
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.nl-wrap { min-height: 100vh; background: #f3f4f6; }

/* Header */
.nl-header {
  position: sticky; top: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #e5e7eb;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
}
.nl-back { font-size: 14px; color: #2563eb; text-decoration: none; white-space: nowrap; }
.nl-back:hover { text-decoration: underline; }
.nl-title { flex: 1; font-size: 17px; font-weight: 700; color: #111827; }
.nl-edit-btn {
  font-size: 14px; font-weight: 600; padding: 5px 14px;
  border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
  color: #374151; cursor: pointer;
}
.nl-edit-btn.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }

/* Drag overlay */
.nl-drag-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(30,58,95,0.85);
  display: flex; align-items: center; justify-content: center;
}
.nl-drag-msg { color: #fff; font-size: 24px; font-weight: 700; }

/* Body */
.nl-body { padding: 20px 16px 40px; max-width: 700px; margin: 0 auto; }
.nl-loading, .nl-error, .nl-empty {
  text-align: center; padding: 40px 16px;
  font-size: 15px; color: #9ca3af;
}
.nl-error { color: #ef4444; }

/* Notes grid — 2 columns */
.nl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 32px;
}
.nl-card-wrap { position: relative; }

/* Note card — tap to print */
.nl-card {
  display: flex; align-items: center; justify-content: center;
  min-height: 80px; padding: 14px 12px;
  background: #fff; border-radius: 12px;
  border: 2px solid #e5e7eb;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s, background 0.1s;
  text-align: center;
}
.nl-card:active { background: #eff6ff; border-color: #1e3a5f; }
@media (hover: hover) { .nl-card:hover { border-color: #1e3a5f; background: #f8faff; } }
.nl-card-text {
  font-size: 14px; font-weight: 600; color: #111827; line-height: 1.35;
}

/* Edit-mode card */
.nl-card-edit {
  display: flex; flex-direction: column; align-items: stretch;
  min-height: 80px; padding: 12px;
  background: #fff; border-radius: 12px;
  border: 2px solid #fbbf24;
  gap: 8px;
}
.nl-card-edit .nl-card-text { font-size: 13px; color: #374151; flex: 1; }
.nl-edit-actions { display: flex; gap: 6px; justify-content: flex-end; }
.nl-action-btn {
  background: #f3f4f6; border: none; border-radius: 6px;
  cursor: pointer; font-size: 15px; padding: 4px 8px;
}
.nl-action-btn:active { background: #e5e7eb; }
.nl-delete-btn:hover { background: #fee2e2; }

/* Rename */
.nl-rename-wrap {
  min-height: 80px; display: flex; align-items: center;
  background: #fff; border-radius: 12px; border: 2px solid #1e3a5f;
  padding: 8px;
}
.nl-rename-input {
  width: 100%; border: none; outline: none;
  font-size: 14px; font-weight: 600; color: #111827;
  font-family: inherit; background: transparent;
}

/* Upload section */
.nl-upload-section { margin-top: 8px; }
.nl-upload-toggle {
  width: 100%; padding: 12px; background: #fff;
  border: 1px dashed #d1d5db; border-radius: 10px;
  font-size: 14px; font-weight: 600; color: #6b7280;
  cursor: pointer; text-align: center;
}
.nl-upload-toggle:hover { border-color: #9ca3af; color: #374151; }
.nl-upload-form { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.nl-drop-zone {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  border: 2px dashed #d1d5db; border-radius: 10px; padding: 20px;
  cursor: pointer; text-align: center;
  background: #fafafa;
}
.nl-drop-zone:hover { border-color: #1e3a5f; }
.nl-drop-icon { font-size: 24px; }
.nl-drop-text { font-size: 13px; color: #6b7280; }
.nl-file-list { display: flex; flex-direction: column; gap: 8px; }
.nl-file-row {
  background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 8px; padding: 8px 10px;
}
.nl-file-status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; margin-bottom: 4px; flex-wrap: wrap; }
.nl-fname { word-break: break-all; }
.nl-fsize { color: #9ca3af; white-space: nowrap; }
.nl-ferr { color: #dc2626; font-size: 11px; width: 100%; }
.nl-title-input {
  width: 100%; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 6px 10px; font-size: 13px; font-family: inherit;
  background: #fff; outline: none;
}
.nl-title-input:focus { border-color: #1e3a5f; }
.nl-upload-btn {
  width: 100%; padding: 12px; background: #1e3a5f; color: #fff;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 700;
  cursor: pointer;
}
.nl-upload-btn:disabled { opacity: 0.5; cursor: default; }

/* Toast */
.nl-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #111827; color: #fff; padding: 10px 22px;
  border-radius: 20px; font-size: 14px; font-weight: 500;
  z-index: 100; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
`;
