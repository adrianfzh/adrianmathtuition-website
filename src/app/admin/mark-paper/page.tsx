'use client';

import { useState, type CSSProperties } from 'react';

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
// Downscale photos client-side so the upload stays well under Vercel's request limit.
async function imageToBase64(file: File, maxEdge = 1600, quality = 0.85): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await readDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  let { width, height } = img;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  const out = canvas.toDataURL('image/jpeg', quality);
  return { base64: out.split(',')[1] || '', mediaType: 'image/jpeg' };
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

export default function MarkPaperPage() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [pdfB64, setPdfB64] = useState('');
  const [imgPreviews, setImgPreviews] = useState<string[]>([]);

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

  const authHeaders = { Authorization: `Bearer ${getAuth()}`, 'Content-Type': 'application/json' };

  function onPickImages(files: FileList | null) {
    const arr = files ? Array.from(files) : [];
    setImages(arr);
    setImgPreviews(arr.map((f) => URL.createObjectURL(f)));
  }

  async function propose() {
    if (!pdf || images.length === 0) { setError('Add a question PDF and at least one working photo.'); return; }
    setError(''); setPhase('proposing'); setResults(null); setTotals(null);
    try {
      const pdfBase64 = await pdfToBase64(pdf);
      setPdfB64(pdfBase64);
      const imgs = await Promise.all(images.map((f) => imageToBase64(f)));
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
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Question paper (PDF)</label>
        <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] || null)} />
        <div style={{ height: 14 }} />
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Student working (photos — one or more)</label>
        <input type="file" accept="image/*" multiple onChange={(e) => onPickImages(e.target.files)} />
        {imgPreviews.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {imgPreviews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`working ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
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
                {imgPreviews[i] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgPreviews[i]} alt={`w${i}`} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                )}
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
    </div>
  );
}
