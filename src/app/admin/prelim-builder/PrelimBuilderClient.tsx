'use client';
// Prelim paper builder — deterministic assembly over data/paper-blueprints.json
// + the QB (no model calls). Generate → per-slot swap/reroll/pin → save draft.
// Drafts are the hybrid hand-off: a Claude session runs the setter pass on a
// saved draft and writes swaps back.
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

interface Candidate {
  id: string;
  total_marks: number;
  school: string | null;
  year: number | null;
  difficulty: string | null;
  has_image: boolean | null;
  image_url: string | null;
  answer: string | null;
  has_solution: boolean;
  parts_count: number;
  preview: string;
  schoolYear: string;
}

interface Slot {
  pos: number;
  topic: string;
  target: number;
  pick: Candidate | null;
  alternates: Candidate[];
  pinned?: boolean;
}

interface Paper {
  level: string;
  paper: string;
  preset: string;
  difficulty: string;
  excludeSchool: string | null;
  seed: number;
  totalTarget: number;
  total: number;
  landed: boolean;
  slots: Slot[];
}

interface PresetMeta {
  name: string;
  description: string;
  appliesTo: string[] | null;
}

interface DraftRow {
  id: string;
  title: string;
  level: string;
  paper: string;
  preset: string;
  difficulty: string;
  status: string;
  total_marks: number;
  created_at: string;
}

const sum = (slots: Slot[]) => slots.reduce((a, s) => a + (s.pick?.total_marks ?? 0), 0);

