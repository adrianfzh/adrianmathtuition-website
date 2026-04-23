'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedQuestion {
  questionLabel: string;
  questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
  isContinuation: boolean;
}

interface DetectedPage {
  pageIndex: number;
  pageImageUrl: string;
  pageImageWidth: number;
  pageImageHeight: number;
  questions: DetectedQuestion[];
}

interface DetectionResult {
  pages: DetectedPage[];
  summary: { totalPages: number; totalQuestions: number };
}

interface MarkingJsonResult {
  questionLabel: string;
  annotatedSliceUrl: string | null;
  marks: { awarded: number; max: number; marginNote: string };
  summary: { title: string; bodyMarkdown: string };
  error?: string;
}

interface Batch {
  batchId: string;
  airtableRecordId: string;
  studentName: string;
  createdAt: string;
  status: string;
  totalPages: number;
  totalQuestions: number;
  totalMarksAwarded: number | null;
  totalMarksMax: number | null;
  finalPdfUrl: string | null;
  detectionJson: DetectionResult | null;
  markingJson: { results: MarkingJsonResult[] } | null;
}

interface Submission {
  submissionId: string;
  questionLabel: string;
  marksAwarded: number;
  marksMax: number;
  annotatedSliceUrls: string[];
  botFeedback: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

const STATUS_COLOR: Record<string, string> = {
  detected: '#6b7280', marking: '#d97706', marked: '#2563eb',
  finalized: '#16a34a', failed: '#dc2626', deleted: '#9ca3af',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.batchId as string;
  const savedPw = useRef('');

  const [batch, setBatch] = useState<Batch | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [includeCoverPage, setIncludeCoverPage] = useState(true);

  const amendInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    savedPw.current = pw;
    loadBatch(pw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const loadBatch = useCallback(async (pw: string) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/mark-batch/get?batchId=${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setBatch(data.batch);
      setSubmissions(data.submissions || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load batch');
    } finally { setLoading(false); }
  }, [batchId]);

  // Auto-poll every 8s while marking is in progress
  useEffect(() => {
    if (batch?.status !== 'marking' && batch?.status !== 'processing') return;
    const id = setInterval(() => loadBatch(savedPw.current), 8000);
    return () => clearInterval(id);
  }, [batch?.status, loadBatch]);

  async function handleStartMarking() {
    if (!batch) return;
    setActionLoading(true); setActionError('');
    try {
      const res = await fetch('/api/mark-batch/execute', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.batchId, studentLevel: 'unknown' }),
      });
      if (!res.ok && res.status !== 202) {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error || `Failed to start marking: ${res.status}`);
        return;
      }
      // Fly accepted (202) — reload to show 'marking' status; auto-poll will take over
      await loadBatch(savedPw.current);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Network error');
    } finally { setActionLoading(false); }
  }

  async function handleAssemble() {
    if (!batch) return;
    setActionLoading(true); setActionError('');
    try {
      const res = await fetch('/api/mark-batch/assemble-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.batchId, includeCoverPage }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error || `Assembly failed: ${res.status}`);
        return;
      }
      await loadBatch(savedPw.current);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Network error');
    } finally { setActionLoading(false); }
  }

  async function handleDelete() {
    if (!batch) return;
    if (!confirm(`Delete this batch for ${batch.studentName}? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await fetch('/api/mark-batch/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.batchId }),
      });
      router.push('/admin/mark');
    } catch {
      alert('Delete failed. Try again.');
      setActionLoading(false);
    }
  }

  async function handleAmendUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setUploadError('Please select a PDF file.'); return; }
    if (file.size > 50 * 1024 * 1024) { setUploadError('File exceeds 50 MB.'); return; }
    setUploading(true); setUploadError('');
    const fd = new FormData();
    fd.append('batchId', batchId);
    fd.append('file', file);
    try {
      const res = await fetch('/api/mark-batch/upload-amended', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setUploadError(d.error || `Upload failed: ${res.status}`);
        return;
      }
      await loadBatch(savedPw.current);
    } catch (e: unknown) { setUploadError(e instanceof Error ? e.message : 'Network error'); }
    finally { setUploading(false); if (amendInputRef.current) amendInputRef.current.value = ''; }
  }

  const dateStr = batch?.createdAt
    ? new Date(batch.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Fall back to markingJson when Airtable submissions weren't written
  const effectiveResults: MarkingJsonResult[] = submissions.length > 0
    ? submissions.map(s => ({
        questionLabel: s.questionLabel,
        annotatedSliceUrl: s.annotatedSliceUrls[0] ?? null,
        marks: { awarded: s.marksAwarded, max: s.marksMax, marginNote: '' },
        summary: { title: '', bodyMarkdown: s.botFeedback },
      }))
    : (batch?.markingJson?.results ?? []);

  const totalAwarded = effectiveResults.reduce((s, r) => s + (r.marks.awarded ?? 0), 0);
  const totalMax = effectiveResults.reduce((s, r) => s + (r.marks.max ?? 0), 0);

  return (
    <>
      <style>{css}</style>
      <div className="mark-wrap">
        <div className="mark-header">
          <div className="mark-header-inner">
            <a href="/admin/mark" className="mark-back">← All batches</a>
            <span className="mark-title">{batch?.studentName || 'Batch'}</span>
            <span />
          </div>
        </div>

        <div className="mark-body">
          {loading && <div className="batch-loading"><div className="spinner" />Loading…</div>}
          {error && <div className="error-msg">{error}</div>}

          {!loading && batch && (
            <>
              {/* Meta chips */}
              <div className="batch-meta-row">
                <div className="batch-meta-chips">
                  <span className="summary-chip">{batch.studentName}</span>
                  {totalMax > 0 && (
                    <span className="summary-chip">Total: {totalAwarded}/{totalMax}</span>
                  )}
                  <span className="summary-chip dim-chip">{dateStr}</span>
                  <span className="summary-chip dim-chip">{batch.totalPages}pp · {batch.totalQuestions}q</span>
                  <span className="summary-chip" style={{ background: STATUS_COLOR[batch.status] || '#6b7280' }}>
                    {batch.status}
                  </span>
                </div>
              </div>

              {actionError && <div className="error-msg" style={{ marginTop: 8 }}>{actionError}</div>}
              {uploadError && <div className="error-msg" style={{ marginTop: 8 }}>{uploadError}</div>}

              {/* ── marked: gallery + assemble CTA ── */}
              {batch.status === 'marked' && (
                <>
                  <div className="batch-actions">
                    <label className="cover-check">
                      <input type="checkbox" checked={includeCoverPage}
                        onChange={e => setIncludeCoverPage(e.target.checked)} />
                      Include cover page
                    </label>
                    <button className="action-link action-link--primary"
                      onClick={handleAssemble} disabled={actionLoading}>
                      {actionLoading ? 'Assembling…' : 'Save as marked (assemble PDF)'}
                    </button>
                    <button className="action-link action-link--danger"
                      onClick={handleDelete} disabled={actionLoading}>
                      Delete batch
                    </button>
                  </div>
                  <AnnotatedGallery results={effectiveResults} />
                </>
              )}

              {/* ── finalized: gallery + download ── */}
              {batch.status === 'finalized' && (
                <>
                  <div className="batch-actions">
                    {batch.finalPdfUrl && (
                      <a href={batch.finalPdfUrl} target="_blank" rel="noreferrer" className="action-link">
                        Download PDF
                      </a>
                    )}
                    <label className="action-link action-link--upload"
                      style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                      {uploading ? 'Uploading…' : 'Upload amended PDF'}
                      <input ref={amendInputRef} type="file" accept="application/pdf"
                        onChange={handleAmendUpload} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                    <button className="action-link action-link--danger"
                      onClick={handleDelete} disabled={actionLoading}>
                      Delete batch
                    </button>
                  </div>
                  <AnnotatedGallery results={effectiveResults} />
                </>
              )}

              {/* ── detected: detection preview + start marking ── */}
              {batch.status === 'detected' && (
                <div className="status-section">
                  <div className="status-message">
                    Questions detected. Ready to start AI marking.
                  </div>
                  <button className="action-link action-link--primary action-link--full"
                    onClick={handleStartMarking} disabled={actionLoading}>
                    {actionLoading
                      ? <><span className="spinner-inline" /> Marking in progress…</>
                      : 'Start marking'}
                  </button>
                  <DetectionPreview batch={batch} />
                </div>
              )}

              {/* ── marking: in-progress with refresh ── */}
              {batch.status === 'marking' && (
                <div className="status-section">
                  <div className="status-message status-message--info">
                    <div className="spinner-sm" />
                    <span>Marking in progress…</span>
                    <button className="refresh-btn"
                      onClick={() => loadBatch(savedPw.current)}>
                      Refresh
                    </button>
                  </div>
                  <DetectionPreview batch={batch} />
                </div>
              )}

              {/* ── failed: retry or delete ── */}
              {batch.status === 'failed' && (
                <div className="status-section">
                  <div className="status-message status-message--error">
                    Marking failed for this batch.
                  </div>
                  <div className="batch-actions">
                    <button className="action-link action-link--primary"
                      onClick={handleStartMarking} disabled={actionLoading}>
                      {actionLoading ? 'Retrying…' : 'Retry marking'}
                    </button>
                    <button className="action-link action-link--danger"
                      onClick={handleDelete} disabled={actionLoading}>
                      Delete batch
                    </button>
                  </div>
                </div>
              )}

              {/* ── deleted ── */}
              {batch.status === 'deleted' && (
                <div className="status-section">
                  <div className="status-message status-message--error">
                    This batch has been deleted.
                  </div>
                  <a href="/admin/mark" className="action-link">← Back to all batches</a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnnotatedGallery({ results }: { results: MarkingJsonResult[] }) {
  if (results.length === 0) {
    return <div className="empty-gallery">No marked submissions found for this batch.</div>;
  }
  return (
    <div className="gallery">
      {results.map((r, i) => (
        <div key={i} className="gallery-card">
          <div className="gallery-card-header">
            <span className="gallery-q-label">{r.questionLabel}</span>
            {r.marks.max > 0 && (
              <span className={`marks-badge ${r.marks.awarded === r.marks.max ? 'marks-badge--full' : r.marks.awarded > 0 ? 'marks-badge--partial' : 'marks-badge--zero'}`}>
                {r.marks.awarded}/{r.marks.max}{r.marks.marginNote ? ` ${r.marks.marginNote}` : ''}
              </span>
            )}
          </div>
          {r.error && <div className="error-msg" style={{ marginBottom: 6, fontSize: 13 }}>Error: {r.error}</div>}
          {r.annotatedSliceUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.annotatedSliceUrl} alt={`${r.questionLabel} annotated`}
              style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }} />
          )}
          {r.summary.bodyMarkdown && (
            <div className="marking-summary">
              {r.summary.title && <div className="marking-summary-title">{r.summary.title}</div>}
              <div className="marking-summary-body">{r.summary.bodyMarkdown}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DetectionPreview({ batch }: { batch: Batch }) {
  const pages = batch.detectionJson?.pages;
  if (!pages?.length) return null;
  return (
    <div className="detection-preview">
      {pages.map(page => {
        const scale = 280 / page.pageImageWidth;
        const thumbH = Math.round(page.pageImageHeight * scale);
        return (
          <div key={page.pageIndex} className="page-block">
            <div className="page-heading">Page {page.pageIndex + 1}</div>
            <div className="thumb-wrap" style={{ width: 280, height: thumbH }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.pageImageUrl} alt={`Page ${page.pageIndex + 1}`}
                style={{ width: 280, height: thumbH, display: 'block' }} />
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
                : page.questions.map(q => q.questionLabel + (q.isContinuation ? ' (continued)' : '')).join(', ')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const css = `
.mark-wrap { min-height:100vh; background:#f3f4f6; padding-bottom:48px; }
.mark-header { position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid #e5e7eb; }
.mark-header-inner { max-width:720px; margin:0 auto; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
.mark-back { font-size:14px; color:#6b7280; text-decoration:none; }
.mark-back:hover { color:#1e3a5f; }
.mark-title { font-size:17px; font-weight:700; color:#111827; }
.mark-body { max-width:720px; margin:0 auto; padding:20px 16px; display:flex; flex-direction:column; gap:20px; }
.batch-loading { display:flex; align-items:center; gap:10px; color:#9ca3af; font-size:14px; }
.spinner { width:36px; height:36px; border:3px solid #e5e7eb; border-top-color:#1e3a5f; border-radius:50%; animation:spin 0.8s linear infinite; }
.spinner-sm { width:18px; height:18px; border:2px solid #dbeafe; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
.spinner-inline { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.4); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:middle; margin-right:6px; }
@keyframes spin { to { transform:rotate(360deg); } }
.error-msg { background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; font-size:14px; color:#b91c1c; }

/* Meta chips */
.batch-meta-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.batch-meta-chips { display:flex; flex-wrap:wrap; gap:8px; }
.summary-chip { background:#1e3a5f; color:#fff; font-size:13px; font-weight:600; border-radius:20px; padding:5px 14px; }
.dim-chip { background:#6b7280; }

/* Action bar */
.batch-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.action-link { font-size:13px; font-weight:600; padding:7px 14px; border-radius:8px; border:1px solid #e5e7eb; background:#fff; color:#374151; text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:background 0.15s; }
.action-link:hover { background:#f3f4f6; }
.action-link--primary { background:#1e3a5f; color:#fff; border-color:#1e3a5f; }
.action-link--primary:hover { background:#162d4a; }
.action-link--primary:disabled { opacity:0.5; cursor:default; }
.action-link--full { width:100%; justify-content:center; padding:12px 14px; font-size:15px; }
.action-link--upload { border-color:#2563eb; color:#2563eb; }
.action-link--upload:hover { background:#eff6ff; }
.action-link--danger { border-color:#fca5a5; color:#b91c1c; }
.action-link--danger:hover { background:#fef2f2; }
.action-link--danger:disabled { opacity:0.5; cursor:default; }

/* Cover page checkbox */
.cover-check { display:flex; align-items:center; gap:8px; font-size:13px; color:#374151; cursor:pointer; }
.cover-check input { width:15px; height:15px; cursor:pointer; }

/* Status sections */
.status-section { display:flex; flex-direction:column; gap:16px; }
.status-message { background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; font-size:14px; color:#374151; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.status-message--info { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
.status-message--error { background:#fef2f2; border-color:#fca5a5; color:#b91c1c; }
.refresh-btn { margin-left:auto; font-size:13px; color:#2563eb; background:none; border:none; cursor:pointer; text-decoration:underline; padding:0; }

/* Gallery */
.empty-gallery { text-align:center; color:#9ca3af; font-size:14px; padding:40px 0; }
.gallery { display:flex; flex-direction:column; gap:20px; }
.gallery-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; }
.gallery-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.gallery-q-label { font-size:14px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.05em; }
.marks-badge { font-size:13px; font-weight:700; padding:3px 10px; border-radius:12px; }
.marks-badge--full { background:#dcfce7; color:#166534; }
.marks-badge--partial { background:#fef3c7; color:#92400e; }
.marks-badge--zero { background:#fee2e2; color:#991b1b; }
.marking-summary { background:#f8fafc; border-left:3px solid #1e3a5f; padding:10px 14px; border-radius:0 8px 8px 0; }
.marking-summary-body { font-size:13px; color:#374151; line-height:1.55; }

/* Detection preview */
.detection-preview { display:flex; flex-direction:column; gap:16px; }
.page-block { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; }
.page-heading { font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.05em; }
.thumb-wrap { position:relative; display:inline-block; overflow:hidden; border:1px solid #e5e7eb; border-radius:6px; }
.q-box { position:absolute; border:2px solid #ef4444; background:rgba(239,68,68,0.08); box-sizing:border-box; }
.q-label { position:absolute; top:-20px; left:0; font-size:10px; font-family:monospace; background:#ef4444; color:#fff; padding:1px 5px; border-radius:3px; white-space:nowrap; line-height:1.6; }
.page-detected { margin-top:10px; font-size:13px; color:#6b7280; }
`;
