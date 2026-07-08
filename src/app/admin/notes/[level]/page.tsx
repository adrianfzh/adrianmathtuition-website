'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { put } from '@vercel/blob/client';
import { ensureAdminSession } from '@/lib/admin-client';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2', 'em': 'E Math', 'am': 'A Math', 'jc': 'JC H2',
  // legacy
  's3-em': 'S3 EM', 's3-am': 'S3 AM', 's4-em': 'S4 EM', 's4-am': 'S4 AM',
  'jc1': 'JC1', 'jc2': 'JC2',
};

// Slug → Airtable Level value used when uploading
const SLUG_TO_UPLOAD_LEVEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2', 'em': 'EM', 'am': 'AM', 'jc': 'JC',
};

// No sub-levels needed any more — everything is flat
const SLUG_TO_SUBLEVELS: Record<string, string[]> = {};

interface Note { id: string; title: string; pdfUrl: string; uploadedAt: string; source?: 'dropbox' | 'airtable'; }

function fileNameToTitle(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
}

export default function NotesLevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = use(params);
  const router = useRouter();
  const levelLabel = SLUG_TO_LABEL[level] ?? level.toUpperCase();

  const [authed, setAuthed] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dropboxFolder, setDropboxFolder] = useState('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Upload — for merged slugs (em/am/jc), just use the first sub-level internally
  const subLevels = SLUG_TO_SUBLEVELS[level] ?? [];
  const uploadLevel = SLUG_TO_UPLOAD_LEVEL[level] ?? subLevels[0] ?? '';
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
    ensureAdminSession().then(ok => {
      if (!ok) { router.replace('/admin'); return; }
      setAuthed(true);
    });
  }, [router]);

  useEffect(() => { if (authed) fetchNotes(); }, [authed]);

  async function fetchNotes() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin-notes?level=${encodeURIComponent(level)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNotes(data.notes ?? []);
      if (data.dropboxEnabled && data.dropboxFolder) setDropboxFolder(data.dropboxFolder);
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
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/admin-notes/${id}`, { method: 'DELETE' });
      showToast('Deleted');
      fetchNotes();
    } catch { showToast('Delete failed'); }
    finally { setDeletingId(null); }
  }

  // ── Replace PDF (keeps title/level/link; swaps the file in place) ────────────
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  function startReplace(id: string) {
    replaceTargetId.current = id;
    replaceInputRef.current?.click();
  }
  async function onReplaceFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = replaceTargetId.current;
    if (replaceInputRef.current) replaceInputRef.current.value = '';
    if (!file || !id) return;
    setReplacingId(id);
    try {
      const tokenRes = await fetch(
        `/api/admin-notes/upload-token?level=${encodeURIComponent(uploadLevel)}&filename=${encodeURIComponent(file.name)}`);
      if (!tokenRes.ok) throw new Error('token');
      const { token, pathname } = await tokenRes.json();
      const blob = await put(pathname, file, {
        access: 'public', token, multipart: file.size > 5 * 1024 * 1024, contentType: 'application/pdf',
      });
      const res = await fetch(`/api/admin-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url, blobPathname: blob.pathname }),
      });
      if (!res.ok) throw new Error('patch');
      showToast('Replaced ✓');
      fetchNotes();
    } catch { showToast('Replace failed'); }
    finally { setReplacingId(null); replaceTargetId.current = null; }
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
          `/api/admin-notes/upload-token?level=${encodeURIComponent(uploadLevel)}&filename=${encodeURIComponent(pf.file.name)}`
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blobUrl: blob.url, blobPathname: blob.pathname, title: pf.title.trim(), level: uploadLevel }),
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

        {/* Hidden input for Replace-PDF */}
        <input ref={replaceInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={onReplaceFileSelected} />

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
                  ) : editMode && note.source !== 'dropbox' ? (
                    <div className="nl-card nl-card-edit">
                      <div className="nl-card-top"><span className="nl-doc-badge">PDF</span></div>
                      <span className="nl-card-text">{note.title}</span>
                      <div className="nl-edit-actions">
                        <button className="nl-action-btn" title="Rename" onClick={() => startRename(note)}>✏️</button>
                        <button className="nl-action-btn" title="Replace PDF" onClick={() => startReplace(note.id)} disabled={replacingId === note.id}>{replacingId === note.id ? '⏳' : '🔄'}</button>
                        <button className="nl-action-btn nl-delete-btn" title="Delete" onClick={() => handleDelete(note.id)} disabled={deletingId === note.id}>
                          {deletingId === note.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="nl-card" onClick={() => window.open(note.pdfUrl, '_blank')}>
                      <div className="nl-card-top">
                        <span className="nl-doc-badge">PDF</span>
                        {note.source === 'dropbox' && (
                          <span className="nl-dbx-badge" title="Managed in Dropbox">
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
                              <path d="M6 1.807 0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
                            </svg>
                            Dropbox
                          </span>
                        )}
                      </div>
                      <span className="nl-card-text">{note.title}</span>
                      <span className="nl-card-hint">{editMode && note.source === 'dropbox' ? 'Edit in Dropbox' : 'Tap to open · print'}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Dropbox drop-in hint */}
          {dropboxFolder && (
            <div className="nl-dbx-hint">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#0061ff" aria-hidden="true">
                <path d="M6 1.807 0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
              </svg>{' '}
              Drop PDFs into <b>Dropbox / Apps / AdrianMathNotes / {dropboxFolder}</b> and they appear here automatically — no upload needed.
            </div>
          )}

          {/* Upload section — collapsed by default */}
          <div className="nl-upload-section">
            <button className="nl-upload-toggle" onClick={() => setUploadOpen(o => !o)}>
              {uploadOpen ? '▲ Hide upload' : '＋ Upload notes (Blob)'}
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

/* Notes grid — responsive document tiles */
.nl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 32px;
}
.nl-card-wrap { position: relative; }

