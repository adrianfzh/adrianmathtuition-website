'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Student { id: string; name: string; }

interface DetectedQuestion {
  questionLabel: string;
  questionRegionBox: [number, number, number, number];
  questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
  hasDiagram: boolean;
  isContinuation: boolean;
  lastPartVisible: string;
}

interface QuestionGroup { questionLabel: string; pages: number[]; }

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
  summary: { totalPages: number; totalQuestions: number; totalRegions: number; questionGroups: QuestionGroup[] };
}

interface QuestionMarkResult {
  questionLabel: string;
  pageIndices: number[];
  annotatedSliceUrl: string | null;
  marks: { awarded: number; max: number; marginNote: string };
  summary: { title: string; bodyMarkdown: string };
  submissionId: string | null;
  error?: string;
}

interface MarkingResult {
  batchId: string;
  studentName: string;
  results: QuestionMarkResult[];
}

interface BatchListItem {
  batchId: string;
  airtableRecordId: string;
  studentName: string;
  createdAt: string;
  status: string;
  totalQuestions: number;
  totalPages: number;
  totalMarksAwarded: number | null;
  totalMarksMax: number | null;
  finalPdfUrl: string | null;
  finalizedAt: string | null;
}

type StudentLevel = 'SECONDARY' | 'JC' | 'unknown';
type UploadState = 'upload' | 'uploading' | 'detecting' | 'preview' | 'marking' | 'marked' | 'assembling';
type AppView = 'landing' | 'upload-flow';

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

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Root ──────────────────────────────────────────────────────────────────────

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
      const res = await fetch('/api/mark-batch/init', { headers: { Authorization: `Bearer ${pw}` } });
      if (res.ok) { savedPw.current = pw; setCookie('admin_pw', pw, 30); setAuthed(true); }
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
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
            <form onSubmit={e => { e.preventDefault(); setAuthError(''); verifyAndLogin(password); }}>
              <input type="password" className="pw-input" placeholder="Admin password"
                value={password} onChange={e => { setPassword(e.target.value); setAuthError(''); }}
                autoFocus disabled={authLoading} />
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

  return <MarkApp savedPw={savedPw} />;
}

// ── App shell ─────────────────────────────────────────────────────────────────

function MarkApp({ savedPw }: { savedPw: React.MutableRefObject<string> }) {
  const [view, setView] = useState<AppView>('landing');
  const goLanding = useCallback(() => setView('landing'), []);
  const goUpload = useCallback(() => setView('upload-flow'), []);

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
          {view === 'landing'
            ? <LandingView savedPw={savedPw} onNewBatch={goUpload} />
            : <UploadFlow savedPw={savedPw} onDone={goLanding} onCancel={goLanding} />}
        </div>
      </div>
    </>
  );
}

// ── Landing view ──────────────────────────────────────────────────────────────

