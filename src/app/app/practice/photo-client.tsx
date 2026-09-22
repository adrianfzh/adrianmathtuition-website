'use client';
// 📷 Practice photo — the client half (SPEC-PRACTICE-PHOTO §5). Same camera
// wiring as Find a question (find-client.tsx): a downscaled JPEG or typed text
// → POST /api/portal/practice/photo → the page refreshes so the Writing… row
// shows on the list below.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import type { FindLevelOption } from '@/lib/portal-find';
import { fileToJpegDataUrl } from './image-downscale';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

type PhotoReply = { ok: true; assignmentId: string; title: string; reskin: boolean; remaining: number };

export default function PhotoClient({ levels }: { levels: FindLevelOption[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [level, setLevel] = useState<FindLevelOption['key']>(levels[0]?.key ?? 'EM');
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(body: { imageBase64?: string; text?: string }) {
    setBusy(true); setMsg(null);
    try {
      const r = await portalFetch<PhotoReply>('/api/portal/practice/photo', {
        json: { ...body, level },
        fallback: 'Could not send that — try again.',
      });
      setMsg({ kind: 'ok', text: `Writing a ${r.title} question for you — it will appear below in a few minutes.${r.remaining <= 2 ? ` ${r.remaining} more today.` : ''}` });
      setTyped(''); setTyping(false);
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      await submit({ imageBase64: dataUrl.split(',')[1] });
    } catch (e) {
      setMsg({ kind: 'err', text: portalMessage(e) });
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-navy">📷 Snap a question</p>
        {levels.length > 1 && (
          <div className="flex gap-1">
            {levels.map(l => (
              <button key={l.key} type="button" onClick={() => setLevel(l.key)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${level === l.key ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'}`}>{l.label}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-sm text-gray-600">Photograph a question you want more of. We write a new one that tests the same skill and put it on your list.</p>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={albumRef} type="file" accept="image/*" className="hidden" onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className="flex-1 min-w-[8rem] bg-navy text-white font-semibold rounded-xl px-4 py-3 disabled:opacity-50">{busy ? 'Sending…' : '📷 Take a photo'}</button>
        <button type="button" disabled={busy} onClick={() => albumRef.current?.click()} className="bg-gray-100 text-navy font-semibold rounded-xl px-4 py-3 disabled:opacity-50">🖼 Album</button>
        <button type="button" disabled={busy} onClick={() => setTyping(v => !v)} className="bg-gray-100 text-navy font-semibold rounded-xl px-4 py-3 disabled:opacity-50">⌨️ Type</button>
      </div>
      {typing && (
        <div className="space-y-2">
          <textarea value={typed} onChange={e => setTyped(e.target.value)} rows={3} maxLength={4000} placeholder="Type the question here" className="w-full text-sm rounded-xl border border-black/10 px-3 py-2" />
          <div className="text-right">
            <button type="button" disabled={busy || typed.trim().length < 8} onClick={() => submit({ text: typed.trim() })} className="text-sm font-semibold bg-navy text-white rounded-full px-4 py-2 disabled:opacity-50">Send</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.kind === 'ok' ? 'text-emerald-800' : 'text-red-700'}`}>{msg.text}</p>}
    </section>
  );
}
