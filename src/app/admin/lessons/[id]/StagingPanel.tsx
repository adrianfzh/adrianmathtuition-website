// Staging workspace — full-screen, resizable 3-panel curation surface:
//   Bank (live search) → Pool (candidates) → Keep (shortlist).
// Bank cards: ☆ Stage OR native-drag straight into a Pool/Keep pane. Pool↔Keep: dnd-kit drag of
// whole cards (with a DragOverlay preview). Keep cards: R/E/P + section + Send; "Add all" sends all.
// Backed by the localStorage staging store (client-only, survives reload, this computer).
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, useDroppable, DragOverlay,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LessonBankPanel, BankQuestionCard, type BankQuestion } from './LessonBankPanel';
import {
  getStaged, subscribeStaging, removeStaged, setPaneAt, moveAllToPane, toggleReject, reorderPane, setKind, setSection,
  clearStaging, clearRejected, getKeep, clearKeep, isStaged, addToStaging,
  undoStaging, redoStaging, stagingUndoTopSeq, stagingRedoTopSeq, clearStagingNoSnap, clearKeepNoSnap,
  setKindAll, setSectionAll,
  type StagedItem, type StagePane, type StageKind,
} from '@/lib/staging-store';

const KIND_BTN: Record<StageKind, { label: string; on: string; off: string }> = {
  refresher: { label: 'R', on: 'bg-emerald-600 text-white border-emerald-600', off: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  worked_example: { label: 'E', on: 'bg-blue-600 text-white border-blue-600', off: 'border-blue-200 bg-blue-50 text-blue-700' },
  practice: { label: 'P', on: 'bg-orange-600 text-white border-orange-600', off: 'border-orange-200 bg-orange-50 text-orange-700' },
};

const WIDTHS_KEY = 'lesson_staging_widths_v1';

function StagedCard({ item, sections, onSend, auth, autoKind }: {
  item: StagedItem;
  sections: string[];
  onSend?: (q: BankQuestion, kind: StageKind, section: string) => void;
  auth?: string;
  /** Pane-enforced kind (Pool=E / Keep=P mode) — Send uses this over the card's chip. */
  autoKind?: StageKind;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.q.id, data: { pane: item.pane } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: 'none' as const };
  const section = item.section ?? sections[0] ?? 'Default';
  const kind = item.kind ?? 'worked_example';
  const noDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const [sent, setSent] = useState(false);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} data-qid={item.q.id}
      className={`rounded border cursor-grab active:cursor-grabbing ${item.rejected ? 'border-red-200 bg-red-50/40 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-100 bg-slate-50/60">
        <span className="text-slate-400 select-none" title="Drag this card">⠿</span>
        <span className="font-mono text-[11px] text-slate-600 truncate flex-1">{item.q.school} {item.q.year} P{item.q.paper} Q{item.q.question_number}</span>
        <button {...noDrag} onClick={() => toggleReject(item.q.id)} title={item.rejected ? 'Unhide (bring back)' : 'Hide from view (kept in tray, reversible)'} className={`text-[10px] px-1.5 py-0.5 rounded border ${item.rejected ? 'bg-white text-slate-500 border-slate-300' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>{item.rejected ? '↺ unhide' : '✕ hide'}</button>
        <button {...noDrag} onClick={() => removeStaged(item.q.id)} title="Remove from staging entirely (delete from tray)" className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-100">🗑 remove</button>
      </div>
      <div className="p-1.5">
        <BankQuestionCard q={item.q} draggable={false} auth={auth} />
        {/* R/E/P + section on BOTH panes (pre-classify in the Pool); Send → only where onSend is wired (Keep). */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap" {...noDrag}>
            <span className="text-[10px] text-slate-400">as</span>
            {(['refresher', 'worked_example', 'practice'] as StageKind[]).map(k => (
              <button key={k} onClick={() => setKind(item.q.id, k)}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${kind === k ? KIND_BTN[k].on : KIND_BTN[k].off}`}>{KIND_BTN[k].label}</button>
            ))}
            <span className="text-[10px] text-slate-400 ml-1">in</span>
            <select value={section} onChange={e => setSection(item.q.id, e.target.value)} className="text-[10px] border border-slate-300 rounded px-1 py-px max-w-[130px]">
              {sections.length === 0 && <option value="Default">Default</option>}
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {onSend && <button
              onClick={() => { onSend(item.q, autoKind ?? kind, section); setSent(true); setTimeout(() => removeStaged(item.q.id), 500); }}
              title={autoKind ? `Send to the lesson as ${KIND_BTN[autoKind].label} (pane mode)` : 'Send to the lesson with the chosen R/E/P + section'}
              className={`ml-auto text-[10px] px-2 py-0.5 rounded text-white ${sent ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-slate-800'}`}
            >{sent ? '✓ sent' : 'Send →'}</button>}
          </div>
      </div>
    </div>
  );
}

function Pane({ title, pane, items, sections, hint, onSend, style, headerActions, autoKind, auth }: {
  title: string; pane: StagePane; items: StagedItem[]; sections: string[]; hint: string;
  onSend?: (q: BankQuestion, kind: StageKind, section: string) => void;
  style?: React.CSSProperties;
  headerActions?: React.ReactNode;
  /** When set, anything dropped into this pane is auto-assigned this kind (Pool=E / Keep=P mode). */
  autoKind?: StageKind;
  auth?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `pane-${pane}`, data: { pane } });
  const [bankOver, setBankOver] = useState(false);
  // Persist + restore this pane's scroll position across refresh (localStorage, debounced).
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(`lesson_staging_scroll_${pane}`));
      if (v > 0 && scrollEl.current) scrollEl.current.scrollTop = v;
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function onPaneScroll(e: React.UIEvent<HTMLDivElement>) {
    const top = e.currentTarget.scrollTop;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      try { localStorage.setItem(`lesson_staging_scroll_${pane}`, String(top)); } catch { /* ignore */ }
    }, 300);
  }
  // Accept native HTML5 drops from the Bank list (bank cards set application/x-bank-question).
  function onDrop(e: React.DragEvent) {
    const payload = e.dataTransfer.getData('application/x-bank-question');
    if (!payload) return;
    e.preventDefault();
    setBankOver(false);
    try {
      const q = JSON.parse(payload) as BankQuestion;
      addToStaging(q);       // no-op if already staged
      // Insert AT the drop position: the first card whose vertical midpoint is below the cursor
      // becomes the card we insert before; none → append at the bottom.
      const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-qid]'));
      let beforeId: string | null = null;
      for (const el of cards) {
        if (el.dataset.qid === q.id) continue;
        const r = el.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { beforeId = el.dataset.qid ?? null; break; }
      }
      setPaneAt(q.id, pane, beforeId);
      if (autoKind) setKind(q.id, autoKind);
    } catch { /* ignore */ }
  }
  return (
    <div className="min-w-0 flex flex-col border border-slate-200 rounded bg-slate-50/40" style={style}>
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-[11px] text-slate-400">{items.length}</span>
        {headerActions}
        <span className="ml-auto text-[10px] text-slate-400">{hint}</span>
      </div>
      <div
        ref={(el) => { setNodeRef(el); scrollEl.current = el; }}
        onScroll={onPaneScroll}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-bank-question')) { e.preventDefault(); setBankOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setBankOver(false); }}
        onDrop={onDrop}
        className={`flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] ${(isOver || bankOver) ? 'outline outline-2 outline-dashed outline-blue-400 bg-blue-50/40' : ''}`}
      >
        <SortableContext items={items.map(i => i.q.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => <StagedCard key={item.q.id} item={item} sections={sections} onSend={onSend} auth={auth} autoKind={autoKind} />)}
        </SortableContext>
        {items.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-6">Drag questions here</p>}
      </div>
    </div>
  );
}

// Vertical drag handle between columns.
function Divider({ onDrag }: { onDrag: (dx: number) => void }) {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        let last = e.clientX;
        const onMove = (ev: PointerEvent) => { onDrag(ev.clientX - last); last = ev.clientX; };
        const up = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', up);
      }}
      className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-blue-400 rounded"
      title="Drag to resize"
    />
  );
}

