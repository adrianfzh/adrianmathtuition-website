// Staging workspace — full-screen 3-panel curation surface:
//   Bank (live search) → Pool (candidates) → Keep (shortlist).
// Drag a bank result into Pool (copies it in), drag between Pool↔Keep (moves). Keep cards get a
// section + R/E/P choice; "Add all" pushes every Keep card into the lesson then clears Keep.
// Backed by the localStorage staging store (client-only, survives reload, this computer).
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LessonBankPanel, BankQuestionCard, type BankQuestion } from './LessonBankPanel';
import {
  getStaged, subscribeStaging, removeStaged, setPane, toggleReject, reorderPane, setKind, setSection,
  clearStaging, clearRejected, getKeep, clearKeep, isStaged, addToStaging,
  type StagedItem, type StagePane, type StageKind,
} from '@/lib/staging-store';

const KIND_BTN: Record<StageKind, { label: string; on: string; off: string }> = {
  refresher: { label: 'R', on: 'bg-emerald-600 text-white border-emerald-600', off: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  worked_example: { label: 'E', on: 'bg-blue-600 text-white border-blue-600', off: 'border-blue-200 bg-blue-50 text-blue-700' },
  practice: { label: 'P', on: 'bg-orange-600 text-white border-orange-600', off: 'border-orange-200 bg-orange-50 text-orange-700' },
};

function StagedCard({ item, sections, onSend }: {
  item: StagedItem;
  sections: string[];
  onSend?: (q: BankQuestion, kind: StageKind, section: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.q.id, data: { pane: item.pane } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: 'none' as const };
  const section = item.section ?? sections[0] ?? 'Default';
  const kind = item.kind ?? 'worked_example';
  const noDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const isKeep = item.pane === 'keep';
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`rounded border cursor-grab active:cursor-grabbing ${item.rejected ? 'border-red-200 bg-red-50/40 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-100 bg-slate-50/60">
        <span className="text-slate-400 select-none" title="Drag this card">⠿</span>
        <span className="font-mono text-[11px] text-slate-600 truncate flex-1">{item.q.school} {item.q.year} P{item.q.paper} Q{item.q.question_number}</span>
        <button {...noDrag} onClick={() => toggleReject(item.q.id)} title={item.rejected ? 'Un-reject' : 'Reject'} className={`text-[10px] px-1.5 py-0.5 rounded border ${item.rejected ? 'bg-white text-slate-500 border-slate-300' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>{item.rejected ? '↺' : '✕'}</button>
        <button {...noDrag} onClick={() => removeStaged(item.q.id)} title="Remove from staging" className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-100">🗑</button>
      </div>
      <div className="p-1.5">
        <BankQuestionCard q={item.q} draggable={false} />
        {isKeep && (
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
            {onSend && <button onClick={() => onSend(item.q, kind, section)} className="ml-auto text-[10px] px-2 py-0.5 rounded bg-slate-700 text-white hover:bg-slate-800">Send →</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Pane({ title, pane, items, sections, hint, onSend }: {
  title: string; pane: StagePane; items: StagedItem[]; sections: string[]; hint: string;
  onSend?: (q: BankQuestion, kind: StageKind, section: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `pane-${pane}`, data: { pane } });
  return (
    <div className="flex-1 min-w-0 flex flex-col border border-slate-200 rounded bg-slate-50/40">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-[11px] text-slate-400">{items.length}</span>
        <span className="ml-auto text-[10px] text-slate-400">{hint}</span>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        <SortableContext items={items.map(i => i.q.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => <StagedCard key={item.q.id} item={item} sections={sections} onSend={onSend} />)}
        </SortableContext>
        {items.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-6">Drag questions here</p>}
      </div>
    </div>
  );
}

export function StagingPanel({ onClose, onInsert, sections, level, topics, auth }: {
  onClose: () => void;
  onInsert: (q: BankQuestion, kind: StageKind, section: string) => void;
  sections: string[];
  level: string;
  topics: string[];
  auth: string;
}) {
  const [items, setItems] = useState<StagedItem[]>(() => getStaged());
  const [showRejected, setShowRejected] = useState(false);
  useEffect(() => subscribeStaging(() => setItems(getStaged())), []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visible = useMemo(() => items.filter(i => showRejected || !i.rejected), [items, showRejected]);
  const pool = visible.filter(i => i.pane === 'pool');
  const keep = visible.filter(i => i.pane === 'keep');
  const rejectedCount = items.filter(i => i.rejected).length;

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
    if (from !== to) { setPane(activeId, to); return; }
    const inPane = items.filter(i => i.pane === from).sort((a, b) => a.order - b.order).map(i => i.q.id);
    const oi = inPane.indexOf(activeId), ni = inPane.indexOf(overId);
    if (oi === -1 || ni === -1) return;
    reorderPane(from, arrayMove(inPane, oi, ni));
  }

  function addAll() {
    const keepers = getKeep();
    if (keepers.length === 0) return;
    if (!confirm(`Add all ${keepers.length} shortlisted question${keepers.length > 1 ? 's' : ''} to the lesson?`)) return;
    for (const it of keepers) onInsert(it.q, it.kind ?? 'worked_example', it.section ?? sections[0] ?? 'Default');
    clearKeep();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50 shrink-0">
        <span className="text-sm font-semibold text-slate-800">🗂 Staging workspace</span>
        <span className="text-[11px] text-slate-400">Bank → drag into Pool → drag keepers into Keep → set R/E/P + section → Add all.</span>
        <span className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-slate-500 flex items-center gap-1"><input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} />show rejected ({rejectedCount})</label>
          {rejectedCount > 0 && <button onClick={clearRejected} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear rejected</button>}
          <button onClick={() => { if (confirm('Clear the entire staging tray?')) clearStaging(); }} className="text-[11px] px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">Clear all</button>
          <button onClick={addAll} disabled={keep.length === 0} className="text-[11px] px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 font-medium">＋ Add all to lesson ({keep.length})</button>
          <button onClick={onClose} className="text-[11px] px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700">Done</button>
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 flex gap-3 p-3">
          {/* Left: live Bank search — ☆ Stage drops a copy into Pool */}
          <div className="w-[340px] shrink-0 flex flex-col border border-slate-200 rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 shrink-0">Bank — search &amp; ☆ Stage</div>
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
          <Pane title="Pool — candidates" pane="pool" items={pool} sections={sections} hint="drag right to shortlist →" />
          <Pane title="Keep — shortlist" pane="keep" items={keep} sections={sections} hint="set R/E/P + section" onSend={onInsert} />
        </div>
      </DndContext>
    </div>
  );
}
