'use client';

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
}

interface DetectedQuestion {
  questionLabel: string;
  questionRegionBox: [number, number, number, number];
  questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
  hasDiagram: boolean;
}

interface PageResult {
  pageIndex: number;
  pageImageUrl: string;
  pageImageWidth: number;
  pageImageHeight: number;
  questions: DetectedQuestion[];
}

interface BatchResult {
  batchId: string;
  studentName: string;
  studentId: string | null;
  pages: PageResult[];
  summary: { totalPages: number; totalQuestions: number };
}

type UIState = 'upload' | 'uploading' | 'preview';

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarkPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    if (pw) { savedPw.current = pw; verifyAndLogin(pw); }
  }, []);

  async function verifyAndLogin(pw: string) {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/mark-batch/init', {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (res.ok) {
        savedPw.current = pw;
        setCookie('admin_pw', pw, 30);
        setAuthed(true);
      } else {
        setAuthError('Incorrect password');
      }
    } catch {
      setAuthError('Connection error');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    await verifyAndLogin(password);
  }

  if (!authed) {
    return (
      <>
        <style>{loginCSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-icon">📝</div>
            <h1>AI Marking</h1>
            <p>Adrian&apos;s Math Tuition</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                className="pw-input"
                placeholder="Admin password"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError(''); }}
                autoFocus
                disabled={authLoading}
              />
              {authError && <div className="pw-error">{authError}</div>}
              <button type="submit" className="pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'Enter'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return <MarkUI savedPw={savedPw} />;
}

// ── Mark UI (authenticated) ───────────────────────────────────────────────────

