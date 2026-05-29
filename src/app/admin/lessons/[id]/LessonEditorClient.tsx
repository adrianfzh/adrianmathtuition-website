'use client';

/* eslint-disable @next/next/no-img-element */
// Lesson editor — multi-topic teaching-deck editor with the same UX as /admin/edit-cards
// (dnd-kit drag-drop, KaTeX live preview, resizable panels, AI sidebar, bank panel).
// Code is COPIED from EditCardsClient.tsx with adjustments for the lessons data model:
//   * Cards have content_kind ∈ {refresher, worked_example, practice} and a section_name
//     (no subgroup_id, no display_group, no is_published).
//   * Bank questions filter by lesson.topics (array), not by sub-group.
//   * Reorder endpoint takes a single orderedIds list per (kind, section) group.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors,
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
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { LessonRightPanel, buildBankWorkedExampleTemplate, type BankQuestion } from './LessonBankPanel';
import {
  loadLesson as storeLoadLesson,
  saveLessonMeta as storeSaveLessonMeta,
  addCard as storeAddCard,
  patchCard as storePatchCard,
  deleteCard as storeDeleteCard,
  reorderCards as storeReorderCards,
} from '@/lib/offline/store';
import { SyncStatusPill } from '@/lib/offline/SyncStatusPill';
import { BankStalePill } from '@/lib/offline/BankStalePill';
import { OfflineModePill } from '@/lib/offline/OfflineModePill';
import { syncEnabledLevels } from '@/lib/offline/qb-cache';
import { registerLessonsServiceWorker } from '@/lib/offline/registerLessonsSW';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  name: string;
  level: string;
  topics: string[];
  description: string | null;
  updated_at: string;
}

type ContentKind = 'refresher' | 'worked_example' | 'practice';

interface Card {
  id: string;
  source_card_id: string | null;
  source_question_id: string | null;
  content_kind: ContentKind;
  section_name: string;
  card_title: string | null;
  content: string | null;
  marks: number | null;
  order_index: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const KIND_ORDER: ContentKind[] = ['refresher', 'worked_example', 'practice'];
const KIND_LABEL: Record<ContentKind, string> = {
  refresher: '🧠 Refreshers',
  worked_example: '💡 Worked Examples',
  practice: '✏️ Practice',
};
const KIND_PREFIX: Record<ContentKind, 'rf' | 'we' | 'pr'> = {
  refresher: 'rf', worked_example: 'we', practice: 'pr',
};
const KIND_ACCENT: Record<ContentKind, string> = {
  refresher: 'text-emerald-700',
  worked_example: 'text-blue-700',
  practice: 'text-orange-700',
};
const DEFAULT_SECTION: Record<ContentKind, string> = {
  refresher: 'Refreshers',
  worked_example: 'Worked Examples',
  practice: 'Practice',
};

// ── Module-level animation tracker (matches edit-cards pattern) ──────────────
let _recentlyMovedCardId: string | null = null;

// ── Layout ───────────────────────────────────────────────────────────────────

const LAYOUT_KEY = 'lesson_editor_layout';
const DEFAULT_LAYOUT = { listWidth: 300, textareaWidth: 440, aiWidth: 320 };
const MIN = { list: 200, textarea: 220, ai: 220 };
const MAX = { list: 560, textarea: 900, ai: 576 };

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) return { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT;
}

// ── Resize handle ────────────────────────────────────────────────────────────

function ResizeHandle({ onDelta }: { onDelta: (delta: number) => void }) {
  const onDeltaRef = useRef(onDelta);
  useEffect(() => { onDeltaRef.current = onDelta; }, [onDelta]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let lastX = e.clientX;
    function onMove(ev: MouseEvent) {
      onDeltaRef.current(ev.clientX - lastX);
      lastX = ev.clientX;
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

// ── KaTeX ────────────────────────────────────────────────────────────────────

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

// ── Cookie helper ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── Simple line diff ─────────────────────────────────────────────────────────

interface DiffLine { type: 'same' | 'add' | 'remove'; text: string }

function computeDiff(original: string, updated: string): DiffLine[] {
  const a = original.split('\n'), b = updated.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { result.push({ type: 'add', text: b[j] }); j++; }
    else { result.push({ type: 'remove', text: a[i] }); i++; }
  }
  return result;
}

// ── AI Quick actions ─────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Generate solutions', instruction: `Add a full worked solution to this card. Preserve every labelled part — if the input has (a), (b), (i), (ii), keep them all and solve each. Style: match the lesson worked-example style. Use **Step 1.**, **Solution:** etc. Use $\\begin{aligned}...\\end{aligned}$ for chained equations. Speak to the student in second person. If a per-part solution already exists, leave it intact.` },
  { label: 'Make clearer', instruction: 'Rewrite for clarity. Same content, same answer, but cleaner phrasing.' },
  { label: 'Shorten ~30%', instruction: 'Shorten by roughly 30%. Drop filler, keep every algebra step.' },
  { label: 'Add pitfall note', instruction: "At the end, add a brief 'Common pitfall:' line warning about the most likely student error." },
  { label: 'Add sanity check', instruction: "Add a final 'Check:' step that substitutes the answer back or spot-checks the result." },
  { label: 'Tighten algebra', instruction: 'Combine micro-steps that students can do in one line, but keep enough scaffolding that the logic is followable.' },
  { label: 'Fresh example', instruction: "Same sub-skill, different numbers and surface. Don't reuse the same coefficients. Rewrite the whole card." },
  { label: 'Generate diagram', instruction: 'Generate an SVG diagram that illustrates the mathematical figure described in this card. Output a clean, minimal <svg>...</svg> element inline, with viewBox and basic shapes only.' },
];

// ── Custom collision detection (cards + section headers) ─────────────────────

const customCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (activeId.startsWith('sec-hdr-')) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        c => String(c.id).startsWith('sec-hdr-') || String(c.id).startsWith('panel-')
      ),
    });
  }

  const activeSection: string = (args.active.data.current as { section?: string } | undefined)?.section ?? '';
  const activeKind: string = (args.active.data.current as { kind?: string } | undefined)?.kind ?? '';

  const cardContainers = args.droppableContainers.filter(c => !String(c.id).startsWith('sec-hdr-'));

  const chipContainers = cardContainers.filter(
    c => !String(c.id).startsWith('sec-zone-') && !String(c.id).startsWith('panel-')
  );
  const chipPointer = pointerWithin({ ...args, droppableContainers: chipContainers });
  if (chipPointer.length > 0) return chipPointer;

  const zonePointer = pointerWithin({ ...args, droppableContainers: cardContainers });
  if (zonePointer.length > 0) {
    const firstId = String(zonePointer[0].id);
    let zoneKind = '';
    let zoneSection = '';
    for (const k of KIND_ORDER) {
      const pre = KIND_PREFIX[k];
      if (firstId.startsWith(`sec-zone-${pre}-`)) { zoneKind = k; zoneSection = firstId.slice(`sec-zone-${pre}-`.length); }
      if (firstId === `panel-${pre}`) { zoneKind = k; zoneSection = ''; }
    }
    if (zoneSection === '__flat__') zoneSection = '';
    const sameSection = zoneSection === activeSection && zoneKind === activeKind;
    if (!sameSection) return zonePointer;
  }

  return closestCenter({ ...args, droppableContainers: chipContainers.length > 0 ? chipContainers : cardContainers });
};

