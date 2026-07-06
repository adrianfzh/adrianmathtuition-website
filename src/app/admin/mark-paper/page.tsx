'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

// ── file helpers ────────────────────────────────────────────────────────────
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function pdfToBase64(file: File): Promise<string> {
  return (await readDataUrl(file)).split(',')[1] || '';
}
// Build the upload payload for one image. Downscale via canvas when the browser can
// decode it (keeps the payload small); otherwise — HEIC on Chrome — send the raw bytes
// and let the server (sharp) convert. Never reject a photo here.
async function fileToUpload(file: File, maxEdge = 1280, quality = 0.72): Promise<{ base64: string; mediaType: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = canvas.toDataURL('image/jpeg', quality);
    return { base64: out.split(',')[1] || '', mediaType: 'image/jpeg' };
  } catch {
    const dataUrl = await readDataUrl(file);
    return { base64: dataUrl.split(',')[1] || '', mediaType: file.type || 'image/heic' };
  }
}

type MarkPart = { label?: string; awarded?: number; max?: number; error_summary?: string | null };
type Run = { id: string; created_at: string; paper_name?: string | null; total_awarded?: number | null; total_max?: number | null; cost_usd?: number | null; num_questions?: number | null; pdf_url?: string | null; photos_pdf_url?: string | null };
type Result = {
  question_number: string; working_index: number; match_confidence: string;
  marking?: { total_awarded?: number; total_max?: number; overall_comment?: string; parts?: MarkPart[] };
  marking_output?: unknown;
  review_recommended?: boolean; review_reasons?: string[];
};
type Usage = { costUsd?: number; timeSec?: number; inputTokens?: number; outputTokens?: number; model?: string };

const card: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 };
const btn: CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' };

// Drag-and-drop / click-to-browse upload zone.
function FileDrop({ label, accept, multiple, count, primaryName, onFiles, hint }: {
  label: string; accept: string; multiple: boolean; count: number;
  primaryName: string | null; onFiles: (files: File[]) => void; hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(Array.from(e.dataTransfer.files)); }}
        style={{
          border: `2px dashed ${drag ? '#2563eb' : '#cbd5e1'}`,
          background: drag ? '#eff6ff' : '#f8fafc',
          borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>{multiple ? '🖼️' : '📄'}</div>
        {count > 0
          ? <div style={{ fontWeight: 600, color: '#0f172a' }}>{multiple ? `${count} photo${count > 1 ? 's' : ''} added — drop or click to add more` : primaryName}</div>
          : <div style={{ color: '#475569' }}>Drag &amp; drop here, or <span style={{ color: '#2563eb', fontWeight: 600 }}>click to browse</span></div>}
        {hint && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files ? Array.from(e.target.files) : [])} />
    </div>
  );
}

