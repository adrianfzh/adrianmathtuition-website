'use client';

// /admin/worksheet-picker — pick-and-choose worksheet builder (Adrian, 8 Oct 2026:
// "put the selected questions in a left panel, then I get to drag and drop to
// the right panel … allow me to see the solutions … once all is selected, I
// click done, and you generate the pdf/docx according to the worksheet skills").
//
// A session hands over its shortlist as `?ids=<uuid>,<uuid>,…&title=…&subtitle=…`;
// the page can also take pasted ids or a bank search. Left = candidates, right =
// the worksheet in print order; drag between the two or tap the arrows. Every
// card opens its worked solution the readable way (lib/solution-readability
// through components/SolutionText). Done → the PDF (lib/render-bot-worksheet,
// plain style) and the DOCX (lib/pick-worksheet-docx) from the SAME model
// (lib/pick-worksheet), so the two files never differ.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor,
  closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { mathHtml } from '@/lib/math-inline';
import SolutionText from '@/components/SolutionText';
import { fromDetail, flatParts, partLabel, partKey, ansLine, parseIds, fileStem, practiceFolderFor, joinMultilineMath, PRACTICE_FOLDERS, type PracticeFolder, type PickQuestion, type DetailRow } from '@/lib/pick-worksheet';

type Col = 'cands' | 'picked';
type Toast = { msg: string; kind: 'ok' | 'err' };

const LEVELS = ['JC2', 'JC1', 'AM', 'EM', 'S3_AM', 'S3_EM', 'S2', 'S1'];

/** A one-line excerpt for the drag ghost that never cuts inside maths: a
 *  `$…$` / `$$…$$` run is kept whole or dropped with the tail (9 Oct 2026 —
 *  "rendering errors": a stem cut mid-formula showed raw LaTeX). */
function excerpt(q: PickQuestion, n = 150): string {
  const first = q.stem || (q.parts[0] ? `(${q.parts[0].label}) ${q.parts[0].text}` : '');
  const clean = joinMultilineMath(first).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return clean;
  const tokens = clean.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g).filter(Boolean);
  let out = '';
  for (const t of tokens) {
    if (out.length + t.length > n) { out += t.startsWith('$') ? '' : t.slice(0, Math.max(0, n - out.length - 1)); break; }
    out += t;
  }
  return out.trimEnd() + '…';
}