// ── Sortable card row ────────────────────────────────────────────────────────

function SortableCardRow({
  card, displayIndex, isSelected, onSelect, onBankDrop,
}: {
  card: Card;
  displayIndex: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onBankDrop?: (q: BankQuestion, anchorCard: Card, position: 'above' | 'below') => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { section: card.section_name ?? '', kind: card.content_kind },
  });
  const [animateIn] = useState(() => card.id === _recentlyMovedCardId);
  const [bankHover, setBankHover] = useState<'above' | 'below' | null>(null);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, touchAction: 'none' as const };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(card.id)}
      onDragOver={(e) => {
        if (!onBankDrop) return;
        if (!e.dataTransfer.types.includes('application/x-bank-question')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const rect = e.currentTarget.getBoundingClientRect();
        const pos: 'above' | 'below' = (e.clientY - rect.top) < rect.height / 2 ? 'above' : 'below';
        setBankHover(pos);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setBankHover(null);
      }}
      onDrop={(e) => {
        if (!onBankDrop) return;
        const payload = e.dataTransfer.getData('application/x-bank-question');
        if (!payload) return;
        e.preventDefault();
        const pos = bankHover ?? 'below';
        setBankHover(null);
        try {
          const q = JSON.parse(payload) as BankQuestion;
          onBankDrop(q, card, pos);
        } catch (err) { console.error('bank drop parse failed', err); }
      }}
      className={`relative flex items-center gap-2 px-3 py-2 rounded cursor-pointer border transition-colors ${isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'} ${animateIn ? 'card-section-entry' : ''} ${bankHover ? 'ring-2 ring-blue-200' : ''}`}
    >
      {bankHover === 'above' && <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none" />}
      {bankHover === 'below' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none" />}
      <span {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0" title="Drag to reorder">⠿</span>
      <span className="text-slate-400 text-xs w-4 shrink-0">{displayIndex}.</span>
      <span className="flex-1 text-sm text-slate-800 min-w-0 leading-snug truncate">{card.card_title || <em className="text-slate-400">Untitled</em>}</span>
      {card.content_kind === 'practice' && card.marks != null && (
        <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded shrink-0">{card.marks}m</span>
      )}
      {card.source_question_id && (
        <span className="text-[10px] text-blue-500 shrink-0" title="From bank">🔗</span>
      )}
    </div>
  );
}

function DragCardOverlay({ card }: { card: Card }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-400 rounded shadow-lg opacity-90">
      <span className="text-slate-300">⠿</span>
      <span className="text-sm text-slate-800 truncate">{card.card_title || 'Untitled'}</span>
    </div>
  );
}

// ── Section header with rename / delete (no API — section is a per-card field) ──

function SectionHeader({
  kind, name, cardCount, dragHandleProps, onRenamed, onDeleted, onAddCard,
}: {
  kind: ContentKind;
  name: string;
  cardCount: number;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  onRenamed: (kind: ContentKind, oldName: string, newName: string) => void;
  onDeleted: (kind: ContentKind, name: string) => void;
  onAddCard?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setEditName(name); return; }
    onRenamed(kind, name, trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 mb-1.5 px-1">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 border border-blue-400 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setEditing(false); setEditName(name); }
          }}
          onBlur={commit}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 mb-1.5 px-1 min-w-0">
      {dragHandleProps && (
        <span
          {...dragHandleProps}
          className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          title="Drag to reorder section"
        >⠿</span>
      )}
      <span className="text-xs font-semibold text-slate-500 truncate flex-1 min-w-0">
        {name} <span className="font-normal text-slate-400">({cardCount})</span>
      </span>
      {onAddCard && (
        <button
          onClick={onAddCard}
          className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs font-medium leading-none"
          title="Add card to this section"
        >+ card</button>
      )}
      <button
        onClick={() => { setEditing(true); setEditName(name); }}
        className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
        title="Rename section"
      >✎</button>
      {cardCount === 0 && (
        <button
          onClick={() => onDeleted(kind, name)}
          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
          title="Delete empty section"
        >🗑</button>
      )}
    </div>
  );
}

// ── Droppable wrappers ───────────────────────────────────────────────────────

