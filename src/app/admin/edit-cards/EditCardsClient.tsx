'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  useDroppable,
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

// ── Sub-group header (Feature 2: rename, Feature 3: delete) ───────────────────

function SubgroupHeader({
  sg, cardCount, auth, reorderStatus, showDragHandle, dragHandleProps, onRenamed, onDeleted,
}: {
  sg: Subgroup; cardCount: number; auth: string; reorderStatus: SaveStatus;
  showDragHandle: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  onRenamed: (updated: Pick<Subgroup, 'id' | 'name' | 'description'>) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(sg.name);
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
      const res = await fetch(`/api/admin/cards/subgroups/${sg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onRenamed({ id: sg.id, name: json.name, description: json.description ?? '' });
      setEditing(false);
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true); setDeleteErr('');
    try {
      const res = await fetch(`/api/admin/cards/subgroups/${sg.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onDeleted(sg.id);
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
              if (e.key === 'Escape') { setEditing(false); setEditName(sg.name); setRenameErr(''); }
            }}
          />
          <button onClick={handleSave} disabled={saving} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? '…' : '✓'}
          </button>
          <button onClick={() => { setEditing(false); setEditName(sg.name); setRenameErr(''); }} className="text-xs px-2 py-0.5 border border-slate-300 rounded hover:bg-slate-50">
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
        {showDragHandle && dragHandleProps && (
          <span
            {...dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder section"
          >⠿</span>
        )}
        <span
          className="text-xs font-semibold text-slate-500 truncate flex-1 min-w-0"
          title="Renaming updates QB, KB, and swipe cards"
        >
          {sg.name} <span className="font-normal text-slate-400">({cardCount})</span>
        </span>
        <button
          onClick={() => { setEditing(true); setEditName(sg.name); }}
          className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
          title="Rename sub-group"
        >✎</button>
        {cardCount === 0 && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
            title="Delete empty sub-group"
          >🗑</button>
        )}
        {reorderStatus === 'saving' && <span className="text-xs text-slate-400 ml-auto shrink-0">Saving…</span>}
        {reorderStatus === 'saved' && <span className="text-xs text-green-600 ml-auto shrink-0">Saved</span>}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteConfirm(false); setDeleteErr(''); } }}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-slate-800 mb-2">Delete &ldquo;{sg.name}&rdquo;?</h2>
            <p className="text-sm text-slate-600 mb-4">This cannot be undone. The sub-group is currently empty in this topic, but it may still be referenced by exam questions or KB entries.</p>
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

// ── Droppable section zone (Feature 1: cross-section card drop target) ─────────

function DroppableSectionZone({ sgId, children, isDragActive }: { sgId: number; children: React.ReactNode; isDragActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sg-zone-${sgId}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-6 rounded transition-colors ${isDragActive && isOver ? 'outline outline-2 outline-dashed outline-blue-400 bg-blue-50' : ''}`}
    >
      {children}
    </div>
  );
}

// ── Sortable section row (Feature 4: drag section headers to reorder) ──────────

function SortableSgSection({
  sg, children, cardCount, auth, reorderStatus, showDragHandle, onRenamed, onDeleted,
}: {
  sg: Subgroup; children: React.ReactNode; cardCount: number; auth: string;
  reorderStatus: SaveStatus; showDragHandle: boolean;
  onRenamed: (updated: Pick<Subgroup, 'id' | 'name' | 'description'>) => void;
  onDeleted: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `sg-header-${sg.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <SubgroupHeader
        sg={sg}
        cardCount={cardCount}
        auth={auth}
        reorderStatus={reorderStatus}
        showDragHandle={showDragHandle}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLSpanElement>}
        onRenamed={onRenamed}
        onDeleted={onDeleted}
      />
      {children}
    </div>
  );
}

// ── New card modal ─────────────────────────────────────────────────────────────

function NewCardModal({ subgroups: initialSubgroups, level, topic, onClose, onCreated, onSubgroupCreated, auth }: {
  subgroups: Subgroup[]; level: string; topic: string;
  onClose: () => void; onCreated: (id: string) => void;
  onSubgroupCreated: (sg: Subgroup) => void;
  auth: string;
}) {
  const [subgroups, setSubgroups] = useState<Subgroup[]>(initialSubgroups);
  const [sgId, setSgId] = useState<number | '__new__'>(initialSubgroups[0]?.id ?? 0);
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
      const newSg: Subgroup = {
        id: json.id,
        name: json.name,
        description: json.description ?? '',
        card_count: 0,
      };
      setSubgroups((prev) => [...prev, newSg].sort((a, b) => a.id - b.id));
      setSgId(newSg.id);
      setNewSgName(''); setNewSgDesc('');
      onSubgroupCreated(newSg);
    } catch (e: unknown) {
      setSgErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCreatingSg(false);
    }
  }

  async function create() {
    if (typeof sgId !== 'number' || !sgId) {
      setErr(sgId === '__new__' ? 'Save the new sub-group first' : 'Pick a sub-group');
      return;
    }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/admin/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, subgroup_id: sgId, card_title: title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json.id);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setCreating(false); }
  }

  const isNewSg = sgId === '__new__';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">New card</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sub-group</label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-slate-400">(optional, helps AI)</span></label>
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
                <button
                  onClick={createNewSubgroup}
                  disabled={creatingSg}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingSg ? 'Saving…' : 'Save sub-group'}
                </button>
                <button
                  onClick={() => { setSgId(initialSubgroups[0]?.id ?? subgroups[0]?.id ?? 0); setNewSgName(''); setNewSgDesc(''); setSgErr(''); }}
                  className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white"
                >
                  Cancel
                </button>
                <p className="text-xs text-slate-500 ml-auto">
                  for {level} · {topic}
                </p>
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

