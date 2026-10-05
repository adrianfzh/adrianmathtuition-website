'use client';
// 📈 The graph-sketch checker's hand-in (SPEC-SKETCH-CHECK.md, 5 Oct 2026): which
// graph (a question from the list, the function typed, or a photo of the question),
// then a photo of the sketch. One tap sends both; the result page shows the red pen.
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { fileToJpegDataUrl } from '../image-downscale';
import { MathText } from '../question-view';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const DOOR = 'flex-1 rounded-xl border border-dashed border-navy/30 bg-[hsl(45,80%,97%)] px-3 py-3 text-center text-sm font-semibold text-navy cursor-pointer select-none';

export type FormQuestion = { id: string; source: string; shown: string; ask: string; marks: number | null };
type Mode = 'list' | 'type' | 'photo';

function PhotoPick({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (v: string | null) => void; disabled: boolean }) {
  const uid = useId();
  // iOS Safari leaves a file input inert after its sheet is dismissed — remount after every pick or cancel.
  const [epoch, setEpoch] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const alb = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const els = [cam.current, alb.current].filter((e): e is HTMLInputElement => Boolean(e));
    const bump = () => setEpoch(e => e + 1);
    els.forEach(el => el.addEventListener('cancel', bump));
    return () => els.forEach(el => el.removeEventListener('cancel', bump));
  }, [epoch]);
  async function pick(list: FileList | null) {
    setEpoch(e => e + 1);
    if (!list || !list[0]) return;
    setErr(null);
    try { onChange(await fileToJpegDataUrl(list[0], 1600)); } catch (e) { setErr(portalMessage(e)); }
  }
  return (
    <div className="space-y-2">
      <input key={`c-${epoch}`} ref={cam} id={`${uid}-c`} type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabled} onChange={e => pick(e.target.files)} />
      <input key={`a-${epoch}`} ref={alb} id={`${uid}-a`} type="file" accept="image/*" className="sr-only" disabled={disabled} onChange={e => pick(e.target.files)} />
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full max-h-72 object-contain rounded-xl border border-black/10 bg-gray-50" />
          <button type="button" onClick={() => onChange(null)} disabled={disabled}
            className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-xs px-2.5 py-1">Change</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label htmlFor={`${uid}-c`} className={`${DOOR} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>📷 Take a photo</label>
          <label htmlFor={`${uid}-a`} className={`${DOOR} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>🖼️ From my photos</label>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function SketchForm({ questions, initialQuestion }: { questions: FormQuestion[]; initialQuestion: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('list');
  const [qid, setQid] = useState<string>(initialQuestion ?? questions[0]?.id ?? '');
  const [fn, setFn] = useState('');
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [qPhoto, setQPhoto] = useState<string | null>(null);
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const q = questions.find(x => x.id === qid) ?? null;

  const ready = !!sketch && (mode === 'list' ? !!q : mode === 'type' ? fn.trim().length > 0 : !!qPhoto);

  async function send() {
    if (!ready || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await portalFetch<{ id: string }>('/api/portal/sketch-check', {
        json: {
          photo: sketch,
          ...(mode === 'list' ? { questionRef: qid } : mode === 'type' ? { function: fn, domainLo: lo, domainHi: hi } : { questionPhoto: qPhoto }),
        },
        fallback: 'Could not send that — try again.',
      });
      router.push(`/app/practice/sketch/${r.id}`);
    } catch (e) {
      setMsg(portalMessage(e));
      setBusy(false);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={busy}
      className={`flex-1 text-xs font-semibold rounded-full px-2 py-1.5 border transition ${mode === m ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-black/10'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <section className={`${CARD} p-4 space-y-3`}>
        <p className="font-semibold text-navy">1. Which graph?</p>
        <div className="flex gap-1.5" role="tablist">
          {tab('list', 'A past question')}
          {tab('type', 'Type it')}
          {tab('photo', 'Photo of it')}
        </div>

        {mode === 'list' && (
          <div className="space-y-2">
            <select value={qid} onChange={e => setQid(e.target.value)} disabled={busy}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
              {questions.map(x => <option key={x.id} value={x.id}>{x.source}</option>)}
            </select>
            {q && (
              <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-800 space-y-1.5">
                <p className="text-base"><MathText text={`$${q.shown}$`} /></p>
                <p>{q.ask}{q.marks ? <span className="text-gray-400"> [{q.marks}]</span> : null}</p>
              </div>
            )}
          </div>
        )}

        {mode === 'type' && (
          <div className="space-y-2">
            <input value={fn} onChange={e => setFn(e.target.value)} disabled={busy} inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              placeholder="y = (x^2 + 4x − 5)/(x − 5)"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-base font-mono" />
            <p className="text-xs text-gray-500">Numbers and x only. Use ^ for powers and |…| for modulus.</p>
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer">Only part of the graph?</summary>
              <div className="flex items-center gap-2 mt-2">
                <input value={lo} onChange={e => setLo(e.target.value)} placeholder="from" className="w-20 rounded-lg border border-black/10 px-2 py-1" inputMode="decimal" />
                <span>≤ x ≤</span>
                <input value={hi} onChange={e => setHi(e.target.value)} placeholder="to" className="w-20 rounded-lg border border-black/10 px-2 py-1" inputMode="decimal" />
              </div>
            </details>
          </div>
        )}

        {mode === 'photo' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">The question with the function printed on it.</p>
            <PhotoPick label="The question" value={qPhoto} onChange={setQPhoto} disabled={busy} />
          </div>
        )}
      </section>

      <section className={`${CARD} p-4 space-y-3`}>
        <p className="font-semibold text-navy">2. Your sketch</p>
        <p className="text-xs text-gray-500">Sketch it on paper with every label. Photograph the whole graph, flat, in good light.</p>
        <PhotoPick label="Your sketch" value={sketch} onChange={setSketch} disabled={busy} />
      </section>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button type="button" onClick={send} disabled={!ready || busy}
        className="w-full rounded-xl bg-navy text-white font-semibold py-3 disabled:opacity-40">
        {busy ? 'Sending…' : 'Check my sketch'}
      </button>
    </div>
  );
}