function LandingView({ savedPw, onNewBatch }: { savedPw: React.MutableRefObject<string>; onNewBatch: () => void }) {
  const [tab, setTab] = useState<'to-mark' | 'marked'>('to-mark');
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBatches = useCallback(async (status: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/mark-batch/list?status=${status}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setBatches(data.batches || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [savedPw]);

  useEffect(() => { fetchBatches(tab); }, [tab, fetchBatches]);

  // Auto-refresh every 10s on to-mark tab (batches may be detecting or marking)
  useEffect(() => {
    if (tab !== 'to-mark') return;
    const id = setInterval(() => fetchBatches('to-mark'), 10000);
    return () => clearInterval(id);
  }, [tab, fetchBatches]);

  async function handleDelete(b: BatchListItem) {
    if (!confirm(`Delete batch for ${b.studentName}? This cannot be undone.`)) return;
    try {
      await fetch(`/api/mark-batch/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: b.batchId }),
      });
      fetchBatches(tab);
    } catch { alert('Delete failed'); }
  }

  const statusColor: Record<string, string> = {
    detected: '#6b7280', marking: '#d97706', marked: '#2563eb',
    finalized: '#16a34a', failed: '#dc2626', deleted: '#9ca3af',
  };

  return (
    <div className="landing-wrap">
      {/* Top action bar */}
      <div className="landing-topbar">
        <div className="landing-tabs">
          <button className={`tab-btn${tab === 'to-mark' ? ' tab-btn--active' : ''}`} onClick={() => setTab('to-mark')}>
            To be marked
          </button>
          <button className={`tab-btn${tab === 'marked' ? ' tab-btn--active' : ''}`} onClick={() => setTab('marked')}>
            Already marked
          </button>
        </div>
        <button className="new-batch-btn" onClick={onNewBatch}>+ New Batch</button>
      </div>

      {loading && <div className="landing-loading"><div className="spinner" /> Loading…</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && batches.length === 0 && (
        <div className="landing-empty">
          {tab === 'to-mark'
            ? 'No batches waiting to be marked. Click "+ New Batch" to start.'
            : 'No marked batches yet.'}
        </div>
      )}

      <div className="batch-list">
        {batches.map(b => (
          <a key={b.batchId} href={`/admin/mark/batch/${b.batchId}`} className="batch-row batch-row--link">
            <div className="batch-row-main">
              <div className="batch-row-name">{b.studentName || '(unnamed)'}</div>
              <div className="batch-row-meta">
                <span className="status-chip" style={{ background: statusColor[b.status] || '#6b7280' }}>
                  {b.status}
                </span>
                {b.totalMarksAwarded !== null && b.totalMarksMax !== null && b.totalMarksMax > 0 && (
                  <span className="score-chip">{b.totalMarksAwarded}/{b.totalMarksMax}</span>
                )}
                <span className="batch-time">
                  {b.status === 'finalized' && b.finalizedAt
                    ? `finalized ${relativeTime(b.finalizedAt)}`
                    : `uploaded ${relativeTime(b.createdAt)}`}
                </span>
                <span className="batch-meta-dim">{b.totalPages}pp · {b.totalQuestions}q</span>
              </div>
            </div>
            <div className="batch-row-actions">
              <button className="row-action-btn row-action-btn--danger"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(b); }}>
                Delete
              </button>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Chunked multipart upload helper ──────────────────────────────────────────

// 4 MB chunks — safely under Vercel's 4.5 MB body limit.
// Uses put()-per-chunk (temp blobs) + server-side assembly, avoiding the 5 MB SDK minimum
// part-size constraint that conflicts with the body limit on the multipart uploadPart API.
const CHUNK_SIZE = 4 * 1024 * 1024;

async function uploadPdfChunked(
  file: File,
  pw: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<string> {
  // 1. Get uploadId + pathname from server
  const startRes = await fetch('/api/mark-batch/upload-start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
    signal,
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Upload start failed: ${startRes.status}`);
  }
  const { uploadId, pathname } = await startRes.json();

  // 2. Upload chunks as temp blobs (concurrency 3, retry 3× with exponential backoff)
  const numChunks = Math.ceil(file.size / CHUNK_SIZE);
  const bytesUploaded = new Array(numChunks).fill(0);

  async function uploadChunk(partNumber: number): Promise<{ tempUrl: string; partNumber: number }> {
    const start = (partNumber - 1) * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const url = `/api/mark-batch/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;

    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/octet-stream' },
          body: chunk,
          signal,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Chunk ${partNumber} failed: ${res.status} ${errText}`);
        }
        const data = await res.json();
        bytesUploaded[partNumber - 1] = end - start;
        onProgress(Math.round(bytesUploaded.reduce((a, b) => a + b, 0) / file.size * 100));
        return data;
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
    throw new Error(`Chunk ${partNumber} exhausted retries`);
  }

  // Worker pool — qi++ is atomic in single-threaded JS, no race condition
  const parts: Array<{ tempUrl: string; partNumber: number }> = new Array(numChunks);
  let qi = 0;
  async function worker() {
    while (qi < numChunks) {
      const partNumber = qi++ + 1;
      parts[partNumber - 1] = await uploadChunk(partNumber);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, numChunks) }, worker));

  // 3. Server assembles chunks into final PDF blob and cleans up temp blobs
  const completeRes = await fetch('/api/mark-batch/upload-complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, parts }),
    signal,
  });
  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({}));
    throw new Error(err.error || `Upload complete failed: ${completeRes.status}`);
  }
  const { url } = await completeRes.json();
  return url;
}

// ── Upload flow (upload → detect → preview → mark → marked → assemble) ────────

