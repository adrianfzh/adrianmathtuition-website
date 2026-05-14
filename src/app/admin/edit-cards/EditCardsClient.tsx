'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  useDroppable, type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardRow {
  id: string;
  subgroup_id: number;
  display_group: string | null;
  content_kind: string;
  order_index: number;
  card_title: string;
  is_published: boolean;
  source_kb_entry_id: string | null;
  content: string;
  content_length: number;
  updated_at: string;
}

interface Subgroup {
  id: number;
  name: string;
  description: string;
  card_count: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const LEVELS = ['AM', 'EM', 'JC', 'S1', 'S2'];

// ── Layout defaults ───────────────────────────────────────────────────────────

const LAYOUT_KEY = 'edit_cards_layout';
const DEFAULT_LAYOUT = { listWidth: 288, textareaWidth: 420, aiWidth: 240 };
const MIN = { list: 160, textarea: 200, ai: 160 };
const MAX = { list: 520, textarea: 900, ai: 420 };

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) return { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT;
}

// ── Resize handle ─────────────────────────────────────────────────────────────

function ResizeHandle({ onDelta }: { onDelta: (delta: number) => void }) {
  const onDeltaRef = useRef(onDelta);
  useEffect(() => { onDeltaRef.current = onDelta; }, [onDelta]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let lastX = e.clientX;

    function onMove(e: MouseEvent) {
      onDeltaRef.current(e.clientX - lastX);
      lastX = e.clientX;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-colors z-10"
    />
  );
}

// ── KaTeX ─────────────────────────────────────────────────────────────────────

const katexOptions = {
  strict: false, trust: true, throwOnError: false,
  output: 'htmlAndMathml' as const,
  macros: { '\\tfrac': '\\frac' },
};

function fixMathFences(src: string): string {
  return src
    .replace(/\$\$(?=\S)/g, () => '$$\n')
    .replace(/([^\n\s])\$\$/g, (_, c: string) => `${c}\n$$`);
}

// ── Cookie helper ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── Simple line diff ──────────────────────────────────────────────────────────

interface DiffLine { type: 'same' | 'add' | 'remove'; text: string }

function computeDiff(original: string, updated: string): DiffLine[] {
  const a = original.split('\n'), b = updated.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) { result.push({ type: 'add', text: b[j] }); j++; }
    else { result.push({ type: 'remove', text: a[i] }); i++; }
  }
  return result;
}

// ── AI Quick actions ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Make clearer', instruction: 'Rewrite for clarity. Same content, same answer, but cleaner phrasing and tighter step transitions.' },
  { label: 'Shorten ~30%', instruction: 'Shorten by roughly 30%. Drop filler, keep every algebra step, keep the worked answer.' },
  { label: 'Add pitfall note', instruction: "At the end, add a brief 'Common pitfall:' line warning about the most likely student error in this kind of question." },
  { label: 'Add common-mistake', instruction: "Add a short '⚠ Watch out:' aside near the relevant step where students typically slip up." },
  { label: 'Add a sanity check', instruction: "Add a short final 'Check:' step that substitutes the answer back / verifies dimensions / spot-checks the result." },
  { label: 'Tighten algebra', instruction: 'Tighten the algebra steps — combine micro-steps that students can do in one line, but keep enough scaffolding that the logic is followable.' },
  { label: 'Use a fresh example', instruction: "Same sub-skill, different numbers and surface. Don't reuse the same coefficients/values. Rewrite the whole card with a new example." },
  { label: 'Add a why-this-works', instruction: 'Add one sentence at the top explaining *why* this method works, before diving into steps.' },
];

// ── Custom collision detection ────────────────────────────────────────────────
// Routes section-header drags to only collide with other sec-hdr- droppables,
// and card drags to only collide with card chips + sec-zone- droppables.
// Without this, closestCenter finds the wrong target when the pools are mixed.
const customCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (activeId.startsWith('sec-hdr-')) {
    // Section drags only collide with other section headers (both kinds)
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => String(c.id).startsWith('sec-hdr-')
      ),
    });
  }
  // Card drags: exclude section headers; include card chips, zones, and panels
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => !String(c.id).startsWith('sec-hdr-')
    ),
  });
};

// ── Sortable card row ──────────────────────────────────────────────────────────

