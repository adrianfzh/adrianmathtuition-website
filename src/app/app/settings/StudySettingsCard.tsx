'use client';

// ⏰ Practice reminder + 💡 hint first on /app/settings (5 Nov 2026, Adrian: "do it"). The same
// saved settings as the Telegram bot's /settings card: a change here shows in Telegram and the
// other way round (GET|POST /api/portal/study-settings, rules lib/study-settings.ts). The reminder
// itself arrives in Telegram, so without a linked Telegram the card says so instead.
import { useEffect, useState } from 'react';
import { DAY_SHORT, DEFAULT_TIME, formatDays, formatTime, TIME_OPTIONS, WEEK_ORDER } from '@/lib/study-settings';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const ALL = [0, 1, 2, 3, 4, 5, 6];

type State = { telegram: boolean; reminder: { enabled: boolean; time: string; days: number[] } | null; hintFirst: boolean | null };

export default function StudySettingsCard() {
  const [s, setS] = useState<State | null>(null);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [days, setDays] = useState<number[]>(ALL);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function take(d: State) {
    setS(d);
    if (d.reminder) { setTime(d.reminder.time); setDays(d.reminder.days.length ? d.reminder.days : ALL); }
  }
  useEffect(() => {
    fetch('/api/portal/study-settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && take(d)).catch(() => {});
  }, []);

  async function save(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/portal/study-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'That did not save — please try again.'); return; }
      take(d); setMsg(ok);
    } finally { setBusy(false); }
  }

  if (!s) return null;
  const on = !!s.reminder?.enabled;
  const changed = on && (time !== s.reminder!.time || [...days].sort().join() !== [...s.reminder!.days].sort().join());
  const preset = (d: number[]) => [...days].sort().join() === [...d].sort().join();
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">⏰ Practice reminder</p>
      {!s.telegram ? (
        <p className="text-sm text-gray-600">Reminders come in Telegram. Link Telegram above, then come back here to set one.</p>
      ) : (
        <>
          <p className="text-sm text-gray-700 mb-3">
            {on ? <>A short nudge with a practice question: <b>{formatTime(s.reminder!.time)}, {formatDays(s.reminder!.days)}</b>.</> : 'A short nudge in Telegram with a practice question, at a time you choose. Skipped on days you already practised.'}
          </p>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-14 text-gray-500">Time</span>
              <select value={time} onChange={(e) => setTime(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-white">
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </label>
            <div className="text-sm">
              <div className="flex gap-1.5 flex-wrap mb-2">
                {[{ l: 'Every day', d: ALL }, { l: 'Weekdays', d: [1, 2, 3, 4, 5] }, { l: 'Weekends', d: [0, 6] }].map((p) => (
                  <button key={p.l} type="button" onClick={() => setDays(p.d)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${preset(p.d) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`}>{p.l}</button>
                ))}
              </div>
              <div className="flex gap-1">
                {WEEK_ORDER.map((d) => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={days.includes(d)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border ${days.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>{DAY_SHORT[d].slice(0, 2)}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {(!on || changed) && (
                <button disabled={busy || !days.length} onClick={() => save({ reminder: { enabled: true, time, days } }, on ? '✓ Reminder updated' : '✓ Reminder on')}
                  className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                  {on ? 'Save changes' : 'Turn on reminder'}
                </button>
              )}
              {on && (
                <button disabled={busy} onClick={() => save({ reminder: { enabled: false, time: s.reminder!.time, days: s.reminder!.days } }, '✓ Reminder off')}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-semibold disabled:opacity-50">Turn off</button>
              )}
            </div>
          </div>
        </>
      )}

      {s.hintFirst !== null && (
        <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-gray-800">💡 Hint first</p>
            <p className="text-gray-500">In Telegram, get the first step to try before the full solution.</p>
          </div>
          <button role="switch" aria-checked={s.hintFirst} disabled={busy}
            onClick={() => save({ hintFirst: !s.hintFirst }, s.hintFirst ? '✓ Hint first off' : '✓ Hint first on')}
            className={`shrink-0 w-12 h-7 rounded-full relative transition-colors ${s.hintFirst ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${s.hintFirst ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
      <p className="mt-3 text-xs text-gray-400">The same settings as /settings in Telegram — change them in either place.</p>
    </div>
  );
}