/* Note card — tap to open + print */
.nl-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 9px;
  min-height: 118px; padding: 16px 15px;
  background: #fff; border-radius: 16px;
  border: 1px solid #e6e9ef;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
  cursor: pointer; text-align: left;
  width: 100%; font-family: inherit; /* button reset */
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}
.nl-card:active { transform: translateY(0); background: #f8faff; }
@media (hover: hover) { .nl-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(30,58,95,0.10); border-color: #cdd7e5; } }

.nl-card-top { display: flex; width: 100%; align-items: center; }
.nl-doc-badge {
  font-size: 10px; font-weight: 800; letter-spacing: .5px; color: #fff;
  background: #dc2626; padding: 3px 7px; border-radius: 6px; line-height: 1;
}
.nl-card-text { font-size: 14.5px; font-weight: 700; color: #13203a; line-height: 1.3; flex: 1; }
.nl-card-hint { font-size: 11px; color: #98a2b3; font-weight: 500; }
.nl-card-top { justify-content: space-between; }
.nl-dbx-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 700; color: #0061ff; background: #eaf1ff; padding: 3px 7px; border-radius: 6px; line-height: 1; white-space: nowrap; }
.nl-dbx-badge svg { display: block; }
.nl-dbx-hint { font-size: 12.5px; color: #1e40af; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; line-height: 1.5; }
.nl-dbx-hint svg { vertical-align: -1px; }

/* Edit-mode card */
.nl-card-edit {
  display: flex; flex-direction: column; align-items: flex-start;
  min-height: 118px; padding: 14px;
  background: #fff; border-radius: 16px;
  border: 1px solid #fcd34d;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
  gap: 9px;
}
.nl-card-edit .nl-card-text { font-size: 13px; color: #374151; flex: 1; }
.nl-edit-actions { display: flex; gap: 6px; justify-content: flex-start; width: 100%; margin-top: auto; }
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
.nl-sublevel-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nl-sublevel-label { font-size: 13px; color: #6b7280; font-weight: 500; }
.nl-sublevel-btn {
  padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;
  border: 2px solid #e5e7eb; background: #f9fafb; color: #374151; cursor: pointer;
}
.nl-sublevel-btn.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
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
