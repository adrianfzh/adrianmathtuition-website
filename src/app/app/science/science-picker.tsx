'use client';
// The Science tab's first screen (Adrian, 24 Sep 2026: "at the start when
// student enters the science page, have explanation saying that science
// marking is live etc then ask them to choose the science subjects they are
// taking — add a combined science option as well"). Saves
// portal_accounts.prefs.sciences + combined_science through the Settings
// route (lib/portal-prefs.ts is the whitelist); the page re-renders with one
// tab per science. Also the "Change" door (/app/science?choose=1).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUBJECT_TONE } from '@/components/PaperSubjectPill';
import { SCIENCE_SUBJECTS, SCIENCE_SUBJECT_LABEL, type ScienceChoice, type ScienceSubject } from '@/lib/portal-prefs';

const TONE: Record<ScienceSubject, 'phy' | 'chem' | 'bio'> = { physics: 'phy', chemistry: 'chem', biology: 'bio' };
const CARD = 'bg-white rounded-3xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

export default function SciencePicker({ initial, firstTime }: { initial: ScienceChoice | null; firstTime: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<ScienceSubject[]>(initial?.subjects ?? []);
  const [combined, setCombined] = useState(initial?.combined ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: ScienceSubject) =>
    setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : SCIENCE_SUBJECTS.filter(x => x === s || p.includes(x))));

  const problem =
    picked.length === 0 ? 'Pick at least one science.'
    : combined && picked.length !== 2 ? 'Combined Science is two sciences — pick the two in your paper.'
    : null;

  async function save() {
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: { sciences: picked, combined_science: combined } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      router.replace('/app/science');
      router.refresh();
    } catch (e) {
      setError((e as Error).message || 'Could not save — try again.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {firstTime && (
        <div className={CARD}>
          <p className="font-bold text-navy text-lg leading-snug">🧪 Science marking is live</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
            <li>Physics, chemistry and biology papers — free while it&apos;s new.</li>
            <li>Two papers a day. Hand one in from this tab and the marked copy comes back here.</li>
            <li>The marks are an estimate; your teacher&apos;s mark is the one that counts.</li>
          </ul>
        </div>
      )}
      <div className={CARD}>
        <p className="font-bold text-navy">Which sciences do you take?</p>
        <p className="text-[12px] text-gray-500 mt-0.5">Your papers get one tab per science. You can change this later.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCIENCE_SUBJECTS.map(s => {
            const on = picked.includes(s);
            const tone = SUBJECT_TONE[TONE[s]];
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${on ? `${tone.solid} shadow-sm` : 'bg-black/[0.05] text-gray-600 hover:bg-black/[0.08]'}`}>
                {on ? '✓ ' : ''}{SCIENCE_SUBJECT_LABEL[s]}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={combined} onChange={e => setCombined(e.target.checked)} className="mt-1 h-4 w-4 accent-teal-600" />
          <span className="text-sm text-gray-700">
            <span className="font-semibold text-navy">Combined Science</span>
            <span className="block text-[12px] text-gray-500">One subject covering two sciences (e.g. Physics/Chemistry) — pick those two above.</span>
          </span>
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy}
            className="rounded-xl bg-navy text-[hsl(45,100%,96%)] px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            {busy ? 'Saving…' : firstTime ? 'Continue' : 'Save'}
          </button>
          {!firstTime && <a href="/app/science" className="text-sm text-gray-500 hover:text-navy">Cancel</a>}
        </div>
      </div>
    </div>
  );
}
