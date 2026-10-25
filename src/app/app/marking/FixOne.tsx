'use client';
// 🎯 Fix one (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026): one practice question
// under the question that lost the most marks, answered on this page. The pick
// comes from /api/portal/marking/fix-one (kept on the run, so a reload shows the
// same question); the answer is marked by /api/portal/practice/grade with
// `fix: { runId }`. Right → "Answer: ✓ fixed". Wrong → the worked solution.
// Then one "Another one" button, up to three a paper. No streaks, no points.
import { useEffect, useState } from 'react';
import { McqChips, Md, QuestionView, mcqLettersIn, type Question } from '@/app/app/practice/question-view';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { logPortalEvent } from '@/lib/portal-event';

type Pick = {
  question: Question | null;
  questionId?: string;
  mcq?: string[];
  n?: number;
  max?: number;
  answered?: { correct: boolean } | null;
};

const CARD = 'mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4';

export default function FixOne({ runId, questionNumber }: { runId: string; questionNumber: string }) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [solution, setSolution] = useState<string | null>(null);

  async function load(next: boolean) {
    setBusy(true); setErr(null);
    try {
      const d = await portalFetch<Pick>('/api/portal/marking/fix-one', { json: next ? { runId, next: true } : { runId } });
      setPick(d);
      setAnswer('');
      setSolution(null);
      setCorrect(d.answered ? d.answered.correct : null);
      if (d.answered && !d.answered.correct && d.questionId) void showSolution(d.questionId);
      if (d.question && d.questionId) logPortalEvent('fix:shown', { runId, questionId: d.questionId });
    } catch (e) {
      if (next) setErr(portalMessage(e));
      else setPick({ question: null });
    } finally {
      setBusy(false);
    }
  }

  async function showSolution(id: string) {
    try {
      const d = await portalFetch<{ markdown?: string }>(`/api/portal/practice/solution?id=${id}`);
      setSolution(d.markdown || null);
    } catch { setSolution(null); }
  }

  useEffect(() => { void load(false); }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function check() {
    const q = pick?.question;
    if (!q || !answer.trim()) return;
    setBusy(true); setErr(null);
    try {
      const lines = pick?.mcq ? [answer] : answer.split('\n').map(l => l.trim()).filter(Boolean);
      const d = await portalFetch<{ result: { verdict: string } }>('/api/portal/practice/grade', {
        json: { questionId: q.id, lines, fix: { runId } },
        fallback: 'Marking didn’t go through — try again.',
      });
      const ok = d.result?.verdict === 'correct';
      setCorrect(ok);
      logPortalEvent('fix:answered', { runId, questionId: q.id, correct: ok });
      if (!ok) await showSolution(q.id);
    } catch (e) {
      setErr(portalMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!pick?.question) return null;
  const q = pick.question;
  const more = (pick.n ?? 1) < (pick.max ?? 3);

  return (
    <section className={CARD} aria-label="Try one like this">
      <p className="text-sm font-semibold text-sky-900">🎯 Try one like Q{questionNumber}</p>
      <div className="mt-2 rounded-xl bg-white p-3 text-[15px]">
        <QuestionView q={q} />
      </div>

      {correct === null && (
        <div className="mt-3">
          {pick.mcq ? (
            <McqChips letters={mcqLettersIn(q.markdown)} value={answer} onPick={setAnswer} disabled={busy} />
          ) : (
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={3}
              placeholder="Your answer (and working, one step a line)"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-300"
              disabled={busy}
            />
          )}
          <button
            type="button"
            onClick={check}
            disabled={busy || !answer.trim()}
            className="mt-2 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      )}

      {correct === true && <p className="mt-3 text-[15px] font-bold text-emerald-700">Answer: ✓ fixed</p>}

      {correct === false && (
        <div className="mt-3">
          <p className="text-[15px] font-bold text-slate-800">Not yet. Here is how it goes:</p>
          {solution
            ? <div className="mt-2 rounded-xl bg-white p-3 text-[15px]"><Md text={solution} /></div>
            : <p className="mt-1 text-[13px] text-slate-500">Loading the solution…</p>}
        </div>
      )}

      {correct !== null && more && (
        <button
          type="button"
          onClick={() => load(true)}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 disabled:opacity-50"
        >
          {busy ? 'Loading…' : 'Another one'}
        </button>
      )}

      {err && <p className="mt-2 text-[13px] text-rose-700">{err}</p>}
    </section>
  );
}
