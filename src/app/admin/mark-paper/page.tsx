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

type Question = { number: string; question_text: string; total_marks?: number | null; parts?: unknown[]; has_diagram?: boolean };
type Working = { detected_label?: string | null; final_answer?: string | null; transcription_confidence?: string };
type Match = { working_index: number; question_number: string | null; confidence: string; used_label?: boolean; reason?: string };
type MarkPart = { label?: string; awarded?: number; max?: number; error_summary?: string | null };
type Result = {
  question_number: string; working_index: number; match_confidence: string;
  marking?: { total_awarded?: number; total_max?: number; overall_comment?: string; parts?: MarkPart[] };
  review_recommended?: boolean; review_reasons?: string[];
};
type Usage = { costUsd?: number; timeSec?: number; inputTokens?: number; outputTokens?: number };

const card: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 };
const btn: CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const conf = (c?: string) => (c === 'low' ? '#b91c1c' : c === 'medium' ? '#b45309' : '#15803d');

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
  const [pdfB64, setPdfB64] = useState('');
  const [imgPreviews, setImgPreviews] = useState<(string | null)[]>([]);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [workings, setWorkings] = useState<Working[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [mapping, setMapping] = useState<(string | null)[]>([]);

  const [results, setResults] = useState<Result[] | null>(null);
  const [totals, setTotals] = useState<{ awarded: number; max: number } | null>(null);
  const [unattempted, setUnattempted] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

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

  async function propose() {
    if (!pdf || images.length === 0) { setError('Add a question PDF and at least one working photo.'); return; }
    setError(''); setPhase('proposing'); setResults(null); setTotals(null);
    try {
      const pdfBase64 = await pdfToBase64(pdf);
      setPdfB64(pdfBase64);
      const imgs = await Promise.all(images.map((f) => fileToUpload(f)));
      const r = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'propose', pdfBase64, images: imgs }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Analyse failed');
      setQuestions(d.questions || []);
      setWorkings(d.workings || []);
      setMatches(d.matches || []);
      setMapping((d.workings || []).map((_: unknown, i: number) => {
        const m = (d.matches || []).find((mm: Match) => mm.working_index === i);
        return m ? m.question_number : null;
      }));
      setUsage(d.usage || null);
      setPhase('proposed');
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  }

  async function mark() {
    setError(''); setPhase('marking');
    try {
      const map = mapping.map((qn, i) => {
        const m = matches.find((mm) => mm.working_index === i);
        return { working_index: i, question_number: qn, confidence: m?.confidence || 'high', used_label: m?.used_label };
      });
      const r = await fetch('/api/admin/mark-paper', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ phase: 'mark', pdfBase64: pdfB64, questions, workings, mapping: map }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Marking failed');
      setResults(d.results || []);
      setTotals(d.totals || null);
      setUnattempted(d.unattempted_questions || []);
      setUsage(d.usage || null);
      setPhase('done');
    } catch (e) { setError((e as Error).message); setPhase('proposed'); }
  }

  const busy = phase === 'proposing' || phase === 'marking';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Mark a paper</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Upload the question paper (PDF) and the student&rsquo;s working (photos). The marker matches each photo to a question — confirm the matches, then mark.</p>

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
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={propose}>
            {phase === 'proposing' ? 'Analysing…' : 'Analyse & match'}
          </button>
          <span style={{ color: '#6b7280', marginLeft: 10, fontSize: 13 }}>Reading the paper and matching each photo (≈1 min).</span>
        </div>
      </div>

      {/* Mapping confirmation */}
      {phase !== 'idle' && phase !== 'proposing' && workings.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Confirm the matches</h2>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>Flagged rows were unlabelled or ambiguous — check those especially.</p>
          {workings.map((w, i) => {
            const m = matches.find((mm) => mm.working_index === i);
            const flagged = (m?.confidence || 'high') === 'low';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
                {imgPreviews[i]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imgPreviews[i]!} alt={`Photo ${i + 1}`} title="Click to enlarge" onClick={() => setLightbox(imgPreviews[i]!)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'zoom-in', flexShrink: 0 }} />
                  : <div style={{ width: 48, height: 48, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>no preview</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    Photo {i + 1}
                    {w.detected_label ? <> · label “{w.detected_label}”</> : <span style={{ color: '#b45309' }}> · no label</span>}
                    {w.final_answer ? <span style={{ color: '#6b7280' }}> · ans: {String(w.final_answer).slice(0, 40)}</span> : null}
                  </div>
                  {m?.reason && <div style={{ fontSize: 12, color: conf(m.confidence) }}>{flagged ? '⚠ ' : ''}{m.reason}</div>}
                </div>
                <select
                  value={mapping[i] ?? ''}
                  onChange={(e) => setMapping((prev) => prev.map((v, j) => (j === i ? (e.target.value || null) : v)))}
                  style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${flagged ? '#fca5a5' : '#d1d5db'}`, minWidth: 120 }}
                >
                  <option value="">— none —</option>
                  {questions.map((q) => <option key={q.number} value={q.number}>Q{q.number}</option>)}
                </select>
              </div>
            );
          })}
          <div style={{ marginTop: 14 }}>
            <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={mark}>
              {phase === 'marking' ? 'Marking…' : 'Mark it'}
            </button>
            <span style={{ color: '#6b7280', marginLeft: 10, fontSize: 13 }}>Solves &amp; marks each matched question (a few minutes).</span>
          </div>
        </div>
      )}

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