function UploadFlow({ savedPw, onDone, onCancel }: {
  savedPw: React.MutableRefObject<string>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [uploadState, setUploadState] = useState<UploadState>('upload');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [adHocName, setAdHocName] = useState('');
  const [studentLevel, setStudentLevel] = useState<StudentLevel>('unknown');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [markingResult, setMarkingResult] = useState<MarkingResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adHocInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { uploadAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    fetch('/api/mark-batch/init', { headers: { Authorization: `Bearer ${savedPw.current}` } })
      .then(r => r.json()).then(d => setStudents(d.students || [])).catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [savedPw]);

  const selectedStudent = students.find(s => s.id === selectedStudentId) || null;
  const isAdHoc = selectedStudentId === '__adhoc__';

  // Auto-focus ad-hoc name input when user selects "Ad-hoc"
  useEffect(() => {
    if (isAdHoc) adHocInputRef.current?.focus();
  }, [isAdHoc]);
  const studentName = isAdHoc ? adHocName.trim() : selectedStudent?.name || '';
  const canUpload = files.length > 0 && studentName.length > 0;

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    setFiles(Array.from(e.dataTransfer.files)); setError('');
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || [])); setError('');
  }

  async function pollForDetection(batchId: string) {
    setUploadState('detecting');
    const maxAttempts = 120; // 10 minutes at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/mark-batch/get?batchId=${batchId}`, {
          headers: { Authorization: `Bearer ${savedPw.current}` },
        });
        if (!res.ok) continue;
        const { batch } = await res.json();
        if (batch.status === 'detected' && batch.detectionJson) {
          const dj = batch.detectionJson as BatchResult;
          setBatchResult({ batchId: dj.batchId, studentName: dj.studentName, studentId: dj.studentId, pages: dj.pages, summary: dj.summary });
          setUploadState('preview');
          return;
        }
        if (batch.status === 'failed') {
          setError(batch.errorMessage || 'Detection failed on the processing worker.');
          setUploadState('upload');
          return;
        }
      } catch { /* network hiccup — keep polling */ }
    }
    setError('Detection timed out after 10 minutes. Check the batch list for status.');
    setUploadState('upload');
  }

  async function handleUpload() {
    if (files.length === 0 || !studentName) return;
    const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    if (totalMB > 50) { setError('Total file size exceeds 50 MB.'); return; }
    setError('');

    const isSinglePdf = files.length === 1 && files[0].type === 'application/pdf';

    if (isSinglePdf) {
      // ── Large-file path: server-side multipart upload via chunked API ──────
      setUploadState('uploading'); setUploadProgress(0);
      const abortCtrl = new AbortController();
      uploadAbortRef.current = abortCtrl;
      try {
        const file = files[0];
        const blobUrl = await uploadPdfChunked(
          file,
          savedPw.current,
          setUploadProgress,
          abortCtrl.signal,
        );

        const res = await fetch('/api/mark-batch/init', {
          method: 'POST',
          headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBlobUrl: blobUrl, studentName, studentId: selectedStudent?.id || null }),
          signal: abortCtrl.signal,
        });
        if (!res.ok) {
          let msg = `Failed to start: ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch { /**/ }
          setError(msg); setUploadState('upload'); return;
        }
        const { batchId } = await res.json();
        await pollForDetection(batchId);
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Network error');
        setUploadState('upload');
      }
    } else {
      // ── Multipart path: images or small files sent directly ────────────────
      setUploadState('uploading');
      const fd = new FormData();
      fd.append('studentName', studentName);
      if (selectedStudent) fd.append('studentId', selectedStudent.id);
      files.forEach(f => fd.append('images[]', f));
      try {
        const res = await fetch('/api/mark-batch/init', {
          method: 'POST', headers: { Authorization: `Bearer ${savedPw.current}` }, body: fd,
        });
        if (!res.ok) {
          let msg = `Upload failed: ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch { try { msg = (await res.text()).substring(0, 200); } catch { /**/ } }
          setError(msg); setUploadState('upload'); return;
        }
        const { batchId } = await res.json();
        await pollForDetection(batchId);
      } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); setUploadState('upload'); }
    }
  }

  async function pollForMarking(batchId: string) {
    setUploadState('marking');
    const maxAttempts = 180; // 15 minutes at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/mark-batch/get?batchId=${batchId}`, {
          headers: { Authorization: `Bearer ${savedPw.current}` },
        });
        if (!res.ok) continue;
        const { batch } = await res.json();
        if ((batch.status === 'marked' || batch.status === 'finalized') && batch.markingJson) {
          setMarkingResult(batch.markingJson as MarkingResult);
          setUploadState('marked');
          return;
        }
        if (batch.status === 'failed') {
          setError(batch.errorMessage || 'Marking failed on the processing worker.');
          setUploadState('preview');
          return;
        }
      } catch { /* network hiccup — keep polling */ }
    }
    setError('Marking timed out after 15 minutes. Check the batch list for status.');
    setUploadState('preview');
  }

  async function handleStartMarking() {
    if (!batchResult) return;
    setError('');
    try {
      const res = await fetch('/api/mark-batch/execute', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batchResult.batchId, studentLevel }),
      });
      if (!res.ok && res.status !== 202) {
        let msg = `Marking failed: ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch { /**/ }
        setError(msg); return;
      }
      // Fly accepted the job (202) — poll for completion
      await pollForMarking(batchResult.batchId);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  }

  async function handleAssemble() {
    if (!batchResult) return;
    setUploadState('assembling'); setError('');
    try {
      const res = await fetch('/api/mark-batch/assemble-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batchResult.batchId, includeCoverPage }),
      });
      if (!res.ok) {
        let msg = `Assembly failed: ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch { /**/ }
        setError(msg); setUploadState('marked'); return;
      }
      onDone();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); setUploadState('marked'); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (uploadState === 'upload') {
    return (
      <div className="upload-section">
        <button className="back-link" onClick={onCancel}>← Back to list</button>

        <div className="field-group">
          <label className="field-label">Student</label>
          <select className="field-select" value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)} disabled={studentsLoading}>
            <option value="">{studentsLoading ? 'Loading…' : '— Select student —'}</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__adhoc__">Ad-hoc (enter name)</option>
          </select>
          {isAdHoc && (
            <input ref={adHocInputRef} type="text" className="field-input" placeholder="Student name"
              value={adHocName} onChange={e => setAdHocName(e.target.value)} style={{ marginTop: 8 }} />
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Level</label>
          <select className="field-select" value={studentLevel} onChange={e => setStudentLevel(e.target.value as StudentLevel)}>
            <option value="unknown">Unknown / auto-detect</option>
            <option value="SECONDARY">Secondary (O-Level A-Math / E-Math)</option>
            <option value="JC">JC (A-Level H2 Math)</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label">Exam paper</label>
          <div className={`drop-zone${dragOver ? ' drop-zone--over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop} onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={handleFileInput} style={{ display: 'none' }} />
            {files.length === 0 ? (
              <><div className="drop-icon">📄</div>
                <div className="drop-primary">Drop PDF or images here</div>
                <div className="drop-secondary">or click to browse · max 50 MB</div></>
            ) : (
              <><div className="drop-icon">✅</div>
                <div className="drop-primary">{files.length === 1 ? files[0].name : `${files.length} files selected`}</div>
                <div className="drop-secondary">
                  {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB · click to change
                </div></>
            )}
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}
        <button className="upload-btn" onClick={handleUpload} disabled={!canUpload}>
          Upload &amp; detect questions
        </button>
      </div>
    );
  }

  if (uploadState === 'uploading') {
    const isBlobUpload = files.length === 1 && files[0].type === 'application/pdf';
    return (
      <div className="uploading-wrap">
        <div className="spinner" />
        <p className="uploading-text">{isBlobUpload ? 'Uploading PDF…' : 'Uploading…'}</p>
        {isBlobUpload && uploadProgress > 0 && (
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
        <p className="uploading-sub">
          {isBlobUpload
            ? `${uploadProgress}% — uploading directly to storage. Large PDFs take 5–20 s.`
            : 'Uploading images…'}
        </p>
      </div>
    );
  }

  if (uploadState === 'detecting') {
    return <Spinner label="Step 1 of 2 — Detecting questions…" sub="The server is rendering each PDF page and running Gemini AI to find question regions. A 10-page batch takes 30–90 s; a 25-page batch can take 3–5 min. Hang tight." />;
  }

  if (uploadState === 'preview' && batchResult) {
    const level = studentLevel === 'JC' ? 'JC' : studentLevel === 'SECONDARY' ? 'Secondary' : 'Unknown level';
    return (
      <div className="preview-section">
        <div className="preview-summary">
          <span className="summary-chip">{batchResult.studentName}</span>
          <span className="summary-chip">{level}</span>
          <span className="summary-chip">Pages: {batchResult.summary.totalPages}</span>
          <span className="summary-chip">
            Detected: {batchResult.summary.totalQuestions}q
            {batchResult.summary.totalRegions !== batchResult.summary.totalQuestions
              ? ` (${batchResult.summary.totalRegions} regions)` : ''}
          </span>
        </div>
        {batchResult.pages.map(page => {
          const scale = 300 / page.pageImageWidth;
          const thumbH = Math.round(page.pageImageHeight * scale);
          return (
            <div key={page.pageIndex} className="page-block">
              <div className="page-heading">Page {page.pageIndex + 1}</div>
              <div className="thumb-wrap" style={{ width: 300, height: thumbH }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.pageImageUrl} alt={`Page ${page.pageIndex + 1}`} style={{ width: 300, height: thumbH, display: 'block' }} />
                {page.questions.map((q, qi) => (
                  <div key={qi} className="q-box" style={{
                    left: Math.round(q.questionRegionPixels.x1 * scale),
                    top: Math.round(q.questionRegionPixels.y1 * scale),
                    width: Math.round((q.questionRegionPixels.x2 - q.questionRegionPixels.x1) * scale),
                    height: Math.round((q.questionRegionPixels.y2 - q.questionRegionPixels.y1) * scale),
                  }}>
                    <span className="q-label">{q.questionLabel}{q.isContinuation ? ' (cont.)' : ''}</span>
                  </div>
                ))}
              </div>
              <div className="page-detected">
                {page.questions.length === 0 ? 'No questions detected'
                  : `Detected: ${page.questions.map(q => q.questionLabel + (q.isContinuation ? ' (continued)' : '')).join(', ')}`}
              </div>
            </div>
          );
        })}
        {error && <div className="error-msg">{error}</div>}
        <div className="preview-actions">
          <button className="action-btn action-btn--primary" onClick={handleStartMarking}>
            Looks right — start marking
          </button>
          <button className="action-btn action-btn--secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (uploadState === 'marking') {
    return <Spinner label="Step 2 of 2 — Marking in progress…" sub="Claude Sonnet is marking each question and Gemini is placing annotation badges. A 10-question batch takes 3–8 min. This page will update automatically when done — you can leave it open." />;
  }

  if (uploadState === 'marked' && markingResult) {
    const totalAwarded = markingResult.results.reduce((s, r) => s + (r.marks.awarded ?? 0), 0);
    const totalMax = markingResult.results.reduce((s, r) => s + (r.marks.max ?? 0), 0);
    return (
      <div className="preview-section">
        <div className="preview-summary">
          <span className="summary-chip">{markingResult.studentName}</span>
          {totalMax > 0 && <span className="summary-chip">Total: {totalAwarded}/{totalMax}</span>}
        </div>

        {markingResult.results.map((qr, i) => (
          <div key={i} className="page-block">
            <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{qr.questionLabel}</span>
              {qr.marks.max > 0 && (
                <span className={`marks-badge ${qr.marks.awarded === qr.marks.max ? 'marks-badge--full' : qr.marks.awarded > 0 ? 'marks-badge--partial' : 'marks-badge--zero'}`}>
                  {qr.marks.awarded}/{qr.marks.max}{qr.marks.marginNote ? ` ${qr.marks.marginNote}` : ''}
                </span>
              )}
            </div>
            {qr.error && <div className="error-msg" style={{ marginBottom: 8 }}>Marking error: {qr.error}</div>}
            {qr.annotatedSliceUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.annotatedSliceUrl} alt={`Annotated ${qr.questionLabel}`}
                style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }} />
            )}
            {qr.summary.title && (
              <div className="marking-summary">
                <div className="marking-summary-title">{qr.summary.title}</div>
                <div className="marking-summary-body">{qr.summary.bodyMarkdown}</div>
              </div>
            )}
          </div>
        ))}

        {error && <div className="error-msg">{error}</div>}

        <label className="cover-page-check">
          <input type="checkbox" checked={includeCoverPage} onChange={e => setIncludeCoverPage(e.target.checked)} />
          Include cover page in PDF
        </label>

        <div className="preview-actions">
          <button className="action-btn action-btn--primary" onClick={handleAssemble}>
            Save as marked
          </button>
          <button className="action-btn action-btn--secondary" onClick={onCancel}>
            Cancel (keep in &ldquo;To be marked&rdquo;)
          </button>
        </div>
      </div>
    );
  }

  if (uploadState === 'assembling') {
    return <Spinner label="Assembling PDF…" sub="Stitching annotated pages into a single PDF. Should take under 15 seconds." />;
  }

  return null;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="uploading-wrap">
      <div className="spinner" />
      <p className="uploading-text">{label}</p>
      {sub && <p className="uploading-sub">{sub}</p>}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const loginCSS = `
.login-wrap { min-height:100vh; background:#f3f4f6; display:flex; align-items:center; justify-content:center; padding:16px; }
.login-card { width:100%; max-width:360px; background:#fff; border-radius:20px; border:1px solid #e5e7eb; padding:32px 28px; text-align:center; }
.login-icon { font-size:40px; margin-bottom:12px; }
.login-card h1 { font-size:20px; font-weight:700; color:#111827; margin:0 0 4px; }
.login-card p { font-size:13px; color:#9ca3af; margin:0 0 24px; }
.pw-input { width:100%; border:1px solid #e5e7eb; border-radius:10px; padding:12px 16px; font-size:15px; outline:none; box-sizing:border-box; margin-bottom:10px; color:#111; }
.pw-input:focus { border-color:#1e3a5f; }
.pw-error { font-size:13px; color:#ef4444; margin-bottom:10px; }
.pw-btn { width:100%; background:#1e3a5f; color:#fff; border:none; border-radius:10px; padding:13px 0; font-size:15px; font-weight:600; cursor:pointer; }
.pw-btn:disabled { opacity:0.45; cursor:default; }
`;

const pageCSS = `
.mark-wrap { min-height:100vh; background:#f3f4f6; padding-bottom:48px; }
.mark-header { position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid #e5e7eb; }
.mark-header-inner { max-width:720px; margin:0 auto; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
.mark-back { font-size:14px; color:#6b7280; text-decoration:none; }
.mark-back:hover { color:#1e3a5f; }
.mark-title { font-size:17px; font-weight:700; color:#111827; }
.mark-body { max-width:720px; margin:0 auto; padding:20px 16px; }

/* Landing */
.landing-wrap { display:flex; flex-direction:column; gap:16px; }
.landing-topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.landing-tabs { display:flex; gap:4px; background:#e5e7eb; border-radius:10px; padding:3px; }
.tab-btn { background:none; border:none; padding:7px 16px; border-radius:8px; font-size:14px; font-weight:600; color:#6b7280; cursor:pointer; transition:all 0.15s; }
.tab-btn--active { background:#fff; color:#1e3a5f; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
.new-batch-btn { background:#1e3a5f; color:#fff; border:none; border-radius:10px; padding:9px 18px; font-size:14px; font-weight:700; cursor:pointer; white-space:nowrap; }
.new-batch-btn:hover { background:#162d4a; }
.landing-loading { display:flex; align-items:center; gap:10px; color:#9ca3af; font-size:14px; padding:24px 0; }
.landing-empty { text-align:center; color:#9ca3af; font-size:14px; padding:48px 0; }

/* Batch list */
.batch-list { display:flex; flex-direction:column; gap:8px; }
.batch-row { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; text-decoration:none; color:inherit; }
.batch-row--link { cursor:pointer; transition:background 0.12s,border-color 0.12s; }
.batch-row--link:hover { background:#f9fafb; border-color:#d1d5db; }
.batch-row-main { flex:1; min-width:0; }
.batch-row-name { font-size:15px; font-weight:700; color:#111827; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.batch-row-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.status-chip { font-size:11px; font-weight:700; color:#fff; border-radius:8px; padding:2px 8px; text-transform:uppercase; letter-spacing:0.04em; }
.score-chip { font-size:13px; font-weight:700; color:#1e3a5f; background:#eff6ff; border-radius:8px; padding:2px 8px; }
.batch-time { font-size:12px; color:#9ca3af; }
.batch-meta-dim { font-size:12px; color:#d1d5db; }
.batch-row-actions { display:flex; gap:6px; flex-shrink:0; }
.row-action-btn { font-size:13px; font-weight:600; padding:6px 12px; border-radius:8px; border:none; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; background:#f3f4f6; color:#374151; transition:background 0.15s; }
.row-action-btn:hover { background:#e5e7eb; }
.row-action-btn--primary { background:#1e3a5f; color:#fff; }
.row-action-btn--primary:hover { background:#162d4a; }
.row-action-btn--danger { color:#b91c1c; }
.row-action-btn--danger:hover { background:#fef2f2; }

/* Upload */
.back-link { font-size:14px; color:#6b7280; background:none; border:none; cursor:pointer; padding:0; text-align:left; }
.back-link:hover { color:#1e3a5f; }
.upload-section { display:flex; flex-direction:column; gap:20px; }
.field-group { display:flex; flex-direction:column; gap:6px; }
.field-label { font-size:13px; font-weight:600; color:#374151; }
.field-select, .field-input { border:1px solid #e5e7eb; border-radius:10px; padding:10px 14px; font-size:15px; color:#111827; background:#fff; outline:none; width:100%; box-sizing:border-box; }
.field-select:focus, .field-input:focus { border-color:#1e3a5f; }
.drop-zone { border:2px dashed #d1d5db; border-radius:14px; padding:32px 20px; text-align:center; cursor:pointer; background:#fff; transition:border-color 0.15s,background 0.15s; }
.drop-zone:hover, .drop-zone--over { border-color:#1e3a5f; background:#f0f4f9; }
.drop-icon { font-size:32px; margin-bottom:8px; }
.drop-primary { font-size:15px; font-weight:600; color:#111827; margin-bottom:4px; }
.drop-secondary { font-size:13px; color:#9ca3af; }
.upload-btn { background:#1e3a5f; color:#fff; border:none; border-radius:12px; padding:14px 0; font-size:15px; font-weight:600; cursor:pointer; width:100%; }
.upload-btn:disabled { opacity:0.4; cursor:default; }

/* Spinner */
.uploading-wrap { text-align:center; padding:60px 20px; }
.spinner { width:44px; height:44px; border:4px solid #e5e7eb; border-top-color:#1e3a5f; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 20px; }
@keyframes spin { to { transform:rotate(360deg); } }
.uploading-text { font-size:16px; font-weight:600; color:#111827; margin:0 0 12px; }
.uploading-sub { font-size:13px; color:#9ca3af; line-height:1.6; margin:0; }
.progress-bar-wrap { height:6px; background:#e5e7eb; border-radius:3px; margin:0 auto 10px; max-width:280px; overflow:hidden; }
.progress-bar { height:100%; background:#1e3a5f; border-radius:3px; transition:width 0.3s ease; }

/* Preview / Marked */
.preview-section { display:flex; flex-direction:column; gap:24px; }
.preview-summary { display:flex; flex-wrap:wrap; gap:8px; }
.summary-chip { background:#1e3a5f; color:#fff; font-size:13px; font-weight:600; border-radius:20px; padding:5px 14px; }
.page-block { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; }
.page-heading { font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.05em; }
.thumb-wrap { position:relative; display:inline-block; overflow:hidden; border:1px solid #e5e7eb; border-radius:6px; }
.q-box { position:absolute; border:2px solid #ef4444; background:rgba(239,68,68,0.08); box-sizing:border-box; }
.q-label { position:absolute; top:-20px; left:0; font-size:10px; font-family:monospace; background:#ef4444; color:#fff; padding:1px 5px; border-radius:3px; white-space:nowrap; line-height:1.6; }
.page-detected { margin-top:10px; font-size:13px; color:#6b7280; }
.marks-badge { font-size:13px; font-weight:700; padding:3px 10px; border-radius:12px; }
.marks-badge--full { background:#dcfce7; color:#166534; }
.marks-badge--partial { background:#fef3c7; color:#92400e; }
.marks-badge--zero { background:#fee2e2; color:#991b1b; }
.marking-summary { background:#f8fafc; border-left:3px solid #1e3a5f; padding:10px 14px; border-radius:0 8px 8px 0; margin-top:4px; }
.marking-summary-title { font-size:13px; font-weight:700; color:#1e3a5f; margin-bottom:4px; }
.marking-summary-body { font-size:13px; color:#374151; line-height:1.55; }

/* Cover page checkbox */
.cover-page-check { display:flex; align-items:center; gap:10px; font-size:14px; color:#374151; cursor:pointer; }
.cover-page-check input { width:16px; height:16px; cursor:pointer; }

/* Actions */
.error-msg { background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; font-size:14px; color:#b91c1c; }
.preview-actions { display:flex; flex-direction:column; gap:10px; }
.action-btn { border:none; border-radius:12px; padding:14px 0; font-size:15px; font-weight:600; cursor:pointer; width:100%; }
.action-btn--primary { background:#1e3a5f; color:#fff; }
.action-btn--secondary { background:#f3f4f6; color:#374151; }
`;