// ── The whole question (stem, figures, parts with marks, the [Ans:] line) ────
// Shared by the card's "Show full question" fold and the solution viewer.
function QuestionBody({ q, size = 14 }: { q: PickQuestion; size?: number }) {
  const parts = flatParts(q.parts);
  return (
    <div className="leading-relaxed text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: size }}>
      {q.stem && <div className="mb-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: mathHtml(joinMultilineMath(q.stem)) }} />}
      {q.images.map((u) => <img key={u} src={u} alt="" className="max-w-[80%] block mx-auto my-2" />)}
      {parts.map(({ labels, part, depth }) => (
        <div key={labels.join('.')} className="mt-1.5" style={{ marginLeft: depth * 18 }}>
          {part.imagesBefore.map((u) => <img key={u} src={u} alt="" className="max-w-[70%] block my-2" />)}
          {(part.text || part.marks) && (
            <div className="flex gap-2">
              <span className="shrink-0 w-10">{partLabel(labels)}</span>
              <span className="flex-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: mathHtml(joinMultilineMath(part.text)) }} />
              {part.marks && <span className="shrink-0 text-slate-600">[{part.marks}]</span>}
            </div>
          )}
          {part.imagesAfter.map((u) => <img key={u} src={u} alt="" className="max-w-[70%] block my-2" />)}
        </div>
      ))}
      {ansLine(q) && <div className="mt-2 text-right" style={{ color: '#843C0C' }} dangerouslySetInnerHTML={{ __html: `[Ans: ${mathHtml(ansLine(q))}]` }} />}
    </div>
  );
}

// ── The drag ghost: a plain card, no sortable hooks (a sortable component inside
// DragOverlay re-registers forever → "Maximum update depth exceeded", 9 Oct 2026) ──
function GhostCard({ q }: { q: PickQuestion }) {
  return (
    <div className="bg-white border-2 border-indigo-400 rounded-lg px-2.5 py-2 shadow-xl w-80 rotate-1">
      <div className="text-[11px] text-slate-500 mb-0.5">{q.provenance}{q.marks != null ? ` [${q.marks}]` : ''}</div>
      <div className="text-[13px] text-slate-800 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(excerpt(q, 110)) }} />
    </div>
  );
}

// ── One card (sortable) ──────────────────────────────────────────────────────

function Card({ q, index, col, onMove, onDrop, reason }: {
  q: PickQuestion; index: number; col: Col; onMove: (id: string, to: Col) => void; onDrop?: (id: string) => void; reason?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, data: { col } });
  const [sol, setSol] = useState(false);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition, touchAction: 'none',
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 shadow-sm flex gap-2 items-start">
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 select-none pt-0.5 text-lg leading-none" title="Drag">⠿</span>
      <div className="flex-1 min-w-0">
        {/* The source line is a grab handle too — a bigger target than the dots. */}
        <div {...listeners} className="flex items-baseline gap-2 text-[11px] text-slate-500 mb-0.5 cursor-grab active:cursor-grabbing select-none" title="Drag to move">
          <span className="font-bold text-slate-400">{col === 'picked' ? `${index + 1}.` : ''}</span>
          <span className="truncate">{q.provenance}</span>
          {q.marks != null && <span className="shrink-0">[{q.marks}]</span>}
          {q.images.length + q.parts.reduce((s, p) => s + p.imagesBefore.length + p.imagesAfter.length, 0) > 0 && <span title="has a figure">🖼</span>}
        </div>
        {/* The buttons stay ABOVE the content so they do not move when the
            card unfolds (Adrian, 9 Oct 2026: "the dropdown remains at its
            original position"). */}
        {/* The whole question shows by default (Adrian, 9 Oct 2026: "just show
            full question by default. solutions keep hidden"). */}
        <div className="mb-1.5 flex gap-3">
          <button onClick={() => onMove(q.id, col === 'cands' ? 'picked' : 'cands')} className="text-[12px] font-semibold text-slate-600 hover:underline">
            {col === 'cands' ? 'Add →' : '← Back to candidates'}
          </button>
          {col === 'cands' && onDrop && (
            <button onClick={() => onDrop(q.id)} className="text-[12px] font-semibold text-slate-400 hover:text-red-600 hover:underline ml-auto" title="Take this question off the candidates (it can be brought back)">✕ Remove</button>
          )}
        </div>
        {reason && <div className="mb-1 text-[11px] italic text-indigo-700">Why: {reason}</div>}
        <div className="pr-1"><QuestionBody q={q} size={13} /></div>
        {/* The solution's own dropdown sits UNDER the question; the working unfolds below it. */}
        <div className="mt-1.5">
          <button onClick={() => setSol((v) => !v)} className="text-[12px] font-semibold text-indigo-700 hover:underline">{sol ? 'Hide solution ▴' : 'Solution ▾'}</button>
        </div>
        {sol && <SolutionBlock q={q} />}
      </div>
    </div>
  );
}