function MarkUI({ savedPw }: { savedPw: React.MutableRefObject<string> }) {
  const [uiState, setUiState] = useState<UIState>('upload');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [adHocName, setAdHocName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/mark-batch/init', {
      headers: { Authorization: `Bearer ${savedPw.current}` },
    })
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [savedPw]);

  // ── File handling ────────────────────────────────────────────────────────────

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(dropped);
    setError('');
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || []));
    setError('');
  }

  const MAX_UPLOAD_MB = 50;

  function validateFiles(files: File[]): string | null {
    if (files.length === 0) return 'Select a file to upload.';
    if (files.length > 1) {
      const hasNonImage = files.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type));
      if (hasNonImage) return 'When uploading multiple files, all must be images (PNG, JPEG, WebP).';
    } else {
      const f = files[0];
      const ok = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.type);
      if (!ok) return `Unsupported file type: ${f.type}. Use PDF, PNG, JPEG, or WebP.`;
    }
    const totalMB = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;
    if (totalMB > MAX_UPLOAD_MB) {
      return `File is ${totalMB.toFixed(1)} MB — maximum is ${MAX_UPLOAD_MB} MB. Try splitting into smaller batches.`;
    }
    return null;
  }

  // ── Effective student name ────────────────────────────────────────────────

  const selectedStudent = students.find(s => s.id === selectedStudentId) || null;
  const isAdHoc = selectedStudentId === '__adhoc__';
  const studentName = isAdHoc ? adHocName.trim() : selectedStudent?.name || '';
  const canUpload = files.length > 0 && studentName.length > 0;

  // ── Upload handler ────────────────────────────────────────────────────────

  async function handleUpload() {
    const validationError = validateFiles(files);
    if (validationError) { setError(validationError); return; }
    if (!studentName) { setError('Select or enter a student name.'); return; }

    setError('');
    setUiState('uploading');

    const fd = new FormData();
    fd.append('studentName', studentName);
    if (selectedStudent) fd.append('studentId', selectedStudent.id);

    const isSinglePdf = files.length === 1 && files[0].type === 'application/pdf';
    if (isSinglePdf) {
      fd.append('file', files[0]);
    } else {
      files.forEach(f => fd.append('images[]', f));
    }

    try {
      const res = await fetch('/api/mark-batch/init', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}` },
        body: fd,
      });
      if (!res.ok) {
        let errorMsg = `Upload failed: ${res.status} ${res.statusText}`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errData.message || errorMsg;
        } catch {
          try {
            const text = await res.text();
            if (text) errorMsg = text.substring(0, 200);
          } catch { /* use status message */ }
        }
        setError(errorMsg);
        setUiState('upload');
        return;
      }
      const data = await res.json();
      setResult(data);
      setUiState('preview');
    } catch (err: any) {
      setError(err.message || 'Network error');
      setUiState('upload');
    }
  }

  function handleCancel() {
    setResult(null);
    setFiles([]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUiState('upload');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{pageCSS}</style>
      <div className="mark-wrap">
        <div className="mark-header">
          <div className="mark-header-inner">
            <a href="/admin" className="mark-back">← Admin</a>
            <span className="mark-title">AI Marking</span>
            <span />
          </div>
        </div>

        <div className="mark-body">
          {uiState === 'upload' && (
            <UploadView
              students={students}
              studentsLoading={studentsLoading}
              selectedStudentId={selectedStudentId}
              setSelectedStudentId={setSelectedStudentId}
              isAdHoc={isAdHoc}
              adHocName={adHocName}
              setAdHocName={setAdHocName}
              files={files}
              dragOver={dragOver}
              setDragOver={setDragOver}
              handleFileDrop={handleFileDrop}
              handleFileInput={handleFileInput}
              fileInputRef={fileInputRef}
              error={error}
              canUpload={canUpload}
              handleUpload={handleUpload}
            />
          )}

          {uiState === 'uploading' && (
            <div className="uploading-wrap">
              <div className="spinner" />
              <p className="uploading-text">Uploading and detecting questions…</p>
              <p className="uploading-sub">
                PDF rendering + Gemini region detection per page.<br />
                A 10-page batch typically takes 20–50 seconds.
              </p>
            </div>
          )}

          {uiState === 'preview' && result && (
            <PreviewView result={result} onCancel={handleCancel} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Upload view ───────────────────────────────────────────────────────────────

function UploadView({
  students, studentsLoading,
  selectedStudentId, setSelectedStudentId,
  isAdHoc, adHocName, setAdHocName,
  files, dragOver, setDragOver, handleFileDrop, handleFileInput,
  fileInputRef, error, canUpload, handleUpload,
}: {
  students: Student[];
  studentsLoading: boolean;
  selectedStudentId: string;
  setSelectedStudentId: (v: string) => void;
  isAdHoc: boolean;
  adHocName: string;
  setAdHocName: (v: string) => void;
  files: File[];
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  handleFileDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  error: string;
  canUpload: boolean;
  handleUpload: () => void;
}) {
  return (
    <div className="upload-section">
      {/* Student selector */}
      <div className="field-group">
        <label className="field-label">Student</label>
        <select
          className="field-select"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
          disabled={studentsLoading}
        >
          <option value="">
            {studentsLoading ? 'Loading students…' : '— Select student —'}
          </option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__adhoc__">Ad-hoc (enter name)</option>
        </select>
        {isAdHoc && (
          <input
            type="text"
            className="field-input"
            placeholder="Student name"
            value={adHocName}
            onChange={e => setAdHocName(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      {/* Drop zone */}
      <div className="field-group">
        <label className="field-label">Exam paper</label>
        <div
          className={`drop-zone${dragOver ? ' drop-zone--over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          {files.length === 0 ? (
            <>
              <div className="drop-icon">📄</div>
              <div className="drop-primary">Drop PDF or images here</div>
              <div className="drop-secondary">or click to browse · PDF, PNG, JPEG, WebP · max 50 MB</div>
            </>
          ) : (
            <>
              <div className="drop-icon">✅</div>
              <div className="drop-primary">
                {files.length === 1 ? files[0].name : `${files.length} files selected`}
              </div>
              <div className="drop-secondary">
                {files.length === 1
                  ? `${(files[0].size / 1024 / 1024).toFixed(1)} MB`
                  : `${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB total`}
                {' · '}click to change
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button
        className="upload-btn"
        onClick={handleUpload}
        disabled={!canUpload}
      >
        Upload &amp; detect questions
      </button>
    </div>
  );
}

// ── Preview view ──────────────────────────────────────────────────────────────

const THUMB_MAX_WIDTH = 300;

function PreviewView({ result, onCancel }: { result: BatchResult; onCancel: () => void }) {
  function handleStartMarking() {
    alert('Marking flow ships in the next iteration.');
  }

  return (
    <div className="preview-section">
      {/* Summary header */}
      <div className="preview-summary">
        <span className="summary-chip">{result.studentName}</span>
        <span className="summary-chip">Pages: {result.summary.totalPages}</span>
        <span className="summary-chip">Detected: {result.summary.totalQuestions} questions</span>
      </div>

      {/* Per-page thumbnails */}
      {result.pages.map((page) => {
        const scale = THUMB_MAX_WIDTH / page.pageImageWidth;
        const thumbH = Math.round(page.pageImageHeight * scale);

        return (
          <div key={page.pageIndex} className="page-block">
            <div className="page-heading">Page {page.pageIndex + 1}</div>

            <div
              className="thumb-wrap"
              style={{ width: THUMB_MAX_WIDTH, height: thumbH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.pageImageUrl}
                alt={`Page ${page.pageIndex + 1}`}
                style={{ width: THUMB_MAX_WIDTH, height: thumbH, display: 'block' }}
              />
              {page.questions.map((q, qi) => (
                <div
                  key={qi}
                  className="q-box"
                  style={{
                    left: Math.round(q.questionRegionPixels.x1 * scale),
                    top: Math.round(q.questionRegionPixels.y1 * scale),
                    width: Math.round((q.questionRegionPixels.x2 - q.questionRegionPixels.x1) * scale),
                    height: Math.round((q.questionRegionPixels.y2 - q.questionRegionPixels.y1) * scale),
                  }}
                >
                  <span className="q-label">{q.questionLabel}</span>
                </div>
              ))}
            </div>

            <div className="page-detected">
              {page.questions.length === 0
                ? 'No questions detected'
                : `Detected: ${page.questions.map(q => q.questionLabel).join(', ')}`}
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div className="preview-actions">
        <button className="action-btn action-btn--primary" onClick={handleStartMarking} disabled>
          Looks right — start marking
          <span className="action-coming-soon">Coming in next iteration</span>
        </button>
        <button className="action-btn action-btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const loginCSS = `
.login-wrap {
  min-height: 100vh;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.login-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  padding: 32px 28px;
  text-align: center;
}
.login-icon { font-size: 40px; margin-bottom: 12px; }
.login-card h1 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px; }
.login-card p { font-size: 13px; color: #9ca3af; margin: 0 0 24px; }
.pw-input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 10px;
  color: #111;
}
.pw-input:focus { border-color: #1e3a5f; }
.pw-error { font-size: 13px; color: #ef4444; margin-bottom: 10px; }
.pw-btn {
  width: 100%;
  background: #1e3a5f;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 13px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.pw-btn:disabled { opacity: 0.45; cursor: default; }
`;

const pageCSS = `
.mark-wrap {
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: 48px;
}
.mark-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.mark-header-inner {
  max-width: 680px;
  margin: 0 auto;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mark-back {
  font-size: 14px;
  color: #6b7280;
  text-decoration: none;
}
.mark-back:hover { color: #1e3a5f; }
.mark-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}
.mark-body {
  max-width: 680px;
  margin: 0 auto;
  padding: 20px 16px;
}

/* Upload */
.upload-section { display: flex; flex-direction: column; gap: 20px; }
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; font-weight: 600; color: #374151; }
.field-select, .field-input {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 15px;
  color: #111827;
  background: #fff;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.field-select:focus, .field-input:focus { border-color: #1e3a5f; }
.drop-zone {
  border: 2px dashed #d1d5db;
  border-radius: 14px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone:hover, .drop-zone--over {
  border-color: #1e3a5f;
  background: #f0f4f9;
}
.drop-icon { font-size: 32px; margin-bottom: 8px; }
.drop-primary { font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.drop-secondary { font-size: 13px; color: #9ca3af; }
.error-msg {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  color: #b91c1c;
}
.upload-btn {
  background: #1e3a5f;
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 14px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.15s;
}
.upload-btn:disabled { opacity: 0.4; cursor: default; }

/* Uploading */
.uploading-wrap {
  text-align: center;
  padding: 60px 20px;
}
.spinner {
  width: 44px;
  height: 44px;
  border: 4px solid #e5e7eb;
  border-top-color: #1e3a5f;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.uploading-text { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 8px; }
.uploading-sub { font-size: 13px; color: #9ca3af; line-height: 1.6; margin: 0; }

/* Preview */
.preview-section { display: flex; flex-direction: column; gap: 24px; }
.preview-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.summary-chip {
  background: #1e3a5f;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 20px;
  padding: 5px 14px;
}
.page-block {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
}
.page-heading {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a5f;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.thumb-wrap {
  position: relative;
  display: inline-block;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.q-box {
  position: absolute;
  border: 2px solid #ef4444;
  background: rgba(239, 68, 68, 0.08);
  box-sizing: border-box;
}
.q-label {
  position: absolute;
  top: -20px;
  left: 0;
  font-size: 10px;
  font-family: monospace;
  background: #ef4444;
  color: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  line-height: 1.6;
}
.page-detected {
  margin-top: 10px;
  font-size: 13px;
  color: #6b7280;
}

/* Actions */
.preview-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.action-btn {
  border: none;
  border-radius: 12px;
  padding: 14px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: opacity 0.15s;
}
.action-btn--primary { background: #1e3a5f; color: #fff; }
.action-btn--primary:disabled { opacity: 0.4; cursor: default; }
.action-btn--secondary { background: #f3f4f6; color: #374151; }
.action-coming-soon {
  font-size: 11px;
  font-weight: 400;
  color: #93c5fd;
}
`;