// ── New section modal (Feature 5) ─────────────────────────────────────────────

function NewSectionModal({ level, topic, auth, onClose, onCreated }: {
  level: string; topic: string; auth: string;
  onClose: () => void;
  onCreated: (sg: Subgroup) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Name is required'); return; }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/admin/cards/subgroups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, name: trimmed, description: description.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create section');
      onCreated({ id: json.id, name: json.name, description: json.description ?? '', card_count: 0 });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">New section</h2>
        <p className="text-xs text-slate-500 mb-4">Creates an empty sub-group under <span className="font-medium">{level} · {topic}</span>. Add cards to it afterwards.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-600">*</span></label>
            <input
              ref={inputRef}
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Simplifying nested surds"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onClose(); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional, helps AI)</span></label>
            <textarea
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="What kind of question falls under this sub-skill?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} disabled={creating} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create section'}
          </button>
        </div>
      </div>
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

function AISidebar({ cardId, level, topic, subgroup, content, title, auth, onAccept }: {
  cardId: string; level: string; topic: string; subgroup: Subgroup | undefined;
  content: string; title: string; auth: string; onAccept: (c: string) => void;
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
        body: JSON.stringify({ instruction, currentTitle: title, currentContent: content, level, topic, subgroupName: subgroup?.name ?? '', subgroupDescription: subgroup?.description ?? '', password: auth }),
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
              <AISidebar cardId={cardId} level={level} topic={topic} subgroup={currentSubgroup} content={content} title={title} auth={auth} onAccept={(c) => setContent(c)} />
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
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reorderStatus, setReorderStatus] = useState<Record<number, SaveStatus>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [showNewSectionModal, setShowNewSectionModal] = useState(false);
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
    if (!level || !topic) { setCards([]); setSubgroups([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ level, topic });
      if (subgroupFilter) params.set('subgroupId', subgroupFilter);
      const res = await fetch(`/api/admin/cards/list?${params}`, { headers: { Authorization: `Bearer ${auth}` } });
      const json = await res.json();
      setCards(json.cards ?? []);
      setSubgroups(json.subgroups ?? []);
    } finally { setLoading(false); }
  }, [level, topic, subgroupFilter, auth]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as string); if (navigator.vibrate) navigator.vibrate(30); }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // ── Feature 4: Section reorder ───────────────────────────────────────────
    if (activeIdStr.startsWith('sg-header-')) {
      if (!overIdStr.startsWith('sg-header-')) return;
      const fromId = Number(activeIdStr.replace('sg-header-', ''));
      const toId = Number(overIdStr.replace('sg-header-', ''));
      const oi = subgroups.findIndex((s) => s.id === fromId);
      const ni = subgroups.findIndex((s) => s.id === toId);
      if (oi === -1 || ni === -1) return;
      const reordered = arrayMove(subgroups, oi, ni);
      setSubgroups(reordered);
      fetch('/api/admin/cards/subgroups/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, orderedIds: reordered.map((s) => s.id) }),
      }).catch(() => fetchCards());
      return;
    }

    // ── Feature 1 + existing: Card drag ──────────────────────────────────────
    const ac = cards.find((c) => c.id === activeIdStr);
    if (!ac) return;

    // Determine target subgroup from what we dropped onto
    let targetSgId: number;
    if (overIdStr.startsWith('sg-zone-')) {
      targetSgId = Number(overIdStr.replace('sg-zone-', ''));
    } else if (overIdStr.startsWith('sg-header-')) {
      targetSgId = Number(overIdStr.replace('sg-header-', ''));
    } else {
      const oc = cards.find((c) => c.id === overIdStr);
      if (!oc) return;
      targetSgId = oc.subgroup_id;
    }

    if (ac.subgroup_id === targetSgId) {
      // ── Within-section reorder (existing behaviour) ───────────────────────
      if (overIdStr.startsWith('sg-zone-') || overIdStr.startsWith('sg-header-')) return; // zone drop on own section = no-op
      const sgCards = cards.filter((c) => c.subgroup_id === targetSgId);
      const oi = sgCards.findIndex((c) => c.id === activeIdStr);
      const ni = sgCards.findIndex((c) => c.id === overIdStr);
      if (oi === -1 || ni === -1) return;
      const reordered = arrayMove(sgCards, oi, ni);
      setCards((prev) => [...prev.filter((c) => c.subgroup_id !== targetSgId), ...reordered]);
      if (reorderTimers.current[targetSgId]) clearTimeout(reorderTimers.current[targetSgId]);
      setReorderStatus((s) => ({ ...s, [targetSgId]: 'saving' }));
      reorderTimers.current[targetSgId] = setTimeout(async () => {
        try {
          const res = await fetch('/api/admin/cards/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
            body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
          });
          if (!res.ok) throw new Error();
          setReorderStatus((s) => ({ ...s, [targetSgId]: 'saved' }));
          setTimeout(() => setReorderStatus((s) => ({ ...s, [targetSgId]: 'idle' })), 2000);
        } catch { setReorderStatus((s) => ({ ...s, [targetSgId]: 'error' })); }
      }, 600);
    } else {
      // ── Cross-section move (Feature 1) ────────────────────────────────────
      const sourceSgId = ac.subgroup_id;
      const sourceCards = cards.filter((c) => c.subgroup_id === sourceSgId && c.id !== activeIdStr);
      const destCards = cards.filter((c) => c.subgroup_id === targetSgId);
      const movedCard = { ...ac, subgroup_id: targetSgId };
      const newDestCards = [...destCards, movedCard];

      // Optimistic update — move card + recompute order_index for both groups
      setCards((prev) => [
        ...prev.filter((c) => c.subgroup_id !== sourceSgId && c.subgroup_id !== targetSgId),
        ...sourceCards.map((c, i) => ({ ...c, order_index: i + 1 })),
        ...newDestCards.map((c, i) => ({ ...c, order_index: i + 1 })),
      ]);
      setSubgroups((prev) => prev.map((sg) => {
        if (sg.id === sourceSgId) return { ...sg, card_count: Math.max(0, sg.card_count - 1) };
        if (sg.id === targetSgId) return { ...sg, card_count: sg.card_count + 1 };
        return sg;
      }));

      fetch('/api/admin/cards/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({
          cardId: activeIdStr,
          targetSubgroupId: targetSgId,
          sourceOrderedIds: sourceCards.map((c) => c.id),
          destOrderedIds: newDestCards.map((c) => c.id),
        }),
      }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => fetchCards());
    }
  }

  function handleCardSaved(updated: Pick<CardRow, 'id' | 'card_title' | 'is_published' | 'subgroup_id' | 'order_index' | 'content'>) {
    setCards((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
  }

  function handleCardDeleted(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
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
  const cardsBySg: Record<number, CardRow[]> = {};
  for (const c of filteredCards) { if (!cardsBySg[c.subgroup_id]) cardsBySg[c.subgroup_id] = []; cardsBySg[c.subgroup_id].push(c); }
  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;
  const selectedCard = selectedId ? cards.find((c) => c.id === selectedId) ?? null : null;

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
          ) : subgroups.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-slate-400 text-sm">No cards yet for {topic}.</p>
              <button onClick={() => setShowNewModal(true)} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ Create the first one</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={subgroups.filter((sg) => !subgroupFilter || String(sg.id) === subgroupFilter).map((sg) => `sg-header-${sg.id}`)} strategy={verticalListSortingStrategy}>
                  {subgroups
                    .filter((sg) => !subgroupFilter || String(sg.id) === subgroupFilter)
                    .map((sg) => {
                      const sgCards = cardsBySg[sg.id] ?? [];
                      const isCardDrag = !!activeId && !String(activeId).startsWith('sg-header-');
                      return (
                        <SortableSgSection
                          key={sg.id}
                          sg={sg}
                          cardCount={sgCards.length}
                          auth={auth}
                          reorderStatus={reorderStatus[sg.id] ?? 'idle'}
                          showDragHandle={!subgroupFilter}
                          onRenamed={handleSgRenamed}
                          onDeleted={handleSgDeleted}
                        >
                          <DroppableSectionZone sgId={sg.id} isDragActive={isCardDrag}>
                            <SortableContext items={sgCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1">
                                {sgCards.map((card) => (
                                  <SortableCardRow key={card.id} card={card} isSelected={selectedId === card.id} onSelect={setSelectedId} />
                                ))}
                              </div>
                            </SortableContext>
                          </DroppableSectionZone>
                        </SortableSgSection>
                      );
                    })}
                </SortableContext>
                <DragOverlay modifiers={[restrictToVerticalAxis]}>
                  {activeId && String(activeId).startsWith('sg-header-') ? (
                    (() => {
                      const sg = subgroups.find((s) => `sg-header-${s.id}` === String(activeId));
                      return sg ? <div className="px-3 py-2 bg-white border border-slate-300 rounded shadow-md text-xs font-semibold text-slate-600 opacity-90">{sg.name}</div> : null;
                    })()
                  ) : activeCard ? <DragCardOverlay card={activeCard} /> : null}
                </DragOverlay>
              </DndContext>
            </div>
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
              allCards={cards}
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
          level={level} topic={topic} auth={auth}
          onClose={() => setShowNewSectionModal(false)}
          onCreated={(sg) => {
            setSubgroups((prev) => {
              if (prev.some((existing) => existing.id === sg.id)) return prev;
              return [...prev, sg];
            });
            setShowNewSectionModal(false);
          }}
        />
      )}

      {showNewModal && level && topic && (
        <NewCardModal
          subgroups={subgroups} level={level} topic={topic}
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