function SortableCardRow({ card, isSelected, onSelect }: { card: CardRow; isSelected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, touchAction: 'none' as const };
  return (
    <div
      ref={setNodeRef} style={style} onClick={() => onSelect(card.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer border transition-colors ${isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
    >
      <span {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0" title="Drag to reorder">⠿</span>
      <span className="text-slate-400 text-xs w-4 shrink-0">{card.order_index}.</span>
      <span className="flex-1 text-sm text-slate-800 min-w-0 leading-snug">{card.card_title || <em className="text-slate-400">Untitled</em>}</span>
      <span className="text-xs text-slate-400 bg-slate-100 px-1 rounded shrink-0 font-mono">sg{card.subgroup_id}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${card.is_published ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
        {card.is_published ? 'Pub' : 'Draft'}
      </span>
    </div>
  );
}

function DragCardOverlay({ card }: { card: CardRow }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-400 rounded shadow-lg opacity-90">
      <span className="text-slate-300">⠿</span>
      <span className="text-sm text-slate-800 truncate">{card.card_title || 'Untitled'}</span>
    </div>
  );
}

// ── Section header — display_group-based rename + delete ─────────────────────

function SectionHeader({
  name, cardCount, level, topic, auth, dragHandleProps, onRenamed, onDeleted,
}: {
  name: string; cardCount: number; level: string; topic: string; auth: string;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  onRenamed: (oldName: string, newName: string) => void;
  onDeleted: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [saving, setSaving] = useState(false);
  const [renameErr, setRenameErr] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function handleSave() {
    const trimmed = editName.trim();
    if (!trimmed) { setRenameErr('Name is required'); return; }
    setSaving(true); setRenameErr('');
    try {
      const res = await fetch('/api/admin/cards/sections/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, oldName: name, newName: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onRenamed(name, trimmed);
      setEditing(false);
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true); setDeleteErr('');
    try {
      const res = await fetch('/api/admin/cards/sections/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onDeleted(name);
      setShowDeleteConfirm(false);
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : 'Failed');
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 mb-1.5 px-1">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 border border-blue-400 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setEditing(false); setEditName(name); setRenameErr(''); }
            }}
          />
          <button onClick={handleSave} disabled={saving} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? '…' : '✓'}
          </button>
          <button onClick={() => { setEditing(false); setEditName(name); setRenameErr(''); }} className="text-xs px-2 py-0.5 border border-slate-300 rounded hover:bg-slate-50">
            ✗
          </button>
        </div>
        {renameErr && <p className="text-red-600 text-xs px-1">{renameErr}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="group flex items-center gap-1 mb-1.5 px-1 min-w-0">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder section"
          >⠿</span>
        )}
        <span
          className="text-xs font-semibold text-slate-500 truncate flex-1 min-w-0"
          title="Student-facing section name. Renaming updates the swipe app immediately."
        >
          {name} <span className="font-normal text-slate-400">({cardCount})</span>
        </span>
        <button
          onClick={() => { setEditing(true); setEditName(name); }}
          className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
          title="Rename section"
        >✎</button>
        {cardCount === 0 && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
            title="Delete empty section"
          >🗑</button>
        )}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteConfirm(false); setDeleteErr(''); } }}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-slate-800 mb-2">Delete &ldquo;{name}&rdquo;?</h2>
            <p className="text-sm text-slate-600 mb-4">This section is empty. Deleting it removes it from the sidebar. No cards are affected.</p>
            {deleteErr && <p className="text-red-600 text-sm mb-3">{deleteErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteErr(''); }} disabled={deleting} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Droppable section zone (cross-section card drop target, keyed by display_group) ──

function DroppableSectionZone({ name, kindPrefix = 'we', children, isDragActive }: { name: string; kindPrefix?: 'we' | 'rf'; children: React.ReactNode; isDragActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sec-zone-${kindPrefix}-${name}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-6 rounded transition-colors ${isDragActive && isOver ? 'outline outline-2 outline-dashed outline-blue-400 bg-blue-50' : ''}`}
    >
      {children}
    </div>
  );
}

// ── Panel-level droppable (catches cross-kind drops anywhere on the panel) ─────

function DroppablePanel({ id, isCrossKindTarget, children }: { id: string; isCrossKindTarget: boolean; children?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-4 rounded transition-colors ${isCrossKindTarget && isOver ? 'bg-indigo-50 outline outline-2 outline-dashed outline-indigo-400' : ''}`}
    >
      {children}
    </div>
  );
}

// ── New card modal ─────────────────────────────────────────────────────────────

