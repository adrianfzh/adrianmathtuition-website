'use client';

// ➕ Add a photo — the notebook's door for work done OUTSIDE the app (Adrian,
// IDEAS.md: school worksheets, tuition homework, textbook working — "so it
// becomes the one place they keep everything").
//
// Same camera pattern as the practice finder's "Snap a question": a hidden
// input with `capture` goes straight into the iOS camera, a second one
// without it opens the photo library. The picked file is downscaled
// client-side to a ≤1600px JPEG (shared helper — also normalises HEIC), then
// previewed full-screen with an optional caption ("what is this?") and an
// optional topic tag (the canonical list for the student's level, passed down
// from the server page; free skip) before POSTing to /api/portal/my-notes as
// kind:'photo'. The saved row lands in the gallery under 📷 My photos.
import { useEffect, useRef, useState } from 'react';
import { fileToJpegDataUrl } from '../practice/image-downscale';
import type { MyNoteRow, TopicOptionGroup } from '@/lib/portal-notes';

// Client-side guard against the platform's 4.5MB body cap — the 1600px JPEG
// re-encode keeps real photos far under this; the guard is for pathologies.
const MAX_DATA_URL = 3_600_000;
const MAX_CAPTION = 300;

export default function AddPhoto({ topicGroups, variant, onSaved }: {
  topicGroups: TopicOptionGroup[];
  /** 'tile' — full-width dashed tile above the gallery; 'button' — compact button for the empty state. */
  variant: 'tile' | 'button';
  onSaved: (note: MyNoteRow) => void;
}) {
  const [stage, setStage] = useState<'idle' | 'reading' | 'preview'>('idle');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  // Stay open through a mid-overlay "Choose another" re-read (stage briefly
  // leaves 'preview' while the replacement downscales) — the old photo keeps
  // showing until the new one lands.
  const overlayOpen = stage === 'preview' || (stage === 'reading' && dataUrl !== null);

  // The gallery behind the overlay must not scroll under it (house pattern —
  // same as the clipper and the lightbox).
  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [overlayOpen]);

  async function onPick(file: File | undefined) {
    if (!file || saving) return;
    setError(null);
    setStage('reading');
    try {
      const url = await fileToJpegDataUrl(file);
      if (url.length > MAX_DATA_URL) {
        throw new Error('That photo is too large to save — try again.');
      }
      setDataUrl(url);
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo — try again.');
      setStage(dataUrl ? 'preview' : 'idle');
    }
  }

  function close() {
    if (saving) return;
    setStage('idle');
    setDataUrl(null);
    setCaption('');
    setTopic('');
    setError(null);
  }

  async function save() {
    // stage guard: no saving the old photo while its replacement is mid-read.
    if (!dataUrl || saving || stage !== 'preview') return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/my-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'photo',
          image: dataUrl,
          note: caption.trim(),
          topic: topic || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      const row = (body as { note: MyNoteRow }).note;
      setSaving(false);
      close();
      onSaved(row);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = stage === 'reading';

  return (
    <>
      {/* Hidden inputs — `capture` forces iOS straight into the camera, so the
          library path needs its own input without it (the practice-finder trick). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={albumRef} type="file" accept="image/*" className="hidden"
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />

      {variant === 'tile' ? (
        <div>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed border-slate-300 rounded-2xl py-3.5 px-4 text-left hover:border-navy/40 transition-colors active:scale-[0.99] disabled:opacity-60"
          >
            <span className="block text-sm font-semibold text-navy">
              {busy ? 'Reading your photo…' : '➕ Add a photo'}
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              School worksheets, homework, anything on paper — snap it into your notebook.
            </span>
          </button>
          <p className="text-[11px] text-slate-400 mt-1 text-center">
            …or{' '}
            <button
              type="button"
              onClick={() => albumRef.current?.click()}
              disabled={busy}
              className="underline active:scale-95 inline-block"
            >
              pick from your photos
            </button>
          </p>
          {stage === 'idle' && error && <p className="text-sm text-rose-700 mt-1.5">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="inline-block text-sm font-semibold text-navy border border-navy/20 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Reading…' : '➕ Add a photo'}
          </button>
          <button
            type="button"
            onClick={() => albumRef.current?.click()}
            disabled={busy}
            className="text-[12px] text-slate-400 underline active:scale-95"
          >
            or pick from your photos
          </button>
          {stage === 'idle' && error && <p className="w-full text-sm text-rose-700">{error}</p>}
        </div>
      )}

      {overlayOpen && dataUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-label="Add a photo to My Notebook">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0">
            <p className="text-sm font-semibold truncate">📷 Add to My Notebook</p>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="shrink-0 text-2xl leading-none px-2 py-1 text-white/80 hover:text-white active:scale-95 disabled:opacity-50"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-3 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview of the downscaled photo */}
            <img
              src={dataUrl}
              alt="Your photo"
              className="max-w-full max-h-full w-auto h-auto rounded-lg bg-white"
            />
          </div>

          <div className="shrink-0 bg-white rounded-t-2xl p-4 space-y-2.5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={MAX_CAPTION}
              placeholder="What is this? (optional)"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
            {topicGroups.length > 0 && (
              <select
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-navy/20"
                aria-label="Topic (optional)"
              >
                <option value="">Topic (optional) — skip if unsure</option>
                {topicGroups.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => albumRef.current?.click()}
                disabled={saving}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 px-3 py-2 active:scale-95 disabled:opacity-50"
              >
                ↺ Choose another
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || stage !== 'preview'}
                className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Saving…' : stage === 'reading' ? 'Reading…' : '💾 Save to My Notebook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
