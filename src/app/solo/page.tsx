'use client';

import { useState, useRef } from 'react';
import { segment, type Ann } from '@/lib/learn/segment';

// UI list only; the server (resolveGradingModel in lib/learn/prompts) is the
// authoritative allowlist. Kept inline so the grading prompts aren't pulled into
// the client bundle. Must stay in sync with GRADING_MODELS there.
const GRADING_MODELS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8 (default)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (test)' },
] as const;

type Feedback = {
  mode: 'english' | 'math';
  model?: string;
  overall: { band: string | null; score: number | null; outOf: number | null; summary: string };
  rubric: { criterion: string; band: string; comment: string }[];
  annotations: Ann[];
  strengths: string[];
  nextSteps: string[];
};

export default function SoloPage() {
  const [mode, setMode] = useState<'english' | 'math'>('english');
  const [question, setQuestion] = useState('');
  const [essay, setEssay] = useState('');
  const [image, setImage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fb, setFb] = useState<Feedback | null>(null);
  const [model, setModel] = useState<string>(GRADING_MODELS[0].id);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function grade() {
    setLoading(true); setError(''); setFb(null);
    try {
      const body: any = { mode, question, model };
      if (mode === 'english') body.text = essay; else body.image = image;
      const r = await fetch('/api/learn/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); return; }
      setFb(d);
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }

  const canGrade = mode === 'english' ? essay.trim().length > 30 : !!image;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #f7f9fb)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 18px 60px' }}>
        <header style={{ textAlign: 'center', marginBottom: 22 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 6px', color: '#13203a', letterSpacing: '-0.02em' }}>Instant feedback. Learn on your own.</h1>
          <p style={{ color: '#5b6573', margin: 0, fontSize: 15 }}>Write an essay or photograph your working — get examiner-grade feedback in seconds, then revise.</p>
        </header>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {([['english', '✍️ Write (O-Level English)'], ['math', '🧮 Solve (Math)']] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setFb(null); setError(''); }}
              style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid ' + (mode === m ? '#13203a' : '#dce1e8'), background: mode === m ? '#13203a' : '#fff', color: mode === m ? '#fff' : '#3a4250', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Grading model picker — for A/B testing a candidate model against the default */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: '#8a93a0' }}>Marker model</span>
          <select value={model} onChange={e => { setModel(e.target.value); setFb(null); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #dce1e8', background: '#fff', color: '#3a4250', fontSize: 13, cursor: 'pointer' }}>
            {GRADING_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: fb ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
          {/* INPUT side */}
          <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 16, padding: 18 }}>
            <input value={question} onChange={e => setQuestion(e.target.value)}
              placeholder={mode === 'english' ? 'Essay question / prompt (optional)' : "What's the question? (optional, helps grading)"}
              style={{ width: '100%', border: '1px solid #e6e9ee', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

            {mode === 'english' ? (
              fb ? (
                <div style={{ fontSize: 15, lineHeight: 1.7, color: '#1c2433', whiteSpace: 'pre-wrap' }}>
                  {segment(essay, fb.annotations).map((p, idx) =>
                    p.i === undefined ? <span key={idx}>{p.text}</span> :
                      <mark key={idx} title={fb.annotations[p.i].comment}
                        style={{ background: p.sev === 'major' ? '#ffe2e2' : '#fff3cf', borderRadius: 3, padding: '0 1px', cursor: 'help' }}>
                        {p.text}<sup style={{ fontSize: 10, color: '#9a4', fontWeight: 700 }}>{p.i + 1}</sup>
                      </mark>
                  )}
                </div>
              ) : (
                <textarea value={essay} onChange={e => setEssay(e.target.value)} rows={16}
                  placeholder="Paste or write your essay / paragraph here…"
                  style={{ width: '100%', border: '1px solid #e6e9ee', borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />
              )
            ) : (
              <div>
                {image
                  ? <img src={image} alt="your working" style={{ width: '100%', borderRadius: 10, border: '1px solid #e6e9ee' }} />
                  : <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '40px 0', border: '2px dashed #cfd6e0', borderRadius: 12, background: '#fafbfc', color: '#5b6573', fontSize: 15, cursor: 'pointer' }}>📷 Tap to photograph your working</button>}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickImage} style={{ display: 'none' }} />
                {image && <button onClick={() => { setImage(''); setFb(null); }} style={{ marginTop: 8, fontSize: 13, color: '#8a93a0', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Remove photo</button>}
              </div>
            )}

            {error && <p style={{ color: '#d23', fontSize: 13, marginTop: 10 }}>{error}</p>}

            <button onClick={grade} disabled={!canGrade || loading}
              style={{ width: '100%', marginTop: 14, padding: '13px 0', borderRadius: 10, border: 'none', background: (!canGrade || loading) ? '#aeb6c2' : '#c0392b', color: '#fff', fontSize: 15, fontWeight: 700, cursor: (!canGrade || loading) ? 'default' : 'pointer' }}>
              {loading ? 'Marking…' : fb ? 'Re-grade my revision' : 'Get feedback'}
            </button>
            {fb && mode === 'english' && <button onClick={() => setFb(null)} style={{ width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 10, border: '1px solid #dce1e8', background: '#fff', color: '#3a4250', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Edit my essay</button>}
          </div>

          {/* FEEDBACK side */}
          {fb && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#13203a', color: '#fff', borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Your feedback</div>
                  {fb.model && <div style={{ fontSize: 11, opacity: 0.6 }}>marked by {GRADING_MODELS.find(m => m.id === fb.model)?.label || fb.model}</div>}
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 6px' }}>
                  {fb.overall.score != null ? `${fb.overall.score}${fb.overall.outOf ? ' / ' + fb.overall.outOf : ''}` : ''}
                  {fb.overall.band ? <span style={{ fontSize: 16, opacity: 0.85, marginLeft: 8 }}>{fb.overall.band}</span> : ''}
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, opacity: 0.92 }}>{fb.overall.summary}</p>
              </div>

              {fb.rubric?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 16, padding: 16 }}>
                  {fb.rubric.map((r, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: i < fb.rubric.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: '#1c2433' }}><span>{r.criterion}</span><span style={{ color: '#c0392b' }}>{r.band}</span></div>
                      <div style={{ fontSize: 13.5, color: '#5b6573', marginTop: 2 }}>{r.comment}</div>
                    </div>
                  ))}
                </div>
              )}

              {fb.annotations?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Line-by-line</div>
                  {fb.annotations.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < fb.annotations.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, background: a.severity === 'major' ? '#ffe2e2' : '#fff3cf', color: '#7a5', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <div>
                        <div style={{ fontSize: 13, color: '#1c2433', fontStyle: 'italic' }}>“{a.quote}”</div>
                        <div style={{ fontSize: 14, color: '#3a4250', marginTop: 2 }}>{a.comment}</div>
                        <span style={{ fontSize: 11, color: '#8a93a0', background: '#f3f5f8', borderRadius: 4, padding: '1px 6px', marginTop: 4, display: 'inline-block' }}>{a.tag}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {fb.strengths?.length > 0 && (
                <div style={{ background: '#eefaf0', border: '1px solid #cdeed4', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3a7a4a', marginBottom: 6 }}>✓ What's working</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#2c4a35', lineHeight: 1.6 }}>{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}

              {fb.nextSteps?.length > 0 && (
                <div style={{ background: '#fff7ec', border: '1px solid #ffe1bd', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#9a6516', marginBottom: 6 }}>→ Do this next</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#6b4a12', lineHeight: 1.6 }}>{fb.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