export default function PrelimBuilderClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [level, setLevel] = useState('AM');
  const [paperNum, setPaperNum] = useState('P2');
  const [preset, setPreset] = useState('standard');
  const [difficulty, setDifficulty] = useState<'standard' | 'hard'>('standard');
  const [excludeSchool, setExcludeSchool] = useState('');

  const [paper, setPaper] = useState<Paper | null>(null);
  const [busy, setBusy] = useState(false);
  const [slotBusy, setSlotBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    ensureAdminSession().then(setAuthed);
  }, []);

  const loadMeta = useCallback(async () => {
    const r = await fetch('/api/admin/prelim-builder/generate');
    if (r.ok) {
      const d = await r.json();
      setPresets(d.presets || []);
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    const r = await fetch('/api/admin/prelim-builder/drafts');
    if (r.ok) setDrafts((await r.json()).drafts || []);
  }, []);

  useEffect(() => {
    if (authed === true) {
      loadMeta();
      loadDrafts();
    }
  }, [authed, loadMeta, loadDrafts]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    const ok = await loginAdminSession(password);
    setAuthLoading(false);
    if (ok) setAuthed(true);
    else setAuthError('Incorrect password');
  }

  async function generate() {
    setBusy(true);
    setError('');
    setSavedId(null);
    try {
      const r = await fetch('/api/admin/prelim-builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          paper: paperNum,
          preset,
          difficulty,
          excludeSchool: excludeSchool || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Generate failed');
      setPaper(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  }

  async function rerollSlot(slot: Slot) {
    if (!paper) return;
    setSlotBusy(slot.pos);
    setError('');
    try {
      const excludeIds = [
        ...(slot.pick ? [slot.pick.id] : []),
        ...paper.slots.filter((s) => s.pos !== slot.pos && s.pick).map((s) => s.pick!.id),
      ];
      const usedSchools = paper.slots
        .filter((s) => s.pos !== slot.pos && s.pick?.school)
        .map((s) => s.pick!.school);
      const r = await fetch('/api/admin/prelim-builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: paper.level,
          paper: paper.paper,
          preset: paper.preset,
          difficulty: paper.difficulty,
          excludeSchool: paper.excludeSchool || undefined,
          reroll: { pos: slot.pos, topic: slot.topic, excludeIds, usedSchools },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Reroll failed');
      setPaper((prev) =>
        prev
          ? {
              ...prev,
              slots: prev.slots.map((s) =>
                s.pos === slot.pos ? { ...s, pick: d.pick, alternates: d.alternates } : s
              ),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reroll failed');
    } finally {
      setSlotBusy(null);
    }
  }

  function swapAlternate(slot: Slot, altId: string) {
    if (!paper) return;
    const alt = slot.alternates.find((a) => a.id === altId);
    if (!alt || !slot.pick) return;
    setPaper({
      ...paper,
      slots: paper.slots.map((s) =>
        s.pos === slot.pos
          ? {
              ...s,
              pick: alt,
              alternates: [s.pick!, ...s.alternates.filter((a) => a.id !== altId)],
            }
          : s
      ),
    });
  }

  function togglePin(slot: Slot) {
    if (!paper) return;
    setPaper({
      ...paper,
      slots: paper.slots.map((s) => (s.pos === slot.pos ? { ...s, pinned: !s.pinned } : s)),
    });
  }

  async function saveDraft() {
    if (!paper) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/prelim-builder/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${paper.level} ${paper.paper} · ${paper.preset}${paper.difficulty === 'hard' ? ' · hard' : ''}`,
          level: paper.level,
          paper: paper.paper,
          preset: paper.preset,
          difficulty: paper.difficulty,
          excludeSchool: paper.excludeSchool,
          slots: paper.slots,
          total_marks: sum(paper.slots),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setSavedId(d.id);
      loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function openDraft(id: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/prelim-builder/drafts?id=${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed');
      const dr = d.draft;
      setPaper({
        level: dr.level,
        paper: dr.paper,
        preset: dr.preset,
        difficulty: dr.difficulty,
        excludeSchool: dr.exclude_school,
        seed: 0,
        totalTarget: 90,
        total: dr.total_marks,
        landed: dr.total_marks === 90,
        slots: dr.slots,
      });
      setSavedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(id: string) {
    await fetch(`/api/admin/prelim-builder/drafts?id=${id}`, { method: 'DELETE' });
    if (savedId === id) setSavedId(null);
    loadDrafts();
  }

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(45,100%,97%)]">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow p-8 w-80">
          <h1 className="font-bold text-navy text-lg mb-1">Prelim Builder</h1>
          <p className="text-xs text-slate-400 mb-5">Enter the admin password.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setAuthError('');
            }}
            placeholder="Admin password"
            autoFocus
            disabled={authLoading}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
          />
          {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
          <button
            type="submit"
            disabled={authLoading || !password}
            className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {authLoading ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  const availablePresets = presets.filter(
    (p) => !p.appliesTo || p.appliesTo.includes(`${level}-${paperNum}`)
  );
  const total = paper ? sum(paper.slots) : 0;

  return (
    <div className="min-h-screen bg-[hsl(45,100%,97%)] px-4 py-10 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-navy mb-1 mt-4">Prelim Paper Builder</h1>
      <p className="text-xs text-slate-500 mb-6">
        Deterministic assembly from the 474-paper blueprint + QB — no AI calls. Save a draft, then
        ask Claude to run the setter pass on it.
      </p>

      {/* config bar */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-navy">
            <option>AM</option>
            <option>EM</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Paper
          <select value={paperNum} onChange={(e) => setPaperNum(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-navy">
            <option>P1</option>
            <option>P2</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Preset
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-navy max-w-56">
            {availablePresets.map((p) => (
              <option key={p.name} value={p.name} title={p.description}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as 'standard' | 'hard')} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-navy">
            <option value="standard">standard</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Exclude school
          <input
            value={excludeSchool}
            onChange={(e) => setExcludeSchool(e.target.value)}
            placeholder="(none)"
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-navy w-40"
          />
        </label>
        <button
          onClick={generate}
          disabled={busy}
          className="bg-navy text-[hsl(45,100%,96%)] rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Generate'}
        </button>
        {paper && (
          <button
            onClick={saveDraft}
            disabled={busy}
            className="border border-navy text-navy rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {savedId ? 'Save as new draft' : 'Save draft'}
          </button>
        )}
        {savedId && (
          <a
            href={`/api/admin/prelim-builder/export?id=${savedId}`}
            target="_blank"
            rel="noreferrer"
            className="border border-emerald-700 text-emerald-700 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Export PDF
          </a>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {savedId && (
        <p className="text-xs text-emerald-700 mb-4">
          Saved draft <span className="font-mono">{savedId.slice(0, 8)}</span> — tell Claude: “run
          the setter pass on draft {savedId.slice(0, 8)}”.
        </p>
      )}

      {/* result */}
      {paper && (
        <div className="mb-8">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-bold text-navy">
              {paper.level} {paper.paper} · {paper.preset}
              {paper.difficulty === 'hard' ? ' · hard' : ''}
            </h2>
            <span
              className={`text-sm font-semibold ${total === paper.totalTarget ? 'text-emerald-700' : 'text-red-600'}`}
            >
              {total}/{paper.totalTarget} marks
            </span>
            {paper.seed ? <span className="text-xs text-slate-400">seed {paper.seed}</span> : null}
          </div>
          <div className="flex flex-col gap-3">
            {paper.slots.map((slot) => (
              <div key={slot.pos} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1 text-sm">
                  <span className="font-bold text-navy">Q{slot.pos}</span>
                  <span className="text-slate-500">{slot.topic}</span>
                  <span className="text-xs text-slate-400">target {slot.target}</span>
                  {slot.pick ? (
                    <span className="ml-auto text-xs font-semibold text-navy">
                      {slot.pick.schoolYear} · {slot.pick.total_marks} marks
                      {slot.pick.has_image ? ' · 🖼' : ''}
                      {!slot.pick.answer ? ' · ⚠ no answer' : ''}
                    </span>
                  ) : (
                    <span className="ml-auto text-xs font-semibold text-red-600">EMPTY SLOT</span>
                  )}
                </div>
                {slot.pick && (
                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">{slot.pick.preview}…</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => rerollSlot(slot)}
                    disabled={slotBusy === slot.pos || slot.pinned}
                    className="border border-slate-300 rounded px-2 py-1 font-semibold text-slate-600 disabled:opacity-40"
                  >
                    {slotBusy === slot.pos ? '…' : '↻ Reroll'}
                  </button>
                  <button
                    onClick={() => togglePin(slot)}
                    className={`border rounded px-2 py-1 font-semibold ${slot.pinned ? 'border-navy text-navy' : 'border-slate-300 text-slate-600'}`}
                  >
                    {slot.pinned ? '📌 Pinned' : 'Pin'}
                  </button>
                  {slot.alternates.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && swapAlternate(slot, e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 text-slate-600 max-w-72"
                    >
                      <option value="">Swap for…</option>
                      {slot.alternates.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.schoolYear} · {a.total_marks}mk · {a.preview.slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* drafts */}
      <h2 className="font-bold text-navy mb-2 text-sm">Drafts</h2>
      {drafts.length === 0 ? (
        <p className="text-xs text-slate-400">No drafts yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm">
              <button onClick={() => openDraft(d.id)} className="font-semibold text-navy hover:underline">
                {d.title}
              </button>
              <span className="text-xs text-slate-400">
                {d.total_marks} marks · {new Date(d.created_at).toLocaleDateString()} ·{' '}
                <span className="font-mono">{d.id.slice(0, 8)}</span>
              </span>
              <button onClick={() => deleteDraft(d.id)} className="ml-auto text-xs text-red-400 hover:text-red-600">
                delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
