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
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor,
  closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { mathHtml } from '@/lib/math-inline';
import SolutionText from '@/components/SolutionText';
import { fromDetail, flatParts, partLabel, partKey, ansLine, parseIds, fileStem, practiceFolderFor, PRACTICE_FOLDERS, type PracticeFolder, type PickQuestion, type DetailRow } from '@/lib/pick-worksheet';

type Col = 'cands' | 'picked';
type Toast = { msg: string; kind: 'ok' | 'err' };

const LEVELS = ['JC2', 'JC1', 'AM', 'EM', 'S3_AM', 'S3_EM', 'S2', 'S1'];

function excerpt(q: PickQuestion, n = 150): string {
  const first = q.stem || (q.parts[0] ? `(${q.parts[0].label}) ${q.parts[0].text}` : '');
  const clean = first.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

// ── One card (sortable) ──────────────────────────────────────────────────────

function Card({ q, index, col, onMove, onOpen, overlay = false }: {
  q: PickQuestion; index: number; col: Col; onMove: (id: string, to: Col) => void; onOpen: (id: string) => void; overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, data: { col } });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition, touchAction: 'none',
    opacity: isDragging && !overlay ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 shadow-sm flex gap-2 items-start">
      <span {...attributes} {...listeners} className="cursor-grab text-slate-400 select-none pt-0.5" title="Drag">⠿</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 text-[11px] text-slate-500 mb-0.5">
          <span className="font-bold text-slate-400">{col === 'picked' ? `${index + 1}.` : ''}</span>
          <span className="truncate">{q.provenance}</span>
          {q.marks != null && <span className="shrink-0">[{q.marks}]</span>}
          {q.images.length + q.parts.reduce((s, p) => s + p.imagesBefore.length + p.imagesAfter.length, 0) > 0 && <span title="has a figure">🖼</span>}
        </div>
        <div className="text-[13px] text-slate-800 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(excerpt(q)) }} />
        <div className="mt-1.5 flex gap-2">
          <button onClick={() => onOpen(q.id)} className="text-[12px] font-semibold text-indigo-700 hover:underline">Question + solution</button>
          <button onClick={() => onMove(q.id, col === 'cands' ? 'picked' : 'cands')} className="text-[12px] font-semibold text-slate-600 hover:underline">
            {col === 'cands' ? 'Add →' : '← Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Column({ col, title, items, onMove, onOpen, empty }: {
  col: Col; title: string; items: PickQuestion[]; onMove: (id: string, to: Col) => void; onOpen: (id: string) => void; empty: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  return (
    <section className="flex-1 min-w-0">
      <h2 className="text-sm font-bold text-slate-700 mb-2">{title} <span className="text-slate-400 font-normal">({items.length}{col === 'picked' && items.length ? ` · ${items.reduce((s, q) => s + (q.marks ?? 0), 0)} marks` : ''})</span></h2>
      <SortableContext id={col} items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex flex-col gap-2 min-h-[140px] rounded-xl p-2 border-2 border-dashed ${isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
          {items.map((q, i) => <Card key={q.id} q={q} index={i} col={col} onMove={onMove} onOpen={onOpen} />)}
          {!items.length && <div className="text-xs text-slate-400 text-center py-8">{empty}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

// ── The question + solution viewer ───────────────────────────────────────────

function Viewer({ q, onClose }: { q: PickQuestion; onClose: () => void }) {
  const parts = flatParts(q.parts);
  const hasPartSolutions = Object.keys(q.partSolutions).length > 0;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">{q.provenance}{q.marks != null ? ` · ${q.marks} marks` : ''}{q.topics.length ? ` · ${q.topics.join(', ')}` : ''}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 text-lg px-2">✕</button>
        </div>
        <div className="px-5 py-4 text-[14px] leading-relaxed text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {q.stem && <div className="mb-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: mathHtml(q.stem) }} />}
          {q.images.map((u) => <img key={u} src={u} alt="" className="max-w-[80%] block mx-auto my-2" />)}
          {parts.map(({ labels, part, depth }) => (
            <div key={labels.join('.')} className="mt-1.5" style={{ marginLeft: depth * 18 }}>
              {part.imagesBefore.map((u) => <img key={u} src={u} alt="" className="max-w-[70%] block my-2" />)}
              {(part.text || part.marks) && (
                <div className="flex gap-2">
                  <span className="shrink-0 w-10">{partLabel(labels)}</span>
                  <span className="flex-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: mathHtml(part.text) }} />
                  {part.marks && <span className="shrink-0 text-slate-600">[{part.marks}]</span>}
                </div>
              )}
              {part.imagesAfter.map((u) => <img key={u} src={u} alt="" className="max-w-[70%] block my-2" />)}
            </div>
          ))}
          {ansLine(q) && <div className="mt-2 text-right" style={{ color: '#843C0C' }} dangerouslySetInnerHTML={{ __html: `[Ans: ${mathHtml(ansLine(q))}]` }} />}
        </div>
        <div className="px-5 pb-8">
          <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase border-b border-slate-200 pb-1 mb-3">Worked solution</h3>
          <div className="text-[14px] text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
            {hasPartSolutions ? (
              parts.filter(({ labels }) => q.partSolutions[partKey(labels)]).map(({ labels }) => (
                <div key={labels.join('.')} className="mb-4">
                  <div className="font-bold text-slate-700 mb-1">{partLabel(labels)}</div>
                  <SolutionText text={q.partSolutions[partKey(labels)]} answer={q.partAnswers[partKey(labels)] ?? null} showScheme />
                </div>
              ))
            ) : q.solution ? (
              <SolutionText text={q.solution} partAnswers={q.partAnswers} answer={Object.keys(q.partAnswers).length ? null : q.answer || null} showScheme />
            ) : (
              <div className="text-slate-400 italic">No worked solution on file{ansLine(q) ? ' — the answer line above is all the bank holds.' : '.'}</div>
            )}
            {q.solutionImages.map((u) => <img key={u} src={u} alt="solution" className="max-w-full block my-2" />)}
          </div>
        </div>
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
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [paste, setPaste] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchLevel, setSearchLevel] = useState('JC2');
  const [searching, setSearching] = useState(false);

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
        const r = await fetch(`/api/admin/questions?ids=${encodeURIComponent(fresh.join(','))}`);
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
  useEffect(() => {
    if (!authed || seeded) return;
    setSeeded(true);
    if (urlIds.length) void loadIds(urlIds);
  }, [authed, seeded, urlIds, loadIds]);

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

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const from = colOf(id);
    const to: Col | null = overId === 'cands' || overId === 'picked' ? (overId as Col) : colOf(overId);
    if (!from || !to || from === to) return;
    const list = to === 'cands' ? cands : picked;
    const idx = list.indexOf(overId);
    move(id, to, idx >= 0 ? idx : undefined);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id); const overId = String(over.id);
    const col = colOf(id);
    if (!col || overId === id) return;
    const list = col === 'cands' ? cands : picked;
    const a = list.indexOf(id); const b = list.indexOf(overId);
    if (a >= 0 && b >= 0 && a !== b) (col === 'cands' ? setCands : setPicked)((cur) => arrayMove(cur, a, b));
    setPdfUrl(null); setDocxUrl(null);
  }

  async function addPasted() {
    const ids = parseIds(paste);
    if (!ids.length) { say('No uuids found in the box', 'err'); return; }
    await loadIds(ids); setPaste('');
  }
  async function runSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/questions?q=${encodeURIComponent(searchQ.trim())}&level=${encodeURIComponent(searchLevel)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const ids = (d.results as { id: string }[]).map((c) => c.id).filter((id) => !byId.has(id));
      if (!ids.length) { say('Nothing new for that search'); return; }
      await loadIds(ids.slice(0, 30));
      say(`${Math.min(ids.length, 30)} added to candidates`);
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
  const openQ = open ? byId.get(open) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-24">
        <h1 className="text-xl font-bold mb-1">Worksheet picker</h1>
        <p className="text-sm text-slate-500 mb-4">Candidates on the left, the worksheet on the right. Drag between them (or tap Add / Remove), reorder on the right, open any card to read the question and its worked solution, then press Done.</p>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end mb-4 bg-white border border-slate-200 rounded-xl p-3">
          <label className="text-xs text-slate-500">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="JC2 · Vectors (lines and planes)" className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-600 flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={workingSpace} onChange={(e) => setWorkingSpace(e.target.checked)} /> working space</label>
        </div>

        <details className="mb-4 bg-white border border-slate-200 rounded-xl p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">Add candidates (paste ids, or search the bank)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="uuid, uuid, …" rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono" />
              <button onClick={addPasted} disabled={loading} className="mt-1 text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">Add ids</button>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <select value={searchLevel} onChange={(e) => setSearchLevel(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }} placeholder="search words (school, topic, phrase)" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs" />
              </div>
              <button onClick={runSearch} disabled={searching || loading} className="self-start text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">{searching ? 'Searching…' : 'Search → candidates'}</button>
            </div>
          </div>
        </details>

        {loading && <div className="text-xs text-slate-500 mb-2">Loading questions…</div>}

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex flex-col md:flex-row gap-4">
            <Column col="cands" title="Candidates" items={candQs} onMove={move} onOpen={setOpen} empty={urlIds.length ? 'All candidates are on the worksheet' : 'Open this page with ?ids=… or add candidates above'} />
            <Column col="picked" title="Worksheet" items={pickQs} onMove={move} onOpen={setOpen} empty="Drag questions here, in print order" />
          </div>
          <DragOverlay>{active ? <div className="w-80"><Card q={active} index={0} col="cands" onMove={() => {}} onOpen={() => {}} overlay /></div> : null}</DragOverlay>
        </DndContext>

        <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 backdrop-blur px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
            <button onClick={done} disabled={!!busy || !picked.length} className="bg-indigo-600 text-white font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-40">{busy ?? `Done — build PDF + DOCX (${picked.length})`}</button>
            {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-700 underline">Open PDF</a>}
            {docxUrl && <a href={docxUrl} download={`${fileStem(title)}.docx`} className="text-sm font-semibold text-indigo-700 underline">Download DOCX</a>}
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
        {openQ && <Viewer q={openQ} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}