function DroppableSectionZone({ name, kindPrefix, children, isDragActive }: {
  name: string; kindPrefix: 'we' | 'rf' | 'pr'; children: React.ReactNode; isDragActive: boolean;
}) {
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

function SortableSectionWrapper({
  kind, name, cardCount, onRenamed, onDeleted, onAddCard, children,
}: {
  kind: ContentKind;
  name: string;
  cardCount: number;
  onRenamed: (kind: ContentKind, oldName: string, newName: string) => void;
  onDeleted: (kind: ContentKind, name: string) => void;
  onAddCard: () => void;
  children: React.ReactNode;
}) {
  const pre = KIND_PREFIX[kind];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sec-hdr-${pre}-${name}`,
    data: { isSectionHeader: true, kind, name },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <SectionHeader
        kind={kind}
        name={name}
        cardCount={cardCount}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLSpanElement>}
        onRenamed={onRenamed}
        onDeleted={onDeleted}
        onAddCard={onAddCard}
      />
      {children}
    </div>
  );
}

// ── Quick-add section modal ──────────────────────────────────────────────────

function NewSectionModal({ kind, existingSections, onClose, onCreated }: {
  kind: ContentKind;
  existingSections: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      // Blank name → create an "Untitled section" the user can rename later via the
      // section header. Auto-number to keep it unique within this kind.
      let auto = 'Untitled section';
      let n = 2;
      while (existingSections.includes(auto)) auto = `Untitled section ${n++}`;
      onCreated(auto);
      return;
    }
    if (existingSections.includes(trimmed)) { setErr('That section already exists'); return; }
    onCreated(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-3">New {KIND_LABEL[kind].replace(/^\S+\s/, '')} section</h2>
        <input
          ref={inputRef}
          type="text"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          placeholder="e.g. Chain rule"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onClose(); }}
        />
        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        <p className="text-xs text-slate-400 mt-2">Leave blank to create an untitled section you can rename later.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={create} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">{name.trim() ? 'Create' : 'Create untitled'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────────

function DeleteModal({ onConfirm, onCancel, deleting }: { onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-2">Delete this card?</h2>
        <p className="text-sm text-slate-600 mb-4">This removes it from the lesson. Other lessons aren&rsquo;t affected.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={deleting} className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ── AI Sidebar ────────────────────────────────────────────────────────────────

function AISidebar({
  cardId, lessonLevel, lessonTopics, sectionName, content, title, contentKind, auth,
  onAccept, onPreviewChange,
}: {
  cardId: string;
  lessonLevel: string;
  lessonTopics: string[];
  sectionName: string;
  content: string;
  title: string;
  contentKind: ContentKind;
  auth: string;
  onAccept: (c: string) => void;
  onPreviewChange?: (content: string | null) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [aiError, setAiError] = useState('');
  type ImgEntry = { data: string; mediaType: string; previewUrl: string };
  const [images, setImages] = useState<ImgEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const prevCardId = useRef(cardId);

  useEffect(() => {
    if (prevCardId.current !== cardId) {
      prevCardId.current = cardId;
      setDiffLines(null); setAiResult(''); setAiError(''); setImages([]);
      onPreviewChange?.(null);
    }
  }, [cardId, onPreviewChange]);

  function loadImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImages(prev => [...prev, { data: dataUrl.split(',')[1], mediaType: file.type, previewUrl: dataUrl }]);
    };
    reader.readAsDataURL(file);
  }

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx));
  }

  // Track online state so we can disable AI when offline (the Anthropic endpoint
  // requires network — no offline fallback exists).
  const [aiOnline, setAiOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setAiOnline(true);
    const down = () => setAiOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const runAI = useCallback(async (instruction: string) => {
    if (streaming) { abortRef.current?.(); return; }
    if (!aiOnline) { setAiError('AI Assist needs a network connection.'); return; }
    setStreaming(true); setAiResult(''); setDiffLines(null); setAiError('');
    let result = '', aborted = false;
    const controller = new AbortController();
    abortRef.current = () => { aborted = true; controller.abort(); };
    try {
      const subgroupName = sectionName || DEFAULT_SECTION[contentKind];
      const subgroupDescription = `Lesson section "${sectionName}". Topics: ${lessonTopics.join(', ')}.`;
      const res = await fetch('/api/edit-cards-ai', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          currentTitle: title,
          currentContent: content,
          level: lessonLevel,
          topic: lessonTopics[0] ?? '',
          subgroupName,
          subgroupDescription,
          content_kind: contentKind,
          images: images.map(i => ({ data: i.data, mediaType: i.mediaType })),
          password: auth,
        }),
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
      if (!aborted && result) { setDiffLines(computeDiff(content, result)); onPreviewChange?.(result); }
    } catch (e: unknown) {
      if (!aborted) setAiError(e instanceof Error ? e.message : 'AI error');
    } finally { setStreaming(false); abortRef.current = null; }
  }, [streaming, aiOnline, title, content, lessonLevel, lessonTopics, sectionName, contentKind, images, auth, onPreviewChange]);

  function handleAccept() { if (!aiResult) return; onAccept(aiResult); setDiffLines(null); setAiResult(''); setPrompt(''); setImages([]); onPreviewChange?.(null); }
  function handleReject() { setDiffLines(null); setAiResult(''); setPrompt(''); onPreviewChange?.(null); }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">✨ AI assist</span>
      </div>
      {!aiOnline && (
        <div className="shrink-0 px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">
          🔴 Offline — AI Assist is unavailable. Reconnect to use quick actions or send a custom prompt.
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Quick actions</p>
          <div className="grid grid-cols-2 gap-1">
            {QUICK_ACTIONS.map(qa => (
              <button key={qa.label} onClick={() => runAI(qa.instruction)} disabled={streaming || !aiOnline} className="text-left text-xs px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 leading-tight">{qa.label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Or describe a change:</p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(f => loadImage(f)); }}
          >
            <textarea
              className={`w-full border rounded px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`}
              rows={3}
              placeholder={images.length > 0 ? 'Optional: instructions for the images…' : 'e.g. Add a worked example for the chain rule…'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={streaming}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
                if (items.length > 0) { items.forEach(i => { const f = i.getAsFile(); if (f) loadImage(f); }); e.preventDefault(); }
              }}
            />
          </div>
          {images.length > 0 && (
            <div className="mt-1.5 border border-slate-200 rounded bg-slate-50 p-1.5 space-y-1">
              <div className="flex flex-wrap gap-1.5">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img src={img.previewUrl} alt={`image ${idx + 1}`} className="h-12 w-12 object-cover rounded border border-slate-200" />
                    <button onClick={() => removeImage(idx)} className="absolute top-0 right-0 bg-black/60 text-white text-[10px] px-1 rounded-bl">✕</button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">{images.length} image{images.length > 1 ? 's' : ''}</p>
            </div>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 shrink-0"
              title="Upload image(s)"
            >📎</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { Array.from(e.target.files ?? []).forEach(f => loadImage(f)); e.target.value = ''; }}
            />
            <button
              onClick={() => runAI(prompt)}
              disabled={(!prompt.trim() && images.length === 0) || streaming || !aiOnline}
              className="flex-1 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              {streaming ? 'Streaming… (click to cancel)' : !aiOnline ? 'Offline' : images.length > 0 ? `Extract from ${images.length > 1 ? `${images.length} images` : 'image'} →` : 'Send to AI →'}
            </button>
          </div>
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
            <div className="text-xs font-mono border border-slate-200 rounded overflow-hidden overflow-y-auto">
              {diffLines.map((line, i) => (
                <div key={i} className={`px-2 py-px whitespace-pre-wrap leading-relaxed ${line.type === 'add' ? 'bg-green-50 text-green-800' : line.type === 'remove' ? 'bg-red-50 text-red-700 line-through' : 'text-slate-500'}`}>
                  {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}{line.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {diffLines && !streaming && (
        <div className="shrink-0 px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
          <button onClick={handleAccept} className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">Accept</button>
          <button onClick={handleReject} className="flex-1 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50">Reject</button>
        </div>
      )}
    </div>
  );
}

// ── Inline editor panel ──────────────────────────────────────────────────────

function EditorPanel({
  initialCard,
  lessonLevel,
  lessonTopics,
  auth,
  allKindCards,
  textareaWidth,
  aiWidth,
  aiOpen,
  rightTab,
  onRightTabChange,
  onSaved,
  onDeleted,
  onNavigate,
  onTextareaResize,
  onAiResize,
  onAiToggle,
}: {
  initialCard: Card;
  lessonLevel: string;
  lessonTopics: string[];
  auth: string;
  allKindCards: Card[]; // for prev/next nav within same kind
  textareaWidth: number;
  aiWidth: number;
  aiOpen: boolean;
  rightTab: 'ai' | 'bank';
  onRightTabChange: (t: 'ai' | 'bank') => void;
  onSaved: (updated: Card) => void;
  onDeleted: (id: string) => void;
  onNavigate: (id: string) => void;
  onTextareaResize: (delta: number) => void;
  onAiResize: (delta: number) => void;
  onAiToggle: () => void;
}) {
  const [title, setTitle] = useState(initialCard.card_title ?? '');
  const [content, setContent] = useState(initialCard.content ?? '');
  const [marks, setMarks] = useState<string>(initialCard.marks?.toString() ?? '');
  const [sectionName, setSectionName] = useState(initialCard.section_name);
  const [contentHistory, setContentHistory] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [previewContent, setPreviewContent] = useState(initialCard.content ?? '');
  const [aiPreviewContent, setAiPreviewContent] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingSourceQuestionId, setPendingSourceQuestionId] = useState<string | null>(null);
  const [dragOverEditor, setDragOverEditor] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const doSave = useCallback(async () => {
    setSaveStatus('saving');
    const patch: Partial<Card> = {
      card_title: title,
      content,
      section_name: sectionName,
    };
    const m = parseInt(marks, 10);
    if (initialCard.content_kind === 'practice' && !isNaN(m)) patch.marks = m;
    if (pendingSourceQuestionId) patch.source_question_id = pendingSourceQuestionId;
    try {
      // Local-first via store; the sync engine ships it to the server (immediately when
      // online, queued when offline). The optimistic UI is already correct.
      const updated = await storePatchCard(cardId, patch);
      setSaveStatus('saved');
      if (updated) onSaved(updated as Card);
      if (pendingSourceQuestionId) setPendingSourceQuestionId(null);
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000);
    } catch { setSaveStatus('error'); }
  }, [cardId, title, content, marks, sectionName, initialCard.content_kind, onSaved, pendingSourceQuestionId]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 800);
  }, [doSave]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    scheduleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, marks, sectionName]);

  // Keep the Bank-drop title/content/source-id in sync if the user drops one in.
  const handleBankDropOnEditor = useCallback((q: BankQuestion) => {
    const { title: tplTitle, content: tplContent } = buildBankWorkedExampleTemplate(q);
    setContentHistory(prev => [...prev.slice(-9), content]);
    setContent(tplContent);
    if (!title.trim()) setTitle(tplTitle);
    setPendingSourceQuestionId(q.id);
    setAiPreviewContent(null);
  }, [content, title]);

  function handleUndo() {
    if (contentHistory.length === 0) return;
    const prev = contentHistory[contentHistory.length - 1];
    setContentHistory(h => h.slice(0, -1));
    setContent(prev);
    setAiPreviewContent(null);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        doSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && contentHistory.length > 0) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSave, contentHistory]);

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
      // Optimistic local delete + queued server delete via the offline store.
      await storeDeleteCard(cardId);
      onDeleted(cardId);
    } catch { setDeleting(false); setShowDelete(false); }
  }

  const siblings = allKindCards.filter(c => c.content_kind === initialCard.content_kind && c.section_name === initialCard.section_name).sort((a, b) => a.order_index - b.order_index);
  const sibIdx = siblings.findIndex(s => s.id === cardId);
  const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSib = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-header */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3">
        <span className={`text-xs font-semibold ${KIND_ACCENT[initialCard.content_kind]}`}>
          {KIND_LABEL[initialCard.content_kind]}
        </span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs text-slate-500 truncate min-w-0">{sectionName} · Card {sibIdx >= 0 ? sibIdx + 1 : '?'} of {siblings.length}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {saveStatus === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved ✓</span>}
          {saveStatus === 'error' && <span className="text-xs text-red-600">Error</span>}
          <button
            onClick={handleUndo}
            disabled={contentHistory.length === 0}
            className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
            title={contentHistory.length > 0 ? `Undo (⌘Z) — ${contentHistory.length} step${contentHistory.length > 1 ? 's' : ''}` : 'No undo history'}
          >
            ↩ Undo{contentHistory.length > 0 ? ` (${contentHistory.length})` : ''}
          </button>
          <button onClick={() => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } doSave(); }} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
          <button onClick={onAiToggle} className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50">{aiOpen ? 'Hide AI' : '✨ AI'}</button>
        </div>
      </div>

      {/* Meta row */}
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 bg-white space-y-2">
        <input
          type="text"
          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Card title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-slate-600">
            Section
            <input
              type="text"
              className="border border-slate-300 rounded px-2 py-1 w-40"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
            />
          </label>
          {initialCard.content_kind === 'practice' && (
            <label className="flex items-center gap-1.5 text-slate-600">
              Marks
              <input
                type="number"
                className="border border-slate-300 rounded px-2 py-1 w-14"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                min={0}
              />
            </label>
          )}
          {initialCard.source_question_id && <span className="text-blue-500">🔗 from bank</span>}
          {initialCard.source_card_id && <span className="text-slate-400">📎 from canonical card</span>}
          {pendingSourceQuestionId && <span className="text-blue-600 font-medium" title="Linked to bank question — saves on next Save">🔗 pending bank link</span>}
        </div>
      </div>

      {/* Editing area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Textarea */}
        <div
          className="flex flex-col min-w-0 overflow-hidden relative"
          style={{ width: textareaWidth, flexShrink: 0 }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-bank-question')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDragOverEditor(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOverEditor(false);
          }}
          onDrop={(e) => {
            const payload = e.dataTransfer.getData('application/x-bank-question');
            if (!payload) return;
            e.preventDefault();
            setDragOverEditor(false);
            try {
              const q = JSON.parse(payload) as BankQuestion;
              if (content.trim().length > 0) {
                const ok = window.confirm('Replace the current card content with this question template?');
                if (!ok) return;
              }
              handleBankDropOnEditor(q);
            } catch (err) { console.error('bank drop parse failed', err); }
          }}
        >
          {dragOverEditor && (
            <div className="absolute inset-0 z-10 pointer-events-none border-4 border-blue-500 bg-blue-50/70 flex items-center justify-center">
              <span className="text-blue-700 text-sm font-medium px-3 py-1 bg-white border border-blue-400 rounded shadow">Drop to replace card with question template</span>
            </div>
          )}
          <div className="px-3 py-1 bg-slate-50 border-b border-r border-slate-200 text-xs text-slate-500">Markdown + LaTeX</div>
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none px-3 py-2.5 text-sm font-mono focus:outline-none bg-white leading-relaxed border-r border-slate-200"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            spellCheck={false}
            placeholder={initialCard.content_kind === 'refresher'
              ? 'Short memory aid — formula, condition, mnemonic. Use $...$ for inline math, $$...$$ for display.'
              : initialCard.content_kind === 'worked_example'
                ? 'Question + Solution. Use $\\begin{aligned}...\\end{aligned}$ for chained equations.'
                : 'Practice question. Drop a bank question to populate.'}
          />
        </div>

        <ResizeHandle onDelta={onTextareaResize} />

        {/* Preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-3 py-1 bg-slate-50 border-b border-r border-slate-200 text-xs flex items-center gap-1.5">
            <span className="text-slate-500">Live preview</span>
            {aiPreviewContent && <span className="text-blue-600 font-medium">✨ AI suggestion</span>}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 bg-white prose prose-sm max-w-none border-r border-slate-200">
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeKatex, katexOptions]]}>
              {fixMathFences(aiPreviewContent ?? previewContent)}
            </ReactMarkdown>
          </div>
        </div>

        {/* Right tabbed panel */}
        {aiOpen && (
          <>
            <ResizeHandle onDelta={onAiResize} />
            <div className="flex flex-col overflow-hidden bg-white" style={{ width: aiWidth, flexShrink: 0 }}>
              <LessonRightPanel
                level={lessonLevel}
                topics={lessonTopics}
                auth={auth}
                activeTab={rightTab}
                onTabChange={onRightTabChange}
                aiContent={
                  <AISidebar
                    cardId={cardId}
                    lessonLevel={lessonLevel}
                    lessonTopics={lessonTopics}
                    sectionName={sectionName}
                    content={content}
                    title={title}
                    contentKind={initialCard.content_kind}
                    auth={auth}
                    onAccept={(c) => { setContentHistory(prev => [...prev.slice(-9), content]); setContent(c); }}
                    onPreviewChange={setAiPreviewContent}
                  />
                }
              />
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

// ── Lesson header (name, description, topics) ────────────────────────────────

function LessonHeader({ lesson, onSave }: { lesson: Lesson; onSave: (patch: Partial<Lesson>) => void }) {
  const [name, setName] = useState(lesson.name);
  const [desc, setDesc] = useState(lesson.description ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Re-sync when the lesson identity actually changes (e.g. parallel updates from another tab).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setName(lesson.name); setDesc(lesson.description ?? ''); }, [lesson.id]);

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="px-4 py-2.5 space-y-1.5">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== lesson.name && onSave({ name })}
            className="flex-1 px-2 py-1 text-base font-semibold text-slate-800 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded"
            placeholder="Lesson name"
          />
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded font-mono">{lesson.level}</span>
        </div>
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (lesson.description ?? '') && onSave({ description: desc || null } as Partial<Lesson>)}
          placeholder="Description (optional)"
          className="w-full px-2 py-1 text-xs text-slate-600 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded"
        />
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-slate-500 mt-1">Topics:</span>
          {lesson.topics.map(t => (
            <span key={t} className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded flex items-center gap-1">
              {t}
              <button onClick={() => onSave({ topics: lesson.topics.filter(x => x !== t) })} className="hover:text-rose-600">✕</button>
            </span>
          ))}
          <button onClick={() => setPickerOpen(o => !o)} className="text-xs px-2 py-0.5 border border-dashed border-slate-400 rounded text-slate-600 hover:border-emerald-500 hover:text-emerald-700">
            + Add topic
          </button>
        </div>
        {pickerOpen && <TopicPicker level={lesson.level} selected={lesson.topics} onPick={t => { onSave({ topics: [...lesson.topics, t] }); setPickerOpen(false); }} />}
      </div>
    </div>
  );
}

function TopicPicker({ level, selected, onPick }: { level: string; selected: string[]; onPick: (t: string) => void }) {
  const cats = getTopicsForPaperLevel(level);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 max-h-72 overflow-y-auto">
      {cats.map(cat => (
        <div key={cat.label} className="mb-2">
          <div className="text-xs font-semibold text-slate-600 mb-1">{cat.label}</div>
          <div className="flex flex-wrap gap-1">
            {cat.topics.map(t => {
              const dis = selected.includes(t);
              return (
                <button key={t} disabled={dis} onClick={() => onPick(t)}
                        className={`text-xs px-2 py-0.5 rounded ${dis ? 'bg-slate-200 text-slate-400' : 'bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-700'}`}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kind panel — one of refresher/worked_example/practice ────────────────────

function KindPanel({
  kind,
  cards,
  selectedId,
  activeId,
  activeDragKind,
  localSections,
  onSelectCard,
  onBankDropOnList,
  onAddSection,
  onAddCard,
  onRenameSection,
  onDeleteSection,
}: {
  kind: ContentKind;
  cards: Card[];
  selectedId: string | null;
  activeId: string | null;
  activeDragKind: string | null;
  localSections: string[];
  onSelectCard: (id: string) => void;
  onBankDropOnList: (q: BankQuestion, anchor: Card, position: 'above' | 'below') => void;
  onAddSection: (kind: ContentKind) => void;
  onAddCard: (kind: ContentKind, section: string) => void;
  onRenameSection: (kind: ContentKind, oldName: string, newName: string) => void;
  onDeleteSection: (kind: ContentKind, name: string) => void;
}) {
  const pre = KIND_PREFIX[kind];
  const accent = KIND_ACCENT[kind];

  const sections = useMemo(() => {
    const fromCards = [...new Set(cards.map(c => c.section_name))].filter(Boolean);
    const all = [...new Set([...fromCards, ...localSections])];
    return all.sort();
  }, [cards, localSections]);

  const isPanelDragTarget = activeDragKind !== null && activeDragKind !== kind;
  const isCardDrag = !!activeId && !String(activeId).startsWith('sec-hdr-');

  return (
    <div className="mt-2">
      <div className={`flex items-center gap-1 px-1 py-1.5 rounded transition-colors ${isPanelDragTarget ? 'bg-indigo-50' : ''}`}>
        <span className={`text-xs font-semibold flex-1 ${accent}`}>
          {KIND_LABEL[kind]} <span className="font-normal text-slate-400">({cards.length})</span>
        </span>
        <button
          onClick={() => onAddSection(kind)}
          className="text-xs px-2 py-0.5 border border-slate-300 rounded hover:bg-slate-50 shrink-0"
          title="Add a new section"
        >+ Section</button>
      </div>

      {sections.length === 0 ? (
        <DroppablePanel id={`panel-${pre}`} isCrossKindTarget={isPanelDragTarget}>
          <div className="px-3 py-3 text-center">
            <p className="text-slate-400 text-sm mb-2">No {kind.replace('_', ' ')} cards yet.</p>
            <button onClick={() => onAddSection(kind)} className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50">+ New section</button>
          </div>
        </DroppablePanel>
      ) : (
        <div className="space-y-3">
          <SortableContext items={sections.map(s => `sec-hdr-${pre}-${s}`)} strategy={verticalListSortingStrategy}>
            {sections.map(sectionName => {
              const sectionCards = cards.filter(c => c.section_name === sectionName).sort((a, b) => a.order_index - b.order_index);
              return (
                <SortableSectionWrapper
                  key={sectionName}
                  kind={kind}
                  name={sectionName}
                  cardCount={sectionCards.length}
                  onRenamed={onRenameSection}
                  onDeleted={onDeleteSection}
                  onAddCard={() => onAddCard(kind, sectionName)}
                >
                  <DroppableSectionZone name={sectionName} kindPrefix={pre} isDragActive={isCardDrag}>
                    <SortableContext items={sectionCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {sectionCards.map((card, idx) => (
                          <SortableCardRow
                            key={card.id}
                            card={card}
                            displayIndex={idx + 1}
                            isSelected={selectedId === card.id}
                            onSelect={onSelectCard}
                            onBankDrop={onBankDropOnList}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DroppableSectionZone>
                </SortableSectionWrapper>
              );
            })}
          </SortableContext>
          <DroppablePanel id={`panel-${pre}`} isCrossKindTarget={isPanelDragTarget} />
        </div>
      )}
    </div>
  );
}

// ── Main editor ──────────────────────────────────────────────────────────────

export default function LessonEditorClient() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');
  const pw = useRef<string>('');
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'ai' | 'bank'>('ai');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragKind, setActiveDragKind] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newSectionKind, setNewSectionKind] = useState<ContentKind | null>(null);
  // UI-only "empty" sections per kind — sections with no cards yet, kept locally until a card is added.
  const [localSections, setLocalSections] = useState<Record<ContentKind, string[]>>({ refresher: [], worked_example: [], practice: [] });

  // Layout (localStorage)
  const [listWidth, setListWidth] = useState(DEFAULT_LAYOUT.listWidth);
  const [textareaWidth, setTextareaWidth] = useState(DEFAULT_LAYOUT.textareaWidth);
  const [aiWidth, setAiWidth] = useState(DEFAULT_LAYOUT.aiWidth);
  const layoutLoaded = useRef(false);

  useEffect(() => {
    const cookiePw = getCookie('admin_pw') || getCookie('schedule_pw');
    pw.current = cookiePw;
    setAuthed(!!cookiePw);
    if (!layoutLoaded.current) {
      layoutLoaded.current = true;
      const l = loadLayout();
      setListWidth(l.listWidth); setTextareaWidth(l.textareaWidth); setAiWidth(l.aiWidth);
    }
  }, []);

  useEffect(() => {
    if (!layoutLoaded.current) return;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ listWidth, textareaWidth, aiWidth }));
  }, [listWidth, textareaWidth, aiWidth]);

  const loadLesson = useCallback(async () => {
    if (!authed || !id) return;
    setLoading(true);
    try {
      // storeLoadLesson is network-first when online, falls back to IndexedDB when offline.
      // Either way it returns the same shape; the caller doesn't need to know which.
      const d = await storeLoadLesson(id);
      if (d) {
        setLesson(d.lesson as unknown as Lesson);
        setCards(d.cards as unknown as Card[]);
      }
    } finally { setLoading(false); }
  }, [authed, id]);

  useEffect(() => { loadLesson(); }, [loadLesson]);

  // Auto-sync the question-bank cache (no-op if offline mode is off or we're offline).
  // Runs once on mount; we deliberately don't put it on a dep array because we want
  // exactly one attempt per editor session.
  useEffect(() => {
    if (!authed) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void syncEnabledLevels();
  }, [authed]);

  // Register the lessons service worker (page-shell cache) once authed. No-op in dev.
  useEffect(() => {
    if (!authed) return;
    registerLessonsServiceWorker();
  }, [authed]);

  async function saveLessonMeta(patch: Partial<Lesson>) {
    if (!lesson) return;
    setLesson({ ...lesson, ...patch });
    const updated = await storeSaveLessonMeta(id, patch as Record<string, unknown>);
    if (updated) { setLesson(updated as unknown as Lesson); setSavedAt(new Date()); }
  }

  const addCard = useCallback(async (kind: ContentKind, extra: Partial<Card> = {}) => {
    const section = extra.section_name ?? DEFAULT_SECTION[kind];
    const created = await storeAddCard({
      lesson_id: id,
      content_kind: kind,
      section_name: section,
      card_title: extra.card_title ?? '',
      content: extra.content ?? '',
      marks: extra.marks ?? null,
      source_question_id: extra.source_question_id ?? null,
      source_card_id: extra.source_card_id ?? null,
    });
    if (created) {
      setCards(prev => [...prev, created as unknown as Card]);
      setLocalSections(prev => ({ ...prev, [kind]: prev[kind].filter(s => s !== section) }));
      setSavedAt(new Date());
      return created as unknown as Card;
    }
    return null;
  }, [id]);

  const handleCardSaved = useCallback((updated: Card) => {
    setCards(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    setSavedAt(new Date());
  }, []);

  const handleCardDeleted = useCallback((cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId));
    setSelectedId(null);
    setSavedAt(new Date());
  }, []);

  // Rename section: bulk-PATCH every card in that (kind, section) to the new section name.
  const handleRenameSection = useCallback(async (kind: ContentKind, oldName: string, newName: string) => {
    if (oldName === newName) return;
    const toRename = cards.filter(c => c.content_kind === kind && c.section_name === oldName);
    setCards(prev => prev.map(c => (c.content_kind === kind && c.section_name === oldName) ? { ...c, section_name: newName } : c));
    setLocalSections(prev => ({ ...prev, [kind]: prev[kind].map(s => s === oldName ? newName : s) }));
    // Local-first patch for each card; sync engine ships them.
    await Promise.all(toRename.map(c => storePatchCard(c.id, { section_name: newName })));
    setSavedAt(new Date());
  }, [cards]);

  // Delete an empty section — just remove from localSections (no API call needed because no cards remain).
  const handleDeleteSection = useCallback((kind: ContentKind, name: string) => {
    const hasCards = cards.some(c => c.content_kind === kind && c.section_name === name);
    if (hasCards) { alert('Move or delete the cards in this section first.'); return; }
    setLocalSections(prev => ({ ...prev, [kind]: prev[kind].filter(s => s !== name) }));
  }, [cards]);

  // Bank-question drop on the card list — create a new card at insertion point
  const handleBankDropOnList = useCallback(async (q: BankQuestion, anchorCard: Card, position: 'above' | 'below') => {
    const { title: tplTitle, content: tplContent } = buildBankWorkedExampleTemplate(q);
    const created = await addCard(anchorCard.content_kind, {
      section_name: anchorCard.section_name,
      card_title: tplTitle,
      content: tplContent,
      source_question_id: q.id,
      marks: anchorCard.content_kind === 'practice' ? q.total_marks ?? null : null,
    });
    if (!created) return;
    // Reorder: place the new card immediately above/below the anchor within its (kind, section).
    const sectionCards = cards.filter(c => c.content_kind === anchorCard.content_kind && c.section_name === anchorCard.section_name).sort((a, b) => a.order_index - b.order_index);
    const idx = sectionCards.findIndex(c => c.id === anchorCard.id);
    const insertIdx = position === 'above' ? idx : idx + 1;
    const newOrder = [...sectionCards];
    newOrder.splice(insertIdx, 0, created);
    const orderedIds = newOrder.map(c => c.id);
    await storeReorderCards(orderedIds);
    // Optimistically update order_index in state
    setCards(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      orderedIds.forEach((cid, i) => {
        const c = map.get(cid);
        if (c) c.order_index = i;
      });
      return Array.from(map.values());
    });
    setSelectedId(created.id);
    setSavedAt(new Date());
  }, [addCard, cards]);

  // ── DnD ────────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  function parseHdrId(id: string): { kind: ContentKind; name: string } | null {
    for (const k of KIND_ORDER) {
      const pre = KIND_PREFIX[k];
      if (id.startsWith(`sec-hdr-${pre}-`)) return { kind: k, name: id.slice(`sec-hdr-${pre}-`.length) };
    }
    return null;
  }
  function parseDropId(id: string, all: Card[]): { kind: ContentKind; section: string } | null {
    for (const k of KIND_ORDER) {
      const pre = KIND_PREFIX[k];
      if (id.startsWith(`sec-zone-${pre}-`)) return { kind: k, section: id.slice(`sec-zone-${pre}-`.length) };
      if (id.startsWith(`sec-hdr-${pre}-`)) return { kind: k, section: id.slice(`sec-hdr-${pre}-`.length) };
      if (id === `panel-${pre}`) return { kind: k, section: '' };
    }
    const card = all.find(c => c.id === id);
    if (card) return { kind: card.content_kind, section: card.section_name };
    return null;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(t => t === msg ? null : t), 2000);
  }

  function handleDragStart(e: DragStartEvent) {
    const idStr = String(e.active.id);
    setActiveId(idStr);
    if (navigator.vibrate) navigator.vibrate(30);
    const hdr = parseHdrId(idStr);
    if (hdr) { setActiveDragKind(hdr.kind); return; }
    const found = cards.find(c => c.id === idStr);
    setActiveDragKind(found?.content_kind ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setActiveDragKind(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Section drag — within-kind only for lessons (cross-kind section moves are excluded
    // because sections are just per-card strings, no section_meta table).
    const activeHdr = parseHdrId(activeIdStr);
    if (activeHdr) {
      // No-op: lessons don't persist section order separately (no sections_meta table). Section
      // ordering is alphabetical for now. Reordering UI was kept so the drag handle still renders,
      // but the drag is non-destructive.
      return;
    }

    const ac = cards.find(c => c.id === activeIdStr);
    if (!ac) return;
    const dropTarget = parseDropId(overIdStr, cards);
    if (!dropTarget) return;

    const srcKind = ac.content_kind;
    const srcSection = ac.section_name;
    const tgtKind = dropTarget.kind;
    const tgtSection = dropTarget.section || srcSection;

    const isCrossKind = srcKind !== tgtKind;
    const isCrossSection = srcSection !== tgtSection;

    if (!isCrossKind && !isCrossSection) {
      // Reorder within same (kind, section)
      if (overIdStr.startsWith('sec-') || overIdStr.startsWith('panel-')) return;
      const sectionCards = cards.filter(c => c.content_kind === srcKind && c.section_name === srcSection).sort((a, b) => a.order_index - b.order_index);
      const oi = sectionCards.findIndex(c => c.id === activeIdStr);
      const ni = sectionCards.findIndex(c => c.id === overIdStr);
      if (oi === -1 || ni === -1) return;
      const reordered = arrayMove(sectionCards, oi, ni);
      const reorderedIds = reordered.map(c => c.id);
      setCards(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        reorderedIds.forEach((cid, i) => {
          const c = map.get(cid);
          if (c) c.order_index = i;
        });
        return Array.from(map.values());
      });
      await storeReorderCards(reorderedIds);
      setSavedAt(new Date());
      return;
    }

    // Cross-section and/or cross-kind move: PATCH the card, then reorder both src + dst groups.
    _recentlyMovedCardId = activeIdStr;
    setTimeout(() => { _recentlyMovedCardId = null; }, 80);

    const patch: Record<string, unknown> = {};
    if (isCrossKind) patch.content_kind = tgtKind; // NB: API doesn't whitelist content_kind in PATCH currently — see note below.
    if (isCrossSection) patch.section_name = tgtSection;

    // Build new src + dst lists with the move applied
    const remainingSrc = cards.filter(c => c.content_kind === srcKind && c.section_name === srcSection && c.id !== activeIdStr).sort((a, b) => a.order_index - b.order_index);
    const dstExisting = cards.filter(c => c.content_kind === tgtKind && c.section_name === tgtSection && c.id !== activeIdStr).sort((a, b) => a.order_index - b.order_index);
    const movedCard: Card = { ...ac, content_kind: tgtKind, section_name: tgtSection };
    const newDst = [...dstExisting, movedCard];

    setCards(prev => prev
      .filter(c => c.id !== activeIdStr)
      .concat([movedCard])
      .map(c => {
        if (c.content_kind === srcKind && c.section_name === srcSection) {
          const idx = remainingSrc.findIndex(x => x.id === c.id);
          return idx >= 0 ? { ...c, order_index: idx } : c;
        }
        if (c.content_kind === tgtKind && c.section_name === tgtSection) {
          const idx = newDst.findIndex(x => x.id === c.id);
          return idx >= 0 ? { ...c, order_index: idx } : c;
        }
        return c;
      })
    );

    setLocalSections(prev => ({ ...prev, [tgtKind]: prev[tgtKind].filter(s => s !== tgtSection) }));

    if (isCrossKind) showToast(`Moved to ${KIND_LABEL[tgtKind]}`);
    else if (isCrossSection) showToast(`Moved to "${tgtSection}"`);

    try {
      await storePatchCard(activeIdStr, patch as Partial<Card>);
      // Reorder destination
      if (newDst.length > 0) await storeReorderCards(newDst.map(c => c.id));
      // Reorder source remainder (if any)
      if (remainingSrc.length > 0) await storeReorderCards(remainingSrc.map(c => c.id));
      setSavedAt(new Date());
    } catch {
      // Reload on failure to ensure UI matches server
      loadLesson();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authed === null || loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!authed) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xl font-semibold text-slate-700">Admin login required</p>
      <Link className="text-blue-600 underline text-sm" href="/admin">/admin</Link>
    </main>
  );
  if (!lesson) return <div className="p-8 text-red-500">Lesson not found.</div>;

  const cardsByKind: Record<ContentKind, Card[]> = {
    refresher: cards.filter(c => c.content_kind === 'refresher'),
    worked_example: cards.filter(c => c.content_kind === 'worked_example'),
    practice: cards.filter(c => c.content_kind === 'practice'),
  };

  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;
  const selectedCard = selectedId ? cards.find(c => c.id === selectedId) ?? null : null;
  const allCardsForNav = selectedCard ? cards.filter(c => c.content_kind === selectedCard.content_kind) : [];

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-2 flex items-center gap-3 text-sm">
        <Link href="/admin/lessons" className="hover:text-emerald-300 font-medium">📚 Lessons</Link>
        <span className="text-slate-400">/</span>
        <span className="text-emerald-300 font-medium truncate">{lesson.name}</span>
        <span className="flex-1" />
        <SyncStatusPill />
        <BankStalePill />
        <OfflineModePill />
        {savedAt && <span className="text-xs text-emerald-300/70">{savedAt.toLocaleTimeString()}</span>}
        <button
          onClick={() => generatePDF(id, pw.current, lesson.name)}
          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 rounded text-xs font-medium"
        >📄 Generate PDF</button>
        <button
          onClick={() => deleteLesson(id, pw.current, router)}
          className="px-2 py-1 hover:bg-rose-700/40 rounded text-xs"
          title="Delete lesson"
        >🗑</button>
      </div>

      {/* Lesson metadata */}
      <LessonHeader lesson={lesson} onSave={saveLessonMeta} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: card list */}
        <div className="shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden" style={{ width: listWidth }}>
          <DndContext sensors={sensors} collisionDetection={customCollision} modifiers={[restrictToVerticalAxis]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {KIND_ORDER.map(kind => (
                <KindPanel
                  key={kind}
                  kind={kind}
                  cards={cardsByKind[kind]}
                  selectedId={selectedId}
                  activeId={activeId}
                  activeDragKind={activeDragKind}
                  localSections={localSections[kind]}
                  onSelectCard={setSelectedId}
                  onBankDropOnList={handleBankDropOnList}
                  onAddSection={(k) => setNewSectionKind(k)}
                  onAddCard={(k, section) => addCard(k, { section_name: section })}
                  onRenameSection={handleRenameSection}
                  onDeleteSection={handleDeleteSection}
                />
              ))}
            </div>
            <DragOverlay modifiers={[restrictToVerticalAxis]}>
              {activeId ? (() => {
                const hdrName = (() => {
                  for (const k of KIND_ORDER) {
                    const pre = KIND_PREFIX[k];
                    const prefix = `sec-hdr-${pre}-`;
                    if (String(activeId).startsWith(prefix)) return String(activeId).slice(prefix.length);
                  }
                  return null;
                })();
                if (hdrName) return <div className="px-3 py-1.5 bg-white border border-slate-300 rounded shadow-md text-xs font-semibold text-slate-600 opacity-90">{hdrName}</div>;
                return activeCard ? <DragCardOverlay card={activeCard} /> : null;
              })() : null}
            </DragOverlay>
          </DndContext>
        </div>

        <ResizeHandle onDelta={(d) => setListWidth(w => Math.max(MIN.list, Math.min(MAX.list, w + d)))} />

        {/* Right: editor */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!selectedCard && (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Select a card to edit. Drop a bank question on the right tab to create one.
            </div>
          )}
          {selectedCard && (
            <EditorPanel
              key={selectedCard.id}
              initialCard={selectedCard}
              lessonLevel={lesson.level}
              lessonTopics={lesson.topics}
              auth={pw.current}
              allKindCards={allCardsForNav}
              textareaWidth={textareaWidth}
              aiWidth={aiWidth}
              aiOpen={aiOpen}
              rightTab={rightTab}
              onRightTabChange={setRightTab}
              onSaved={handleCardSaved}
              onDeleted={handleCardDeleted}
              onNavigate={setSelectedId}
              onTextareaResize={(d) => setTextareaWidth(w => Math.max(MIN.textarea, Math.min(MAX.textarea, w + d)))}
              onAiResize={(d) => setAiWidth(w => Math.max(MIN.ai, Math.min(MAX.ai, w - d)))}
              onAiToggle={() => setAiOpen(v => !v)}
            />
          )}
        </div>
      </div>

      {newSectionKind && (
        <NewSectionModal
          kind={newSectionKind}
          existingSections={[...new Set(cards.filter(c => c.content_kind === newSectionKind).map(c => c.section_name))]}
          onClose={() => setNewSectionKind(null)}
          onCreated={(name) => {
            setLocalSections(prev => ({ ...prev, [newSectionKind]: prev[newSectionKind].includes(name) ? prev[newSectionKind] : [...prev[newSectionKind], name] }));
            setNewSectionKind(null);
          }}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// (The old `api()` helper was removed when this component was migrated to the offline
// store in lib/offline/store.ts — every mutation now flows through there.)

async function generatePDF(lessonId: string, pw: string, name: string) {
  try {
    const res = await fetch(`/api/admin/lessons/${lessonId}/pdf`, { headers: { Authorization: `Bearer ${pw}` } });
    if (!res.ok) { alert('PDF generation failed: ' + (await res.text()).slice(0, 200)); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name.replace(/[^a-z0-9-]+/gi, '_')}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('PDF error: ' + (e as Error).message);
  }
}

async function deleteLesson(id: string, pw: string, router: ReturnType<typeof useRouter>) {
  if (!confirm('Delete this lesson and all its cards? This cannot be undone.')) return;
  await fetch(`/api/admin/lessons/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${pw}` } });
  router.push('/admin/lessons');
}
