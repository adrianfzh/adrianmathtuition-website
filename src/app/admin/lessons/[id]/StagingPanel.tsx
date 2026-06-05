// Staging workspace — a full-width overlay for sifting candidate bank questions before committing
// them to a lesson. Two panes ("Pool" = all candidates, "Keep" = shortlist); drag between panes &
// reorder; star/reject; expand to read full question+solution; "send to lesson" into a section.
// Backed by the localStorage staging store (client-only, survives reload, this computer).
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BankQuestionCard, type BankQuestion } from './LessonBankPanel';
import {
  getStaged, subscribeStaging, removeStaged, setPane, toggleReject, reorderPane,
  clearStaging, clearRejected, type StagedItem, type StagePane,
} from '@/lib/staging-store';

type Kind = 'refresher' | 'worked_example' | 'practice';

function SortableStaged({ item, onInsert, sections }: {
  item: StagedItem;
  onInsert: (q: BankQuestion, kind: Kind, section: string) => void;
  sections: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.q.id, data: { pane: item.pane } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [section, setSection] = useState(sections[0] ?? 'Default');
  // Whole card is the drag handle. Interactive controls (buttons, select) stopPropagation on
  // pointerdown so clicking them doesn't start a drag.
  const noDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: 'none' }}
      {...attributes}
      {...listeners}
      className={`rounded border cursor-grab active:cursor-grabbing ${item.rejected ? 'border-red-200 bg-red-50/40 opacity-60' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-100 bg-slate-50/60">
        <span className="text-slate-400 select-none" title="Drag anywhere on this card to move / reorder">⠿</span>
        <span className="font-mono text-[11px] text-slate-600 truncate flex-1">{item.q.school} {item.q.year} P{item.q.paper} Q{item.q.question_number}</span>
        <button {...noDrag} onClick={() => toggleReject(item.q.id)} title={item.rejected ? 'Un-reject' : 'Reject'} className={`text-[10px] px-1.5 py-0.5 rounded border ${item.rejected ? 'bg-white text-slate-500 border-slate-300' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>{item.rejected ? '↺' : '✕'}</button>
        <button {...noDrag} onClick={() => removeStaged(item.q.id)} title="Remove from staging" className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-100">🗑</button>
      </div>
      <div className="p-1.5">
        <BankQuestionCard q={item.q} draggable={false} />
        <div className="flex items-center gap-1 mt-1 flex-wrap" {...noDrag}>
          <span className="text-[10px] text-slate-400">→ lesson:</span>
          <select value={section} onChange={e => setSection(e.target.value)} className="text-[10px] border border-slate-300 rounded px-1 py-px max-w-[140px]">
            {sections.length === 0 && <option value="Default">Default</option>}
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => onInsert(item.q, 'refresher', section)} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">R</button>
          <button onClick={() => onInsert(item.q, 'worked_example', section)} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">E</button>
          <button onClick={() => onInsert(item.q, 'practice', section)} className="text-[10px] px-1.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">P</button>
        </div>
      </div>
    </div>
  );
}

function Pane({ title, pane, items, onInsert, sections, hint }: {
  title: string; pane: StagePane; items: StagedItem[];
  onInsert: (q: BankQuestion, kind: Kind, section: string) => void;
  sections: string[]; hint: string;
}) {
  // Droppable target = the whole pane (so dropping on empty space still moves the card here).
  const { setNodeRef } = useDroppable({ id: `pane-${pane}`, data: { pane } });
  return (
    <div className="flex-1 min-w-0 flex flex-col border border-slate-200 rounded bg-slate-50/40">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-[11px] text-slate-400">{items.length}</span>
        <span className="ml-auto text-[10px] text-slate-400">{hint}</span>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        <SortableContext items={items.map(i => i.q.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => <SortableStaged key={item.q.id} item={item} onInsert={onInsert} sections={sections} />)}
        </SortableContext>
        {items.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-6">Drag questions here</p>}
      </div>
    </div>
  );
}

export function StagingPanel({ onClose, onInsert, sections }: {
  onClose: () => void;
  onInsert: (q: BankQuestion, kind: Kind, section: string) => void;
  sections: string[];
}) {
  const [items, setItems] = useState<StagedItem[]>(() => getStaged());
  const [showRejected, setShowRejected] = useState(false);
  useEffect(() => subscribeStaging(() => setItems(getStaged())), []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visible = useMemo(() => items.filter(i => showRejected || !i.rejected), [items, showRejected]);
  const pool = visible.filter(i => i.pane === 'pool');
  const keep = visible.filter(i => i.pane === 'keep');

  function paneOf(id: string): StagePane | null {
    if (id === 'pane-pool') return 'pool';
    if (id === 'pane-keep') return 'keep';
    return items.find(i => i.q.id === id)?.pane ?? null;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const from = items.find(i => i.q.id === activeId)?.pane;
    const to = paneOf(overId);
    if (!from || !to) return;
    if (from !== to) {
      setPane(activeId, to); // cross-pane move (appended to end of target pane)
      return;
    }
    // Reorder within the same pane.
    const inPane = items.filter(i => i.pane === from).sort((a, b) => a.order - b.order).map(i => i.q.id);
    const oi = inPane.indexOf(activeId);
    const ni = inPane.indexOf(overId);
    if (oi === -1 || ni === -1) return;
    reorderPane(from, arrayMove(inPane, oi, ni));
  }

  const rejectedCount = items.filter(i => i.rejected).length;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-stretch justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <span className="text-sm font-semibold text-slate-800">🗂 Staging workspace</span>
          <span className="text-[11px] text-slate-400">Pull questions from the Bank (☆ Stage), sift here, then send keepers to the lesson.</span>
          <span className="ml-auto flex items-center gap-2">
            <label className="text-[11px] text-slate-500 flex items-center gap-1"><input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} />show rejected ({rejectedCount})</label>
            {rejectedCount > 0 && <button onClick={clearRejected} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear rejected</button>}
            <button onClick={() => { if (confirm('Clear the entire staging tray?')) clearStaging(); }} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear all</button>
            <button onClick={onClose} className="text-[11px] px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700">Done</button>
          </span>
        </div>
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-10 text-center">
            Nothing staged yet.<br />In the Bank panel, click <strong className="mx-1">☆ Stage</strong> on questions to collect candidates here.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 flex gap-3 p-3">
              <Pane title="Pool — candidates" pane="pool" items={pool} onInsert={onInsert} sections={sections} hint="drag right to shortlist →" />
              <Pane title="Keep — shortlist" pane="keep" items={keep} onInsert={onInsert} sections={sections} hint="← back to pool" />
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
