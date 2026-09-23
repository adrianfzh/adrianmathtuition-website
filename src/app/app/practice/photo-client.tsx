'use client';
// 📷 Practice photo — the client half (SPEC-PRACTICE-PHOTO §5). A downscaled
// JPEG or typed text → POST /api/portal/practice/photo → the page refreshes so
// the Writing… row shows on the list below.
//
// The camera and album doors are <label>s wrapping their file inputs (not a
// scripted input.click() on a display:none input): a label tap is a native
// activation, which every phone honours — including iOS in a home-screen web
// app, where a scripted click on a hidden input can open nothing at all
// (Adrian, 23 Sep 2026: "the buttons for take photo and album not working").
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import type { FindLevelOption } from '@/lib/portal-find';
import { fileToJpegDataUrl } from './image-downscale';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
// Off-screen but still a real, focusable input (never display:none).
const INPUT = 'sr-only';

type PhotoReply = { ok: true; assignmentId: string; title: string; reskin: boolean; remaining: number };
type Busy = null | 'photo' | 'text';

export default function PhotoClient({ levels }: { levels: FindLevelOption[] }) {
  const router = useRouter();
  const uid = useId();
  const [level, setLevel] = useState<FindLevelOption['key']>(levels[0]?.key ?? 'EM');
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // iOS Safari leaves a file input inert after its sheet is dismissed (the
  // next label tap opens nothing — Adrian, 23 Sep 2026), so both inputs are
  // remounted after every cancel or pick: the key changes, a fresh input mounts.
  const [epoch, setEpoch] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const els = [cameraRef.current, albumRef.current].filter((el): el is HTMLInputElement => Boolean(el));
    const bump = () => setEpoch(e => e + 1);
    els.forEach(el => el.addEventListener('cancel', bump));
    return () => els.forEach(el => el.removeEventListener('cancel', bump));
  }, [epoch]);

  async function submit(body: { imageBase64?: string; text?: string }, kind: Exclude<Busy, null>) {
    setBusy(kind); setMsg(null);
    try {
      const r = await portalFetch<PhotoReply>('/api/portal/practice/photo', {
        json: { ...body, level },
        fallback: 'Could not send that — try again.',
      });
      setMsg({ kind: 'ok', text: `Writing a ${r.title} question for you — it appears below in a few minutes.${r.remaining <= 2 ? ` ${r.remaining} more today.` : ''}` });
      setTyped(''); setTyping(false);
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy('photo'); setMsg(null);
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      await submit({ imageBase64: dataUrl.split(',')[1] }, 'photo');
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
      setBusy(null);
    }
  }

  const locked = busy !== null;
  const cameraId = `${uid}-camera`;
  const albumId = `${uid}-album`;

  return (
    <section className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">Snap a question</p>
          <p className="text-xs text-gray-500">Get a similar question.</p>
        </div>
        {levels.length > 1 && (
          <div className="flex gap-1 shrink-0" role="radiogroup" aria-label="Which subject?">
            {levels.map(l => (
              <button key={l.key} type="button" role="radio" aria-checked={level === l.key} disabled={locked}
                onClick={() => setLevel(l.key)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border transition ${
                  level === l.key ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-black/10'}`}>
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Camera: `capture` sends iOS straight to the camera, so the album door needs its own input without it. */}
      <input key={`camera-${epoch}`} ref={cameraRef} id={cameraId} type="file" accept="image/*" capture="environment" className={INPUT} disabled={locked}
        onChange={e => { const f = e.target.files?.[0]; setEpoch(n => n + 1); onPhoto(f); }} />
      <input key={`album-${epoch}`} ref={albumRef} id={albumId} type="file" accept="image/*" className={INPUT} disabled={locked}
        onChange={e => { const f = e.target.files?.[0]; setEpoch(n => n + 1); onPhoto(f); }} />

      {busy ? (
        <div className="flex items-center gap-3 rounded-xl bg-[hsl(45,80%,96%)] px-4 py-3" role="status">
          <div className="h-5 w-5 shrink-0 rounded-full border-[3px] border-navy/20 border-t-navy animate-spin" aria-hidden />
          <p className="text-sm font-semibold text-navy">{busy === 'photo' ? 'Reading your photo…' : 'Reading your question…'}</p>
        </div>
      ) : (
        <>
          <label htmlFor={cameraId}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3.5 text-[15px] font-semibold text-white active:opacity-80">
            <span aria-hidden>📷</span> Take a photo
          </label>
          <div className="flex items-center justify-center gap-4 text-sm font-semibold text-navy/80">
            <label htmlFor={albumId} className="cursor-pointer underline-offset-2 hover:underline">🖼 From album</label>
            <span className="text-gray-300" aria-hidden>·</span>
            <button type="button" onClick={() => setTyping(v => !v)} className="underline-offset-2 hover:underline">
              ⌨️ {typing ? 'Never mind' : 'Type it'}
            </button>
          </div>
        </>
      )}

      {typing && !busy && (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (typed.trim().length >= 8) submit({ text: typed.trim() }, 'text'); }}>
          <textarea value={typed} onChange={e => setTyped(e.target.value)} rows={3} maxLength={4000} autoFocus
            placeholder="Type the question — e.g. Solve 2x² − 5x + 2 = 0"
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30" />
          <div className="flex justify-end">
            <button type="submit" disabled={typed.trim().length < 8}
              className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Send</button>
          </div>
        </form>
      )}

      {msg && (
        <p className={`rounded-xl px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>
      )}
    </section>
  );
}
