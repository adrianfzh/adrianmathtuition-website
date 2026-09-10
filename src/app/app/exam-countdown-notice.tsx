'use client';

// The one-time Home notice for the exam countdown switch (SPEC-NOTEBOOK-V2 §3,
// Adrian 11 Sep 2026: "give them a one-time notification (the next time they
// login) to tell them they can do it in settings"). Rendered by Home only
// while lib/portal-prefs examCountdownNoticeDue() says so AND the student has
// an upcoming exam — a notice about an empty card would be noise. Either
// button writes the seen flag, so it appears once per account, ever.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-fetch';
import { EXAM_COUNTDOWN_NOTICE_PREF, EXAM_COUNTDOWN_PREF } from '@/lib/portal-prefs';

export default function ExamCountdownNotice({ examTitle }: { examTitle: string }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(turnOn: boolean) {
    setBusy(true);
    try {
      await portalFetch('/api/portal/settings', {
        json: { prefs: { [EXAM_COUNTDOWN_NOTICE_PREF]: true, ...(turnOn ? { [EXAM_COUNTDOWN_PREF]: true } : {}) } },
      });
    } catch { /* the notice simply shows again next time */ }
    setGone(true);
    setBusy(false);
    if (turnOn) router.refresh();
  }

  if (gone) return null;
  return (
    <div data-exam-countdown-notice className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">New</p>
      <p className="text-sm font-bold text-navy mt-0.5">A countdown to {examTitle}, at the top of Home</p>
      <p className="text-[13px] text-slate-600 mt-1">
        It counts the days and lists the topics being tested. Off unless you want it — you can change your mind any time in Settings.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(true)}
          className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          Turn it on
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(false)}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 border border-black/10 hover:bg-slate-50 disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