function NewCardModal({ subgroups: initialSubgroups, sections: initialSections, level, topic, onClose, onCreated, onSubgroupCreated, auth }: {
  subgroups: Subgroup[]; sections: string[]; level: string; topic: string;
  onClose: () => void; onCreated: (id: string) => void;
  onSubgroupCreated: (sg: Subgroup) => void;
  auth: string;
}) {
  const [subgroups, setSubgroups] = useState<Subgroup[]>(initialSubgroups);
  const [sgId, setSgId] = useState<number | '__new__'>(initialSubgroups[0]?.id ?? 0);
  // Section (display_group) for the new card
  const [section, setSection] = useState<string | '__new__'>(initialSections[0] ?? '');
  const [newSectionName, setNewSectionName] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  // New-subgroup inline form state
  const [newSgName, setNewSgName] = useState('');
  const [newSgDesc, setNewSgDesc] = useState('');
  const [creatingSg, setCreatingSg] = useState(false);
  const [sgErr, setSgErr] = useState('');

  async function createNewSubgroup() {
    if (!newSgName.trim()) { setSgErr('Name is required'); return; }
    setCreatingSg(true); setSgErr('');
    try {
      const res = await fetch('/api/admin/cards/subgroups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, name: newSgName.trim(), description: newSgDesc.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create sub-group');
      const newSg: Subgroup = { id: json.id, name: json.name, description: json.description ?? '', card_count: 0 };
      setSubgroups((prev) => [...prev, newSg].sort((a, b) => a.id - b.id));
      setSgId(newSg.id);
      setNewSgName(''); setNewSgDesc('');
      onSubgroupCreated(newSg);
    } catch (e: unknown) {
      setSgErr(e instanceof Error ? e.message : 'Failed');
    } finally { setCreatingSg(false); }
  }

  async function create() {
    if (typeof sgId !== 'number' || !sgId) {
      setErr(sgId === '__new__' ? 'Save the new sub-group first' : 'Pick a sub-group');
      return;
    }
    const resolvedSection = section === '__new__' ? newSectionName.trim() : section;
    if (!resolvedSection) { setErr('Pick or name a section'); return; }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/admin/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, subgroup_id: sgId, card_title: title, display_group: resolvedSection }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json.id);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setCreating(false); }
  }

  const isNewSg = sgId === '__new__';
  const isNewSection = section === '__new__';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">New card</h2>
        <div className="space-y-4">
          {/* Section (display_group) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Section <span className="text-slate-400 font-normal text-xs">(student-facing)</span></label>
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={section}
              onChange={(e) => setSection(e.target.value === '__new__' ? '__new__' : e.target.value)}
            >
              {initialSections.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__new__">+ New section…</option>
            </select>
            {isNewSection && (
              <input
                type="text"
                className="mt-1 w-full border border-slate-300 rounded px-3 py-1.5 text-sm"
                placeholder="Section name"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                autoFocus
              />
            )}
          </div>

          {/* Sub-group (QB labelling) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sub-group <span className="text-slate-400 font-normal text-xs">(QB labelling)</span></label>
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={sgId}
              onChange={(e) => {
                const v = e.target.value;
                setSgId(v === '__new__' ? '__new__' : Number(v));
              }}
            >
              {subgroups.map((sg) => (
                <option key={sg.id} value={sg.id}>{sg.name} (sg{sg.id})</option>
              ))}
              <option value="__new__">+ New sub-group…</option>
            </select>
          </div>

          {isNewSg && (
            <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sub-group name <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="e.g. Simplifying nested surds"
                  value={newSgName}
                  onChange={(e) => setNewSgName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-slate-400">(optional)</span></label>
                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="What kind of question falls under this sub-skill?"
                  value={newSgDesc}
                  onChange={(e) => setNewSgDesc(e.target.value)}
                />
              </div>
              {sgErr && <p className="text-red-600 text-xs">{sgErr}</p>}
              <div className="flex gap-2 items-center">
                <button onClick={createNewSubgroup} disabled={creatingSg} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {creatingSg ? 'Saving…' : 'Save sub-group'}
                </button>
                <button onClick={() => { setSgId(initialSubgroups[0]?.id ?? subgroups[0]?.id ?? 0); setNewSgName(''); setNewSgDesc(''); setSgErr(''); }} className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Card title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. Simplify √72"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isNewSg) create(); }}
            />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} disabled={creating || isNewSg} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{creating ? 'Creating…' : 'Create card'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable section wrapper (section drag-to-reorder) ────────────────────────

function SortableSectionWrapper({
  name, kindPrefix = 'we', children, level, topic, auth, onRenamed, onDeleted, cardCount,
}: {
  name: string; kindPrefix?: 'we' | 'rf'; children: React.ReactNode;
  level: string; topic: string; auth: string;
  cardCount: number;
  onRenamed: (oldName: string, newName: string) => void;
  onDeleted: (name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `sec-hdr-${kindPrefix}-${name}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <SectionHeader
        name={name}
        cardCount={cardCount}
        level={level}
        topic={topic}
        auth={auth}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLSpanElement>}
        onRenamed={onRenamed}
        onDeleted={onDeleted}
      />
      {children}
    </div>
  );
}

// ── New section modal (Feature 5) ─────────────────────────────────────────────

// NewSectionModal — UI-only. Sections are implicit (no DB row); just adds the name
// to local state. The section appears in the sidebar immediately and persists once
// a card is dragged or created into it.
function NewSectionModal({ level, topic, existingSections, onClose, onCreated }: {
  level: string; topic: string; existingSections: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Name is required'); return; }
    if (existingSections.includes(trimmed)) { setErr('A section with that name already exists'); return; }
    onCreated(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">New section</h2>
        <p className="text-xs text-slate-500 mb-4">Adds an empty section under <span className="font-medium">{level} · {topic}</span>. Drag cards into it or create a card directly in it. The section persists once it has at least one card.</p>
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Simplifying surds"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onClose(); }}
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Add section</button>
        </div>
      </div>
    </div>
  );
}

// ── New refresher modal ───────────────────────────────────────────────────────

function NewRefresherModal({ subgroups, defaultSgId, level, topic, auth, onClose, onCreated }: {
  subgroups: Subgroup[]; defaultSgId: number | null;
  level: string; topic: string; auth: string;
  onClose: () => void;
  onCreated: (card: CardRow) => void;
}) {
  const [sgId, setSgId] = useState<number>(defaultSgId ?? subgroups[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function create() {
    if (!sgId) { setErr('Pick a sub-group'); return; }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/admin/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, subgroup_id: sgId, card_title: title, content_kind: 'refresher' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json as CardRow);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setCreating(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">🧠 New refresher card</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sub-group <span className="text-slate-400 font-normal text-xs">(QB labelling)</span></label>
            <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={sgId} onChange={(e) => setSgId(Number(e.target.value))}>
              {subgroups.map((sg) => <option key={sg.id} value={sg.id}>{sg.name} (sg{sg.id})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Card title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input ref={inputRef} type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="e.g. Surd form a√b — key conditions" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} disabled={creating} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Refresher panel ───────────────────────────────────────────────────────────

// RefresherPanel: no DndContext — participates in parent's single DndContext.
// Groups cards by display_group (null display_group = flat zone at bottom).
function RefresherPanel({
  cards, subgroups, auth, selectedId, level, topic,
  activeDragId, isCrossKindDrag,
  onSelectCard, onCardCreated, onRenamed, onDeleted,
}: {
  cards: CardRow[]; subgroups: Subgroup[]; auth: string; selectedId: string | null;
  level: string; topic: string;
  activeDragId: string | null; isCrossKindDrag: boolean;
  onSelectCard: (id: string) => void;
  onCardCreated: (card: CardRow) => void;
  onRenamed: (oldName: string, newName: string) => void;
  onDeleted: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Group cards by display_group; null → '' (flat zone)
  const sections = [...new Set(cards.map((c) => c.display_group ?? ''))].sort();
  const cardsBySection: Record<string, CardRow[]> = {};
  for (const c of cards) {
    const key = c.display_group ?? '';
    if (!cardsBySection[key]) cardsBySection[key] = [];
    cardsBySection[key].push(c);
  }

  const isCardDrag = !!activeDragId && !String(activeDragId).startsWith('sec-hdr-');

  return (
    <div className="mb-2">
      {/* Panel header */}
      <div className={`flex items-center gap-1 px-1 py-1.5 rounded transition-colors ${isCrossKindDrag ? 'bg-blue-50' : ''}`}>
        <button onClick={() => setExpanded((v) => !v)} className="text-xs text-slate-400 shrink-0">{expanded ? '▾' : '▸'}</button>
        <span className="text-xs font-semibold text-blue-700 flex-1">🧠 Refresher <span className="font-normal text-slate-400">({cards.length})</span></span>
        <button onClick={() => setShowModal(true)} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ New</button>
      </div>

      {expanded && (
        <div className="space-y-2">
          {cards.length === 0 ? (
            <DroppablePanel id="panel-rf" isCrossKindTarget={isCrossKindDrag}>
              <p className="px-3 py-2 text-xs text-slate-400 italic">No refresher cards yet — click + New or drag a card here.</p>
            </DroppablePanel>
          ) : (
            <SortableContext items={sections.map((s) => `sec-hdr-rf-${s || '__flat__'}`)} strategy={verticalListSortingStrategy}>
              {sections.map((sectionKey) => {
                const sectionCards = cardsBySection[sectionKey] ?? [];
                if (sectionKey === '') {
                  // Flat (no display_group) — show without section header
                  return (
                    <div key="__flat__">
                      <DroppableSectionZone name="__flat__" kindPrefix="rf" isDragActive={isCardDrag}>
                        <SortableContext items={sectionCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1">
                            {sectionCards.map((card) => (
                              <SortableCardRow key={card.id} card={card} isSelected={selectedId === card.id} onSelect={onSelectCard} />
                            ))}
                          </div>
                        </SortableContext>
                      </DroppableSectionZone>
                    </div>
                  );
                }
                return (
                  <SortableSectionWrapper
                    key={sectionKey}
                    name={sectionKey}
                    kindPrefix="rf"
                    cardCount={sectionCards.length}
                    level={level}
                    topic={topic}
                    auth={auth}
                    onRenamed={onRenamed}
                    onDeleted={onDeleted}
                  >
                    <DroppableSectionZone name={sectionKey} kindPrefix="rf" isDragActive={isCardDrag}>
                      <SortableContext items={sectionCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {sectionCards.map((card) => (
                            <SortableCardRow key={card.id} card={card} isSelected={selectedId === card.id} onSelect={onSelectCard} />
                          ))}
                        </div>
                      </SortableContext>
                    </DroppableSectionZone>
                  </SortableSectionWrapper>
                );
              })}
            </SortableContext>
          )}
          {/* Panel-level drop zone at bottom (catches drops past all sections) */}
          <DroppablePanel id="panel-rf" isCrossKindTarget={isCrossKindDrag && cards.length > 0} />
        </div>
      )}

      {showModal && (
        <NewRefresherModal
          subgroups={subgroups}
          defaultSgId={null}
          level={level}
          topic={topic}
          auth={auth}
          onClose={() => setShowModal(false)}
          onCreated={(card) => { onCardCreated(card); setShowModal(false); onSelectCard(card.id); }}
        />
      )}
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────

function DeleteModal({ onConfirm, onCancel, deleting }: { onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Delete this card?</h2>
        <p className="text-sm text-slate-600 mb-6">This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={deleting} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ── AI Sidebar ────────────────────────────────────────────────────────────────

function AISidebar({ cardId, level, topic, subgroup, content, title, contentKind, auth, onAccept }: {
  cardId: string; level: string; topic: string; subgroup: Subgroup | undefined;
  content: string; title: string; contentKind: string; auth: string; onAccept: (c: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [aiError, setAiError] = useState('');
  const abortRef = useRef<(() => void) | null>(null);
  const prevCardId = useRef(cardId);

  useEffect(() => {
    if (prevCardId.current !== cardId) {
      prevCardId.current = cardId;
      setDiffLines(null); setAiResult(''); setAiError('');
    }
  }, [cardId]);

  const runAI = useCallback(async (instruction: string) => {
    if (streaming) { abortRef.current?.(); return; }
    setStreaming(true); setAiResult(''); setDiffLines(null); setAiError('');
    let result = '', aborted = false;
    const controller = new AbortController();
    abortRef.current = () => { aborted = true; controller.abort(); };
    try {
      const res = await fetch('/api/edit-cards-ai', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, currentTitle: title, currentContent: content, level, topic, subgroupName: subgroup?.name ?? '', subgroupDescription: subgroup?.description ?? '', content_kind: contentKind, password: auth }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`); }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const data = JSON.parse(part.slice(6));
          if (data.error) throw new Error(data.error);
          if (data.done) break;
          if (data.chunk) { result += data.chunk; setAiResult(result); }
        }
      }
      if (!aborted && result) setDiffLines(computeDiff(content, result));
    } catch (e: unknown) {
      if (!aborted) setAiError(e instanceof Error ? e.message : 'AI error');
    } finally { setStreaming(false); abortRef.current = null; }
  }, [streaming, title, content, level, topic, subgroup, auth]);

  function handleAccept() { if (!aiResult) return; onAccept(aiResult); setDiffLines(null); setAiResult(''); setPrompt(''); }
  function handleReject() { setDiffLines(null); setAiResult(''); setPrompt(''); }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">✨ AI assist</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Quick actions</p>
          <div className="space-y-1">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.label} onClick={() => runAI(qa.instruction)} disabled={streaming} className="w-full text-left text-xs px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">{qa.label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Or describe a change:</p>
          <textarea className="w-full border border-slate-300 rounded px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} placeholder="e.g. Split into two cards…" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={streaming} />
          <button onClick={() => runAI(prompt)} disabled={!prompt.trim() || streaming} className="mt-1.5 w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
            {streaming ? 'Streaming… (click to cancel)' : 'Send to AI →'}
          </button>
        </div>
        {aiError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{aiError}</p>}
        {streaming && aiResult && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Streaming…</p>
            <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-slate-600">{aiResult}</div>
          </div>
        )}
        {diffLines && !streaming && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Diff preview</p>
            <div className="text-xs font-mono border border-slate-200 rounded overflow-hidden max-h-56 overflow-y-auto">
              {diffLines.map((line, i) => (
                <div key={i} className={`px-2 py-px whitespace-pre-wrap leading-relaxed ${line.type === 'add' ? 'bg-green-50 text-green-800' : line.type === 'remove' ? 'bg-red-50 text-red-700 line-through' : 'text-slate-500'}`}>
                  {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}{line.text}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={handleAccept} className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Accept</button>
              <button onClick={handleReject} className="flex-1 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50">Reject</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline editor panel ───────────────────────────────────────────────────────

function EditorPanel({ initialCard, subgroups, allCards, level, topic, auth,
  textareaWidth, aiWidth, aiOpen,
  onSaved, onDeleted, onNavigate, onTextareaResize, onAiResize, onAiToggle,
}: {
  initialCard: CardRow; subgroups: Subgroup[]; allCards: CardRow[];
  level: string; topic: string; auth: string;
  textareaWidth: number; aiWidth: number; aiOpen: boolean;
  onSaved: (updated: Pick<CardRow, 'id' | 'card_title' | 'is_published' | 'subgroup_id' | 'order_index' | 'content'>) => void;
  onDeleted: (id: string) => void;
  onNavigate: (id: string) => void;
  onTextareaResize: (delta: number) => void;
  onAiResize: (delta: number) => void;
  onAiToggle: () => void;
}) {
  const [title, setTitle] = useState(initialCard.card_title);
  const [content, setContent] = useState(initialCard.content);
  const [sgId, setSgId] = useState(initialCard.subgroup_id);
  const [orderIndex, setOrderIndex] = useState(initialCard.order_index);
  const [isPublished, setIsPublished] = useState(initialCard.is_published);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [previewContent, setPreviewContent] = useState(initialCard.content);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = initialCard.id;

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewContent(content), 200);
  }, [content]);

  const doSave = useCallback(async (fields: { card_title: string; content: string; subgroup_id: number; order_index: number; is_published: boolean }) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/admin/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      setSaveStatus('saved');
      onSaved({ id: cardId, ...fields });
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2500);
    } catch { setSaveStatus('error'); }
  }, [cardId, auth, onSaved]);

  const scheduleSave = useCallback((fields: { card_title: string; content: string; subgroup_id: number; order_index: number; is_published: boolean }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(fields), 800);
  }, [doSave]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    scheduleSave({ card_title: title, content, subgroup_id: sgId, order_index: orderIndex, is_published: isPublished });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, sgId, orderIndex, isPublished]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        doSave({ card_title: title, content, subgroup_id: sgId, order_index: orderIndex, is_published: isPublished });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSave, title, content, sgId, orderIndex, isPublished]);

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const next = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      setContent(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/cards/${cardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${auth}` } });
      if (!res.ok) throw new Error();
      onDeleted(cardId);
    } catch { setDeleting(false); setShowDelete(false); }
  }

  const currentSubgroup = subgroups.find((sg) => sg.id === sgId);
  const siblings = allCards.filter((c) => c.subgroup_id === sgId).sort((a, b) => a.order_index - b.order_index);
  const sibIdx = siblings.findIndex((s) => s.id === cardId);
  const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSib = sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-header */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3">
        <span className="text-xs text-slate-500 truncate min-w-0">sg{sgId} · {currentSubgroup?.name ?? '…'} · Card {sibIdx + 1} of {siblings.length}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {saveStatus === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved ✓</span>}
          {saveStatus === 'error' && <span className="text-xs text-red-600">Error</span>}
          <button onClick={() => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } doSave({ card_title: title, content, subgroup_id: sgId, order_index: orderIndex, is_published: isPublished }); }} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
          <button onClick={onAiToggle} className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50">{aiOpen ? 'Hide AI' : '✨ AI'}</button>
        </div>
      </div>

      {/* Meta */}
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 bg-white space-y-2">
        <input type="text" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Card title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select className="border border-slate-300 rounded px-2 py-1" value={sgId} onChange={(e) => setSgId(Number(e.target.value))}>
            {subgroups.map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-slate-600">Order <input type="number" className="border border-slate-300 rounded px-2 py-1 w-14" value={orderIndex} onChange={(e) => setOrderIndex(Number(e.target.value))} min={1} /></label>
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600"><input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Published</label>
          {initialCard.source_kb_entry_id && <span className="text-slate-400">🔗 KB entry</span>}
        </div>
      </div>

      {/* Editing area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Textarea */}
        <div className="flex flex-col min-w-0 overflow-hidden" style={{ width: textareaWidth, flexShrink: 0 }}>
          <div className="px-3 py-1 bg-slate-50 border-b border-r border-slate-200 text-xs text-slate-500">Markdown + LaTeX</div>
          <textarea className="flex-1 resize-none px-3 py-2.5 text-sm font-mono focus:outline-none bg-white leading-relaxed border-r border-slate-200" value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={handleTextareaKeyDown} spellCheck={false} />
        </div>

        <ResizeHandle onDelta={onTextareaResize} />

        {/* Preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-3 py-1 bg-slate-50 border-b border-r border-slate-200 text-xs text-slate-500">Live preview</div>
          <div className="flex-1 overflow-y-auto px-4 py-3 bg-white prose prose-sm max-w-none border-r border-slate-200">
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[[rehypeKatex, katexOptions]]}>
              {fixMathFences(previewContent)}
            </ReactMarkdown>
          </div>
        </div>

        {/* AI sidebar */}
        {aiOpen && (
          <>
            <ResizeHandle onDelta={onAiResize} />
            <div className="flex flex-col overflow-hidden bg-white" style={{ width: aiWidth, flexShrink: 0 }}>
              <AISidebar cardId={cardId} level={level} topic={topic} subgroup={currentSubgroup} content={content} title={title} contentKind={initialCard.content_kind} auth={auth} onAccept={(c) => setContent(c)} />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between">
        <button onClick={() => setShowDelete(true)} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700">Delete card</button>
        <div className="flex gap-2">
          <button onClick={() => prevSib && onNavigate(prevSib.id)} disabled={!prevSib} title={prevSib?.card_title ?? ''} className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30">← Prev</button>
          <button onClick={() => nextSib && onNavigate(nextSib.id)} disabled={!nextSib} title={nextSib?.card_title ?? ''} className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30">Next →</button>
        </div>
      </div>

      {showDelete && <DeleteModal onConfirm={handleDelete} onCancel={() => setShowDelete(false)} deleting={deleting} />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EditCardsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw') || '';
  const auth = pw;

  const [level, setLevel] = useState(searchParams.get('level') || '');
  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [subgroupFilter, setSubgroupFilter] = useState(searchParams.get('subgroup') || '');
  const [unpublishedOnly, setUnpublishedOnly] = useState(false);

  const [topics, setTopics] = useState<string[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [refresherCards, setRefresherCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reorderStatus, setReorderStatus] = useState<Record<number, SaveStatus>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [showNewSectionModal, setShowNewSectionModal] = useState(false);
  const [localSections, setLocalSections] = useState<string[]>([]); // UI-only empty sections
  const [sectionOrder, setSectionOrder] = useState<string[]>([]); // persisted order from sections_meta
  const [activeDragKind, setActiveDragKind] = useState<string | null>(null); // kind of item being dragged
  const [toast, setToast] = useState<string | null>(null); // cross-kind drop toast
  const [activeId, setActiveId] = useState<string | null>(null);

  // Panel widths — loaded from localStorage once on mount
  const [listWidth, setListWidth] = useState(DEFAULT_LAYOUT.listWidth);
  const [textareaWidth, setTextareaWidth] = useState(DEFAULT_LAYOUT.textareaWidth);
  const [aiWidth, setAiWidth] = useState(DEFAULT_LAYOUT.aiWidth);
  const [aiOpen, setAiOpen] = useState(true);
  const layoutLoaded = useRef(false);

  const reorderTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!pw) { window.location.href = '/admin'; return; }

    // Load layout
    if (!layoutLoaded.current) {
      layoutLoaded.current = true;
      const l = loadLayout();
      setListWidth(l.listWidth);
      setTextareaWidth(l.textareaWidth);
      setAiWidth(l.aiWidth);
    }

    // Load filters
    const saved = localStorage.getItem('edit_cards_filters');
    if (saved) {
      try {
        const f = JSON.parse(saved);
        if (!searchParams.get('level') && f.level) setLevel(f.level);
        if (!searchParams.get('topic') && f.topic) setTopic(f.topic);
        if (!searchParams.get('subgroup') && f.subgroup) setSubgroupFilter(f.subgroup);
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist layout on change
  useEffect(() => {
    if (!layoutLoaded.current) return;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ listWidth, textareaWidth, aiWidth }));
  }, [listWidth, textareaWidth, aiWidth]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (topic) params.set('topic', topic);
    if (subgroupFilter) params.set('subgroup', subgroupFilter);
    router.replace(`/admin/edit-cards?${params.toString()}`, { scroll: false });
    localStorage.setItem('edit_cards_filters', JSON.stringify({ level, topic, subgroup: subgroupFilter }));
  }, [level, topic, subgroupFilter, router]);

  useEffect(() => {
    if (!level) { setTopics([]); setTopic(''); return; }
    fetch(`/api/admin/cards/topics?level=${encodeURIComponent(level)}`, { headers: { Authorization: `Bearer ${auth}` } })
      .then((r) => r.json()).then((j) => setTopics(j.topics ?? [])).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const fetchCards = useCallback(async () => {
    if (!level || !topic) { setCards([]); setSubgroups([]); setRefresherCards([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ level, topic });
      if (subgroupFilter) params.set('subgroupId', subgroupFilter);
      const [weRes, rfRes] = await Promise.all([
        fetch(`/api/admin/cards/list?${params}`, { headers: { Authorization: `Bearer ${auth}` } }),
        fetch(`/api/admin/cards/list?${params}&kind=refresher`, { headers: { Authorization: `Bearer ${auth}` } }),
      ]);
      const [weJson, rfJson] = await Promise.all([weRes.json(), rfRes.json()]);
      setCards(weJson.cards ?? []);
      setSubgroups(weJson.subgroups ?? []);
      setSectionOrder(weJson.sectionOrder ?? []);
      setRefresherCards(rfJson.cards ?? []);
    } finally { setLoading(false); }
  }, [level, topic, subgroupFilter, auth]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  // Drag ID helpers
  function parseHdrId(id: string): { kind: string; name: string } | null {
    if (id.startsWith('sec-hdr-we-')) return { kind: 'worked_example', name: id.slice('sec-hdr-we-'.length) };
    if (id.startsWith('sec-hdr-rf-')) return { kind: 'refresher', name: id.slice('sec-hdr-rf-'.length) };
    return null;
  }
  function parseDropId(id: string, allCardsCombined: CardRow[]): { kind: string; section: string } | null {
    if (id.startsWith('sec-zone-we-')) return { kind: 'worked_example', section: id.slice('sec-zone-we-'.length) };
    if (id.startsWith('sec-zone-rf-')) return { kind: 'refresher', section: id.slice('sec-zone-rf-'.length) };
    if (id.startsWith('sec-hdr-we-')) return { kind: 'worked_example', section: id.slice('sec-hdr-we-'.length) };
    if (id.startsWith('sec-hdr-rf-')) return { kind: 'refresher', section: id.slice('sec-hdr-rf-'.length) };
    if (id === 'panel-we') return { kind: 'worked_example', section: '' };
    if (id === 'panel-rf') return { kind: 'refresher', section: '' };
    const card = allCardsCombined.find((c) => c.id === id);
    if (card) return { kind: card.content_kind, section: card.display_group ?? '' };
    return null;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => t === msg ? null : t), 2000);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    if (navigator.vibrate) navigator.vibrate(30);
    const hdr = parseHdrId(id);
    if (hdr) { setActiveDragKind(hdr.kind); return; }
    const found = [...cards, ...refresherCards].find((c) => c.id === id);
    setActiveDragKind(found?.content_kind ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setActiveDragKind(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const allCardsCombined = [...cards, ...refresherCards];

    // Section header drag
    const activeHdr = parseHdrId(activeIdStr);
    if (activeHdr) {
      const overHdr = parseHdrId(overIdStr);
      if (!overHdr) return;
      if (activeHdr.kind === overHdr.kind && activeHdr.kind === 'worked_example') {
        // Within-WE section reorder
        const oi = allSections.indexOf(activeHdr.name);
        const ni = allSections.indexOf(overHdr.name);
        if (oi === -1 || ni === -1) return;
        const reordered = arrayMove(allSections, oi, ni);
        setSectionOrder(reordered);
        fetch('/api/admin/cards/sections/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ level, topic, orderedNames: reordered }),
        }).catch(() => fetchCards());
      } else if (activeHdr.kind !== overHdr.kind) {
        // Cross-kind section move
        const srcKind = activeHdr.kind;
        const tgtKind = overHdr.kind;
        const movedSection = activeHdr.name;
        if (srcKind === 'refresher') {
          const moving = refresherCards.filter((c) => c.display_group === movedSection);
          setRefresherCards((prev) => prev.filter((c) => c.display_group !== movedSection));
          setCards((prev) => [...prev, ...moving.map((c) => ({ ...c, content_kind: 'worked_example' }))]);
        } else {
          const moving = cards.filter((c) => c.display_group === movedSection);
          setCards((prev) => prev.filter((c) => c.display_group !== movedSection));
          setRefresherCards((prev) => [...prev, ...moving.map((c) => ({ ...c, content_kind: 'refresher' }))]);
        }
        showToast(`Moved "${movedSection}" to ${tgtKind === 'refresher' ? '🧠 Refresher' : '💡 Worked Examples'}`);
        fetch('/api/admin/cards/sections/move-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ level, topic, displayGroup: movedSection, sourceKind: srcKind, targetKind: tgtKind }),
        }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => fetchCards());
      }
      return;
    }

    // Card drag
    const ac = allCardsCombined.find((c) => c.id === activeIdStr);
    if (!ac) return;
    const srcKind = ac.content_kind;
    const srcSection = ac.display_group ?? '';

    const dropTarget = parseDropId(overIdStr, allCardsCombined);
    if (!dropTarget) return;
    const tgtKind = dropTarget.kind;
    const tgtSection = dropTarget.section || srcSection; // fall back to srcSection on panel drops

    const isCrossKind = srcKind !== tgtKind;
    const isCrossSection = srcSection !== tgtSection;

    const srcList = srcKind === 'refresher' ? refresherCards : cards;
    const setSrcList = srcKind === 'refresher' ? setRefresherCards : setCards;
    const dstList = tgtKind === 'refresher' ? refresherCards : cards;
    const setDstList = tgtKind === 'refresher' ? setRefresherCards : setCards;

    if (!isCrossKind && !isCrossSection) {
      // Within-section reorder
      if (dropTarget.section !== undefined && overIdStr !== activeIdStr && !allCardsCombined.find(c => c.id === overIdStr)) return;
      if (overIdStr.startsWith('sec-') || overIdStr.startsWith('panel-')) return;
      const sectionCards = srcList.filter((c) => c.display_group === srcSection);
      const oi = sectionCards.findIndex((c) => c.id === activeIdStr);
      const ni = sectionCards.findIndex((c) => c.id === overIdStr);
      if (oi === -1 || ni === -1) return;
      const reordered = arrayMove(sectionCards, oi, ni);
      setSrcList((prev) => [...prev.filter((c) => c.display_group !== srcSection), ...reordered]);
      const sKey = `${srcKind === 'refresher' ? 'rf' : 'we'}-${srcSection}`;
      if (reorderTimers.current[sKey as unknown as number]) clearTimeout(reorderTimers.current[sKey as unknown as number]);
      setReorderStatus((s) => ({ ...s, [sKey]: 'saving' }));
      reorderTimers.current[sKey as unknown as number] = setTimeout(async () => {
        try {
          const res = await fetch('/api/admin/cards/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
            body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
          });
          if (!res.ok) throw new Error();
          setReorderStatus((s) => ({ ...s, [sKey]: 'saved' }));
          setTimeout(() => setReorderStatus((s) => ({ ...s, [sKey]: 'idle' })), 2000);
        } catch { setReorderStatus((s) => ({ ...s, [sKey]: 'error' })); }
      }, 600);

    } else if (!isCrossKind && isCrossSection) {
      // Cross-section same-kind move
      const remainSrc = srcList.filter((c) => c.display_group === srcSection && c.id !== activeIdStr);
      const destSectionCards = dstList.filter((c) => c.display_group === tgtSection);
      const moved = { ...ac, display_group: tgtSection };
      const newDest = [...destSectionCards, moved];
      setSrcList((prev) => [
        ...prev.filter((c) => c.display_group !== srcSection && c.display_group !== tgtSection),
        ...remainSrc.map((c, i) => ({ ...c, order_index: i + 1 })),
        ...newDest.map((c, i) => ({ ...c, order_index: i + 1 })),
      ]);
      setLocalSections((prev) => prev.filter((s) => s !== tgtSection));
      fetch('/api/admin/cards/sections/move-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ cardId: activeIdStr, targetSection: tgtSection, sourceOrderedIds: remainSrc.map((c) => c.id), destOrderedIds: newDest.map((c) => c.id) }),
      }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => fetchCards());

    } else {
      // Cross-kind card move
      const remainSrc = srcList.filter((c) => c.id !== activeIdStr);
      const destSectionCards = dstList.filter((c) => c.display_group === tgtSection);
      const moved = { ...ac, display_group: tgtSection, content_kind: tgtKind };
      const newDest = [...destSectionCards, moved];
      setSrcList((prev) => prev.filter((c) => c.id !== activeIdStr));
      setDstList((prev) => [
        ...prev.filter((c) => c.display_group !== tgtSection),
        ...newDest.map((c, i) => ({ ...c, order_index: i + 1 })),
      ]);
      showToast(`Moved to ${tgtKind === 'refresher' ? '🧠 Refresher' : '💡 Worked Examples'}`);
      fetch('/api/admin/cards/sections/move-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ cardId: activeIdStr, targetSection: tgtSection, targetKind: tgtKind, sourceOrderedIds: remainSrc.map((c) => c.id), destOrderedIds: newDest.map((c) => c.id) }),
      }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => fetchCards());
    }
  }

  function handleCardSaved(updated: Pick<CardRow, 'id' | 'card_title' | 'is_published' | 'subgroup_id' | 'order_index' | 'content'>) {
    setCards((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
    setRefresherCards((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
  }

  function handleCardDeleted(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setRefresherCards((prev) => prev.filter((c) => c.id !== id));
    setSelectedId(null);
  }

  function handleSgRenamed(updated: Pick<Subgroup, 'id' | 'name' | 'description'>) {
    setSubgroups((prev) => prev.map((sg) => sg.id === updated.id ? { ...sg, ...updated } : sg));
  }

  function handleSgDeleted(id: number) {
    setSubgroups((prev) => prev.filter((sg) => sg.id !== id));
    setCards((prev) => prev.filter((c) => c.subgroup_id !== id));
    if (subgroupFilter === String(id)) setSubgroupFilter('');
  }

  // Section (display_group) handlers
  function handleSectionRenamed(oldName: string, newName: string) {
    setCards((prev) => prev.map((c) => c.display_group === oldName ? { ...c, display_group: newName } : c));
    setLocalSections((prev) => prev.map((s) => s === oldName ? newName : s));
    setSectionOrder((prev) => prev.map((s) => s === oldName ? newName : s));
  }

  function handleSectionDeleted(name: string) {
    setLocalSections((prev) => prev.filter((s) => s !== name));
    setCards((prev) => prev.filter((c) => c.display_group !== name));
    setSectionOrder((prev) => prev.filter((s) => s !== name));
  }

  // Resize handlers with clamping
  const handleListResize = useCallback((delta: number) => {
    setListWidth((w) => Math.max(MIN.list, Math.min(MAX.list, w + delta)));
  }, []);
  const handleTextareaResize = useCallback((delta: number) => {
    setTextareaWidth((w) => Math.max(MIN.textarea, Math.min(MAX.textarea, w + delta)));
  }, []);
  const handleAiResize = useCallback((delta: number) => {
    setAiWidth((w) => Math.max(MIN.ai, Math.min(MAX.ai, w - delta)));
  }, []);

  const filteredCards = unpublishedOnly ? cards.filter((c) => !c.is_published) : cards;

  // Derive sections: ordered by sectionOrder (from sections_meta), then any new ones alphabetically
  const usedSections = [...new Set(filteredCards.map((c) => c.display_group ?? '').filter(Boolean))];
  const combinedSections = [...new Set([...usedSections, ...localSections])];
  const allSections = [
    ...sectionOrder.filter((s) => combinedSections.includes(s)),
    ...combinedSections.filter((s) => !sectionOrder.includes(s)).sort(),
  ];

  // Group cards by display_group
  const cardsBySection: Record<string, CardRow[]> = {};
  for (const c of filteredCards) {
    const key = c.display_group ?? '';
    if (!key) continue;
    if (!cardsBySection[key]) cardsBySection[key] = [];
    cardsBySection[key].push(c);
  }

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;
  const selectedCard = selectedId
    ? (cards.find((c) => c.id === selectedId) ?? refresherCards.find((c) => c.id === selectedId) ?? null)
    : null;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-800">Cards editor</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-xs">Level</span>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={level} onChange={(e) => { setLevel(e.target.value); setTopic(''); setSubgroupFilter(''); setSelectedId(null); }}>
              <option value="">—</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-xs">Topic</span>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={topic} onChange={(e) => { setTopic(e.target.value); setSubgroupFilter(''); setSelectedId(null); }} disabled={!level}>
              <option value="">—</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-xs">Sub-group</span>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={subgroupFilter} onChange={(e) => setSubgroupFilter(e.target.value)} disabled={!topic}>
              <option value="">All</option>
              {subgroups.map((sg) => <option key={sg.id} value={String(sg.id)}>{sg.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={unpublishedOnly} onChange={(e) => setUnpublishedOnly(e.target.checked)} /> Drafts only
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowNewSectionModal(true)} disabled={!level || !topic} className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40">+ New section</button>
          <button onClick={() => setShowNewModal(true)} disabled={!level || !topic || subgroups.length === 0} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">+ New card</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: card list */}
        <div className="shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden" style={{ width: listWidth }}>
          {!level || !topic ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400 text-sm">Pick a level and topic to start editing.</div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={customCollision} modifiers={[restrictToVerticalAxis]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                {/* Toast */}
                {toast && (
                  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none">
                    {toast}
                  </div>
                )}

                {/* 🧠 Refresher panel — no DndContext, uses parent's */}
                <RefresherPanel
                  cards={refresherCards}
                  subgroups={subgroups}
                  auth={auth}
                  selectedId={selectedId}
                  level={level}
                  topic={topic}
                  activeDragId={activeId}
                  isCrossKindDrag={activeDragKind !== null && activeDragKind !== 'refresher'}
                  onSelectCard={setSelectedId}
                  onCardCreated={(card) => setRefresherCards((prev) => [...prev, card])}
                  onRenamed={handleSectionRenamed}
                  onDeleted={handleSectionDeleted}
                />

                {/* 💡 Worked Examples panel */}
                <div className={`flex items-center gap-1 px-1 py-1.5 mt-2 rounded transition-colors ${activeDragKind !== null && activeDragKind === 'refresher' ? 'bg-amber-50' : ''}`}>
                  <span className="text-xs font-semibold text-amber-700 flex-1">💡 Worked Examples <span className="font-normal text-slate-400">({filteredCards.length})</span></span>
                </div>

                {allSections.length === 0 ? (
                  <DroppablePanel id="panel-we" isCrossKindTarget={activeDragKind === 'refresher'}>
                    <div className="px-3 py-3 text-center">
                      <p className="text-slate-400 text-sm mb-2">No worked examples yet.</p>
                      <button onClick={() => setShowNewSectionModal(true)} className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50">+ New section</button>
                    </div>
                  </DroppablePanel>
                ) : (
                  <div className="space-y-4">
                    <SortableContext items={allSections.map((s) => `sec-hdr-we-${s}`)} strategy={verticalListSortingStrategy}>
                      {allSections.map((sectionName) => {
                        const sectionCards = cardsBySection[sectionName] ?? [];
                        const isCardDrag = !!activeId && !String(activeId).startsWith('sec-hdr-');
                        return (
                          <SortableSectionWrapper
                            key={sectionName}
                            name={sectionName}
                            kindPrefix="we"
                            cardCount={sectionCards.length}
                            level={level}
                            topic={topic}
                            auth={auth}
                            onRenamed={handleSectionRenamed}
                            onDeleted={handleSectionDeleted}
                          >
                            <DroppableSectionZone name={sectionName} kindPrefix="we" isDragActive={isCardDrag}>
                              <SortableContext items={sectionCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                  {sectionCards.map((card) => (
                                    <SortableCardRow key={card.id} card={card} isSelected={selectedId === card.id} onSelect={setSelectedId} />
                                  ))}
                                </div>
                              </SortableContext>
                            </DroppableSectionZone>
                          </SortableSectionWrapper>
                        );
                      })}
                    </SortableContext>
                    <DroppablePanel id="panel-we" isCrossKindTarget={activeDragKind === 'refresher'} />
                  </div>
                )}
              </div>

              <DragOverlay modifiers={[restrictToVerticalAxis]}>
                {activeId ? (() => {
                  const id = String(activeId);
                  const hdrName = id.startsWith('sec-hdr-we-') ? id.slice('sec-hdr-we-'.length)
                    : id.startsWith('sec-hdr-rf-') ? id.slice('sec-hdr-rf-'.length) : null;
                  if (hdrName) return <div className="px-3 py-1.5 bg-white border border-slate-300 rounded shadow-md text-xs font-semibold text-slate-600 opacity-90">{hdrName}</div>;
                  return activeCard ? <DragCardOverlay card={activeCard} /> : null;
                })() : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <ResizeHandle onDelta={handleListResize} />

        {/* Right: editor */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedCard ? (
            <EditorPanel
              key={selectedCard.id}
              initialCard={selectedCard}
              subgroups={subgroups}
              allCards={selectedCard?.content_kind === 'refresher' ? refresherCards : cards}
              level={level}
              topic={topic}
              auth={auth}
              textareaWidth={textareaWidth}
              aiWidth={aiWidth}
              aiOpen={aiOpen}
              onSaved={handleCardSaved}
              onDeleted={handleCardDeleted}
              onNavigate={setSelectedId}
              onTextareaResize={handleTextareaResize}
              onAiResize={handleAiResize}
              onAiToggle={() => setAiOpen((v) => !v)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              {level && topic ? 'Select a card to edit.' : ''}
            </div>
          )}
        </div>
      </div>

      {showNewSectionModal && level && topic && (
        <NewSectionModal
          level={level} topic={topic} existingSections={allSections}
          onClose={() => setShowNewSectionModal(false)}
          onCreated={(name) => {
            setLocalSections((prev) => prev.includes(name) ? prev : [...prev, name]);
            setShowNewSectionModal(false);
          }}
        />
      )}

      {showNewModal && level && topic && (
        <NewCardModal
          subgroups={subgroups} sections={allSections} level={level} topic={topic}
          onClose={() => setShowNewModal(false)}
          onCreated={async (id) => {
            setShowNewModal(false);
            await fetchCards();
            setSelectedId(id);
          }}
          onSubgroupCreated={(sg) => {
            setSubgroups((prev) => {
              if (prev.some((existing) => existing.id === sg.id)) return prev;
              return [...prev, sg].sort((a, b) => a.id - b.id);
            });
          }}
          auth={auth}
        />
      )}
    </div>
  );
}