export default function MarkPaperPage() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imgPreviews, setImgPreviews] = useState<(string | null)[]>([]);

  const [results, setResults] = useState<Result[] | null>(null);
  const [totals, setTotals] = useState<{ awarded: number; max: number } | null>(null);
  const [unattempted, setUnattempted] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [marked, setMarked] = useState<{ url: string; kind: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<{ count: number; totalCost: number; avgCost: number; avgTime: number } | null>(null);
  const [annotatedPhotos, setAnnotatedPhotos] = useState<{ photo_index: number; url: string }[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [markModel, setMarkModel] = useState<'opus' | 'sonnet'>('opus');
  const [markStyle, setMarkStyle] = useState<'classic' | 'teacher'>('classic');

  const [phase, setPhase] = useState<'idle' | 'proposing' | 'proposed' | 'marking' | 'done'>('idle');
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const authHeaders = { 'Content-Type': 'application/json' };

  // Lifetime cost metrics + recent runs (for the history list). Re-callable after mark/generate.
  async function loadStats() {
    try {
      const r = await fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'stats' }) });
      if (!r.ok) return;
      const d = await r.json();
      setStats(d);
      setRecentRuns(d.runs || []);
    } catch { /* ignore */ }
  }
  // Establish the admin session first (silently upgrades a legacy cookie); if not
  // logged in, send to the admin hub instead of failing with a bare "unauthorized".
  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (!ok) { window.location.href = '/admin'; return; }
      loadStats();
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Load a stored run back into the page so its PDFs can be regenerated (no re-mark).
  async function loadRun(id: string) {
    setError('');
    try {
      const r = await fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'run', id }) });
      const d = await r.json();
      if (!r.ok || !d.run) throw new Error(d.error || 'Could not load that run');
      const rj = d.run.result_json || {};
      setResults(rj.results || []);
      setTotals(rj.totals || null);
      setAnnotatedPhotos(rj.annotated_photos || []);
      setUnattempted([]);
      setRunId(d.run.id);
      setMarked(null);
      setPhase('done');
    } catch (e) { setError((e as Error).message); }
  }

  // Can the browser natively decode this for a preview? (JPEG/PNG/WebP everywhere; HEIC only on Safari.)
  async function canDecode(f: Blob): Promise<boolean> {
    try { const b = await createImageBitmap(f); b.close?.(); return true; } catch { return false; }
  }

  // Accept all picked photos (HEIC included). Preview those the browser can decode; the rest
  // still upload and get converted on the server. Appends, so you can build the set up.
  async function onPickImages(arr: File[]) {
    if (!arr.length) return;
    setError('');
    const withPreview = await Promise.all(arr.map(async (f) => ({
      file: f,
      url: (await canDecode(f)) ? URL.createObjectURL(f) : null,
    })));
    setImages((prev) => [...prev, ...withPreview.map((w) => w.file)]);
    setImgPreviews((prev) => [...prev, ...withPreview.map((w) => w.url)]);
  }

  function removeImage(idx: number) {
    setImgPreviews((prev) => { const u = prev[idx]; if (u) URL.revokeObjectURL(u); return prev.filter((_, j) => j !== idx); });
    setImages((prev) => prev.filter((_, j) => j !== idx));
  }

  // Single-pass: mark every photo directly against the PDF (no extract/match/confirm step).
  async function markPaper() {
    if (images.length === 0) { setError('Add at least one working photo.'); return; }
    setError(''); setPhase('marking'); setResults(null); setTotals(null); setMarked(null);
    try {
      // PDF is optional — without it, photos are marked standalone (self-contained
      // worksheets where the printed questions are on the pages themselves).
      const pdfBase64 = pdf ? await pdfToBase64(pdf) : null;
      const imgs = await Promise.all(images.map((f) => fileToUpload(f)));
      const resp = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'direct', pdfBase64, images: imgs, paperName: pdf ? pdf.name : `worksheet (${images.length} photo${images.length === 1 ? '' : 's'})`, model: markModel, style: markStyle }),
      });
      const raw = await resp.text();
      let d: { results?: Result[]; totals?: { awarded: number; max: number }; unattempted_questions?: string[]; annotated_photos?: { photo_index: number; url: string }[]; run_id?: string | null; usage?: Usage; error?: string };
      try { d = raw ? JSON.parse(raw) : {}; }
      catch {
        const hint = resp.status === 413
          ? 'the upload is too large for the server — try fewer photos, or a smaller PDF'
          : 'it likely timed out — try fewer photos at once';
        throw new Error(`The marker didn't return a result (status ${resp.status}) — ${hint}.`);
      }
      if (!resp.ok) throw new Error(d.error || `Marking failed (status ${resp.status})`);
      setResults(d.results || []);
      setTotals(d.totals || null);
      setUnattempted(d.unattempted_questions || []);
      setAnnotatedPhotos(d.annotated_photos || []);
      setRunId(d.run_id || null);
      setUsage(d.usage || null);
      setPhase('done');
      loadStats();
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  }

  // Render the marked typeset output: PDF (>1 image) or a single image (1 image).
  async function generateMarked(mode: 'full' | 'photos' = 'full') {
    if (mode === 'photos' ? !annotatedPhotos.length : !results?.length) return;
    setGenerating(true); setMarked(null); setError('');
    try {
      const payload = {
        results: (results || []).map((r) => ({ question_number: r.question_number, marking_output: r.marking_output })),
        annotated_photos: annotatedPhotos,
        totals,
        student: { name: '', level: '' },
        multi: images.length > 1,
        mode,
      };
      const resp = await fetch('/api/admin/mark-paper-pdf', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || 'Generate failed');
      setMarked({ url: d.url, kind: d.kind });
      // Attach the generated PDF to its run so it shows as a one-click download in history.
      if (runId && d.url) {
        fetch('/api/admin/mark-paper', { method: 'POST', headers: authHeaders, body: JSON.stringify({ phase: 'link-pdf', id: runId, url: d.url, kind: mode }) })
          .then(() => loadStats()).catch(() => {});
      }
    } catch (e) { setError((e as Error).message); }
    finally { setGenerating(false); }
  }

  const busy = phase === 'proposing' || phase === 'marking';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Mark a paper</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Upload the student&rsquo;s working (photos) — plus the question paper (PDF) if there is one — then Mark. With a paper, each photo is marked against it; without one, the marker reads the printed questions off the pages themselves (self-contained worksheets).</p>

      {error && <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}

      {stats && stats.count > 0 && (
        <div style={{ ...card, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', background: '#f8fafc' }}>
          <span style={{ fontWeight: 700 }}>📊 Marking cost</span>
          <span style={{ fontSize: 13, color: '#374151' }}>
            last {stats.count} papers · ${stats.totalCost.toFixed(2)} total · <strong>${stats.avgCost.toFixed(3)}/paper</strong> avg · {stats.avgTime.toFixed(0)}s avg
          </span>
        </div>
      )}

      {recentRuns.length > 0 && (
        <details style={card}>
          <summary style={{ fontWeight: 700, cursor: 'pointer' }}>🗂️ Recent marked papers ({recentRuns.length})</summary>
          <div style={{ marginTop: 8 }}>
            {recentRuns.map((run) => (
              <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f3f4f6', fontSize: 13 }}>
                <span style={{ color: '#6b7280', minWidth: 120 }}>{new Date(run.created_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ flex: 1, minWidth: 120, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.paper_name || 'Paper'}</span>
                <span style={{ color: '#374151' }}>{run.total_awarded ?? 0}/{run.total_max ?? 0}</span>
                <span style={{ color: '#9ca3af' }}>${(run.cost_usd ?? 0).toFixed(3)}</span>
                {run.pdf_url && <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>PDF ↗</a>}
                {run.photos_pdf_url && <a href={run.photos_pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Images ↗</a>}
                <button onClick={() => loadRun(run.id)} style={{ ...btn, padding: '4px 10px', fontSize: 12 }}>Load</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Upload */}
      <div style={card}>
        <FileDrop
          label="Question paper (PDF) — optional"
          accept="application/pdf"
          multiple={false}
          count={pdf ? 1 : 0}
          primaryName={pdf?.name || null}
          onFiles={(fs) => setPdf(fs.find((f) => f.type === 'application/pdf') || fs[0] || null)}
          hint="One PDF file · leave empty for self-contained worksheets (questions printed on the pages)"
        />
        <FileDrop
          label="Student working (photos — one or more)"
          accept="image/*"
          multiple
          count={images.length}
          primaryName={null}
          onFiles={(fs) => { const imgs = fs.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name)); if (imgs.length) onPickImages(imgs); }}
          hint="JPG / PNG / HEIC · drop several · click to add more"
        />
        {imgPreviews.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {imgPreviews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                {src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={src} alt={`working ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  : <div style={{ width: 72, height: 72, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', textAlign: 'center', gap: 2 }}><span style={{ fontSize: 18 }}>🖼️</span>HEIC<br />converts on<br />upload</div>}
                <button onClick={() => removeImage(i)} aria-label={`Remove photo ${i + 1}`}
                  style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', background: '#111827', color: '#fff', fontSize: 12, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={markPaper}>
            {phase === 'marking' ? 'Marking…' : 'Mark paper'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
            <span>Model:</span>
            <select
              value={markModel}
              onChange={(e) => setMarkModel(e.target.value as 'opus' | 'sonnet')}
              disabled={busy}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="opus">Opus 4.8 (default)</option>
              <option value="sonnet">Sonnet 5</option>
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
            <span>Marks:</span>
            <select
              value={markStyle}
              onChange={(e) => setMarkStyle(e.target.value as 'classic' | 'teacher')}
              disabled={busy}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="classic">Classic pills</option>
              <option value="teacher">✍️ Teacher&apos;s red pen</option>
            </select>
          </label>
          <span style={{ color: '#6b7280', fontSize: 13 }}>{pdf ? 'Reads each photo against the paper and marks every question it finds (≈1–2 min).' : 'No paper attached — marks each photo standalone, reading the printed questions off the page (≈1–2 min).'}</span>
        </div>
      </div>

      {/* (matching/confirm step removed — direct marking marks every photo against the PDF) */}

      {/* Results */}
      {phase === 'done' && results && (
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Result: {totals?.awarded ?? 0}/{totals?.max ?? 0}
          </h2>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Q{r.question_number}</strong>
                <span>{r.marking?.total_awarded ?? 0}/{r.marking?.total_max ?? 0}</span>
              </div>
              {(r.marking?.parts || []).map((p, j) => (
                <div key={j} style={{ fontSize: 13, color: p.error_summary ? '#b91c1c' : '#15803d', marginLeft: 8 }}>
                  {p.label ? `${p.label} ` : ''}{p.awarded ?? 0}/{p.max ?? 0} — {p.error_summary || 'Correct'}
                </div>
              ))}
              {r.marking?.overall_comment && <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{r.marking.overall_comment}</div>}
              {r.review_recommended && (
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>⚠ {(r.review_reasons || []).join(' · ')}</div>
              )}
            </div>
          ))}
          {unattempted.length > 0 && (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>Not attempted: {unattempted.map((n) => `Q${n}`).join(', ')}</div>
          )}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button style={{ ...btn, opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={() => generateMarked('full')}>
              {generating ? 'Generating…' : '📄 Generate full PDF'}
            </button>
            {annotatedPhotos.length > 0 && (
              <button style={{ ...btn, background: '#374151', opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={() => generateMarked('photos')}>
                {generating ? '…' : '🖼️ Generate images PDF'}
              </button>
            )}
            {marked && (
              <a href={marked.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                Open {marked.kind === 'pdf' ? 'PDF' : 'image'} ↗
              </a>
            )}
            <span style={{ color: '#6b7280', fontSize: 13 }}>Each click builds a fresh PDF (a few sec). Full = typeset + annotated photos · Images = annotated originals only.</span>
          </div>
        </div>
      )}

      {usage && (
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          💰 ${(usage.costUsd ?? 0).toFixed(4)} · ⏱ {usage.timeSec ?? 0}s · {(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)} tokens{usage.model ? ` · 🧠 ${usage.model}` : ''}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="enlarged working" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
