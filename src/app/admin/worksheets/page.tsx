'use client';

// /admin/worksheets — 🛠 make a worksheet: the Telegram /ws menu as one page
// (9 Oct 2026, Adrian: "can we create an page interface for /ws command in telegram?
// put in on admin page"). One screen, top to bottom: what to make → level → topic(s)
// and the few settings that kind has → one "Make it" button → where it is.
//
// It makes EXACTLY what /ws makes (SPEC-WORKSHEET-MENU.md): "Questions only" comes
// back at once as a PDF; the other four are queued as a worksheet_jobs row and the
// .docx arrives in Telegram when the builder has made it. The request is built on the
// server by lib/ws-menu `buildWsRequest` (tested against the bot's own bodies) — this
// file is only the form. Different from /admin/worksheet-picker (choose and arrange the
// questions by hand). The old /admin/worksheet-builder was retired 9 Oct 2026.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import {
  WS_KINDS, WS_LEVELS, WS_PAPERS, WS_DEFAULT_COUNT, WS_MAX_COUNT, WS_MAX_TOPICS, WS_SKILL_KINDS,
  clampCount, displayTopics, filterTopics, isQueued, jobStateLine, missing, presetsFor, summaryLine, topicFamilies,
  type WsForm, type WsKind, type WsTier,
} from '@/lib/ws-menu';

type Job = {
  id: string; kind: number; label: string; status: string; stage: string | null; error: string | null;
  attempts: number; result: unknown; created_at: string; completed_at: string | null;
};
type Sheet = { url: string; title: string; count: number; skills?: { covered?: unknown[]; empty?: string[]; skipped?: string[]; dropped?: string[] } | null };
type Made = { lane: 'instant'; sheet: Sheet } | { lane: 'queued'; job: Job };

