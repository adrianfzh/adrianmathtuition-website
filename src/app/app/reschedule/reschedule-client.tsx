'use client';

// Move-a-lesson flow: pick which lesson (auto-picked when there is only one),
// pick an open session (grouped by week), confirm, done. The option list and
// the booking both come from /api/portal/reschedule, which proxies the bot's
// canonical reschedule module — so what is offered here is exactly what the
// Telegram/WhatsApp pickers would offer, and Adrian is Telegram-notified by
// the bot on success. A 409 on booking means the session filled (or the lesson
// moved) while the page sat open: reload the lists and say so, never retry
// silently.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

type Lesson = { id: string; date: string; type: string; slotId: string; slotLabel: string; dateLabel: string; kind: 'reschedule' | 'makeup' };
type Option = { slotId: string; slotLabel: string; date: string; dateLabel: string; count: number; capacity: number; light: boolean };
type Data = { lessons: Lesson[]; options: Option[]; weeks: number };

// Slot labels arrive as "Sunday 9-11am" — the date line already names the day.
const timeOf = (lbl: string) => lbl.replace(/^[A-Za-z]+day\s*/, '').trim();

// Week bucket for an ISO date relative to the first option's week, labelled
// the way the bot's pickers do: "This week" / "Next week" / "In N weeks".
function weekLabel(dateStr: string, todayStr: string): string {
  const day = (s: string) => new Date(s + 'T00:00:00Z');
  const monday = (d: Date) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const diff = Math.round((monday(day(dateStr)).getTime() - monday(day(todayStr)).getTime()) / 604800000);
  return diff <= 0 ? 'This week' : diff === 1 ? 'Next week' : `In ${diff} weeks`;
}

export default function RescheduleClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ dateLabel: string; slotLabel: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch('/api/portal/reschedule');
      if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || `HTTP ${r.status}`);
      const d: Data = await r.json();
      setData(d);
      setLessonId(prev => (prev && d.lessons.some(l => l.id === prev)) ? prev : (d.lessons.length === 1 ? d.lessons[0].id : null));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const lesson = data?.lessons.find(l => l.id === lessonId) ?? null;
  const todayStr = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // SGT
  const groups = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, Option[]>();
    for (const o of data.options) {
      const k = weekLabel(o.date, todayStr);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return [...m.entries()];
  }, [data, todayStr]);

  const book = async () => {
    if (!lesson || !choice || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch('/api/portal/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, slotId: choice.slotId, date: choice.date }),
      });
      const d = await r.json().catch(() => ({} as { error?: string; movedTo?: { dateLabel: string; slotLabel: string } }));
      if (r.ok && d.movedTo) {
        setDone(d.movedTo);
      } else if (r.status === 409) {
        setChoice(null);
        setNotice(d.error === 'lesson_not_movable'
          ? 'That lesson can no longer be moved from here — it may have changed. Here is the fresh list.'
          : 'That session just filled up or closed — pick another time.');
        await load();
      } else {
        setNotice('Something went wrong saving that. Please try again, or message Adrian.');
      }
    } catch {
      setNotice('Something went wrong saving that. Please try again, or message Adrian.');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex items-baseline justify-between pt-1">
      <h1 className="text-xl font-bold text-navy">🔀 Change a lesson</h1>
      <Link href="/app" className="text-sm text-gray-500 hover:text-navy">← Home</Link>
    </div>
  );

  if (done) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        {header}
        <div className={`${CARD} p-5 space-y-2`}>
          <p className="text-2xl" aria-hidden>✅</p>
          <p className="font-semibold text-navy">Your lesson is moved to {done.dateLabel}, {timeOf(done.slotLabel)}.</p>
          <p className="text-sm text-gray-600">Adrian has been notified — nothing else to do.</p>
        </div>
        <Link href="/app" className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-sm hover:opacity-90 transition-opacity">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {header}

      {loadError && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          Couldn’t load your lessons right now ({loadError}). Please try again in a minute, or message Adrian and he’ll move it for you.
        </div>
      )}

      {!data && !loadError && <div className={`${CARD} p-5 text-sm text-gray-500`}>Loading your lessons…</div>}

      {data && data.lessons.length === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          No upcoming lessons in the next {data.weeks} weeks can be moved from here. If something urgent came up (like a lesson starting within the hour), message Adrian directly.
        </div>
      )}

      {data && data.lessons.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{data.lessons.length === 1 ? 'Your lesson' : 'Which lesson?'}</p>
          {data.lessons.map(l => (
            <button
              key={l.id}
              onClick={() => { setLessonId(l.id); setChoice(null); setNotice(null); }}
              className={`${CARD} w-full text-left p-4 flex items-center gap-3 transition-colors ${l.id === lessonId ? 'ring-2 ring-navy' : 'hover:bg-[hsl(45,100%,99%)]'}`}
            >
              <span className="text-xl leading-none" aria-hidden>📅</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-navy">{l.dateLabel}, {timeOf(l.slotLabel)}</span>
                {l.type !== 'Regular' && <span className="block text-xs text-blue-700">{l.type}</span>}
              </span>
              {l.id === lessonId && <span className="text-navy font-bold" aria-hidden>✓</span>}
            </button>
          ))}
        </section>
      )}

      {notice && <div className={`${CARD} p-4 text-sm text-amber-800 bg-amber-50 border-amber-200`}>{notice}</div>}

      {lesson && data && (
        groups.length === 0 ? (
          <div className={`${CARD} p-5 text-sm text-gray-600`}>
            Sorry — no open sessions in the next {data.weeks} weeks. Message Adrian and he’ll sort something out.
          </div>
        ) : (
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Move it to…</p>
            {groups.map(([label, opts]) => (
              <div key={label} className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-500">{label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {opts.map(o => {
                    const sel = choice && choice.slotId === o.slotId && choice.date === o.date;
                    return (
                      <button
                        key={`${o.slotId}:${o.date}`}
                        onClick={() => { setChoice(o); setNotice(null); }}
                        className={`${CARD} text-left px-4 py-3 transition-colors ${sel ? 'ring-2 ring-navy' : 'hover:bg-[hsl(45,100%,99%)]'}`}
                      >
                        <span className="font-semibold text-navy text-sm">{o.dateLabel} · {timeOf(o.slotLabel)}</span>
                        {o.light && <span className="ml-2 text-[11px] text-emerald-700">quieter class</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )
      )}

      {lesson && choice && (
        <div className="sticky bottom-20 sm:bottom-4">
          <button
            onClick={book}
            disabled={busy}
            className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {busy ? 'Moving…' : `Move to ${choice.dateLabel}, ${timeOf(choice.slotLabel)}`}
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Moves are confirmed instantly and Adrian is notified. You can also reschedule any time through the WhatsApp or Telegram bot.
      </p>
    </div>
  );
}
