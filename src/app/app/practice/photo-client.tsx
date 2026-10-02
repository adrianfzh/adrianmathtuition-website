'use client';
// The Practice tab's photo door (SPEC-PRACTICE-PHOTO §14, 24 Sep 2026): up to
// five photos in, one practice sheet out. Each photo becomes a short taught
// part and two questions — one like it and one turned around — written by
// the sheet worker like a Practice Again sheet, so the sheet takes about an
// hour and lands on the Practice list (a Writing… row until then). One sheet
// a day; a second one lands on the first free day up to three days ahead.
// A single photo can ask for a worked example as well.
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import type { FindLevelOption } from '@/lib/portal-find';
import { fileToJpegDataUrl } from './image-downscale';
import { MAX_SHEET_PHOTOS, QUESTIONS_PER_PHOTO } from '@/lib/practice-sheet';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const INPUT = 'sr-only';
const DOOR = 'flex-1 rounded-xl border border-dashed border-navy/30 bg-[hsl(45,80%,97%)] px-3 py-3 text-center text-sm font-semibold text-navy cursor-pointer select-none';

type Photo = { dataUrl: string; name: string };
type SheetReply = { ok: true; assignmentId: string; day: string; waits: boolean; message: string };

export default function PhotoClient({ levels }: { levels: FindLevelOption[] }) {
  const router = useRouter();
  const uid = useId();
  const [level, setLevel] = useState<FindLevelOption['key']>(levels[0]?.key ?? 'EM');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [workedExample, setWorkedExample] = useState(false);
  const [busy, setBusy] = useState<'reading' | 'sending' | null>(null);
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

  const full = photos.length >= MAX_SHEET_PHOTOS;
  const locked = busy !== null;

  async function addFiles(list: FileList | null) {
    setEpoch(e => e + 1);
    if (!list || !list.length) return;
    setBusy('reading'); setMsg(null);
    try {
      const room = MAX_SHEET_PHOTOS - photos.length;
      const files = Array.from(list).slice(0, Math.max(0, room));
      const next: Photo[] = [];
      for (const f of files) next.push({ dataUrl: await fileToJpegDataUrl(f, 1400), name: f.name });
      setPhotos(p => [...p, ...next].slice(0, MAX_SHEET_PHOTOS));
      if (list.length > room) setMsg({ kind: 'err', text: `Up to ${MAX_SHEET_PHOTOS} photos a sheet — the first ${room} were kept.` });
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  function removePhoto(i: number) {
    setPhotos(p => p.filter((_, j) => j !== i));
  }

  async function send() {
    if (!photos.length || locked) return;
    setBusy('sending'); setMsg(null);
    try {
      const r = await portalFetch<SheetReply>('/api/portal/practice/sheet', {
        json: { photos: photos.map(p => p.dataUrl), level, workedExample: photos.length === 1 && workedExample },
        fallback: 'Could not send those — try again.',
      });
      setMsg({ kind: 'ok', text: r.message });
      setPhotos([]); setWorkedExample(false);
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const cameraId = `${uid}-camera`;
  const albumId = `${uid}-album`;
  const questions = photos.length * QUESTIONS_PER_PHOTO;

  return (
    <section className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">Photos in, a practice sheet out</p>
          <p className="text-xs text-gray-500">Up to {MAX_SHEET_PHOTOS} questions a day · {QUESTIONS_PER_PHOTO} practice questions for each, in about an hour.</p>
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
      <input key={`camera-${epoch}`} ref={cameraRef} id={cameraId} type="file" accept="image/*" capture="environment" className={INPUT} disabled={locked || full}
        onChange={e => addFiles(e.target.files)} />
      <input key={`album-${epoch}`} ref={albumRef} id={albumId} type="file" accept="image/*" multiple className={INPUT} disabled={locked || full}
        onChange={e => addFiles(e.target.files)} />

      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos for this sheet">
          {photos.map((p, i) => (
            <li key={`${i}-${p.name}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-black/10 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`Question ${i + 1}`} className="w-full h-full object-cover" />
              <button type="button" onClick={() => removePhoto(i)} disabled={locked} aria-label={`Remove photo ${i + 1}`}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] leading-5 text-center">✕</button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="flex gap-2">
          <label htmlFor={cameraId} className={`${DOOR} ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
            📷 {photos.length ? 'Add a photo' : 'Take a photo'}
          </label>
          <label htmlFor={albumId} className={`${DOOR} ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
            🖼️ From my photos
          </label>
        </div>
      )}

      {photos.length === 1 && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={workedExample} disabled={locked} onChange={e => setWorkedExample(e.target.checked)} className="w-4 h-4 accent-[hsl(220,60%,25%)]" />
          Include a worked example of this question
        </label>
      )}

      {photos.length > 0 && (
        <button type="button" onClick={send} disabled={locked}
          className="w-full rounded-xl bg-navy text-[hsl(45,100%,96%)] font-semibold py-3 text-sm disabled:opacity-60">
          {busy === 'sending' ? 'Reading your photos…' : `Write my sheet · ${questions} question${questions === 1 ? '' : 's'}`}
        </button>
      )}
      {busy === 'reading' && <p className="text-xs text-gray-500">Getting the photo ready…</p>}

      {msg && (
        <p className={`text-sm rounded-xl px-3 py-2 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
