'use client';
// 🎬 The door to a question's solution clip (SPEC-CLIP-PIPELINE.md §9): on the practice
// page under a maths question, on a marked paper's question, and on the clip page itself.
// It asks /api/portal/question-clip what exists: ready → "🎬 Watch the clip"; Adrian (admin)
// also sees "Make this clip" / the state while it is made, and 👍 / 👎 under a ready one.
// 403 (switch shut for this viewer) or nothing ready for a student → renders nothing.
import { useEffect, useState } from 'react';

type Status = 'queued' | 'making' | 'ready' | 'refused' | 'failed' | null;

export default function ClipDoor({ questionId, from, initial, verdict: verdictProp = null, watchOnly = false, back }: {
  questionId: string; from: 'practice' | 'paper' | 'admin'; initial?: Status; verdict?: 'good' | 'not_good' | null; watchOnly?: boolean; back?: string;
}) {
  const [state, setState] = useState<{ status: Status; canMake: boolean; line: string } | null>(initial !== undefined ? { status: initial, canMake: true, line: '' } : null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState(verdictProp);

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    fetch(`/api/portal/question-clip?id=${encodeURIComponent(questionId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (live && j) setState({ status: j.status ?? null, canMake: !!j.canMake, line: j.line ?? '' }); })
      .catch(() => {});
    return () => { live = false; };
  }, [questionId, initial]);

  if (!state) return null;
  const href = `/app/clip/q/${questionId}${back ? `?back=${encodeURIComponent(back)}` : ''}`;

  if (watchOnly) {
    const send = async (v: 'good' | 'not_good') => {
      const note = v === 'not_good' ? window.prompt('What is wrong with this clip?') ?? '' : '';
      setBusy(true);
      await fetch('/api/portal/question-clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: questionId, verdict: v, note }) }).catch(() => {});
      setVerdict(v); setBusy(false);
    };
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Your watch:</span>
        <button type="button" disabled={busy} onClick={() => send('good')} className={`rounded-full border px-3 py-1 ${verdict === 'good' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}>👍 Good</button>
        <button type="button" disabled={busy} onClick={() => send('not_good')} className={`rounded-full border px-3 py-1 ${verdict === 'not_good' ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}>👎 Not good</button>
      </div>
    );
  }

  if (state.status === 'ready') {
    return <a href={href} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium" data-question-clip>🎬 Watch the clip</a>;
  }
  if (!state.canMake) return null;
  const make = async (retry: boolean) => {
    setBusy(true);
    const r = await fetch('/api/portal/question-clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: questionId, from, retry }) }).catch(() => null);
    const j = r && r.ok ? await r.json() : null;
    if (j) setState({ status: j.status, canMake: true, line: j.line ?? '' });
    setBusy(false);
  };
  if (state.status === 'queued' || state.status === 'making') {
    return <span className="text-sm text-slate-500" data-question-clip>🎬 {state.status === 'queued' ? 'Clip asked for — about 5 minutes' : 'Clip being made…'}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm" data-question-clip>
      <button type="button" disabled={busy} onClick={() => make(state.status === 'failed' || state.status === 'refused')} className="rounded-full border border-slate-300 px-3 py-1.5 font-medium">
        🎬 {state.status === 'failed' || state.status === 'refused' ? 'Try the clip again' : 'Make a clip'}
      </button>
      {(state.status === 'refused' || state.status === 'failed') && state.line && <span className="text-slate-500">{state.line}</span>}
    </span>
  );
}
