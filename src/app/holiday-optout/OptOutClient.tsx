'use client';

// The parent's screen. One switch per month, then Confirm.
//
// Deliberately boring: no account, no password, no marketing. A parent opens
// this from a phone, taps two things and closes it. The copy states what will
// happen to the invoice, because that is the question they actually have.
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

type MonthChoice = {
  year: number; month: number; label: string;
  lessonCount: number; skipped: boolean; partial: boolean; lockedCount: number;
};

export default function OptOutClient() {
  const token = useSearchParams().get('t') || '';
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [name, setName] = useState('your child');
  const [months, setMonths] = useState<MonthChoice[]>([]);
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const [noSlots, setNoSlots] = useState(false);

  const keyOf = (m: { year: number; month: number }) => `${m.year}-${m.month}`;

  const seed = useCallback((list: MonthChoice[]) => {
    setMonths(list);
    setSkip(Object.fromEntries(list.map((m) => [keyOf(m), m.skipped])));
  }, []);

  useEffect(() => {
    if (!token) { setState('error'); setError('This link is incomplete. Please reply to your invoice email.'); return; }
    (async () => {
      try {
        const res = await fetch(`/api/holiday-optout?t=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) { setState('error'); setError(data.error || 'This link is no longer valid.'); return; }
        setName(data.studentName || 'your child');
        setNoSlots(!!data.noSlots);
        seed(data.months || []);
        setState('ready');
      } catch {
        setState('error');
        setError('Could not reach the server. Please try again in a moment.');
      }
    })();
  }, [token, seed]);

  const dirty = months.some((m) => skip[keyOf(m)] !== m.skipped);

  async function confirm() {
    setState('saving');
    try {
      const res = await fetch('/api/holiday-optout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token,
          months: months
            .filter((m) => skip[keyOf(m)] !== m.skipped)
            .map((m) => ({ year: m.year, month: m.month, skip: skip[keyOf(m)] })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setState('error'); setError(data.error || 'Could not save that.'); return; }
      seed(data.months || []);
      setState('done');
    } catch {
      setState('error');
      setError('Could not reach the server. Nothing was changed.');
    }
  }

  if (state === 'loading') return <Shell><p className="text-gray-500">Loading your lessons…</p></Shell>;

  if (state === 'error') {
    return (
      <Shell>
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">{error}</p>
        <p className="mt-4 text-sm text-gray-600">
          You can always just reply to the invoice email with the months you would like to skip.
        </p>
      </Shell>
    );
  }

  if (noSlots || months.length === 0) {
    return (
      <Shell>
        <p className="text-gray-700">There are no upcoming lessons to change here.</p>
        <p className="mt-4 text-sm text-gray-600">If that looks wrong, please reply to your invoice email.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-gray-700">
        Lessons carry on as usual over the holidays, but October, November and December are optional.
        Turn off any month you would like {name} to skip.
      </p>

      <ul className="mt-6 space-y-3">
        {months.map((m) => {
          const k = keyOf(m);
          const off = !!skip[k];
          return (
            <li key={k}>
              <label className={`flex items-center gap-4 rounded-xl border p-4 cursor-pointer transition ${off ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-amber-600"
                  checked={off}
                  onChange={(e) => setSkip((s) => ({ ...s, [k]: e.target.checked }))}
                  disabled={state === 'saving'}
                />
                <span className="flex-1">
                  <span className="block font-semibold text-gray-900">{m.label}</span>
                  <span className="block text-sm text-gray-600">
                    {off
                      ? `Skipping — ${m.lessonCount} ${m.lessonCount === 1 ? 'lesson' : 'lessons'} off the schedule and off the invoice`
                      : `${m.lessonCount} ${m.lessonCount === 1 ? 'lesson' : 'lessons'} as usual`}
                    {m.partial && !off ? ' · some dates already marked as skipped' : ''}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {state === 'done' && !dirty && (
        <p className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          Saved. Adrian has been told. You can change this again from the same link any time.
        </p>
      )}

      <button
        onClick={confirm}
        disabled={!dirty || state === 'saving'}
        className="mt-6 w-full rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {state === 'saving' ? 'Saving…' : dirty ? 'Confirm these months' : 'Nothing to change'}
      </button>

      <p className="mt-4 text-sm text-gray-600">
        Skipping a month takes those lessons off the schedule and off the invoice. If you are away for
        only part of a month you do not need to skip it — message the WhatsApp assistant to move those
        lessons and {name} will get make-ups instead. Students who skip a month can still come in for
        one-off lessons, billed per lesson.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-gray-900">Lessons in October, November and December</h1>
        <div className="mt-4">{children}</div>
        <p className="mt-8 border-t border-gray-100 pt-4 text-xs text-gray-400">AdrianMath Tuition</p>
      </div>
    </main>
  );
}
