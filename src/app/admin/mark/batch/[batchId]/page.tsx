'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Submission {
  questionLabel: string;
  annotatedSliceUrls: string[];
  awarded: number;
  max: number;
  feedback: string;
  submissionId: string;
}

interface BatchDetail {
  batchId: string;
  studentName: string;
  createdAt: string;
  status: string;
  totalPages: number;
  totalQuestions: number;
  totalMarksAwarded: number | null;
  totalMarksMax: number | null;
  finalPdfUrl: string | null;
  submissions: Submission[];
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.batchId as string;
  const savedPw = useRef('');

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const amendInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    savedPw.current = pw;
    loadBatch(pw);
  }, [batchId]);

  async function loadBatch(pw: string) {
    setLoading(true); setError('');
    try {
      // Fetch batch row
      const listRes = await fetch(`/api/mark-batch/list?status=all`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!listRes.ok) throw new Error(`${listRes.status}`);
      const listData = await listRes.json();
      const batchRow = (listData.batches || []).find((b: any) => b.batchId === batchId);
      if (!batchRow) throw new Error('Batch not found');

      // Fetch submissions for this batch
      const subRes = await fetch(`/api/mark-batch/submissions?batchId=${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      let submissions: Submission[] = [];
      if (subRes.ok) {
        const subData = await subRes.json();
        submissions = subData.submissions || [];
      }

      setBatch({
        batchId: batchRow.batchId,
        studentName: batchRow.studentName,
        createdAt: batchRow.createdAt,
        status: batchRow.status,
        totalPages: batchRow.totalPages,
        totalQuestions: batchRow.totalQuestions,
        totalMarksAwarded: batchRow.totalMarksAwarded,
        totalMarksMax: batchRow.totalMarksMax,
        finalPdfUrl: batchRow.finalPdfUrl,
        submissions,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load batch');
    } finally { setLoading(false); }
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

  async function handleDelete() {
    if (!confirm(`Delete this batch for ${batch?.studentName}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch('/api/mark-batch/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      router.push('/admin/mark');
    } catch { alert('Delete failed. Try again.'); setDeleting(false); }
  }

  const dateStr = batch?.createdAt
    ? new Date(batch.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

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

          {batch && (
            <>
              {/* Summary row */}
              <div className="batch-meta-row">
                <div className="batch-meta-chips">
                  <span className="summary-chip">{batch.studentName}</span>
                  {batch.totalMarksAwarded !== null && batch.totalMarksMax !== null && batch.totalMarksMax > 0 && (
                    <span className="summary-chip">Total: {batch.totalMarksAwarded}/{batch.totalMarksMax}</span>
                  )}
                  <span className="summary-chip dim-chip">{dateStr}</span>
                  <span className="summary-chip dim-chip">{batch.totalPages}pp · {batch.totalQuestions}q</span>
                </div>

                {/* Action buttons */}
                <div className="batch-actions">
                  {batch.finalPdfUrl && (
                    <a href={batch.finalPdfUrl} target="_blank" rel="noreferrer" className="action-link">
                      Download PDF
                    </a>
                  )}
                  <label className="action-link action-link--upload" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                    {uploading ? 'Uploading…' : 'Upload amended PDF'}
                    <input ref={amendInputRef} type="file" accept="application/pdf"
                      onChange={handleAmendUpload} style={{ display: 'none' }} disabled={uploading} />
                  </label>
                  <button className="action-link action-link--danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete batch'}
                  </button>
                </div>
              </div>

              {uploadError && <div className="error-msg" style={{ marginTop: 8 }}>{uploadError}</div>}

              {/* Annotated gallery */}
              {batch.submissions.length === 0 && (
                <div className="empty-gallery">No marked submissions found for this batch.</div>
              )}

              <div className="gallery">
                {batch.submissions.map((sub, i) => (
                  <div key={i} className="gallery-card">
                    <div className="gallery-card-header">
                      <span className="gallery-q-label">{sub.questionLabel}</span>
                      {sub.max > 0 && (
                        <span className={`marks-badge ${sub.awarded === sub.max ? 'marks-badge--full' : sub.awarded > 0 ? 'marks-badge--partial' : 'marks-badge--zero'}`}>
                          {sub.awarded}/{sub.max}
                        </span>
                      )}
                    </div>
                    {sub.annotatedSliceUrls.map((url, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={url} alt={`${sub.questionLabel} annotated`}
                        style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }} />
                    ))}
                    {sub.feedback && (
                      <div className="marking-summary">
                        <div className="marking-summary-body">{sub.feedback}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

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
@keyframes spin { to { transform:rotate(360deg); } }
.error-msg { background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; font-size:14px; color:#b91c1c; }
.batch-meta-row { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; justify-content:space-between; }
.batch-meta-chips { display:flex; flex-wrap:wrap; gap:8px; }
.summary-chip { background:#1e3a5f; color:#fff; font-size:13px; font-weight:600; border-radius:20px; padding:5px 14px; }
.dim-chip { background:#6b7280; }
.batch-actions { display:flex; flex-wrap:wrap; gap:8px; }
.action-link { font-size:13px; font-weight:600; padding:7px 14px; border-radius:8px; border:1px solid #e5e7eb; background:#fff; color:#374151; text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; transition:background 0.15s; }
.action-link:hover { background:#f3f4f6; }
.action-link--upload { border-color:#2563eb; color:#2563eb; }
.action-link--upload:hover { background:#eff6ff; }
.action-link--danger { border-color:#fca5a5; color:#b91c1c; }
.action-link--danger:hover { background:#fef2f2; }
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
`;
