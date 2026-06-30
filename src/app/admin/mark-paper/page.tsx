'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';

// ── auth (same cookie scheme as the other admin pages) ──────────────────────
function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : '';
}
function getAuth(): string {
  return getCookie('admin_pw') || getCookie('schedule_pw') || '';
}

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
async function fileToUpload(file: File, maxEdge = 1600, quality = 0.85): Promise<{ base64: string; mediaType: string }> {
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
type Result = {
  question_number: string; working_index: number; match_confidence: string;
  marking?: { total_awarded?: number; total_max?: number; overall_comment?: string; parts?: MarkPart[] };
  marking_output?: unknown;
  review_recommended?: boolean; review_reasons?: string[];
};
type Usage = { costUsd?: number; timeSec?: number; inputTokens?: number; outputTokens?: number };

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

  const [phase, setPhase] = useState<'idle' | 'proposing' | 'proposed' | 'marking' | 'done'>('idle');
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${getAuth()}`, 'Content-Type': 'application/json' };

  // Not logged in (e.g. opened this page directly in a browser without the admin cookie)
  // → send to the admin hub to log in, instead of failing with a bare "unauthorized".
  useEffect(() => { if (!getAuth()) window.location.href = '/admin'; }, []);

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
    if (!pdf || images.length === 0) { setError('Add a question PDF and at least one working photo.'); return; }
    setError(''); setPhase('marking'); setResults(null); setTotals(null); setMarked(null);
    try {
      const pdfBase64 = await pdfToBase64(pdf);
      const imgs = await Promise.all(images.map((f) => fileToUpload(f)));
      const resp = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'direct', pdfBase64, images: imgs }),
      });
      const raw = await resp.text();
      let d: { results?: Result[]; totals?: { awarded: number; max: number }; unattempted_questions?: string[]; usage?: Usage; error?: string };
      try { d = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`The marker didn't return a result (status ${resp.status}) — it likely timed out. Try marking fewer photos at once.`); }
      if (!resp.ok) throw new Error(d.error || `Marking failed (status ${resp.status})`);
      setResults(d.results || []);
      setTotals(d.totals || null);
      setUnattempted(d.unattempted_questions || []);
      setUsage(d.usage || null);
      setPhase('done');
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  }

  // Render the marked typeset output: PDF (>1 image) or a single image (1 image).
  async function generateMarked() {
    if (!results?.length) return;
    setGenerating(true); setMarked(null); setError('');
    try {
      const payload = {
        results: results.map((r) => ({ question_number: r.question_number, marking_output: r.marking_output })),
        student: { name: '', level: '' },
        multi: images.length > 1,
      };
      const resp = await fetch('/api/admin/mark-paper-pdf', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || 'Generate failed');
      setMarked({ url: d.url, kind: d.kind });
    } catch (e) { setError((e as Error).message); }
    finally { setGenerating(false); }
  }

  const busy = phase === 'proposing' || phase === 'marking';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Mark a paper</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Upload the question paper (PDF) and the student&rsquo;s working (photos), then Mark. The marker reads each photo against the paper and marks every question it finds — no manual matching.</p>

      {error && <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}

      {/* Upload */}
      <div style={card}>
        <FileDrop
          label="Question paper (PDF)"
          accept="application/pdf"
          multiple={false}
          count={pdf ? 1 : 0}
          primaryName={pdf?.name || null}
          onFiles={(fs) => setPdf(fs.find((f) => f.type === 'application/pdf') || fs[0] || null)}
          hint="One PDF file"
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
        <div style={{ marginTop: 14 }}>
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={markPaper}>
            {phase === 'marking' ? 'Marking…' : 'Mark paper'}
          </button>
          <span style={{ color: '#6b7280', marginLeft: 10, fontSize: 13 }}>Reads each photo against the paper and marks every question it finds (≈1–2 min).</span>
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
            <button style={{ ...btn, opacity: generating ? 0.6 : 1 }} disabled={generating} onClick={generateMarked}>
              {generating ? 'Generating…' : (images.length > 1 ? '📄 Generate marked PDF' : '🖼️ Generate marked image')}
            </button>
            {marked && (
              <a href={marked.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                Open marked {marked.kind === 'pdf' ? 'PDF' : 'image'} ↗
              </a>
            )}
            <span style={{ color: '#6b7280', fontSize: 13 }}>Typeset sheet with ✓/✗ on each step (≈{Math.max(1, (results?.length || 1))}× a few sec).</span>
          </div>
        </div>
      )}

      {usage && (
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          💰 ${(usage.costUsd ?? 0).toFixed(4)} · ⏱ {usage.timeSec ?? 0}s · {(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)} tokens
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
