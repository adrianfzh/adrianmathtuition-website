'use client';

// Change-a-lesson page: move an upcoming lesson, or book a makeup for a missed
// one; a FULL session (⏳) can be joined as a waiting list; an open offer from
// the waiting list sits at the top with Yes / No and a live countdown.
// Everything comes from /api/portal/reschedule (lists) and /api/portal/waitlist
// (join / leave / answer), which proxy the bot's lib/reschedule.js and
// lib/reschedule-queue.js — so what is offered here is exactly what the
// Telegram/WhatsApp pickers offer, and the tutor is told by the bot.
// A 409 on booking means the session filled (or the lesson moved) while the
// page sat open: reload the lists and say so, never retry silently.
// (Waiting list in the app: Adrian, 13 Oct 2026, "yes, the app too".)
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PortalFetchError, portalFetch, portalMessage } from '@/lib/portal-fetch';
import { sgtTodayISO } from '@/lib/sgt';
import { countdownLine, joinedLine, offerEnded, placeLine } from '@/lib/waitlist-view';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const BIG_BTN = 'w-full bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-60';

type Lesson = { id: string; date: string; type?: string; slotId: string; slotLabel: string; dateLabel: string; kind: 'reschedule' | 'makeup' };
type Option = { slotId: string; slotLabel: string; date: string; dateLabel: string; count: number; capacity: number; light: boolean; full?: boolean };
type Place = {
  id: number; kind: 'reschedule' | 'makeup' | 'switch'; slotId: string; date: string | null; origLessonId: string | null;
  when: string; position: number | null; offered: boolean; expiresAt: string | null; untilLabel: string | null; text: string | null;
};
type Data = { lessons: Lesson[]; options: Option[]; weeks: number; missed?: Lesson[]; queue?: Place[] };
type Mode = 'move' | 'makeup';
type Done = { title: string; lines: string[] };

// Slot labels arrive as "Sunday 9-11am" — the date line already names the day.
const timeOf = (lbl: string) => lbl.replace(/^[A-Za-z]+day\s*/, '').trim();

// Week bucket for an ISO date, labelled the way the bot's pickers do:
// "This week" / "Next week" / "In N weeks".
function weekLabel(dateStr: string, todayStr: string): string {
  const day = (s: string) => new Date(s + 'T00:00:00Z');
  const monday = (d: Date) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const diff = Math.round((monday(day(dateStr)).getTime() - monday(day(todayStr)).getTime()) / 604800000);
  return diff <= 0 ? 'This week' : diff === 1 ? 'Next week' : `In ${diff} weeks`;
}