export function StagingPanel({ onClose, onInsert, onInsertBatch, onUndoLesson, onRedoLesson, lessonUndoTopSeq, lessonRedoTopSeq, sections, level, topics, auth }: {
  onClose: () => void;
  onInsert: (q: BankQuestion, kind: StageKind, section: string) => void;
  onInsertBatch?: (items: { q: BankQuestion; kind: StageKind; section: string }[]) => void;
  onUndoLesson?: () => void;
  onRedoLesson?: () => void;
  lessonUndoTopSeq?: () => number;
  lessonRedoTopSeq?: () => number;
  sections: string[];
  level: string;
  topics: string[];
  auth: string;
}) {
  const [items, setItems] = useState<StagedItem[]>(() => getStaged());
  const [showRejected, setShowRejected] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => subscribeStaging(() => setItems(getStaged())), []);

  // "Pool=E · Keep=P" mode: when ON, dropping into a pane auto-assigns the kind (middle pane =
  // worked examples, right pane = practice). OFF = kinds are set manually (default). Persisted.
  const [kindMode, setKindMode] = useState(false);
  useEffect(() => { try { setKindMode(localStorage.getItem('lesson_staging_kind_mode') === '1'); } catch { /* ignore */ } }, []);
  function toggleKindMode() {
    setKindMode(v => {
      const n = !v;
      try { localStorage.setItem('lesson_staging_kind_mode', n ? '1' : '0'); } catch { /* ignore */ }
      // Turning the mode ON applies it immediately: every Pool card becomes E, every Keep card P —
      // so cards staged earlier (or moved while the mode was off) match the pane they sit in.
      if (n) { setKindAll('pool', 'worked_example'); setKindAll('keep', 'practice'); }
      return n;
    });
  }

  // Unified undo/redo across BOTH stacks (tray actions + lesson actions like "Add all"). Each action
  // is stamped with a shared monotonic seq, so we act on whichever stack holds the most recent one.
  const doUndo = useCallback(() => {
    const traySeq = stagingUndoTopSeq();
    const lessonSeq = lessonUndoTopSeq ? lessonUndoTopSeq() : -1;
    if (traySeq < 0 && lessonSeq < 0) return false;
    if (lessonSeq > traySeq) { onUndoLesson?.(); return true; }
    return undoStaging();
  }, [onUndoLesson, lessonUndoTopSeq]);
  const doRedo = useCallback(() => {
    const traySeq = stagingRedoTopSeq();
    const lessonSeq = lessonRedoTopSeq ? lessonRedoTopSeq() : -1;
    if (traySeq < 0 && lessonSeq < 0) return false;
    if (lessonSeq > traySeq) { onRedoLesson?.(); return true; }
    return redoStaging();
  }, [onRedoLesson, lessonRedoTopSeq]);
  // Force a re-render after an action so the Undo/Redo buttons' disabled state refreshes.
  const [, force] = useState(0);
  useEffect(() => subscribeStaging(() => force(n => n + 1)), []);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) = redo, while the workspace is open. Capture
  // phase so a handled key doesn't also hit the editor's own global handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { if (doUndo()) { e.preventDefault(); e.stopPropagation(); } }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { if (doRedo()) { e.preventDefault(); e.stopPropagation(); } }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [doUndo, doRedo]);

  // Column widths (px for bank + pool; keep takes the rest). Persisted.
  const [bankW, setBankW] = useState(340);
  const [poolW, setPoolW] = useState(420);
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}'); if (s.bankW) setBankW(s.bankW); if (s.poolW) setPoolW(s.poolW); } catch { /* ignore */ }
  }, []);
  const persist = useRef<ReturnType<typeof setTimeout> | null>(null);
  function saveWidths(b: number, p: number) {
    if (persist.current) clearTimeout(persist.current);
    persist.current = setTimeout(() => { try { localStorage.setItem(WIDTHS_KEY, JSON.stringify({ bankW: b, poolW: p })); } catch { /* ignore */ } }, 300);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visible = useMemo(() => items.filter(i => showRejected || !i.rejected), [items, showRejected]);
  const pool = visible.filter(i => i.pane === 'pool');
  const keep = visible.filter(i => i.pane === 'keep');
  const rejectedCount = items.filter(i => i.rejected).length;
  const activeItem = activeId ? items.find(i => i.q.id === activeId) : null;

  function paneOf(id: string): StagePane | null {
    if (id === 'pane-pool') return 'pool';
    if (id === 'pane-keep') return 'keep';
    return items.find(i => i.q.id === id)?.pane ?? null;
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const from = items.find(i => i.q.id === activeId)?.pane;
    const to = paneOf(overId);
    if (!from || !to) return;
    if (from !== to) {
      // Dropped over a specific card in the other pane → land right there; over empty space → append.
      const overIsCard = overId !== 'pane-pool' && overId !== 'pane-keep';
      setPaneAt(activeId, to, overIsCard ? overId : null);
      if (kindMode) setKind(activeId, to === 'pool' ? 'worked_example' : 'practice');
      return;
    }
    const inPane = items.filter(i => i.pane === from).sort((a, b) => a.order - b.order).map(i => i.q.id);
    const oi = inPane.indexOf(activeId), ni = inPane.indexOf(overId);
    if (oi === -1 || ni === -1) return;
    reorderPane(from, arrayMove(inPane, oi, ni));
  }

  // How many cards "Add all" would send: in Pool=E/Keep=P mode BOTH panes go (pane decides the
  // kind); otherwise only the Keep shortlist goes (per-card kind).
  const addAllCount = kindMode ? items.filter(i => !i.rejected).length : items.filter(i => i.pane === 'keep' && !i.rejected).length;

  function addAll() {
    const sec = (it: StagedItem) => it.section ?? sections[0] ?? 'Default';
    const batch = kindMode
      ? [
          ...items.filter(i => i.pane === 'pool' && !i.rejected).sort((a, b) => a.order - b.order)
            .map(it => ({ q: it.q, kind: 'worked_example' as StageKind, section: sec(it) })),
          ...items.filter(i => i.pane === 'keep' && !i.rejected).sort((a, b) => a.order - b.order)
            .map(it => ({ q: it.q, kind: 'practice' as StageKind, section: sec(it) })),
        ]
      : getKeep().map(it => ({ q: it.q, kind: it.kind ?? 'worked_example' as StageKind, section: sec(it) }));
    if (batch.length === 0) return;
    if (onInsertBatch) {
      onInsertBatch(batch); // the editor clears the tray itself (carried on its single undo entry)
    } else {
      for (const b of batch) onInsert(b.q, b.kind, b.section);
      if (kindMode) clearStagingNoSnap(); else clearKeepNoSnap();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50 shrink-0">
        <span className="text-sm font-semibold text-slate-800">🗂 Staging workspace</span>
        <span className="text-[11px] text-slate-400">Bank → Pool → Keep. ✕ hide (reversible) · 🗑 remove = delete from tray.</span>
        <span className="ml-auto flex items-center gap-2">
          <label
            className={`text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded border ${kindMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-transparent text-slate-500'}`}
            title="When ON: anything dropped into the middle pane becomes a worked Example (E), anything dropped into the right pane becomes Practice (P). OFF = set kinds manually."
          ><input type="checkbox" checked={kindMode} onChange={toggleKindMode} />Pool=E · Keep=P</label>
          <label className="text-[11px] text-slate-500 flex items-center gap-1"><input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} />show hidden ({rejectedCount})</label>
          <button onClick={doUndo} disabled={stagingUndoTopSeq() < 0 && (lessonUndoTopSeq ? lessonUndoTopSeq() : -1) < 0} title="Undo the last action (Ctrl/Cmd+Z)" className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40">↩ Undo</button>
          <button onClick={doRedo} disabled={stagingRedoTopSeq() < 0 && (lessonRedoTopSeq ? lessonRedoTopSeq() : -1) < 0} title="Redo (Ctrl/Cmd+Shift+Z)" className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40">↪ Redo</button>
          {rejectedCount > 0 && <button onClick={clearRejected} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear hidden</button>}
          <button onClick={() => { if (confirm('Clear the entire staging tray?')) clearStaging(); }} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear all</button>
          <button
            onClick={addAll}
            disabled={addAllCount === 0}
            title={kindMode ? 'Adds BOTH panes: Pool cards as Examples, Keep cards as Practice' : 'Adds the Keep shortlist (per-card R/E/P)'}
            className="text-[11px] px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 font-medium"
          >＋ Add all to lesson ({addAllCount})</button>
          <button onClick={onClose} className="text-[11px] px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700">Done</button>
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex-1 min-h-0 flex gap-0 p-3">
          {/* Left: live Bank — ☆ Stage adds to Pool, or native-drag a card into Pool/Keep */}
          <div className="shrink-0 flex flex-col border border-slate-200 rounded overflow-hidden" style={{ width: bankW }}>
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 shrink-0">Bank — search, ☆ Stage or drag →</div>
            <div className="flex-1 min-h-0">
              <LessonBankPanel
                level={level}
                topics={topics}
                auth={auth}
                onStage={(q) => addToStaging(q)}
                isStaged={(id) => isStaged(id)}
              />
            </div>
          </div>
          <Divider onDrag={(dx) => setBankW(w => { const n = Math.max(220, Math.min(700, w + dx)); saveWidths(n, poolW); return n; })} />
          <Pane
            title={kindMode ? 'Pool — examples (E)' : 'Pool — candidates'} pane="pool" items={pool} sections={sections}
            hint="drag right to shortlist →" style={{ width: poolW }} auth={auth} onSend={onInsert}
            autoKind={kindMode ? 'worked_example' : undefined}
            headerActions={pool.length > 0 && (
              <button onClick={() => { moveAllToPane('pool', 'keep'); if (kindMode) setKindAll('keep', 'practice'); }} title="Move every Pool card into the shortlist" className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">shortlist all →</button>
            )}
          />
          <Divider onDrag={(dx) => setPoolW(w => { const n = Math.max(260, w + dx); saveWidths(bankW, n); return n; })} />
          <Pane
            title={kindMode ? 'Keep — practice (P)' : 'Keep — shortlist'} pane="keep" items={keep} sections={sections}
            hint="set R/E/P + section" onSend={onInsert} style={{ flex: 1 }} auth={auth}
            autoKind={kindMode ? 'practice' : undefined}
            headerActions={keep.length > 0 && (
              <>
                <button onClick={() => { moveAllToPane('keep', 'pool'); if (kindMode) setKindAll('pool', 'worked_example'); }} title="Move every shortlisted card back to the Pool" className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100">← all to pool</button>
                <button onClick={() => { if (confirm(`Remove all ${keep.length} shortlisted question${keep.length > 1 ? 's' : ''} from the tray?`)) clearKeep(); }} title="Delete every shortlisted card from the tray" className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 bg-red-50 hover:bg-red-100">clear</button>
                <span className="flex items-center gap-1 ml-2" title="Apply to ALL shortlisted cards at once">
                  <span className="text-[10px] text-slate-400">all as</span>
                  {(['refresher', 'worked_example', 'practice'] as StageKind[]).map(k => (
                    <button key={k} onClick={() => setKindAll('keep', k)} title={`Set every shortlisted card to ${KIND_BTN[k].label}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${KIND_BTN[k].off} hover:ring-1 hover:ring-slate-400`}>{KIND_BTN[k].label}</button>
                  ))}
                  <span className="text-[10px] text-slate-400">in</span>
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) { setSectionAll('keep', e.target.value); e.currentTarget.value = ''; } }}
                    className="text-[10px] border border-slate-300 rounded px-1 py-px max-w-[120px]"
                  >
                    <option value="" disabled>section…</option>
                    {sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </span>
              </>
            )}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="rounded border border-blue-400 bg-white shadow-lg p-1.5 text-xs max-w-[420px]">
              <div className="font-mono text-[11px] text-slate-600 mb-1">{activeItem.q.school} {activeItem.q.year} P{activeItem.q.paper} Q{activeItem.q.question_number}</div>
              <BankQuestionCard q={activeItem.q} draggable={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