function Column({ col, title, items, onMove, onDrop, removedCount, onShowRemoved, reasons, empty }: {
  col: Col; title: string; items: PickQuestion[]; onMove: (id: string, to: Col) => void; onDrop?: (id: string) => void;
  removedCount?: number; onShowRemoved?: () => void; reasons?: Record<string, string>; empty: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  return (
    <section className="flex-1 min-w-0">
      <h2 className="text-sm font-bold text-slate-700 mb-2">{title} <span className="text-slate-400 font-normal">({items.length}{col === 'picked' && items.length ? ` · ${items.reduce((s, q) => s + (q.marks ?? 0), 0)} marks` : ''})</span>
        {!!removedCount && onShowRemoved && <button onClick={onShowRemoved} className="ml-3 text-xs font-normal text-slate-500 underline">{removedCount} removed · show</button>}
      </h2>
      <SortableContext id={col} items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex flex-col gap-2 min-h-[140px] rounded-xl p-2 border-2 border-dashed ${isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
          {items.map((q, i) => <Card key={q.id} q={q} index={i} col={col} onMove={onMove} onDrop={onDrop} reason={reasons?.[q.id]} />)}
          {!items.length && <div className="text-xs text-slate-400 text-center py-8">{empty}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

// ── The worked solution, readable (lib/solution-readability through SolutionText) ──
function SolutionBlock({ q }: { q: PickQuestion }) {
  const parts = flatParts(q.parts);
  const hasPartSolutions = Object.keys(q.partSolutions).length > 0;
  return (
    <div className="mt-3 pt-2 border-t border-slate-200">
      <h3 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-2">Worked solution</h3>
      <div className="text-[13px] text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
            {hasPartSolutions ? (
              parts.filter(({ labels }) => q.partSolutions[partKey(labels)] || q.partSolutionImages[partKey(labels)]).map(({ labels }) => (
                <div key={labels.join('.')} className="mb-4">
                  <div className="font-bold text-slate-700 mb-1">{partLabel(labels)}</div>
                  {q.partSolutions[partKey(labels)] && <SolutionText text={q.partSolutions[partKey(labels)]} answer={q.partAnswers[partKey(labels)] ?? null} showScheme />}
                  {q.partSolutionImages[partKey(labels)] && <img src={q.partSolutionImages[partKey(labels)]} alt={`sketch for ${partLabel(labels)}`} className="max-w-[70%] block my-2" />}
                </div>
              ))
            ) : q.solution ? (
              <SolutionText text={q.solution} partAnswers={q.partAnswers} answer={Object.keys(q.partAnswers).length ? null : q.answer || null} showScheme />
            ) : (
              <div className="text-slate-400 italic">No worked solution on file{ansLine(q) ? ' — the answer line above is all the bank holds.' : '.'}</div>
            )}
        {!hasPartSolutions && Object.entries(q.partSolutionImages).map(([k, u]) => (
          <div key={k} className="my-2"><div className="text-[12px] font-bold text-slate-600">({k.replace(/\./g, ')(')})</div><img src={u} alt={`sketch for part ${k}`} className="max-w-[70%] block" /></div>
        ))}
        {q.solutionImages.map((u) => <img key={u} src={u} alt="solution" className="max-w-full block my-2" />)}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function WorksheetPickerClient() {
  const params = useSearchParams();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [title, setTitle] = useState(params.get('title') ?? 'Revision Practice');
  const [subtitle, setSubtitle] = useState(params.get('subtitle') ?? '');
  const [workingSpace, setWorkingSpace] = useState(true);
  const [byId, setById] = useState<Map<string, PickQuestion>>(new Map());
  const [cands, setCands] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  type PickState = { title: string; subtitle: string; cands: string[]; picked: string[]; removed?: string[]; savedAt?: string };
  const [removed, setRemoved] = useState<string[]>([]);
  type Pick = { id: string; created_at: string; title: string; subtitle: string; note: string; source: string; question_ids: string[]; opened_at: string | null; state?: PickState | null };
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  // Which saved selection the two columns currently belong to. null while a
  // switch is loading, so the autosave can never write one selection's lists
  // under another's id (9 Oct 2026: switching A/V → Vectors saved the A/V list
  // as the Vectors state, 60 ids, and Vectors then "restored" to that).
  const [stateFor, setStateFor] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pickId, setPickId] = useState<string | null>(params.get('pick'));
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchLevel, setSearchLevel] = useState('JC2');
  const [searchCount, setSearchCount] = useState(10);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  /** Why the model picked a card (describe-search), shown on the card. */
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docxUrl, setDocxUrl] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [folder, setFolder] = useState<PracticeFolder | ''>('');
  const [fileName, setFileName] = useState('');
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const say = useCallback((msg: string, kind: Toast['kind'] = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); }, []);

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoginError('');
    const ok = await loginAdminSession(password);
    if (ok) setAuthed(true); else setLoginError('Incorrect password');
  }

  /** Fetch full rows for ids not yet loaded; append the new ones to `cands`. */
  const loadIds = useCallback(async (ids: string[], into: Col = 'cands') => {
    const fresh = ids.filter((id) => !byId.has(id));
    if (!fresh.length && !ids.length) return;
    setLoading(true);
    try {
      let add = new Map<string, PickQuestion>();
      if (fresh.length) {
        const r = await fetch(`/api/admin/questions?ids=${encodeURIComponent(fresh.join(','))}&solutions=all`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        add = new Map((d.questions as DetailRow[]).map((row) => [row.id, fromDetail(row)]));
        if (Array.isArray(d.missing) && d.missing.length) say(`${d.missing.length} id(s) not in the bank`, 'err');
        setById((m) => new Map([...m, ...add]));
      }
      const known = (id: string) => byId.has(id) || add.has(id);
      const setter = into === 'cands' ? setCands : setPicked;
      setter((cur) => [...cur, ...ids.filter((id) => known(id) && !cur.includes(id) && !(into === 'cands' ? picked : cands).includes(id))]);
    } catch (e) {
      say((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [byId, cands, picked, say]);

  // The URL's ids load once, into the candidates column.
  const urlIds = useMemo(() => parseIds(params.get('ids')), [params]);
  const [seeded, setSeeded] = useState(false);
  const loadPicks = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/worksheet-picker/picks');
      if (r.ok) setPicks(((await r.json()).picks ?? []) as Pick[]);
    } catch { /* the list is a convenience */ }
  }, []);
  const openPick = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/admin/worksheet-picker/picks?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const pk = d.pick as Pick;
      // A saved state counts only if every id in it belongs to this selection.
      const own = new Set(pk.question_ids);
      const raw = pk.state && Array.isArray(pk.state.cands) && Array.isArray(pk.state.picked) ? pk.state : null;
      const st = raw && [...raw.cands, ...raw.picked].every((id) => own.has(id)) && (raw.cands.length + raw.picked.length) > 0 ? raw : null;
      setStateFor(null);
      setTitle(st?.title || pk.title); setSubtitle(st?.subtitle ?? pk.subtitle); setPickId(pk.id);
      setCands([]); setPicked([]); setPdfUrl(null); setDocxUrl(null); setDocxBlob(null); setFiled([]);
      setRestoredAt(st?.savedAt ?? null);
      const rem = (st?.removed ?? []).filter((id) => own.has(id));
      setRemoved(rem);
      if (st) {
        // Where you left off: the two columns as they were, in order; any of
        // the selection's questions missing from the state go back to candidates
        // unless Adrian removed them.
        const seen = new Set([...st.cands, ...st.picked, ...rem]);
        await loadIds([...st.cands, ...pk.question_ids.filter((id) => !seen.has(id))], 'cands');
        await loadIds(st.picked, 'picked');
      } else {
        await loadIds(pk.question_ids);
      }
      setStateFor(pk.id);
      const u = new URL(window.location.href); u.search = `?pick=${pk.id}`; window.history.replaceState(null, '', u.toString());
    } catch (e) { say((e as Error).message, 'err'); }
  }, [loadIds, say]);
  useEffect(() => {
    if (!authed || seeded) return;
    setSeeded(true);
    void loadPicks();
    if (urlIds.length) void loadIds(urlIds);
    else if (pickId) void openPick(pickId);
  }, [authed, seeded, urlIds, loadIds, pickId, openPick, loadPicks]);

  /** Save the worksheet column (or, before any picking, the candidates) as a selection to reopen later. */
  async function saveSelection() {
    const ids = picked.length ? picked : cands;
    if (!ids.length) { say('Nothing to save yet', 'err'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/worksheet-picker/picks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || 'Revision Practice', subtitle: subtitle.trim(), question_ids: ids, source: 'picker', note: picked.length ? 'Saved from the picker (worksheet column)' : 'Saved from the picker (candidates)' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPickId(d.pick.id); setStateFor(d.pick.id); await loadPicks(); say('Selection saved');
    } catch (e) { say((e as Error).message, 'err'); } finally { setSaving(false); }
  }

  const colOf = (id: string): Col | null => (picked.includes(id) ? 'picked' : cands.includes(id) ? 'cands' : null);
  const move = useCallback((id: string, to: Col, index?: number) => {
    const from = colOf(id);
    if (!from || from === to) return;
    (from === 'cands' ? setCands : setPicked)((cur) => cur.filter((x) => x !== id));
    (to === 'cands' ? setCands : setPicked)((cur) => {
      const next = cur.filter((x) => x !== id);
      next.splice(index ?? next.length, 0, id);
      return next;
    });
    setPdfUrl(null); setDocxUrl(null); setDocxBlob(null); setFiled([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands, picked]);

  /** Take a candidate off the left panel; "n removed · show" puts them all back. */
  const dropCandidate = useCallback((id: string) => {
    setCands((cur) => cur.filter((x) => x !== id));
    setRemoved((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }, []);
  const showRemoved = useCallback(async () => {
    // Removed questions were never fetched on a restore, so load them (loadIds
    // appends to the candidates and skips ids already in either column).
    const ids = removed; setRemoved([]);
    await loadIds(ids, 'cands');
  }, [removed, loadIds]);

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  // Cross-column moves happen on DROP, not during drag-over: moving an item
  // between the two SortableContexts while the drag is live looped React
  // ("Maximum update depth exceeded", 9 Oct 2026). The ghost follows the
  // pointer and the target column highlights; within a column the cards
  // still slide live.
  function onDragOver() { /* no live moves across columns */ }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id); const overId = String(over.id);
    const from = colOf(id);
    const to: Col | null = overId === 'cands' || overId === 'picked' ? (overId as Col) : colOf(overId);
    if (!from || !to) return;
    if (from !== to) {
      const list = to === 'cands' ? cands : picked;
      const idx = list.indexOf(overId);
      move(id, to, idx >= 0 ? idx : undefined);
      return;
    }
    if (overId === id) return;
    const list = from === 'cands' ? cands : picked;
    const a = list.indexOf(id); const b = list.indexOf(overId);
    if (a >= 0 && b >= 0 && a !== b) (from === 'cands' ? setCands : setPicked)((cur) => arrayMove(cur, a, b));
    setPdfUrl(null); setDocxUrl(null);
  }

  async function addPasted() {
    const ids = parseIds(paste);
    if (!ids.length) { say('No uuids found in the box', 'err'); return; }
    await loadIds(ids); setPaste('');
  }
  /** Describe what you want in words; a model reads the bank's matching pool
   *  and picks — skills, settings, difficulty (Adrian, 9 Oct 2026). */
  async function runSearch() {
    if (!searchQ.trim()) return;
    setSearching(true); setSearchNote(null);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'describe-search', q: searchQ.trim(), level: searchLevel, count: searchCount, exclude: [...cands, ...picked, ...removed] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const res = (d.results as { id: string; reason: string }[]) ?? [];
      const ids = res.map((c) => c.id).filter((id) => !cands.includes(id) && !picked.includes(id));
      setSearchNote(`${res.length} picked from ${d.pool ?? '?'} matching bank questions${d.note ? ` — ${d.note}` : ''}`);
      if (!ids.length) { say('Nothing new for that description'); return; }
      setReasons((cur) => ({ ...cur, ...Object.fromEntries(res.map((c) => [c.id, c.reason])) }));
      await loadIds(ids);
      say(`${ids.length} added to candidates`);
    } catch (e) { say((e as Error).message, 'err'); } finally { setSearching(false); }
  }

  async function done() {
    if (!picked.length) { say('Drag some questions to the worksheet first', 'err'); return; }
    if (!title.trim()) { say('Give the sheet a title', 'err'); return; }
    setPdfUrl(null); setDocxUrl(null);
    const qs = picked.map((id) => byId.get(id)!).filter(Boolean);
    try {
      setBusy('Building the DOCX…');
      const { buildPickWorksheetDocx } = await import('@/lib/pick-worksheet-docx');
      const blob = await buildPickWorksheetDocx({ title: title.trim(), subtitle: subtitle.trim(), questions: qs, workingSpace });
      setDocxBlob(blob);
      setDocxUrl(URL.createObjectURL(blob));
      setFiled([]);
      if (!folder) setFolder(practiceFolderFor(qs.map((q) => q.level)) ?? 'JC');
      if (!fileName) setFileName(fileStem(title.trim()));
      setBusy('Rendering the PDF…');
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'worksheet', ids: picked, title: title.trim(), subtitle: subtitle.trim(), style: 'plain', answers: true, workspace: workingSpace }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPdfUrl(d.url);
      if (Array.isArray(d.warnings) && d.warnings.length) say(d.warnings.join(' · '), 'err');
      else say('Both files are ready');
    } catch (e) {
      say((e as Error).message, 'err');
    } finally { setBusy(null); }
  }

  /** Both files onto the kiosk's Practice shelf (Dropbox/Apps/AdrianMathNotes/Practice/<folder>). */
  async function fileToDropbox() {
    if (!docxBlob || !pdfUrl || !folder) { say('Build the files first', 'err'); return; }
    setFiling(true);
    try {
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) throw new Error(`Could not read the PDF (HTTP ${pdfRes.status})`);
      const fd = new FormData();
      fd.set('folder', folder);
      fd.set('name', fileStem(fileName || title));
      fd.set('docx', new File([docxBlob], 'sheet.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      fd.set('pdf', new File([await pdfRes.blob()], 'sheet.pdf', { type: 'application/pdf' }));
      const r = await fetch('/api/admin/worksheet-picker/file', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setFiled((d.filed as { path: string }[]).map((f) => f.path));
      say(d.errors?.length ? `Filed with a problem: ${d.errors.join('; ')}` : `Filed to ${d.folder}`, d.errors?.length ? 'err' : 'ok');
    } catch (e) { say((e as Error).message, 'err'); } finally { setFiling(false); }
  }

  // ── Save the state as you go (Adrian, 9 Oct 2026: "save the state so I can go
  // back to the same state even if I leave the page") ──────────────────────────
  // A saved selection keeps its state on the server (worksheet_picks.state); an
  // ad-hoc ?ids= page keeps it in this browser under the ids.
  const localKey = useMemo(() => (urlIds.length ? `picker:${urlIds.join(',')}` : null), [urlIds]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (seeded) setDirty(true); /* any change after seeding */ }, [cands, picked, removed, title, subtitle, seeded]);
  useEffect(() => {
    if (!dirty || loading) return;
    if (pickId && stateFor !== pickId) return;   // mid-switch: these lists are not this selection's
    const st: PickState = { title, subtitle, cands, picked, removed };
    const t = setTimeout(() => {
      if (pickId) {
        fetch('/api/admin/worksheet-picker/picks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pickId, state: st }) }).catch(() => {});
      } else if (localKey) {
        try { localStorage.setItem(localKey, JSON.stringify({ ...st, savedAt: new Date().toISOString() })); } catch { /* private window */ }
      }
    }, 700);
    return () => clearTimeout(t);
  }, [dirty, loading, title, subtitle, cands, picked, removed, pickId, localKey, stateFor]);
  // An ad-hoc page restores from the browser once its questions are in.
  const [localRestored, setLocalRestored] = useState(false);
  useEffect(() => {
    if (!seeded || localRestored || pickId || !localKey || loading || !byId.size) return;
    setLocalRestored(true);
    try {
      const raw = localStorage.getItem(localKey);
      if (!raw) return;
      const st = JSON.parse(raw) as PickState;
      if (Array.isArray(st.cands) && Array.isArray(st.picked) && [...st.cands, ...st.picked].every((id) => byId.has(id))) {
        setCands(st.cands); setPicked(st.picked); setRemoved((st.removed ?? []).filter((id) => byId.has(id))); if (st.title) setTitle(st.title); setSubtitle(st.subtitle ?? ''); setRestoredAt(st.savedAt ?? null);
      }
    } catch { /* ignore */ }
  }, [seeded, localRestored, pickId, localKey, loading, byId]);

  /** Back to the selection as it was handed over: every question a candidate, nothing picked. */
  async function restart() {
    if (!window.confirm('Restart this selection? The worksheet column is emptied and every question goes back to candidates.')) return;
    setPdfUrl(null); setDocxUrl(null); setDocxBlob(null); setFiled([]); setRestoredAt(null); setRemoved([]);
    if (pickId) {
      await fetch('/api/admin/worksheet-picker/picks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pickId, state: null, force: true }) }).catch(() => {});
      const pk = picks.find((p) => p.id === pickId);
      if (pk) { setTitle(pk.title); setSubtitle(pk.subtitle); setCands([...pk.question_ids].filter((id) => byId.has(id))); setPicked([]); setStateFor(pk.id); }
      else await openPick(pickId);
    } else {
      if (localKey) { try { localStorage.removeItem(localKey); } catch { /* ignore */ } }
      setCands([...urlIds].filter((id) => byId.has(id))); setPicked([]);
    }
    say('Restarted');
  }

  function shareLink() {
    const u = new URL(window.location.href);
    u.searchParams.set('ids', picked.join(','));
    u.searchParams.set('title', title); if (subtitle) u.searchParams.set('subtitle', subtitle); else u.searchParams.delete('subtitle');
    navigator.clipboard?.writeText(u.toString()).then(() => say('Link to this selection copied')).catch(() => say(u.toString()));
  }

  if (authed === null) return <div className="min-h-screen flex items-center justify-center text-slate-500">Checking session…</div>;
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md w-80">
          <h1 className="text-lg font-bold text-slate-800 mb-4">Worksheet Picker</h1>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" autoFocus />
          {loginError && <p className="text-red-600 text-xs mb-2">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-700">Log in</button>
        </form>
      </div>
    );
  }

  const candQs = cands.map((id) => byId.get(id)!).filter(Boolean);
  const pickQs = picked.map((id) => byId.get(id)!).filter(Boolean);
  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-24">
        <h1 className="text-xl font-bold mb-1">Worksheet picker</h1>
        <p className="text-sm text-slate-500 mb-4">Candidates on the left, the worksheet on the right. Drag between them (or tap Add / Remove), reorder on the right, every card shows its whole question; unfold Solution for the working, then press Done.</p>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end mb-4 bg-white border border-slate-200 rounded-xl p-3">
          <label className="text-xs text-slate-500">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="JC2 · Vectors (lines and planes)" className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-600 flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={workingSpace} onChange={(e) => setWorkingSpace(e.target.checked)} /> working space</label>
        </div>

        <details open={!cands.length && !picked.length} className="mb-4 bg-white border border-slate-200 rounded-xl p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">Recent selections <span className="font-normal text-slate-400">({picks.length})</span></summary>
          {picks.length ? (
            <ul className="mt-2 divide-y divide-slate-100">
              {picks.map((pk) => (
                <li key={pk.id} className={`py-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${pk.id === pickId ? 'bg-indigo-50/60 -mx-2 px-2 rounded' : ''}`}>
                  <button onClick={() => void openPick(pk.id)} className="font-semibold text-indigo-700 hover:underline text-left">{pk.title}</button>
                  {pk.subtitle && <span className="text-slate-500">{pk.subtitle}</span>}
                  <span className="text-xs text-slate-400">{pk.question_ids.length} questions · {new Date(pk.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · {pk.source}{pk.opened_at ? '' : ' · new'}</span>
                  {pk.note && <span className="w-full text-xs text-slate-500">{pk.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-500">No saved selections yet. A session saves one when it shortlists questions for you; Save selection (below) keeps your own.</p>
          )}
        </details>

        <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3 text-sm">
          <div className="font-semibold text-slate-700 mb-2">Find questions</div>
          <div className="flex gap-2">
            <select value={searchLevel} onChange={(e) => setSearchLevel(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }} placeholder="describe it: 'vectors in a real setting, a light ray off a mirror', 'reflection of a line in a plane', 'integration by parts twice'" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
            <select value={searchCount} onChange={(e) => setSearchCount(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" title="how many to pick">{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <button onClick={runSearch} disabled={searching || loading} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50 whitespace-nowrap">{searching ? 'Reading the bank…' : 'Find → candidates'}</button>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
            <span>A model reads the bank questions whose topic, sub-skill or text matches your words and picks the ones that fit; each pick shows why. 20–40 s.</span>
            {searchNote && <span className="text-slate-500">{searchNote}</span>}
          </div>
          {/* For a session or script handing over a list — Adrian uses the search above. */}
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-400">paste question ids</summary>
            <div className="mt-1 flex gap-2 items-start">
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="uuid, uuid, …" rows={2} className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono" />
              <button onClick={addPasted} disabled={loading} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">Add ids</button>
            </div>
          </details>
        </div>

        {loading && <div className="text-xs text-slate-500 mb-2">Loading questions…</div>}

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex flex-col md:flex-row gap-4">
            <Column col="cands" title="Candidates" items={candQs} onMove={move} onDrop={dropCandidate} removedCount={removed.length} onShowRemoved={() => { void showRemoved(); }} reasons={reasons} empty={urlIds.length || pickId ? 'All candidates are on the worksheet' : 'Open a recent selection above, or add candidates'} />
            <Column col="picked" title="Worksheet" items={pickQs} onMove={move} reasons={reasons} empty="Drag questions here, in print order" />
          </div>
          <DragOverlay dropAnimation={null}>{active ? <GhostCard q={active} /> : null}</DragOverlay>
        </DndContext>

        <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 backdrop-blur px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
            <button onClick={done} disabled={!!busy || !picked.length} className="bg-indigo-600 text-white font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-40">{busy ?? `Done — build PDF + DOCX (${picked.length})`}</button>
            {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-700 underline">Open PDF</a>}
            {docxUrl && <a href={docxUrl} download={`${fileStem(title)}.docx`} className="text-sm font-semibold text-indigo-700 underline">Download DOCX</a>}
            <button onClick={saveSelection} disabled={saving || (!picked.length && !cands.length)} className="text-sm text-slate-600 underline disabled:opacity-40">{saving ? 'Saving…' : 'Save as new selection'}</button>
            <button onClick={restart} disabled={!cands.length && !picked.length} className="text-sm text-slate-600 underline disabled:opacity-40">Restart</button>
            {restoredAt && <span className="text-xs text-slate-400">restored from {new Date(restoredAt).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={shareLink} disabled={!picked.length} className="text-sm text-slate-600 underline disabled:opacity-40 ml-auto">Copy link to this selection</button>
          </div>
          {docxBlob && pdfUrl && (
            <div className="max-w-6xl mx-auto mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">File to Dropbox Practice/</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value as PracticeFolder)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
                {PRACTICE_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="file name" className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-1 text-sm" />
              <button onClick={fileToDropbox} disabled={filing || !!filed.length} className="bg-emerald-600 text-white font-semibold rounded-lg px-4 py-1.5 text-sm disabled:opacity-40">{filing ? 'Filing…' : filed.length ? 'Filed ✓' : 'File .docx + .pdf'}</button>
              {filed.length > 0 && <span className="text-xs text-slate-500 truncate" title={filed.join('\n')}>{filed.map((p) => p.split('/').pop()).join(' · ')}</span>}
            </div>
          )}
        </div>

        {toast && <div className={`fixed top-3 right-3 z-50 text-sm px-3 py-2 rounded-lg shadow ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{toast.msg}</div>}
      </div>
    </div>
  );
}