export default function RescheduleClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('move');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await portalFetch<Data>('/api/portal/reschedule');
      setData(d);
      setMode(m => (m === 'makeup' && !(d.missed ?? []).length ? 'move' : m));
    } catch (e) {
      setLoadError(portalMessage(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The countdown ticks every 20 seconds; an offer that runs out reloads the page's lists.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);
  const queue = useMemo(() => data?.queue ?? [], [data]);
  const offers = queue.filter(p => p.offered && !offerEnded(p.expiresAt, now));
  const places = queue.filter(p => !p.offered && p.position);
  const hadOffer = queue.some(p => p.offered);
  const offerGone = hadOffer && offers.length < queue.filter(p => p.offered).length;
  useEffect(() => { if (offerGone) load(); }, [offerGone, load]);

  const missed = useMemo(() => data?.missed ?? [], [data]);
  const lessons = useMemo(() => (mode === 'makeup' ? missed : (data?.lessons ?? [])), [mode, missed, data]);
  // Auto-pick when there is only one lesson to choose from.
  useEffect(() => {
    setLessonId(prev => (prev && lessons.some(l => l.id === prev)) ? prev : (lessons.length === 1 ? lessons[0].id : null));
  }, [lessons]);
  const lesson = lessons.find(l => l.id === lessonId) ?? null;

  const todayStr = sgtTodayISO();
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
  const anyFull = (data?.options ?? []).some(o => o.full);
  const anyLight = (data?.options ?? []).some(o => o.light && !o.full);

  const switchMode = (m: Mode) => { setMode(m); setLessonId(null); setChoice(null); setNotice(null); };

  const book = async () => {
    if (!lesson || !choice || busy) return;
    setBusy(true);
    setNotice(null);
    const isMakeup = lesson.kind === 'makeup';
    try {
      if (choice.full) {
        const d = await portalFetch<{ booked?: boolean; position?: number; already?: boolean; movedTo?: { dateLabel: string; slotLabel: string } }>('/api/portal/waitlist', {
          json: { action: 'join', lessonId: lesson.id, slotId: choice.slotId, date: choice.date },
        });
        if (d.booked && d.movedTo) {
          setDone({ title: `A seat just opened up — ${isMakeup ? 'your makeup is booked for' : 'your lesson is moved to'} ${d.movedTo.dateLabel}, ${timeOf(d.movedTo.slotLabel)}.`, lines: ['Your tutor has been told — nothing else to do.'] });
        } else if (d.position) {
          setDone({
            title: `${joinedLine(d.position, !!d.already)}`,
            lines: [
              `For ${choice.dateLabel}, ${timeOf(choice.slotLabel)}.`,
              'If a seat frees up, we will ask you first.',
              isMakeup ? 'Nothing is booked until you say yes.' : 'Your lesson stays where it is until you say yes.',
            ],
          });
        } else {
          setNotice('Something went wrong saving that. Please try again, or message your tutor.');
        }
      } else {
        const d = await portalFetch<{ movedTo?: { dateLabel: string; slotLabel: string } }>('/api/portal/reschedule', {
          json: { lessonId: lesson.id, slotId: choice.slotId, date: choice.date },
        });
        if (d.movedTo) {
          setDone({ title: `${isMakeup ? 'Your makeup is booked for' : 'Your lesson is moved to'} ${d.movedTo.dateLabel}, ${timeOf(d.movedTo.slotLabel)}.`, lines: ['Your tutor has been told — nothing else to do.'] });
        } else {
          setNotice('Something went wrong saving that. Please try again, or message your tutor.');
        }
      }
    } catch (e) {
      // 409 = the session filled or the lesson moved while the page sat open —
      // branch on status/serverError (never message text), refresh the lists.
      if (e instanceof PortalFetchError && e.status === 409) {
        setChoice(null);
        setNotice(
          e.serverError === 'lesson_not_movable' ? 'That lesson can no longer be changed from here. Here is the fresh list.'
            : e.serverError === 'full' ? 'That class just filled up. It is now marked ⏳ — you can join its waiting list.'
              : e.serverError === 'conflict' || e.serverError === 'double_booked' ? 'You already have a lesson at that time. Pick another.'
                : 'That class just filled up or closed. Pick another time.');
        await load();
      } else {
        setNotice(portalMessage(e) || 'Something went wrong saving that. Please try again, or message your tutor.');
      }
    } finally {
      setBusy(false);
    }
  };

  const answer = async (p: Place, yes: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await portalFetch<{ ok?: boolean; text?: string }>('/api/portal/waitlist', { json: { action: 'answer', id: p.id, yes } });
      setAnswered(d.text || (yes ? 'Done.' : 'OK.'));
    } catch (e) {
      setAnswered(portalMessage(e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const leave = async (p: Place) => {
    if (busy) return;
    setBusy(true);
    try {
      await portalFetch('/api/portal/waitlist', { json: { action: 'leave', id: p.id } });
      setAnswered(`You left the waiting list for ${p.when}.`);
    } catch (e) {
      setAnswered(e instanceof PortalFetchError && e.status === 409 ? 'That place was already gone.' : portalMessage(e));
    } finally {
      setLeaving(null);
      setBusy(false);
      await load();
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
          <p className="font-semibold text-navy">{done.title}</p>
          {done.lines.map(l => <p key={l} className="text-sm text-gray-600">{l}</p>)}
        </div>
        <button type="button" onClick={() => { setDone(null); setChoice(null); setLessonId(null); load(); }} className="w-full text-sm font-semibold text-navy border border-navy/30 rounded-2xl px-4 py-3 hover:bg-navy/5 transition-colors">
          Change another lesson
        </button>
        <Link href="/app" className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 font-semibold shadow-sm hover:opacity-90 transition-opacity">Back to Home</Link>
      </div>
    );
  }

  const nothingToChange = data && data.lessons.length === 0 && missed.length === 0;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {header}

      {loadError && (
        <div className={`${CARD} p-5 space-y-3`}>
          <p className="text-sm text-gray-600">
            {loadError} If it keeps happening, message your tutor to move it.
          </p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-navy border border-navy/30 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!data && !loadError && <div className={`${CARD} p-5 text-sm text-gray-500`}>Loading your lessons…</div>}

      {answered && (
        <div className={`${CARD} p-4 text-sm text-navy flex items-start gap-3`}>
          <p className="flex-1 whitespace-pre-line">{answered}</p>
          <button type="button" onClick={() => setAnswered(null)} className="text-gray-400 hover:text-navy" aria-label="Close">✕</button>
        </div>
      )}

      {/* An open offer — the most urgent thing on the page. */}
      {offers.map(p => (
        <section key={p.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 space-y-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">🎉 A slot has opened up</p>
          <p className="font-semibold text-navy">{p.text}</p>
          {p.kind === 'switch' && <p className="text-sm text-gray-600">This is your weekly slot.</p>}
          <p className="text-sm font-semibold text-amber-800">
            ⏳ {countdownLine(Date.parse(p.expiresAt as string), now, p.untilLabel)}
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => answer(p, true)} className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-3 font-semibold hover:opacity-90 disabled:opacity-60">
              Yes, take it
            </button>
            <button type="button" disabled={busy} onClick={() => answer(p, false)} className="bg-white text-navy border border-navy/30 rounded-xl px-4 py-3 font-semibold hover:bg-navy/5 disabled:opacity-60">
              No
            </button>
          </div>
        </section>
      ))}

      {/* Places in line. */}
      {places.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your waiting list</p>
          {places.map(p => (
            <div key={p.id} className={`${CARD} p-4 space-y-2`}>
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none" aria-hidden>⏳</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-navy">{p.when}</span>
                  <span className="block text-xs text-gray-500">{placeLine(p.position)}</span>
                </span>
                {leaving !== p.id && (
                  <button type="button" onClick={() => setLeaving(p.id)} className="text-sm text-gray-500 hover:text-navy underline underline-offset-2">Leave</button>
                )}
              </div>
              {leaving === p.id && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => leave(p)} className="text-sm font-semibold text-white bg-red-600 rounded-xl px-3 py-2 hover:opacity-90 disabled:opacity-60">Leave the line</button>
                  <button type="button" onClick={() => setLeaving(null)} className="text-sm font-semibold text-navy border border-navy/30 rounded-xl px-3 py-2 hover:bg-navy/5">Keep my place</button>
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] text-gray-400">If a seat frees up, we will ask you first.</p>
        </section>
      )}

      {nothingToChange && (
        <div className={`${CARD} p-5 text-sm text-gray-600 space-y-1`}>
          <p>No upcoming lessons in the next {data.weeks} weeks can be moved from here.</p>
          <p>No missed lessons to make up.</p>
          <p>If something urgent came up, message your tutor.</p>
        </div>
      )}

      {/* Move a lesson / make up a missed one. */}
      {data && !nothingToChange && missed.length > 0 && (
        <div className="grid grid-cols-2 gap-1 bg-black/5 rounded-xl p-1" role="tablist">
          {([['move', '📅 Move a lesson'], ['makeup', '🔄 Make up a lesson']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {data && !nothingToChange && lessons.length === 0 && (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          {mode === 'move'
            ? `No upcoming lessons in the next ${data.weeks} weeks can be moved from here. If one starts within the hour, message your tutor.`
            : 'No missed lessons to make up.'}
        </div>
      )}

      {data && lessons.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {mode === 'makeup' ? (lessons.length === 1 ? 'The lesson you missed' : 'Which missed lesson?') : (lessons.length === 1 ? 'Your lesson' : 'Which lesson?')}
          </p>
          {lessons.map(l => (
            <button
              key={l.id}
              onClick={() => { setLessonId(l.id); setChoice(null); setNotice(null); }}
              className={`${CARD} w-full text-left p-4 flex items-center gap-3 transition-colors ${l.id === lessonId ? 'ring-2 ring-navy' : 'hover:bg-[hsl(45,100%,99%)]'}`}
            >
              <span className="text-xl leading-none" aria-hidden>{mode === 'makeup' ? '🔄' : '📅'}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-navy">{l.dateLabel}, {timeOf(l.slotLabel)}</span>
                {mode === 'makeup'
                  ? <span className="block text-xs text-gray-500">Missed</span>
                  : l.type && l.type !== 'Regular' && <span className="block text-xs text-blue-700">{l.type}</span>}
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
            Sorry — no classes in the next {data.weeks} weeks. Message your tutor to sort something out.
          </div>
        ) : (
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{mode === 'makeup' ? 'Make it up on…' : 'Move it to…'}</p>
            {(anyFull || anyLight) && (
              <div className="text-[11px] text-gray-500 space-y-0.5">
                {anyLight && <p>🟢 quieter class (2 or fewer so far)</p>}
                {anyFull && <p>⏳ full — tap to join the waiting list</p>}
              </div>
            )}
            {groups.map(([label, opts]) => (
              <div key={label} className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-500">{label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {opts.map(o => {
                    const sel = choice && choice.slotId === o.slotId && choice.date === o.date;
                    const waiting = places.find(p => p.slotId === o.slotId && p.date === o.date && p.origLessonId === lesson.id);
                    return (
                      <button
                        key={`${o.slotId}:${o.date}`}
                        onClick={() => { setChoice(o); setNotice(null); }}
                        disabled={!!waiting}
                        className={`${CARD} text-left px-4 py-3 transition-colors ${o.full ? 'bg-gray-50' : ''} ${sel ? 'ring-2 ring-navy' : 'hover:bg-[hsl(45,100%,99%)]'} disabled:opacity-60`}
                      >
                        <span className={`font-semibold text-sm ${o.full ? 'text-gray-500' : 'text-navy'}`}>
                          {o.full ? '⏳ ' : o.light ? '🟢 ' : ''}{o.dateLabel} · {timeOf(o.slotLabel)}
                        </span>
                        {o.full && <span className="block text-[11px] text-amber-700">{waiting ? placeLine(waiting.position) : 'Full — join the waiting list'}</span>}
                        {!o.full && o.light && <span className="block text-[11px] text-emerald-700">Quieter class</span>}
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
        <div className="sticky bottom-20 sm:bottom-4 space-y-1">
          {choice.full && <p className="text-xs text-center text-gray-700 bg-white rounded-xl border border-black/5 shadow-sm px-3 py-2">This class is full. You’ll be asked first if a seat frees up.</p>}
          <button onClick={book} disabled={busy} className={BIG_BTN}>
            {busy ? 'Saving…'
              : choice.full ? `Join the waiting list for ${choice.dateLabel}, ${timeOf(choice.slotLabel)}`
                : `${lesson.kind === 'makeup' ? 'Book makeup on' : 'Move to'} ${choice.dateLabel}, ${timeOf(choice.slotLabel)}`}
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Changes are confirmed at once and your tutor is told. You can also do this through the WhatsApp or Telegram bot.
      </p>
    </div>
  );
}
