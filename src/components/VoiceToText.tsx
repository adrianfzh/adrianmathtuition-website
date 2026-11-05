'use client';
// 🎤 Voice → words for a chat box (5 Nov 2026, Adrian: voice for settings, reschedules, quick
// questions — "ultimately math needs to show working"). Tap to talk, tap again to stop (or two
// minutes run out). The recording goes to the bot's POST /api/chat/transcribe, and the words come
// back into the text box for the student to check and send — the same message typed. The
// Telegram twin is the bot's handlers/voice-in.js. The recorder is the English oral one's
// (src/app/app/languages/oral/oral-session.tsx), cut down.
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 120;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? '';
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export default function VoiceToText({ endpoint, getToken, onText, onError, disabled }: {
  endpoint: string;
  getToken: () => Promise<string | null>;
  onText: (words: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'on' | 'reading'>('idle');
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const began = useRef(0);

  const stop = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);
  useEffect(() => () => stop(), [stop]);

  const send = useCallback(async (blob: Blob) => {
    setState('reading');
    try {
      const token = await getToken();
      if (!token) { onError('Sign in to use voice. Refresh the page and try again.'); return; }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: await toBase64(blob), mediaType: blob.type || 'audio/webm', portalToken: token }),
      });
      const data: { text?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) { onError(data.error || 'The voice note did not go through. Try again, or type it.'); return; }
      onText(data.text);
    } catch {
      onError('The voice note did not go through. Check your connection and try again, or type it.');
    } finally {
      setState('idle');
    }
  }, [endpoint, getToken, onText, onError]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError('This browser cannot record. Open the app in Safari or Chrome.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { onError('The microphone is off for this site. Allow it, then tap 🎤 again.'); return; }
    const mime = pickMime();
    const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] });
      if (!blob.size) { setState('idle'); onError('Nothing was recorded. Tap 🎤 and try again.'); return; }
      void send(blob);
    };
    rec.current = r; began.current = Date.now(); setSecs(0); setState('on');
    r.start(1000);
    tick.current = setInterval(() => {
      const s = (Date.now() - began.current) / 1000;
      setSecs(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
  };

  const label = state === 'on' ? `Stop recording (${Math.floor(secs)} s)` : state === 'reading' ? 'Reading your voice note' : 'Speak instead of typing';
  return (
    <button
      type="button"
      onClick={() => (state === 'on' ? stop() : state === 'idle' ? void start() : undefined)}
      disabled={disabled || state === 'reading'}
      title={label}
      aria-label={label}
      className={`h-9 shrink-0 rounded-lg border flex items-center justify-center text-[15px] transition-colors disabled:opacity-50 ${
        state === 'on' ? 'px-2 min-w-9 border-rose-300 bg-rose-50 text-rose-700 font-semibold' : 'w-9 border-black/10 bg-[hsl(45,60%,97%)] text-gray-500'
      }`}
    >
      {state === 'on' ? <span className="text-[13px] tabular-nums">⏹ {Math.floor(secs)}s</span> : state === 'reading' ? '…' : '🎤'}
    </button>
  );
}
