'use client';
// One oral practice, start to finish (SPEC-ENGLISH-ORAL-LISTENING.md):
//   look → (Part 1: prepare, with a timer and notes that stay on the phone) → speak, one prompt at
//   a time → "This is what we heard" (the student fixes a misheard word) → handed in → the feedback.
// Each recording goes to POST /api/portal/english/oral (stored privately, turned into words); the
// confirmed words are queued there for reading and GET ?attempt= is asked until the feedback is in.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MIC_SILENT_PEAK, type OralPart, type OralReport, type PublicOral } from '@/lib/english-oral';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
const TAG = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';
const MAIN = 'w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3 disabled:opacity-50';
const SIDE = 'w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-2.5 disabled:opacity-50';
const API = '/api/portal/english/oral';
const clock = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s)) % 60).padStart(2, '0')}`;

type Band = { line: string; descriptors: string[] };
type Stage = 'look' | 'prepare' | 'speak' | 'confirm' | 'waiting' | 'done' | 'failed';
interface Props { set: PublicOral; part: OralPart; attempt: string | null; prompts: string[]; promptAudio: string[]; maxSeconds: number; prepSeconds: number }

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Record one answer: Start → a countdown → Stop (or the time runs out) → the recording is handed up. */
function Recorder({ maxSeconds, busy, onDone }: { maxSeconds: number; busy: boolean; onDone: (blob: Blob, seconds: number) => void }) {
  const [on, setOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const began = useRef(0);
  const peak = useRef(0);
  const meter = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [level, setLevel] = useState(0);

  const stop = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);
  useEffect(() => () => { stop(); if (meter.current) clearInterval(meter.current); }, [stop]);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('This browser cannot record. Open the app in Safari or Chrome.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setError('The microphone is off for this site. Allow it, then tap Start again.'); return; }
    const mime = pickMime();
    const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (meter.current) { clearInterval(meter.current); meter.current = null; }
      void audio.current?.close().catch(() => {}); audio.current = null;
      setOn(false); setLevel(0);
      if (peak.current < MIC_SILENT_PEAK) { setError('We could not hear you. Check that the microphone is on and not covered, then record it again.'); return; }
      onDone(new Blob(chunks, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] }), Math.round((Date.now() - began.current) / 1000));
    };
    // the microphone's level: a bar the student can see, and proof that something was heard at all
    let ctx: AudioContext | null = null;
    peak.current = 0;
    try {
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      meter.current = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
        peak.current = Math.max(peak.current, m); setLevel(m);
      }, 120);
    } catch { peak.current = 1; /* no meter on this browser: let the server decide */ }
    audio.current = ctx;
    rec.current = r; began.current = Date.now(); setSecs(0); setOn(true);
    r.start(1000);
    tick.current = setInterval(() => {
      const s = (Date.now() - began.current) / 1000;
      setSecs(s);
      if (s >= maxSeconds) stop();
    }, 250);
  };

  const left = maxSeconds - secs;
  return (
    <div className="space-y-2">
      {on ? (
        <>
          <p className="flex items-center justify-center gap-2 text-[15px] font-semibold text-red-600" aria-live="polite">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" aria-hidden />Recording · {clock(left)} left
          </p>
          <div className="h-1.5 rounded-full bg-red-100 overflow-hidden" aria-hidden><div className="h-full bg-red-500" style={{ width: `${Math.min(100, (secs / maxSeconds) * 100)}%` }} /></div>
          <div className="flex items-center gap-2" aria-hidden>
            <span className="text-[12px] text-gray-500">Mic</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.min(100, level * 250)}%` }} /></div>
          </div>
          <button type="button" onClick={stop} className="w-full rounded-xl bg-red-600 text-white text-[15px] font-semibold px-4 py-3">I have finished</button>
        </>
      ) : (
        <button type="button" onClick={() => void start()} disabled={busy} className={MAIN}>
          <span aria-hidden className="mr-2">🎙</span>{busy ? 'Listening to your answer…' : `Start speaking · up to ${clock(maxSeconds)}`}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Report({ part, band, report, prompts, said }: { part: OralPart; band: Band | null; report: OralReport; prompts: string[]; said: string[] }) {
  return (
    <div className="space-y-3">
      <section className={`${CARD} p-4 space-y-1.5`}>
        {band && <p className="text-[18px] font-bold text-navy leading-tight">{band.line}</p>}
        {band?.descriptors.map((d, i) => <p key={i} className="text-[13px] leading-snug text-gray-500">{d}</p>)}
        {report.answered && <p className="text-[15px] leading-snug text-gray-900 pt-1">{report.answered}</p>}
      </section>

      {part === 'interaction' && report.prompts.length > 0 && (
        <section className={`${CARD} p-4 space-y-2`}>
          <h2 className={TAG}>Each question</h2>
          {report.prompts.map(p => (
            <div key={p.n}>
              <p className="text-[13px] leading-snug text-gray-500">{p.n}. {prompts[p.n - 1]}</p>
              <p className="text-[15px] leading-snug text-gray-900">{p.line}</p>
            </div>
          ))}
        </section>
      )}

      {report.ideas.length > 0 && (
        <section className={`${CARD} p-4 space-y-2`}>
          <h2 className={TAG}>Your ideas</h2>
          {report.ideas.map((x, i) => (
            <div key={i} className="flex gap-2">
              <span aria-hidden className={`shrink-0 font-bold ${x.developed ? 'text-emerald-600' : 'text-amber-600'}`}>{x.developed ? '✓' : '◐'}</span>
              <div className="min-w-0">
                <p className="text-[15px] leading-snug text-gray-900">{x.idea}</p>
                <p className="text-[13px] leading-snug text-gray-600"><b>{x.developed ? 'Developed' : 'Only stated'}</b>{x.note ? ` — ${x.note}` : ''}</p>
              </div>
            </div>
          ))}
          {report.organisation && <p className="text-[14px] leading-snug text-gray-800 border-t border-gray-100 pt-2"><b>Order: </b>{report.organisation}</p>}
        </section>
      )}

      {report.habits.length > 0 && (
        <section className={`${CARD} p-4 space-y-2.5`}>
          <h2 className={TAG}>Habits to fix</h2>
          {report.habits.map((h, i) => (
            <div key={i}>
              <p className="text-[15px] font-semibold text-gray-900 first-letter:uppercase">{h.name} ×{h.count}</p>
              <p className="text-[14px] leading-snug text-gray-600">You said: “{h.said}”</p>
              <p className="text-[14px] leading-snug text-gray-900"><b>Say:</b> “{h.fix}”</p>
            </div>
          ))}
        </section>
      )}

      {report.upgrades.length > 0 && (
        <section className={`${CARD} p-4 space-y-2.5`}>
          <h2 className={TAG}>Say it better</h2>
          {report.upgrades.map((u, i) => (
            <div key={i}>
              <p className="text-[14px] leading-snug text-gray-600">You said: “{u.said}”</p>
              <p className="text-[15px] leading-snug text-gray-900"><b>Stronger:</b> “{u.better}”</p>
              {u.why && <p className="text-[13px] leading-snug text-gray-500">{u.why}</p>}
            </div>
          ))}
        </section>
      )}

      {report.next && (
        <section className="rounded-3xl bg-violet-50 border border-violet-200 p-4">
          <h2 className={TAG}>Next time</h2>
          <p className="text-[15px] leading-snug text-gray-900 mt-0.5">{report.next}</p>
        </section>
      )}

      <details className={`${CARD} p-4`}>
        <summary className={`cursor-pointer ${TAG}`}>What you said</summary>
        <div className="mt-2 space-y-2">
          {said.map((t, i) => (
            <div key={i}>
              {prompts.length > 1 && <p className="text-[13px] leading-snug text-gray-500">{i + 1}. {prompts[i]}</p>}
              <p className="text-[15px] leading-relaxed text-gray-900 whitespace-pre-wrap">{t || '—'}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export default function OralSession({ set, part, attempt: opened, prompts, promptAudio, maxSeconds, prepSeconds }: Props) {
  const planned = part === 'planned';
  const [stage, setStage] = useState<Stage>(opened ? 'waiting' : 'look');
  const [attempt, setAttempt] = useState<string | null>(opened);
  const [q, setQ] = useState(0);
  const [heard, setHeard] = useState<string[]>(prompts.map(() => ''));
  const [clips, setClips] = useState<(string | null)[]>(prompts.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepLeft, setPrepLeft] = useState(prepSeconds);
  const [notes, setNotes] = useState('');
  const [report, setReport] = useState<OralReport | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [said, setSaid] = useState<string[]>([]);
  const ask = useRef<HTMLAudioElement>(null);

  // the preparation clock
  useEffect(() => {
    if (stage !== 'prepare') return;
    const end = Date.now() + prepLeft * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setPrepLeft(left);
      if (left <= 0) { clearInterval(t); setStage('speak'); }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // the feedback: ask until it is in
  useEffect(() => {
    if (stage !== 'waiting' || !attempt) return;
    let tries = 0; let stopped = false;
    const once = async () => {
      tries++;
      try {
        const r = await fetch(`${API}?attempt=${attempt}`);
        const j = await r.json().catch(() => ({}));
        if (stopped) return;
        if (j.state === 'done') { setReport(j.report as OralReport); setBand((j.band as Band) ?? null); setSaid((j.said as string[]) ?? []); setStage('done'); }
        else if (j.state === 'failed' || r.status === 404) setStage('failed');
        else if (j.state === 'recording') setStage('look');
      } catch { /* a dropped request: ask again */ }
    };
    void once();
    const t = setInterval(() => { if (tries < 150) void once(); }, 6000);
    return () => { stopped = true; clearInterval(t); };
  }, [stage, attempt]);

  const send = async (blob: Blob, seconds: number) => {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set('set', set.id); form.set('part', part); form.set('q', String(q)); form.set('seconds', String(seconds));
      if (attempt) form.set('attempt', attempt);
      form.set('audio', blob, 'answer');
      const r = await fetch(API, { method: 'POST', body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save it. Try again.');
      if (!String(j.heard ?? '').trim()) throw new Error('We could not hear any words. Move somewhere quieter, hold the phone closer, and record it again.');
      setAttempt(String(j.attempt));
      setHeard(h => h.map((x, i) => (i === q ? String(j.heard) : x)));
      setClips(c => c.map((x, i) => (i === q ? URL.createObjectURL(blob) : x)));
      if (q + 1 < prompts.length) setQ(q + 1); else setStage('confirm');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save it. Try again.'); }
    finally { setBusy(false); }
  };

  const handIn = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempt, said: heard }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send it. Try again.');
      setStage('waiting');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send it. Try again.'); }
    finally { setBusy(false); }
  };

  const again = () => { setAttempt(null); setQ(0); setHeard(prompts.map(() => '')); setClips(prompts.map(() => null)); setReport(null); setBand(null); setPrepLeft(prepSeconds); setError(null); setStage('look'); };
  const picture = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={set.picture} alt={set.alt} className="w-full rounded-3xl border border-black/5 shadow-sm" />
  );

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/languages/oral" className="text-xs text-gray-500">‹ Oral</Link>
        <h1 className="text-xl font-bold text-navy mt-1 leading-tight">{set.title}</h1>
        <p className="text-[12px] text-gray-500">{planned ? 'Part 1 · Planned response' : 'Part 2 · Spoken interaction'}</p>
      </div>

      {stage === 'look' && (
        <>
          {picture}
          {planned ? (
            <section className={`${CARD} p-4 space-y-1`}>
              <h2 className={TAG}>Your prompt</h2>
              <p className="text-[16px] font-semibold leading-snug text-gray-900">{prompts[0]}</p>
            </section>
          ) : (
            <section className={`${CARD} p-4 space-y-1`}>
              <h2 className={TAG}>How it works</h2>
              <p className="text-[15px] leading-snug text-gray-900">You will hear {prompts.length} questions on this topic, one at a time.</p>
              <p className="text-[15px] leading-snug text-gray-900">Answer each one aloud. You have up to {clock(maxSeconds)} for each.</p>
            </section>
          )}
          <button type="button" className={MAIN} onClick={() => setStage(planned ? 'prepare' : 'speak')}>{planned ? `Start preparing · ${clock(prepSeconds)}` : 'Start'}</button>
        </>
      )}

      {stage === 'prepare' && (
        <>
          {picture}
          <section className={`${CARD} p-4 space-y-1`}>
            <h2 className={TAG}>Your prompt</h2>
            <p className="text-[16px] font-semibold leading-snug text-gray-900">{prompts[0]}</p>
          </section>
          <section className={`${CARD} p-4 space-y-2`}>
            <p className="flex items-baseline justify-between"><span className={TAG}>Time to prepare</span><span className="text-[22px] font-bold tabular-nums text-navy">{clock(prepLeft)}</span></p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Jot down your points. Your notes stay on this phone."
              className="w-full rounded-2xl border border-black/10 bg-white p-3 text-[15px] text-gray-900 focus:outline-none focus:border-violet-500" />
          </section>
          <button type="button" className={MAIN} onClick={() => setStage('speak')}>I am ready to speak</button>
        </>
      )}

      {stage === 'speak' && (
        <>
          {planned && picture}
          <section className={`${CARD} p-4 space-y-2`}>
            <h2 className={TAG}>{planned ? 'Your prompt' : `Question ${q + 1} of ${prompts.length}`}</h2>
            <p className="text-[16px] font-semibold leading-snug text-gray-900">{prompts[q]}</p>
            {!planned && promptAudio[q] && (
              <>
                <audio ref={ask} key={promptAudio[q]} src={promptAudio[q]} autoPlay preload="auto" />
                <button type="button" onClick={() => { const a = ask.current; if (a) { a.currentTime = 0; void a.play().catch(() => {}); } }} className="text-[13px] font-semibold text-violet-700"><span aria-hidden className="mr-1">🔊</span>Hear the question</button>
              </>
            )}
            {planned && notes.trim() && <p className="text-[14px] leading-snug text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-2">{notes}</p>}
          </section>
          <Recorder key={q} maxSeconds={maxSeconds} busy={busy} onDone={(b, s) => void send(b, s)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}

      {stage === 'confirm' && (
        <>
          <section className={`${CARD} p-4 space-y-3`}>
            <div>
              <h2 className={TAG}>This is what we heard</h2>
              <p className="text-[14px] leading-snug text-gray-700 mt-0.5">Fix any word that was heard wrong. Leave the rest as you said it.</p>
            </div>
            {prompts.map((p, i) => (
              <div key={i} className="space-y-1.5">
                {prompts.length > 1 && <p className="text-[13px] leading-snug text-gray-500">{i + 1}. {p}</p>}
                <textarea value={heard[i]} onChange={e => setHeard(h => h.map((x, k) => (k === i ? e.target.value : x)))} rows={prompts.length > 1 ? 4 : 9} maxLength={3000}
                  className="w-full rounded-2xl border border-black/10 bg-white p-3 text-[15px] leading-relaxed text-gray-900 focus:outline-none focus:border-violet-500" />
                {clips[i] && <audio controls src={clips[i] as string} className="w-full h-9" />}
              </div>
            ))}
          </section>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" className={MAIN} disabled={busy} onClick={() => void handIn()}>{busy ? 'Sending…' : 'Get my feedback'}</button>
          <button type="button" className={SIDE} disabled={busy} onClick={again}>Start again</button>
        </>
      )}

      {stage === 'waiting' && (
        <section className={`${CARD} p-5 text-center space-y-1.5`}>
          <p className="text-[17px] font-bold text-navy">Handed in</p>
          <p className="text-[15px] leading-snug text-gray-700">Your feedback will show here in a few minutes.</p>
          <p className="text-[13px] leading-snug text-gray-500">You can leave this page. It will be under Oral when you come back.</p>
        </section>
      )}

      {stage === 'failed' && (
        <section className={`${CARD} p-5 text-center space-y-2`}>
          <p className="text-[16px] font-bold text-navy">This one could not be read</p>
          <button type="button" className={MAIN} onClick={again}>Try again</button>
        </section>
      )}

      {stage === 'done' && report && (
        <>
          <Report part={part} band={band} report={report} prompts={prompts} said={said} />
          <button type="button" className={SIDE} onClick={again}>Speak on this again</button>
          <Link href="/app/languages/oral" className="block text-center text-[13px] text-gray-500 underline underline-offset-2">Choose another topic</Link>
        </>
      )}
    </div>
  );
}