const when = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const TONE: Record<string, string> = { wait: 'bg-amber-400', work: 'bg-sky-500', ok: 'bg-emerald-500', bad: 'bg-rose-500', off: 'bg-neutral-300' };

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs text-white">{n}</span>
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children, strike }: { on: boolean; onClick: () => void; children: React.ReactNode; strike?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[44px] rounded-xl px-3.5 py-2 text-left text-sm leading-snug ring-1 transition-colors ${on
        ? (strike ? 'bg-rose-50 text-rose-700 ring-rose-300 line-through' : 'bg-indigo-600 text-white ring-indigo-600')
        : 'bg-white text-neutral-800 ring-neutral-300 active:bg-neutral-100'}`}>
      {children}
    </button>
  );
}

export default function WorksheetsMenuPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');

  const [kind, setKind] = useState<WsKind | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [tier, setTier] = useState<WsTier>('mixed');
  const [sheet, setSheet] = useState<string | null>(null);
  const [skipSkills, setSkipSkills] = useState<string[]>([]);
  const [paper, setPaper] = useState<string | null>(null);
  const [preset, setPreset] = useState('standard');
  const [exclude, setExclude] = useState<string[]>([]);

  const [topics, setTopics] = useState<string[] | null>(null);
  const [topicsError, setTopicsError] = useState('');
  const [typed, setTyped] = useState('');
  const [sheets, setSheets] = useState<string[] | null>(null);
  const [skills, setSkills] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<Made | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const madeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureAdminSession().then((ok) => { if (ok) setAuthed(true); }); }, []);

  // ── the topic list: the level's, or the paper's level for a full paper ──────────
  const listLevel = kind === 5 ? (WS_PAPERS.find((p) => p.key === paper)?.level ?? null) : level;
  useEffect(() => {
    setTopics(null); setTopicsError(''); setTyped('');
    if (!authed || !listLevel) return;
    let live = true;
    fetch(`/api/admin/ws-menu?level=${encodeURIComponent(listLevel)}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => { if (!live) return; if (ok) setTopics(d.topics ?? []); else setTopicsError(d.error || 'Could not read the topic list.'); })
      .catch(() => { if (live) setTopicsError('Could not read the topic list.'); });
    return () => { live = false; };
  }, [authed, listLevel]);

  const families = useMemo(() => topicFamilies(topics ?? []), [topics]);
  const topicName = useMemo(() => displayTopics(picked, topics ?? []), [picked, topics]);

  // ── kind 4: his own sheets for the topic ────────────────────────────────────
  useEffect(() => {
    setSheets(null); setSheet(null);
    if (!authed || kind !== 4 || !level || !topicName) return;
    let live = true;
    fetch(`/api/admin/worksheet-jobs?sheets=1&level=${encodeURIComponent(level)}&topic=${encodeURIComponent(topicName)}`)
      .then((r) => r.json()).then((d) => {
        if (!live) return;
        const list: string[] = Array.isArray(d.sheets) ? d.sheets : [];
        setSheets(list); if (list.length === 1) setSheet(list[0]);
      }).catch(() => { if (live) setSheets([]); });
    return () => { live = false; };
  }, [authed, kind, level, topicName]);

  // ── kinds 2, 3, 4 with one topic: its skills, any of which can be left out ───────
  const oneTopic = picked.length === 1 ? picked[0] : null;
  const wantsSkills = !!kind && WS_SKILL_KINDS.has(kind) && !!level && !!oneTopic;
  useEffect(() => {
    setSkills([]); setSkipSkills([]);
    if (!authed || !wantsSkills) return;
    let live = true;
    fetch(`/api/admin/worksheet-jobs?skills=1&level=${encodeURIComponent(level!)}&topic=${encodeURIComponent(oneTopic!)}`)
      .then((r) => r.json()).then((d) => { if (live) setSkills(Array.isArray(d.skills) ? d.skills.map((s: { name: string }) => s.name) : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [authed, wantsSkills, level, oneTopic]);

  // ── his recent jobs; look again every 20 s while one is waiting or being built ────
  const loadJobs = useCallback(async () => {
    const r = await fetch('/api/admin/worksheet-jobs').catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    if (d?.jobs) setJobs(d.jobs);
  }, []);
  useEffect(() => { if (authed) loadJobs(); }, [authed, loadJobs]);
  const anyOpen = (jobs ?? []).some((j) => j.status === 'queued' || j.status === 'claimed');
  useEffect(() => {
    if (!authed || !anyOpen) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadJobs(); }, 20_000);
    return () => clearInterval(t);
  }, [authed, anyOpen, loadJobs]);

  const form: WsForm = { kind, level, picked, count, tier, sheet, skipSkills, paper, preset, exclude };
  const need = missing(form, topics);
  const line = summaryLine(form, topics ?? []);
  const queued = kind ? isQueued(kind) : false;
  const n = kind && kind !== 5 ? clampCount(kind, count) ?? 8 : 0;
  const max = kind ? WS_MAX_COUNT[kind] ?? 0 : 0;

  function chooseKind(k: WsKind) { setKind(k); setCount(WS_DEFAULT_COUNT[k]); setMade(null); setError(''); }
  function chooseLevel(l: string) { if (l !== level) { setLevel(l); setPicked([]); } setMade(null); setError(''); }
  function choosePaper(p: string) {
    if (p !== paper) { setPaper(p); setExclude([]); if (!presetsFor(p).some((x) => x.key === preset)) setPreset('standard'); }
    setMade(null); setError('');
  }
  function toggleTopic(t: string) {
    setMade(null); setError('');
    setPicked((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= WS_MAX_TOPICS ? cur : [...cur, t]);
  }
  function toggleFamily(members: string[]) {
    setMade(null); setError('');
    setPicked((cur) => members.every((m) => cur.includes(m)) ? cur.filter((x) => !members.includes(x)) : [...new Set([...cur, ...members])].slice(0, WS_MAX_TOPICS));
  }
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) => { setMade(null); set((cur) => cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); };

  async function make() {
    if (need || busy) return;
    setBusy(true); setError(''); setMade(null);
    try {
      const r = await fetch('/api/admin/ws-menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `It did not go through (${r.status}).`);
      setMade(d as Made);
      if (d.lane === 'queued') loadJobs();
      setTimeout(() => madeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function stop(j: Job) {
    if (!window.confirm(`Stop "${j.label}"?`)) return;
    await fetch('/api/admin/worksheet-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: j.id }) }).catch(() => {});
    loadJobs();
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🛠 Worksheets</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  const shown = filterTopics(topics ?? [], typed);
  const shownFamilies = typed.trim() ? families.filter((f) => f.name.toLowerCase().includes(typed.trim().toLowerCase())) : families;
  const madeJob = made?.lane === 'queued' ? (jobs ?? []).find((j) => j.id === made.job.id) ?? made.job : null;
  let step = 1;

  return (
    <main className="min-h-screen bg-neutral-100 p-3 sm:p-6 pb-16">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center gap-3 px-1 pt-1">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-900">🛠 Worksheets</h1>
        </header>

        <Step n={step++} title="What do you want?">
          <div className="grid gap-2 sm:grid-cols-2">
            {WS_KINDS.map((k) => (
              <button key={k.n} type="button" onClick={() => chooseKind(k.n)} aria-pressed={kind === k.n}
                className={`rounded-xl p-3.5 text-left ring-1 transition-colors ${kind === k.n ? 'bg-indigo-50 ring-2 ring-indigo-600' : 'bg-white ring-neutral-300 active:bg-neutral-50'} ${k.n === 5 ? 'sm:col-span-2' : ''}`}>
                <div className="font-semibold text-neutral-900">{`${k.emoji} ${k.title}`}</div>
                <div className="mt-1 text-sm leading-snug text-neutral-600">{k.gets}</div>
                <div className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${k.queued ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-100 text-emerald-800'}`}>
                  {k.queued ? 'Arrives in Telegram in a few minutes' : 'Ready at once'}
                </div>
              </button>
            ))}
          </div>
          {/* The one front door (9 Oct 2026, Adrian: "yes to both"): the five above are done for him;
              this sixth opens the picker, where he chooses the questions. Its own tile is gone. */}
          <div className="mt-4 text-sm text-neutral-500">Or choose the questions yourself</div>
          <a href="/admin/worksheet-picker"
            className="mt-2 flex items-center gap-3 rounded-xl bg-white p-3.5 ring-2 ring-indigo-300 active:bg-neutral-50">
            <div className="flex-1">
              <div className="font-semibold text-neutral-900">🧺 I will pick the questions myself</div>
              <div className="mt-1 text-sm leading-snug text-neutral-600">Opens the picker. Drag the ones you want, read the solutions, press Done.</div>
            </div>
            <span aria-hidden className="text-lg text-indigo-600">→</span>
          </a>
        </Step>

        {kind && kind !== 5 && (
          <Step n={step++} title="Which level?">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WS_LEVELS.map((l) => (
                <button key={l.token} type="button" onClick={() => chooseLevel(l.token)} aria-pressed={level === l.token}
                  className={`min-h-[48px] rounded-xl px-1 text-sm font-medium ring-1 ${level === l.token ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-neutral-800 ring-neutral-300 active:bg-neutral-100'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </Step>
        )}

        {kind && kind !== 5 && level && (
          <Step n={step++} title="Which topic?"
            hint={kind === 2 ? 'Tap one topic. Tap more to put several on one sheet, or take a whole chapter.' : 'Tap one topic. A whole chapter works too.'}>
            {topicsError && <p className="text-sm text-rose-700">{topicsError}</p>}
            {!topics && !topicsError && <p className="text-sm text-neutral-500">Loading the topics…</p>}
            {topics && (
              <>
                {picked.length > 0 && (
                  <div className="rounded-xl bg-indigo-50 p-3">
                    <div className="text-xs font-medium text-indigo-900">{`Chosen (${picked.length})`}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {picked.map((t) => (
                        <button key={t} type="button" onClick={() => toggleTopic(t)}
                          className="min-h-[36px] rounded-full bg-indigo-600 px-3 py-1 text-sm text-white">{`${t} `}<span aria-hidden className="opacity-70">✕</span></button>
                      ))}
                    </div>
                  </div>
                )}
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to find a topic" inputMode="search" autoComplete="off"
                  className="w-full rounded-xl border border-neutral-300 px-3.5 py-3 text-base" />
                {shownFamilies.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-neutral-500">Whole chapters</div>
                    <div className="flex flex-wrap gap-2">
                      {shownFamilies.map((f) => (
                        <Chip key={f.name} on={f.members.every((m) => picked.includes(m))} onClick={() => toggleFamily(f.members)}>{`📚 ${f.name} (all)`}</Chip>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  {shownFamilies.length > 0 && <div className="mb-1.5 text-xs font-medium text-neutral-500">Topics</div>}
                  <div className="flex flex-wrap gap-2">
                    {shown.map((t) => <Chip key={t} on={picked.includes(t)} onClick={() => toggleTopic(t)}>{t}</Chip>)}
                  </div>
                  {shown.length === 0 && <p className="text-sm text-neutral-500">No topic at this level has those words.</p>}
                </div>
              </>
            )}
          </Step>
        )}

        {kind === 4 && level && picked.length > 0 && (
          <Step n={step++} title="Which of your sheets?" hint="The new practice goes at the end of a copy. Your own sheet is not changed.">
            {!sheets && <p className="text-sm text-neutral-500">Looking in your Revision folder…</p>}
            {sheets && sheets.length === 0 && (
              <p className="text-sm text-neutral-700">{'You have no sheet for '}<b>{topicName}</b>{' at this level.'}<br />Choose “Revision worksheet” or “Practice with notes” above to make a new one.</p>
            )}
            <div className="space-y-2">
              {(sheets ?? []).map((s) => (
                <button key={s} type="button" onClick={() => { setSheet(s); setMade(null); }} aria-pressed={sheet === s}
                  className={`block w-full min-h-[48px] rounded-xl px-3.5 py-2.5 text-left text-sm ring-1 ${sheet === s ? 'bg-indigo-50 ring-2 ring-indigo-600' : 'bg-white ring-neutral-300'}`}>
                  {s.replace(/\.docx$/i, '')}
                </button>
              ))}
            </div>
          </Step>
        )}

        {kind && kind !== 5 && level && picked.length > 0 && (
          <Step n={step++} title="How many questions?">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { setCount(Math.max(1, n - 1)); setMade(null); }} aria-label="One fewer"
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-neutral-300 active:bg-neutral-100">−</button>
              <div className="w-16 text-center text-2xl font-semibold tabular-nums text-neutral-900">{n}</div>
              <button type="button" onClick={() => { setCount(Math.min(max, n + 1)); setMade(null); }} aria-label="One more"
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-neutral-300 active:bg-neutral-100">+</button>
              <span className="text-sm text-neutral-500">{`up to ${max}`}</span>
            </div>
            {kind === 3 && (
              <div>
                <div className="mb-1.5 text-sm font-medium text-neutral-800">How hard?</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['mixed', 'standard', 'advanced'] as WsTier[]).map((t) => (
                    <button key={t} type="button" onClick={() => { setTier(t); setMade(null); }} aria-pressed={tier === t}
                      className={`min-h-[48px] rounded-xl text-sm font-medium capitalize ring-1 ${tier === t ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-neutral-800 ring-neutral-300'}`}>{t}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">Advanced is thin outside S4 A Math. Mixed is the safe choice.</p>
              </div>
            )}
            {skills.length > 0 && (
              <details className="rounded-xl bg-neutral-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-neutral-800">
                  {`The sheet takes one question per skill (${skills.length - skipSkills.length} of ${skills.length})`}
                </summary>
                <p className="mt-2 text-xs text-neutral-500">Tap a skill to leave it out.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {skills.map((s) => <Chip key={s} on={skipSkills.includes(s)} strike onClick={() => toggle(setSkipSkills)(s)}>{s}</Chip>)}
                </div>
              </details>
            )}
          </Step>
        )}

        {kind === 5 && (
          <>
            <Step n={step++} title="Which paper?">
              <div className="grid grid-cols-2 gap-2">
                {WS_PAPERS.map((p) => (
                  <button key={p.key} type="button" onClick={() => choosePaper(p.key)} aria-pressed={paper === p.key}
                    className={`min-h-[52px] rounded-xl px-3 py-2 text-left text-sm font-medium ring-1 ${paper === p.key ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-neutral-800 ring-neutral-300'}`}>{p.label}</button>
                ))}
              </div>
            </Step>
            {paper && (
              <Step n={step++} title="Which style?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {presetsFor(paper).map((p) => (
                    <button key={p.key} type="button" onClick={() => { setPreset(p.key); setMade(null); }} aria-pressed={preset === p.key}
                      className={`min-h-[48px] rounded-xl px-3.5 py-2 text-left text-sm font-medium ring-1 ${preset === p.key ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-neutral-800 ring-neutral-300'}`}>{p.label}</button>
                  ))}
                </div>
              </Step>
            )}
            {paper && (
              <Step n={step++} title="Any topics to leave out?" hint="Leave this alone for a paper on every topic. Tap a topic to leave it out.">
                {topicsError && <p className="text-sm text-rose-700">{topicsError}</p>}
                {!topics && !topicsError && <p className="text-sm text-neutral-500">Loading the topics…</p>}
                {topics && (
                  <>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-neutral-800">{exclude.length ? `Leaving out ${exclude.length}` : 'All topics are in'}</span>
                      {exclude.length > 0 && <button type="button" onClick={() => setExclude([])} className="min-h-[36px] rounded-lg px-3 text-indigo-700 ring-1 ring-indigo-200">Put all back</button>}
                    </div>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to find a topic" inputMode="search" autoComplete="off"
                      className="w-full rounded-xl border border-neutral-300 px-3.5 py-3 text-base" />
                    <div className="flex flex-wrap gap-2">
                      {shown.map((t) => <Chip key={t} on={exclude.includes(t)} strike onClick={() => toggle(setExclude)(t)}>{t}</Chip>)}
                    </div>
                  </>
                )}
              </Step>
            )}
          </>
        )}

        {kind && (
          <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
            {need
              ? <p className="text-sm text-neutral-500">{need}</p>
              : <p className="text-base leading-snug text-neutral-900">{line}</p>}
            {!need && <p className="text-sm text-neutral-500">{queued ? 'The Word file arrives in Telegram when it is built.' : 'The PDF opens here.'}</p>}
            <button type="button" onClick={make} disabled={!!need || busy}
              className="w-full min-h-[56px] rounded-xl bg-neutral-900 text-lg font-semibold text-white disabled:opacity-40">
              {busy ? (queued ? 'Sending…' : 'Making it…') : 'Make it'}
            </button>
            {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
            <div ref={madeRef}>
              {made?.lane === 'instant' && (
                <div className="rounded-xl bg-emerald-50 p-4 space-y-2">
                  <div className="font-semibold text-emerald-900">{`Ready: ${made.sheet.title}`}</div>
                  <div className="text-sm text-emerald-900">{`${made.sheet.count} questions, answers at the end.`}</div>
                  {made.sheet.skills?.empty && made.sheet.skills.empty.length > 0 && (
                    <div className="text-sm text-emerald-900">{`The bank has nothing for: ${made.sheet.skills.empty.join(', ')}.`}</div>
                  )}
                  <a href={made.sheet.url} target="_blank" rel="noreferrer"
                    className="block w-full rounded-xl bg-emerald-600 py-3.5 text-center text-base font-semibold text-white">Open the PDF</a>
                </div>
              )}
              {madeJob && (
                <div className="rounded-xl bg-indigo-50 p-4 space-y-1">
                  <div className="font-semibold text-indigo-900">Queued. It will arrive in Telegram.</div>
                  <div className="text-sm text-indigo-900">{madeJob.label}</div>
                  <div className="flex items-center gap-2 text-sm text-indigo-900">
                    <span className={`h-2.5 w-2.5 rounded-full ${TONE[jobStateLine(madeJob).tone]}`} />{jobStateLine(madeJob).text}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Recent worksheets</h2>
            <button type="button" onClick={loadJobs} className="min-h-[36px] rounded-lg px-3 text-sm text-neutral-600 ring-1 ring-neutral-300">Look again</button>
          </div>
          {!jobs && <p className="text-sm text-neutral-500">Loading…</p>}
          {jobs && jobs.length === 0 && <p className="text-sm text-neutral-500">Nothing yet.</p>}
          {(jobs ?? []).slice(0, 8).map((j) => {
            const s = jobStateLine(j);
            const open = j.status === 'queued' || j.status === 'claimed';
            return (
              <div key={j.id} className="flex items-start gap-3 border-t border-neutral-100 pt-3 first:border-0 first:pt-0">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE[s.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug text-neutral-900">{j.label}</div>
                  <div className={`text-sm leading-snug break-words ${s.tone === 'bad' ? 'text-rose-700' : 'text-neutral-600'}`}>{s.text}</div>
                  <div className="text-xs text-neutral-400">{when(j.completed_at ?? j.created_at)}</div>
                </div>
                {open && <button type="button" onClick={() => stop(j)} className="min-h-[36px] shrink-0 rounded-lg px-3 text-sm text-rose-700 ring-1 ring-rose-200">Stop</button>}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
