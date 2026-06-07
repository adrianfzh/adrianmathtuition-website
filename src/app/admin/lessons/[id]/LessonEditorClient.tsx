'use client';

/* eslint-disable @next/next/no-img-element */
// Lesson editor — multi-topic teaching-deck editor with the same UX as /admin/edit-cards
// (dnd-kit drag-drop, KaTeX live preview, resizable panels, AI sidebar, bank panel).
// Code is COPIED from EditCardsClient.tsx with adjustments for the lessons data model:
//   * Cards have content_kind ∈ {refresher, worked_example, practice} and a section_name
//     (no subgroup_id, no display_group, no is_published).
//   * Bank questions filter by lesson.topics (array), not by sub-group.
//   * Reorder endpoint takes a single orderedIds list per (kind, section) group.

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { renderDesmosPng } from '@/lib/desmos';
import { LessonRightPanel, buildBankWorkedExampleTemplate, type BankQuestion } from './LessonBankPanel';
import { StagingPanel } from './StagingPanel';
import { addToStaging, isStaged as storeIsStaged, stagedCount, subscribeStaging, removeStaged, setPane as setStagePane, setKind as setStageKind, setSection as setStageSection, setStagingScope, type StageKind } from '@/lib/staging-store';
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
  // Lesson-level ordered list of section names; unknown sections fall back to alphabetical.
  section_order?: string[];
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
  is_advanced?: boolean;
  order_index: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_SECTION: Record<ContentKind, string> = {
  refresher: 'Refreshers',
  worked_example: 'Worked Examples',
  practice: 'Practice',
};
// Section-first model: a lesson is an ordered list of named sections; each card carries a `kind`
// (refresher / worked example / practice) shown as a chip and used for PDF styling + answers.
const KIND_CHIP: Record<ContentKind, { icon: string; cls: string; short: string }> = {
  refresher: { icon: 'R', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', short: 'Refresher' },
  worked_example: { icon: 'E', cls: 'bg-blue-50 text-blue-700 border-blue-200', short: 'Worked example' },
  practice: { icon: 'P', cls: 'bg-orange-50 text-orange-700 border-orange-200', short: 'Practice' },
};
// Single DnD id namespace now that sections are lesson-level (no per-kind prefix).
const SEC = 'x';

// Coerce lessons.section_order to an array — legacy rows stored it as a `{}` object (the column's
// old default), so we must never assume it's an array.
function asOrder(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// Lesson-level ordered section list: saved order first, then any new sections alphabetically.
function orderedSections(cards: Card[], local: string[], order: unknown): string[] {
  const ord = asOrder(order);
  const all = [...new Set([...cards.map(c => c.section_name).filter(Boolean), ...local])];
  const known = ord.filter(s => all.includes(s));
  const rest = all.filter(s => !known.includes(s)).sort();
  return [...known, ...rest];
}

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

// ── Cookie helper ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// Wrap standalone <img> tags (each on its own line) in a <div> before rendering. A bare <img> is
// inline/phrasing content, and react-markdown's raw-HTML reparse (rehype-raw) can reorder it
// relative to adjacent blocks (e.g. an image swapping places with the next paragraph). Wrapping it
// in a block-level <div> keeps it in source order. Render-time only — stored content is untouched,
// so this also fixes images already saved in older cards.
function wrapBlockImages(md: string): string {
  return md.replace(/^[ \t]*(<img\b[^>]*?>)[ \t]*$/gim, '<div>$1</div>');
}

// remark-math (the editor preview's math parser) mishandles escaped-dollar currency written as a
// self-contained math span like `$\$32000$`: it mis-pairs the `$` delimiters and swallows the prose
// between two currency amounts (renders it as italic run-together math). KaTeX auto-render (the
// question-bank viewer) handles `\$` fine, so this is a preview-only quirk. Fix: convert a
// self-contained currency span `$\$<number>$` into plain escaped text `\$<number>` (markdown renders
// `\$` as a literal $), so remark-math never has to pair those delimiters. Render-time only — the
// stored content is untouched. Real math spans ($V$, $V=A(1.25)^{kt}$, …) are left alone.
function fixCurrencyDollars(md: string): string {
  // House style writes currency inside math with an escaped dollar: $\$20$, $\$k$, $\$8{,}250$,
  // $\$100900(1.009)^{n-1} - \$90810$. remark-math doesn't honour the escape and mis-pairs the
  // `$`s, swallowing prose as run-together math. Rewrite EVERY `\$` inside a math span to
  // \text{\textdollar} (no `$` character at all) so the span pairs cleanly and still renders as
  // real math. The span matcher is escape-aware so an interior `\$` doesn't end the span.
  return md.replace(/\$((?:\\.|[^$\\])*)\$/g, (m, body: string) => {
    if (!body.includes('\\$')) return m; // ordinary math — leave untouched
    return `$${body.replace(/\\\$/g, '\\text{\\textdollar}')}$`;
  });
}

// Rewrite the width of the Nth <img> in the markdown source (used by drag-to-resize in the preview).
// Sets an explicit pixel width and removes max-width so the chosen size sticks.
function setImgWidthInMarkdown(md: string, index: number, widthPx: number): string {
  let i = -1;
  return md.replace(/<img\b[^>]*>/gi, (tag) => {
    i++;
    if (i !== index) return tag;
    const styleDecl = `width:${widthPx}px;max-width:100%`;
    if (/style\s*=\s*"/i.test(tag)) {
      return tag.replace(/style\s*=\s*"([^"]*)"/i, (_m, s: string) => {
        const rest = s
          .split(';')
          .map(d => d.trim())
          .filter(d => d && !/^width\s*:/i.test(d) && !/^max-width\s*:/i.test(d))
          .join('; ');
        return `style="${rest ? rest + '; ' : ''}${styleDecl}"`;
      });
    }
    return tag.replace(/<img\b/i, `<img style="${styleDecl}"`);
  });
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

const GENERATE_SOLUTIONS_INSTRUCTION = `Add a full worked solution to this card. Preserve every labelled part — if the input has (a), (b), (i), (ii), keep them all and solve each. Style: match the lesson worked-example style. Use **Step 1.**, **Solution:** etc. Use $\\begin{aligned}...\\end{aligned}$ for chained equations. Speak to the student in second person. If a per-part solution already exists, leave it intact.`;

const QUICK_ACTIONS = [
  { label: 'Generate solutions', instruction: GENERATE_SOLUTIONS_INSTRUCTION },
  { label: 'Make clearer', instruction: 'Rewrite for clarity. Same content, same answer, but cleaner phrasing.' },
  { label: 'Format nicely', instruction: 'Improve the formatting and readability ONLY. Keep ALL existing content — every example, formula, value, line and labelled part. Do not delete, shorten, reword the maths, or remove anything. Just improve layout: clear bold headers/labels, sensible line breaks and spacing, put each formula on its own line with $$...$$ where it helps, and use bullet points or short lines where they make it easier to scan.' },
  { label: 'Shorten ~30%', instruction: 'Shorten by roughly 30%. Drop filler, keep every algebra step.' },
  { label: 'Add pitfall note', instruction: "At the end, add a brief 'Common pitfall:' line warning about the most likely student error." },
  { label: 'Add sanity check', instruction: "Add a final 'Check:' step that substitutes the answer back or spot-checks the result." },
  { label: 'Tighten algebra', instruction: 'Combine micro-steps that students can do in one line, but keep enough scaffolding that the logic is followable.' },
  { label: 'Fresh example', instruction: "Same sub-skill, different numbers and surface. Don't reuse the same coefficients. Rewrite the whole card." },
];

// ── Custom collision detection (cards + section headers) ─────────────────────

const customCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (activeId.startsWith('sec-hdr-')) {
    // Section header drag → only consider other section headers.
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(c => String(c.id).startsWith('sec-hdr-')),
    });
  }

  const activeSection: string = (args.active.data.current as { section?: string } | undefined)?.section ?? '';
  const cardContainers = args.droppableContainers.filter(c => !String(c.id).startsWith('sec-hdr-'));
  const chipContainers = cardContainers.filter(c => !String(c.id).startsWith('sec-zone-'));

  const chipPointer = pointerWithin({ ...args, droppableContainers: chipContainers });
  if (chipPointer.length > 0) return chipPointer;

  const zonePointer = pointerWithin({ ...args, droppableContainers: cardContainers });
  if (zonePointer.length > 0) {
    const firstId = String(zonePointer[0].id);
    const zoneSection = firstId.startsWith(`sec-zone-${SEC}-`) ? firstId.slice(`sec-zone-${SEC}-`.length) : '';
    if (zoneSection !== activeSection) return zonePointer; // dropping into a different section
  }

  return closestCenter({ ...args, droppableContainers: chipContainers.length > 0 ? chipContainers : cardContainers });
};

// ── Sortable card row ────────────────────────────────────────────────────────

const KIND_CYCLE: Record<ContentKind, ContentKind> = { refresher: 'worked_example', worked_example: 'practice', practice: 'refresher' };

function SortableCardRow({
  card, displayIndex, isSelected, onSelect, onBankDrop, onQuickDelete, onQuickKind,
}: {
  card: Card;
  displayIndex: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onBankDrop?: (q: BankQuestion, anchorCard: Card, position: 'above' | 'below') => void;
  onQuickDelete?: (card: Card) => void;
  onQuickKind?: (card: Card, kind: ContentKind) => void;
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
      className={`group relative flex items-center gap-2 px-3 py-2 rounded cursor-pointer border transition-colors ${isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'} ${animateIn ? 'card-section-entry' : ''} ${bankHover ? 'ring-2 ring-blue-200' : ''}`}
    >
      {bankHover === 'above' && <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none" />}
      {bankHover === 'below' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none" />}
      <span {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="text-slate-300 cursor-grab active:cursor-grabbing select-none shrink-0" title="Drag to reorder">⠿</span>
      <span className="text-slate-400 text-xs w-4 shrink-0">{displayIndex}.</span>
      <button
        onClick={(e) => { e.stopPropagation(); onQuickKind?.(card, KIND_CYCLE[card.content_kind]); }}
        className={`text-[10px] font-bold w-4 text-center rounded border shrink-0 cursor-pointer hover:ring-1 hover:ring-blue-400 ${KIND_CHIP[card.content_kind].cls}`}
        title={`${KIND_CHIP[card.content_kind].short} — click to change to ${KIND_CHIP[KIND_CYCLE[card.content_kind]].short}`}
      >{KIND_CHIP[card.content_kind].icon}</button>
      <span className="flex-1 text-sm text-slate-800 min-w-0 leading-snug truncate">{card.card_title || <em className="text-slate-400">Untitled</em>}</span>
      {card.content_kind === 'practice' && card.is_advanced && (
        <span className="text-[9px] font-bold text-orange-700 bg-orange-100 border border-orange-200 px-1 rounded shrink-0" title="Advanced practice">ADV</span>
      )}
      {card.content_kind === 'practice' && card.marks != null && (
        <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded shrink-0">{card.marks}m</span>
      )}
      {card.source_question_id && (
        <span className="text-[10px] text-blue-500 shrink-0" title="From bank">🔗</span>
      )}
      {onQuickDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onQuickDelete(card); }}
          className="shrink-0 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none px-1"
          title="Delete card (Ctrl/Cmd+Z to undo)"
        >🗑</button>
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
  name, cardCount, dragHandleProps, onRenamed, onDeleted, onAddCard,
}: {
  name: string;
  cardCount: number;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  onRenamed: (oldName: string, newName: string) => void;
  onDeleted: (name: string) => void;
  onAddCard?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setEditName(name); return; }
    onRenamed(name, trimmed);
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
      <button
        onClick={() => onDeleted(name)}
        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs leading-none"
        title={cardCount === 0 ? 'Delete section' : `Delete section and its ${cardCount} card${cardCount > 1 ? 's' : ''}`}
      >🗑</button>
    </div>
  );
}

// ── Droppable wrappers ───────────────────────────────────────────────────────

function DroppableSectionZone({ name, children, isDragActive }: {
  name: string; children: React.ReactNode; isDragActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `sec-zone-${SEC}-${name}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-6 rounded transition-colors ${isDragActive && isOver ? 'outline outline-2 outline-dashed outline-blue-400 bg-blue-50' : ''}`}
    >
      {children}
    </div>
  );
}

function SortableSectionWrapper({
  name, cardCount, onRenamed, onDeleted, onAddCard, children,
}: {
  name: string;
  cardCount: number;
  onRenamed: (oldName: string, newName: string) => void;
  onDeleted: (name: string) => void;
  onAddCard: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sec-hdr-${SEC}-${name}`,
    data: { isSectionHeader: true, name },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <SectionHeader
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

function NewSectionModal({ existingSections, onClose, onCreated }: {
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
      // Blank name → create an "Untitled section" the user can rename later via the header.
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
        <h2 className="text-base font-semibold text-slate-800 mb-3">New section</h2>
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
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Desmos graph generator
  const [graphEqs, setGraphEqs] = useState('');
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphErr, setGraphErr] = useState('');
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

  // Render the equations in Desmos (a real plotting engine), upload the PNG, append it to the card.
  async function insertGraph() {
    const eqs = graphEqs.split('\n').map(s => s.trim()).filter(Boolean);
    if (eqs.length === 0) { setGraphErr('Enter at least one equation'); return; }
    setGraphBusy(true); setGraphErr('');
    try {
      const dataUrl = await renderDesmosPng(eqs);
      const res = await fetch('/api/admin/lessons/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({} as { error?: string })); throw new Error(j.error || `HTTP ${res.status}`); }
      const { url } = await res.json() as { url: string };
      const img = `<img src="${url}" alt="graph" style="max-width:100%;display:block;margin:8px 0" />`;
      onAccept((content ? content + '\n\n' : '') + img);
      setGraphEqs('');
    } catch (e) {
      setGraphErr(e instanceof Error ? e.message : 'Graph generation failed');
    } finally {
      setGraphBusy(false);
    }
  }

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
            <div className="mt-1.5 border border-slate-200 rounded bg-slate-50 p-1.5 space-y-1.5">
              {images.map((img, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <img src={img.previewUrl} alt={`image ${idx + 1}`} className="h-16 w-20 object-contain bg-white rounded border border-slate-200 shrink-0" />
                  <button onClick={() => setCropIdx(idx)} className="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50">✂ Crop</button>
                  <button onClick={() => removeImage(idx)} className="text-xs px-2 py-1 border border-slate-300 rounded bg-white text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
              <p className="text-[10px] text-slate-400">{images.length} image{images.length > 1 ? 's' : ''} — crop to the part you want, then Extract.</p>
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
        <div className="border-t border-slate-200 pt-2 mt-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">📈 Graph (Desmos)</p>
          <textarea
            className="w-full border border-slate-300 rounded px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            rows={2}
            placeholder={'One equation per line, e.g.\n(x-1)^2+(y+2)^2=9'}
            value={graphEqs}
            onChange={(e) => setGraphEqs(e.target.value)}
            disabled={graphBusy}
          />
          <button
            onClick={insertGraph}
            disabled={graphBusy || !aiOnline || !graphEqs.trim()}
            className="mt-1.5 w-full py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
          >{graphBusy ? 'Plotting…' : !aiOnline ? 'Offline' : 'Insert accurate graph →'}</button>
          {graphErr && <p className="text-[11px] text-red-600 mt-1">{graphErr}</p>}
          <p className="text-[10px] text-slate-400 mt-1">Plotted by Desmos and inserted as an image — accurate on axes (unlike AI sketches).</p>
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
      {cropIdx !== null && images[cropIdx] && (
        <ImageCropModal
          src={images[cropIdx].previewUrl}
          onAddCrop={(data, mediaType, previewUrl) => setImages(prev => [...prev, { data, mediaType, previewUrl }])}
          onReplace={(data, mediaType, previewUrl) => {
            setImages(prev => prev.map((im, i) => i === cropIdx ? { data, mediaType, previewUrl } : im));
            setCropIdx(null);
          }}
          onClose={() => setCropIdx(null)}
        />
      )}
    </div>
  );
}

// ── Image crop modal — drag a box over a pasted/uploaded snippet to crop it before extraction.
// "Add crop" appends each selection as a NEW attachment (so you can pull several regions out of one
// source image); "Replace original" swaps the source image for the single crop.
function ImageCropModal({ src, onAddCrop, onReplace, onClose }: {
  src: string;
  onAddCrop: (data: string, mediaType: string, previewUrl: string) => void;
  onReplace: (data: string, mediaType: string, previewUrl: string) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [added, setAdded] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const hasSel = !!sel && sel.w > 4 && sel.h > 4;

  function relPoint(e: React.PointerEvent) {
    const r = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - r.left, r.width)),
      y: Math.max(0, Math.min(e.clientY - r.top, r.height)),
    };
  }
  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = relPoint(e);
    startRef.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const p = relPoint(e);
    const s = startRef.current;
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function onUp() { startRef.current = null; }

  // Render the current selection (or whole image if none) to a PNG data URL.
  function computeCrop(): { data: string; mediaType: string; previewUrl: string } | null {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const region = hasSel ? sel! : { x: 0, y: 0, w: r.width, h: r.height };
    const scaleX = img.naturalWidth / r.width;
    const scaleY = img.naturalHeight / r.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(region.w * scaleX));
    canvas.height = Math.max(1, Math.round(region.h * scaleY));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, region.x * scaleX, region.y * scaleY, region.w * scaleX, region.h * scaleY, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    return { data: dataUrl.split(',')[1], mediaType: 'image/png', previewUrl: dataUrl };
  }

  function handleAdd() {
    if (!hasSel) return; // need a region to add a new image
    const c = computeCrop();
    if (!c) return;
    onAddCrop(c.data, c.mediaType, c.previewUrl);
    setAdded(a => a + 1);
    setSel(null); // ready to draw the next region
  }
  function handleReplace() {
    const c = computeCrop();
    if (!c) return;
    onReplace(c.data, c.mediaType, c.previewUrl);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl p-3 max-w-[90vw] max-h-[90vh] flex flex-col gap-2">
        <p className="text-xs text-slate-500">Drag a box over a region. <strong>Add crop</strong> saves it as a new image and lets you grab another part of the same picture. <strong>Replace original</strong> swaps this image for the single crop.</p>
        <div className="relative overflow-auto" style={{ touchAction: 'none' }}>
          <img
            ref={imgRef}
            src={src}
            alt="crop source"
            draggable={false}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className="max-w-full max-h-[70vh] select-none cursor-crosshair block"
          />
          {sel && sel.w > 0 && sel.h > 0 && (
            <div
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <span className="mr-auto text-[11px] text-slate-500">
            {hasSel ? `Selected ${Math.round(sel!.w)}×${Math.round(sel!.h)} px` : 'Drag a box to select a region'}
            {added > 0 ? ` · ${added} crop${added > 1 ? 's' : ''} added` : ''}
          </span>
          {sel && <button onClick={() => setSel(null)} className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50">Reset</button>}
          <button onClick={handleAdd} disabled={!hasSel} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40">+ Add crop</button>
          <button onClick={handleReplace} disabled={!hasSel} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Replace original</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50">{added > 0 ? 'Done' : 'Cancel'}</button>
        </div>
      </div>
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
  const [kind, setKind] = useState<ContentKind>(initialCard.content_kind);
  const [isAdvanced, setIsAdvanced] = useState<boolean>(initialCard.is_advanced ?? false);
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
      content_kind: kind,
    };
    const m = parseInt(marks, 10);
    if (kind === 'practice' && !isNaN(m)) patch.marks = m;
    // Advanced only applies to practice; clear it otherwise so a kind-change drops the flag.
    patch.is_advanced = kind === 'practice' ? isAdvanced : false;
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
  }, [cardId, title, content, marks, sectionName, kind, isAdvanced, onSaved, pendingSourceQuestionId]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 800);
  }, [doSave]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    scheduleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, marks, sectionName, kind, isAdvanced]);

  // Keep the Bank-drop title/content/source-id in sync if the user drops one in.
  const handleBankDropOnEditor = useCallback((q: BankQuestion) => {
    const { title: tplTitle, content: tplContent } = buildBankWorkedExampleTemplate(q);
    setContentHistory(prev => [...prev.slice(-9), content]);
    setContent(tplContent);
    if (!title.trim()) setTitle(tplTitle);
    setPendingSourceQuestionId(q.id);
    setAiPreviewContent(null);
  }, [content, title]);

  // Paste an image straight into the markdown editor → upload it and insert an <img> at the cursor.
  async function handleEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imgItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!imgItem) return; // let normal text paste proceed
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    const ta = e.currentTarget;
    const at = ta.selectionStart;
    const placeholder = '\n\n_⏳ uploading image…_\n\n';
    const before = content.slice(0, at), after = content.slice(ta.selectionEnd);
    setContentHistory(prev => [...prev.slice(-9), content]);
    setContent(before + placeholder + after);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
      const resp = await fetch('/api/admin/lessons/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ dataUrl }),
      });
      if (!resp.ok) { const j = await resp.json().catch(() => ({} as { error?: string })); throw new Error(j.error || `HTTP ${resp.status}`); }
      const { url } = await resp.json() as { url: string };
      const img = `<img src="${url}" alt="" style="max-width:100%;display:block;margin:8px 0" />`;
      setContent(c => c.replace(placeholder, `\n\n${img}\n\n`));
    } catch (err) {
      setContent(c => c.replace(placeholder, `\n\n_⚠ image upload failed: ${err instanceof Error ? err.message : 'error'}_\n\n`));
    }
  }

  function handleUndo() {
    if (contentHistory.length === 0) return;
    const prev = contentHistory[contentHistory.length - 1];
    setContentHistory(h => h.slice(0, -1));
    setContent(prev);
    setAiPreviewContent(null);
  }

  // ── Drag-to-resize images in the live preview ────────────────────────────
  const previewRef = useRef<HTMLDivElement>(null);
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null);
  const [handlePos, setHandlePos] = useState<{ x: number; y: number } | null>(null);
  const resizeDrag = useRef<{ startX: number; startW: number; el: HTMLImageElement } | null>(null);

  // Track the selected image's on-screen corner (survives scroll/layout) via a rAF loop.
  useEffect(() => {
    if (!selImg) { setHandlePos(null); return; }
    selImg.style.outline = '2px solid #2563eb';
    let raf = 0;
    const tick = () => {
      if (!selImg.isConnected) { setSelImg(null); return; }
      const r = selImg.getBoundingClientRect();
      setHandlePos({ x: r.right, y: r.bottom });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); try { selImg.style.outline = ''; } catch { /* gone */ } };
  }, [selImg]);

  function onPreviewClick(e: React.MouseEvent) {
    if (aiPreviewContent) return; // don't resize while an AI suggestion is being previewed
    const t = e.target as HTMLElement;
    setSelImg(t.tagName === 'IMG' ? (t as HTMLImageElement) : null);
  }
  function onResizeDown(e: React.PointerEvent) {
    if (!selImg) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeDrag.current = { startX: e.clientX, startW: selImg.getBoundingClientRect().width, el: selImg };
  }
  function onResizeMove(e: React.PointerEvent) {
    const d = resizeDrag.current; if (!d) return;
    const w = Math.max(40, Math.round(d.startW + (e.clientX - d.startX)));
    d.el.style.width = `${w}px`; d.el.style.maxWidth = 'none';
  }
  function onResizeUp() {
    const d = resizeDrag.current; if (!d) return;
    resizeDrag.current = null;
    const imgs = Array.from(previewRef.current?.querySelectorAll('img') ?? []);
    const idx = imgs.indexOf(d.el);
    const w = parseInt(d.el.style.width, 10);
    if (idx >= 0 && w > 0) {
      setContentHistory(prev => [...prev.slice(-9), content]);
      setContent(c => setImgWidthInMarkdown(c, idx, w));
    }
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

  const siblings = allKindCards.filter(c => c.section_name === initialCard.section_name).sort((a, b) => a.order_index - b.order_index);
  const sibIdx = siblings.findIndex(s => s.id === cardId);
  const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSib = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-header */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ContentKind)}
          className="text-xs font-semibold border border-slate-300 rounded px-1 py-0.5 bg-white"
          title="Card type"
        >
          <option value="refresher">R — Refresher</option>
          <option value="worked_example">E — Worked example</option>
          <option value="practice">P — Practice</option>
        </select>
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
          {kind === 'practice' && (
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
          {kind === 'practice' && (
            <label className="flex items-center gap-1.5 text-orange-700" title="Advanced practice questions are placed after the regular ones in the PDF/DOCX">
              <input type="checkbox" checked={isAdvanced} onChange={(e) => setIsAdvanced(e.target.checked)} />
              Advanced
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
            onPaste={handleEditorPaste}
            spellCheck={false}
            placeholder={kind === 'refresher'
              ? 'Short memory aid — formula, condition, mnemonic. Use $...$ for inline math, $$...$$ for display.'
              : kind === 'worked_example'
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
          <div ref={previewRef} onClick={onPreviewClick} className="flex-1 overflow-y-auto px-4 py-3 bg-white prose prose-sm max-w-none border-r border-slate-200">
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeKatex, katexOptions]]}>
              {wrapBlockImages(fixCurrencyDollars(aiPreviewContent ?? previewContent))}
            </ReactMarkdown>
          </div>
        </div>
        {/* Drag-to-resize handle for the selected preview image */}
        {handlePos && (
          <div
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            title="Drag to resize image"
            style={{ position: 'fixed', left: handlePos.x - 8, top: handlePos.y - 8, touchAction: 'none', zIndex: 60 }}
            className="w-4 h-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
          />
        )}

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
                onStage={(q) => addToStaging(q)}
                isStaged={(qid) => storeIsStaged(qid)}
                aiContent={
                  <AISidebar
                    cardId={cardId}
                    lessonLevel={lessonLevel}
                    lessonTopics={lessonTopics}
                    sectionName={sectionName}
                    content={content}
                    title={title}
                    contentKind={kind}
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
        {pickerOpen && (
          <TopicPicker
            level={lesson.level}
            selected={lesson.topics}
            onPick={t => onSave({ topics: lesson.topics.includes(t) ? lesson.topics.filter(x => x !== t) : [...lesson.topics, t] })}
            onDone={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function TopicPicker({ level, selected, onPick, onDone }: { level: string; selected: string[]; onPick: (t: string) => void; onDone: () => void }) {
  const cats = getTopicsForPaperLevel(level);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 max-h-72 overflow-y-auto">
      <div className="flex items-center mb-2">
        <span className="text-[11px] text-slate-400">Click topics to add or remove — pick as many as you like.</span>
        <button onClick={onDone} className="ml-auto text-xs px-3 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Done</button>
      </div>
      {cats.map(cat => (
        <div key={cat.label} className="mb-2">
          <div className="text-xs font-semibold text-slate-600 mb-1">{cat.label}</div>
          <div className="flex flex-wrap gap-1">
            {cat.topics.map(t => {
              const on = selected.includes(t);
              return (
                <button key={t} onClick={() => onPick(t)}
                        className={`text-xs px-2 py-0.5 rounded border ${on ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-white border-slate-300 hover:border-emerald-500 hover:text-emerald-700'}`}>
                  {on ? '✓ ' : ''}{t}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section flow — lesson-level ordered sections, each holding mixed-kind cards ──

function SectionFlow({
  cards,
  sections,
  selectedId,
  activeId,
  onSelectCard,
  onBankDropOnList,
  onAddSection,
  onAddCard,
  onRenameSection,
  onDeleteSection,
  onQuickDeleteCard,
  onQuickKindCard,
}: {
  cards: Card[];
  sections: string[];                 // lesson-level ordered section names
  selectedId: string | null;
  activeId: string | null;
  onSelectCard: (id: string) => void;
  onBankDropOnList: (q: BankQuestion, anchor: Card, position: 'above' | 'below') => void;
  onAddSection: () => void;
  onAddCard: (section: string, kind: ContentKind) => void;
  onRenameSection: (oldName: string, newName: string) => void;
  onDeleteSection: (name: string) => void;
  onQuickDeleteCard: (card: Card) => void;
  onQuickKindCard: (card: Card, kind: ContentKind) => void;
}) {
  const isCardDrag = !!activeId && !String(activeId).startsWith('sec-hdr-');

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 px-1 py-1.5">
        <span className="text-xs font-semibold flex-1 text-slate-600">Sections <span className="font-normal text-slate-400">({sections.length})</span></span>
        <button onClick={onAddSection} className="text-xs px-2 py-0.5 border border-slate-300 rounded hover:bg-slate-50 shrink-0" title="Add a new section">+ Section</button>
      </div>

      {sections.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-slate-400 text-sm mb-2">No sections yet.</p>
          <button onClick={onAddSection} className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50">+ New section</button>
        </div>
      ) : (
        <div className="space-y-3">
          <SortableContext items={sections.map(s => `sec-hdr-${SEC}-${s}`)} strategy={verticalListSortingStrategy}>
            {sections.map(sectionName => {
              const sectionCards = cards.filter(c => c.section_name === sectionName).sort((a, b) => a.order_index - b.order_index);
              return (
                <SortableSectionWrapper
                  key={sectionName}
                  name={sectionName}
                  cardCount={sectionCards.length}
                  onRenamed={onRenameSection}
                  onDeleted={onDeleteSection}
                  onAddCard={() => onAddCard(sectionName, 'worked_example')}
                >
                  <DroppableSectionZone name={sectionName} isDragActive={isCardDrag}>
                    <SortableContext items={sectionCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1 min-h-[8px]">
                        {sectionCards.map((card, idx) => (
                          <SortableCardRow
                            key={card.id}
                            card={card}
                            displayIndex={idx + 1}
                            isSelected={selectedId === card.id}
                            onSelect={onSelectCard}
                            onBankDrop={onBankDropOnList}
                            onQuickDelete={onQuickDeleteCard}
                            onQuickKind={onQuickKindCard}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DroppableSectionZone>
                  {/* Add a card of a chosen kind to this section */}
                  <div className="flex gap-1 mt-1 pl-1">
                    <span className="text-[10px] text-slate-400 self-center">+ card:</span>
                    <button onClick={() => onAddCard(sectionName, 'refresher')} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><b>R</b> Refresher</button>
                    <button onClick={() => onAddCard(sectionName, 'worked_example')} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"><b>E</b> Example</button>
                    <button onClick={() => onAddCard(sectionName, 'practice')} className="text-[10px] px-1.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"><b>P</b> Practice</button>
                  </div>
                </SortableSectionWrapper>
              );
            })}
          </SortableContext>
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
  const [toast, setToast] = useState<string | null>(null);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  // UI-only "empty" sections (lesson-level) — sections with no cards yet, kept locally until a card is added.
  const [localSections, setLocalSections] = useState<string[]>([]);
  // Batch "generate solutions for practice cards missing one" progress (null = idle).
  const [batchSol, setBatchSol] = useState<{ done: number; total: number; failed: number } | null>(null);
  // Each lesson has its OWN staging tray — scope the store to this lesson before any reads below.
  // Idempotent, so calling it during render is safe; it must run before StagingPanel/getStaged().
  setStagingScope(id);

  // Staging workspace overlay + live count badge. Open/closed survives a page refresh so you come
  // back to the workspace where you left it.
  const [stagingOpen, setStagingOpen] = useState(false);
  useEffect(() => { try { if (localStorage.getItem('lesson_staging_open') === '1') setStagingOpen(true); } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem('lesson_staging_open', stagingOpen ? '1' : '0'); } catch { /* ignore */ } }, [stagingOpen]);
  const [stageCount, setStageCount] = useState(0);
  useEffect(() => { setStageCount(stagedCount()); return subscribeStaging(() => setStageCount(stagedCount())); }, []);

  // ── Undo (structural actions: delete / reorder / move / add) ──────────────
  // Snapshot the card-state before each structural action; Ctrl/Cmd+Z restores it and reconciles
  // the offline store (re-adds deleted cards, re-deletes added ones, re-patches/reorders).
  const cardsRef = useRef<Card[]>([]); cardsRef.current = cards;
  const lessonRef = useRef<Lesson | null>(null); lessonRef.current = lesson;
  type Snapshot = { label: string; cards: Card[]; sectionOrder: string[] };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const [undoTop, setUndoTop] = useState<string | null>(null);
  const [redoTop, setRedoTop] = useState<string | null>(null);
  // Remembers the bank question behind each card added from staging, so undo can drop it back into
  // the staging Keep pane (and redo can pull it back out).
  const stagedCardMeta = useRef<Map<string, { q: BankQuestion; kind: StageKind; section: string }>>(new Map());

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

  const addCard = useCallback(async (kind: ContentKind, extra: Partial<Card> = {}, opts: { skipUndo?: boolean } = {}) => {
    if (!opts.skipUndo) pushUndo('Add card');
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
      setLocalSections(prev => prev.filter(s => s !== section)); // it now has a card
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
    pushUndo('Delete card');
    setCards(prev => prev.filter(c => c.id !== cardId));
    setSelectedId(null);
    setSavedAt(new Date());
  }, []);

  // Delete a card straight from the list (no need to open it). Undoable with Ctrl/Cmd+Z.
  const handleQuickDeleteCard = useCallback(async (card: Card) => {
    pushUndo('Delete card');
    setCards(prev => prev.filter(c => c.id !== card.id));
    setSelectedId(prev => (prev === card.id ? null : prev));
    setSavedAt(new Date());
    await storeDeleteCard(card.id);
  }, []);

  // Change a card's kind (R/E/P) straight from the list badge. Undoable with Ctrl/Cmd+Z.
  const handleQuickKindCard = useCallback(async (card: Card, kind: ContentKind) => {
    pushUndo('Change card kind');
    setCards(prev => prev.map(c => (c.id === card.id ? { ...c, content_kind: kind } : c)));
    setSavedAt(new Date());
    await storePatchCard(card.id, { content_kind: kind });
  }, []);

  // One-click: generate worked solutions for every practice card that doesn't already have one.
  const generateMissingSolutions = useCallback(async () => {
    if (!lesson || batchSol) return;
    const targets = cards.filter(c => c.content_kind === 'practice' && !practiceHasSolution(c.content));
    if (targets.length === 0) { showToast('All practice cards already have solutions.'); return; }
    if (!window.confirm(`Generate solutions for ${targets.length} practice card${targets.length > 1 ? 's' : ''} missing one? This calls the AI per card and may take a moment.`)) return;
    setBatchSol({ done: 0, total: targets.length, failed: 0 });
    let done = 0, failed = 0;
    for (const card of targets) {
      try {
        const newContent = await generateSolutionForCard(card, lesson, pw.current);
        if (newContent) {
          await storePatchCard(card.id, { content: newContent });
          setCards(prev => prev.map(c => c.id === card.id ? { ...c, content: newContent } : c));
        }
      } catch { failed++; }
      done++;
      setBatchSol({ done, total: targets.length, failed });
    }
    setSavedAt(new Date());
    setBatchSol(null);
    showToast(failed ? `Done — ${done - failed} generated, ${failed} failed` : `Generated solutions for ${done} card${done > 1 ? 's' : ''}`);
  }, [cards, lesson, batchSol]);

  // Create a new (empty) lesson-level section and append it to the saved order.
  const createSection = useCallback((name: string) => {
    setLocalSections(prev => prev.includes(name) ? prev : [...prev, name]);
    const cur = asOrder(lesson?.section_order);
    if (!cur.includes(name)) void saveLessonMeta({ section_order: [...cur, name] });
    setNewSectionOpen(false);
  }, [lesson]);

  // Rename a lesson-level section: bulk-PATCH every card in it (any kind) + update saved order.
  const handleRenameSection = useCallback(async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    if (cards.some(c => c.section_name === newName) || asOrder(lesson?.section_order).includes(newName)) {
      alert('A section with that name already exists.'); return;
    }
    const toRename = cards.filter(c => c.section_name === oldName);
    setCards(prev => prev.map(c => c.section_name === oldName ? { ...c, section_name: newName } : c));
    setLocalSections(prev => prev.map(s => s === oldName ? newName : s));
    const cur = asOrder(lesson?.section_order);
    if (cur.includes(oldName)) void saveLessonMeta({ section_order: cur.map(s => s === oldName ? newName : s) });
    await Promise.all(toRename.map(c => storePatchCard(c.id, { section_name: newName })));
    setSavedAt(new Date());
  }, [cards, lesson]);

  // Send a staged question into a lesson section as a card of the chosen kind (reuses addCard;
  // the bank template carries the question's stored solution/answer).
  const sendStagedToLesson = useCallback(async (q: BankQuestion, kind: ContentKind, section: string) => {
    const { title: tplTitle, content: tplContent } = buildBankWorkedExampleTemplate(q);
    const created = await addCard(kind, {
      section_name: section || DEFAULT_SECTION[kind],
      card_title: tplTitle,
      content: tplContent,
      source_question_id: q.id,
      marks: kind === 'practice' ? q.total_marks ?? null : null,
    });
    if (created) stagedCardMeta.current.set(created.id, { q, kind: kind as StageKind, section: section || DEFAULT_SECTION[kind] });
    showToast(`Added to "${section}"`);
  }, [addCard]);

  // Add a whole shortlist at once, undoable in a SINGLE Ctrl+Z (one snapshot before the batch,
  // then each card added with skipUndo so it doesn't stack N entries).
  const sendStagedBatch = useCallback(async (batch: { q: BankQuestion; kind: ContentKind; section: string }[]) => {
    if (batch.length === 0) return;
    pushUndo(`Add ${batch.length} question${batch.length > 1 ? 's' : ''}`);
    for (const b of batch) {
      const { title: tplTitle, content: tplContent } = buildBankWorkedExampleTemplate(b.q);
      const created = await addCard(b.kind, {
        section_name: b.section || DEFAULT_SECTION[b.kind],
        card_title: tplTitle,
        content: tplContent,
        source_question_id: b.q.id,
        marks: b.kind === 'practice' ? b.q.total_marks ?? null : null,
      }, { skipUndo: true });
      if (created) stagedCardMeta.current.set(created.id, { q: b.q, kind: b.kind as StageKind, section: b.section || DEFAULT_SECTION[b.kind] });
    }
    showToast(`Added ${batch.length} question${batch.length > 1 ? 's' : ''}`);
  }, [addCard]);

  // Delete a lesson-level section. If it still has cards, confirm and delete them too.
  const handleDeleteSection = useCallback(async (name: string) => {
    const inSection = cards.filter(c => c.section_name === name);
    if (inSection.length > 0) {
      const ok = window.confirm(`Delete section "${name}" and its ${inSection.length} card${inSection.length > 1 ? 's' : ''}? (You can undo with Ctrl/Cmd+Z.)`);
      if (!ok) return;
      pushUndo('Delete section');
      if (inSection.some(c => c.id === selectedId)) setSelectedId(null);
      setCards(prev => prev.filter(c => c.section_name !== name));
      await Promise.all(inSection.map(c => storeDeleteCard(c.id)));
    }
    setLocalSections(prev => prev.filter(s => s !== name));
    const cur = asOrder(lesson?.section_order);
    if (cur.includes(name)) void saveLessonMeta({ section_order: cur.filter(s => s !== name) });
    setSavedAt(new Date());
  }, [cards, lesson, selectedId]);

  // Bank-question drop on the card list — create a new card at insertion point (keeps anchor's kind).
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
    // Reorder: place the new card immediately above/below the anchor within its SECTION (any kind).
    const sectionCards = cards.filter(c => c.section_name === anchorCard.section_name).sort((a, b) => a.order_index - b.order_index);
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

  function parseHdrId(id: string): { name: string } | null {
    if (id.startsWith(`sec-hdr-${SEC}-`)) return { name: id.slice(`sec-hdr-${SEC}-`.length) };
    return null;
  }
  function parseDropId(id: string, all: Card[]): { section: string } | null {
    if (id.startsWith(`sec-zone-${SEC}-`)) return { section: id.slice(`sec-zone-${SEC}-`.length) };
    if (id.startsWith(`sec-hdr-${SEC}-`)) return { section: id.slice(`sec-hdr-${SEC}-`.length) };
    const card = all.find(c => c.id === id);
    if (card) return { section: card.section_name };
    return null;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(t => t === msg ? null : t), 2000);
  }

  // Capture the pre-action card-state so it can be restored. Reads via refs so it's always fresh,
  // even when called from a memoized handler. A brand-new action invalidates the redo stack.
  function pushUndo(label: string) {
    undoStack.current.push({ label, cards: cardsRef.current.map(c => ({ ...c })), sectionOrder: asOrder(lessonRef.current?.section_order) });
    if (undoStack.current.length > 25) undoStack.current.shift();
    redoStack.current = [];
    setRedoTop(null);
    setUndoTop(label);
  }

  // Reconcile the offline store + UI to match a captured snapshot. Cards present now but absent in
  // the snapshot are deleted (and, if they came from staging, dropped back into the Keep pane);
  // cards in the snapshot but missing now are re-added (and pulled back out of staging).
  async function applySnapshot(entry: Snapshot) {
    const cur = cardsRef.current;
    const snapById = new Map(entry.cards.map(c => [c.id, c]));
    const curById = new Map(cur.map(c => [c.id, c]));
    // Re-add cards that are in the snapshot but gone now — restore with their original id.
    for (const c of entry.cards) {
      if (!curById.has(c.id)) {
        await storeAddCard({ id: c.id, lesson_id: id, content_kind: c.content_kind, section_name: c.section_name, card_title: c.card_title, content: c.content, marks: c.marks, source_question_id: c.source_question_id, source_card_id: c.source_card_id });
        const meta = stagedCardMeta.current.get(c.id);
        if (meta) removeStaged(meta.q.id); // back in the lesson → out of staging
      }
    }
    // Delete cards that exist now but aren't in the snapshot.
    for (const c of cur) {
      if (!snapById.has(c.id)) {
        await storeDeleteCard(c.id);
        const meta = stagedCardMeta.current.get(c.id);
        if (meta) { addToStaging(meta.q); setStagePane(meta.q.id, 'keep'); setStageKind(meta.q.id, meta.kind); setStageSection(meta.q.id, meta.section); }
      }
    }
    // Re-patch changed fields (section/kind/title/content/marks).
    for (const c of entry.cards) {
      const cu = curById.get(c.id);
      if (cu && (cu.section_name !== c.section_name || cu.content_kind !== c.content_kind || cu.card_title !== c.card_title || cu.content !== c.content || cu.marks !== c.marks)) {
        await storePatchCard(c.id, { section_name: c.section_name, content_kind: c.content_kind, card_title: c.card_title, content: c.content, marks: c.marks });
      }
    }
    // Restore UI state + per-section order. Keep the bank/editor panel open: if the selected card
    // survives, keep it selected; otherwise fall back to a card in the same section (or any card).
    const restored = entry.cards.map(c => ({ ...c }));
    const selStillExists = selectedId != null && restored.some(c => c.id === selectedId);
    if (!selStillExists) {
      const gone = cur.find(c => c.id === selectedId);
      const fallback = (gone && restored.find(c => c.section_name === gone.section_name)) || restored[0];
      if (fallback) setSelectedId(fallback.id);
    }
    setCards(restored);
    const bySection = new Map<string, Card[]>();
    for (const c of entry.cards) { const a = bySection.get(c.section_name) ?? []; a.push(c); bySection.set(c.section_name, a); }
    for (const [, list] of bySection) { list.sort((a, b) => a.order_index - b.order_index); await storeReorderCards(list.map(c => c.id)); }
    if (JSON.stringify(asOrder(lessonRef.current?.section_order)) !== JSON.stringify(entry.sectionOrder)) {
      void saveLessonMeta({ section_order: entry.sectionOrder });
    }
    setSavedAt(new Date());
  }

  async function runUndo() {
    const entry = undoStack.current.pop();
    setUndoTop(undoStack.current[undoStack.current.length - 1]?.label ?? null);
    if (!entry) return;
    // Snapshot the CURRENT state so redo can re-apply it.
    redoStack.current.push({ label: entry.label, cards: cardsRef.current.map(c => ({ ...c })), sectionOrder: asOrder(lessonRef.current?.section_order) });
    if (redoStack.current.length > 25) redoStack.current.shift();
    setRedoTop(entry.label);
    try { await applySnapshot(entry); showToast(`Undone: ${entry.label}`); }
    catch { loadLesson(); }
  }

  async function runRedo() {
    const entry = redoStack.current.pop();
    setRedoTop(redoStack.current[redoStack.current.length - 1]?.label ?? null);
    if (!entry) return;
    undoStack.current.push({ label: entry.label, cards: cardsRef.current.map(c => ({ ...c })), sectionOrder: asOrder(lessonRef.current?.section_order) });
    if (undoStack.current.length > 25) undoStack.current.shift();
    setUndoTop(entry.label);
    try { await applySnapshot(entry); showToast(`Redone: ${entry.label}`); }
    catch { loadLesson(); }
  }

  // Global Ctrl/Cmd+Z → structural undo, but only when not typing in a field (the markdown
  // editor handles its own content undo).
  const runUndoRef = useRef<() => void>(() => {});
  runUndoRef.current = runUndo;
  const runRedoRef = useRef<() => void>(() => {});
  runRedoRef.current = runRedo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const key = e.key.toLowerCase();
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      const isUndo = key === 'z' && !e.shiftKey;
      // Only act if there's a matching action — otherwise leave the keypress alone.
      if (isRedo) {
        if (redoStack.current.length === 0) return;
        e.preventDefault();
        void runRedoRef.current();
      } else if (isUndo) {
        if (undoStack.current.length === 0) return;
        e.preventDefault();
        void runUndoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleDragStart(e: DragStartEvent) {
    const idStr = String(e.active.id);
    setActiveId(idStr);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Section drag — reorder lesson-level sections, persisted in lessons.section_order (string[]).
    const activeHdr = parseHdrId(activeIdStr);
    if (activeHdr) {
      const overHdr = parseHdrId(overIdStr);
      if (!overHdr) return;
      const ordered = orderedSections(cards, localSections, lesson?.section_order ?? []);
      const oi = ordered.indexOf(activeHdr.name);
      const ni = ordered.indexOf(overHdr.name);
      if (oi === -1 || ni === -1 || oi === ni) return;
      pushUndo('Reorder sections');
      void saveLessonMeta({ section_order: arrayMove(ordered, oi, ni) });
      return;
    }

    const ac = cards.find(c => c.id === activeIdStr);
    if (!ac) return;
    const dropTarget = parseDropId(overIdStr, cards);
    if (!dropTarget) return;

    const srcSection = ac.section_name;
    const tgtSection = dropTarget.section || srcSection;
    const isCrossSection = srcSection !== tgtSection;

    if (!isCrossSection) {
      // Reorder within the same section (cards keep their kind).
      if (overIdStr.startsWith('sec-hdr-')) return;
      const sectionCards = cards.filter(c => c.section_name === srcSection).sort((a, b) => a.order_index - b.order_index);
      const oi = sectionCards.findIndex(c => c.id === activeIdStr);
      const ni = sectionCards.findIndex(c => c.id === overIdStr);
      if (oi === -1 || ni === -1) return;
      pushUndo('Reorder cards');
      const reorderedIds = arrayMove(sectionCards, oi, ni).map(c => c.id);
      setCards(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        reorderedIds.forEach((cid, i) => { const c = map.get(cid); if (c) c.order_index = i; });
        return Array.from(map.values());
      });
      await storeReorderCards(reorderedIds);
      setSavedAt(new Date());
      return;
    }

    // Cross-section move (kind unchanged): PATCH section_name, then reorder src + dst.
    pushUndo('Move card');
    _recentlyMovedCardId = activeIdStr;
    setTimeout(() => { _recentlyMovedCardId = null; }, 80);

    const remainingSrc = cards.filter(c => c.section_name === srcSection && c.id !== activeIdStr).sort((a, b) => a.order_index - b.order_index);
    const dstExisting = cards.filter(c => c.section_name === tgtSection && c.id !== activeIdStr).sort((a, b) => a.order_index - b.order_index);
    const movedCard: Card = { ...ac, section_name: tgtSection };
    const newDst = [...dstExisting, movedCard];

    setCards(prev => prev
      .filter(c => c.id !== activeIdStr)
      .concat([movedCard])
      .map(c => {
        if (c.section_name === srcSection) {
          const idx = remainingSrc.findIndex(x => x.id === c.id);
          return idx >= 0 ? { ...c, order_index: idx } : c;
        }
        if (c.section_name === tgtSection) {
          const idx = newDst.findIndex(x => x.id === c.id);
          return idx >= 0 ? { ...c, order_index: idx } : c;
        }
        return c;
      })
    );

    setLocalSections(prev => prev.filter(s => s !== tgtSection));
    showToast(`Moved to "${tgtSection}"`);

    try {
      await storePatchCard(activeIdStr, { section_name: tgtSection } as Partial<Card>);
      if (newDst.length > 0) await storeReorderCards(newDst.map(c => c.id));
      if (remainingSrc.length > 0) await storeReorderCards(remainingSrc.map(c => c.id));
      setSavedAt(new Date());
    } catch {
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

  const sectionList = orderedSections(cards, localSections, lesson.section_order ?? []);
  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;
  const selectedCard = selectedId ? cards.find(c => c.id === selectedId) ?? null : null;
  // Prev/Next now walks the whole lesson in section → order sequence.
  const allCardsForNav = sectionList.flatMap(s => cards.filter(c => c.section_name === s).sort((a, b) => a.order_index - b.order_index));

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
          onClick={() => void runUndo()}
          disabled={!undoTop}
          title={undoTop ? `Undo: ${undoTop} (Ctrl/Cmd+Z)` : 'Nothing to undo'}
          className="px-2 py-1 rounded text-xs hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
        >↩ Undo</button>
        <button
          onClick={() => void runRedo()}
          disabled={!redoTop}
          title={redoTop ? `Redo: ${redoTop} (Ctrl/Cmd+Shift+Z)` : 'Nothing to redo'}
          className="px-2 py-1 rounded text-xs hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
        >↪ Redo</button>
        <button
          onClick={generateMissingSolutions}
          disabled={!!batchSol}
          title="Generate worked solutions for any practice cards that don't have one yet"
          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-medium disabled:opacity-50"
        >{batchSol ? `Generating ${batchSol.done}/${batchSol.total}…` : '✨ Fill solutions'}</button>
        <button
          onClick={() => generatePDF(id, pw.current, lesson.name)}
          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 rounded text-xs font-medium"
        >📄 Generate PDF</button>
        <button
          onClick={() => downloadDocx(lesson, cards, pw.current)}
          title="Download as Word (.docx) with editable equations"
          className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-xs font-medium"
        >⬇ DOCX</button>
        <button
          onClick={() => setStagingOpen(true)}
          title="Open the staging workspace to sift candidate questions"
          className="px-3 py-1 bg-slate-600 hover:bg-slate-700 rounded text-xs font-medium"
        >🗂 Staging{stageCount > 0 ? ` (${stageCount})` : ''}</button>
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
              <SectionFlow
                cards={cards}
                sections={sectionList}
                selectedId={selectedId}
                activeId={activeId}
                onSelectCard={setSelectedId}
                onBankDropOnList={handleBankDropOnList}
                onAddSection={() => setNewSectionOpen(true)}
                onAddCard={(section, kind) => addCard(kind, { section_name: section })}
                onRenameSection={handleRenameSection}
                onDeleteSection={handleDeleteSection}
                onQuickDeleteCard={handleQuickDeleteCard}
                onQuickKindCard={handleQuickKindCard}
              />
            </div>
            <DragOverlay modifiers={[restrictToVerticalAxis]}>
              {activeId ? (() => {
                const prefix = `sec-hdr-${SEC}-`;
                const hdrName = String(activeId).startsWith(prefix) ? String(activeId).slice(prefix.length) : null;
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

      {newSectionOpen && (
        <NewSectionModal
          existingSections={sectionList}
          onClose={() => setNewSectionOpen(false)}
          onCreated={createSection}
        />
      )}

      {stagingOpen && (
        <StagingPanel
          onClose={() => setStagingOpen(false)}
          onInsert={(q, kind, section) => void sendStagedToLesson(q, kind, section)}
          onInsertBatch={(batch) => void sendStagedBatch(batch)}
          sections={sectionList}
          level={lesson.level}
          topics={lesson.topics}
          auth={pw.current}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// (The old `api()` helper was removed when this component was migrated to the offline
// store in lib/offline/store.ts — every mutation now flows through there.)

// Heuristic: does a practice card already contain worked-solution content? We look for the
// markers our templates/AI use (Working:, Solution:, Answer:, Step) or a "---" divider that the
// bank template inserts before the solution block. If none present, it's "missing a solution".
function practiceHasSolution(content: string | null): boolean {
  const c = (content ?? '').trim();
  if (!c) return false;
  return /(^|\n)\s*-{3,}\s*(\n|$)/.test(c)
    || /\*\*\s*(Working|Solution|Answer|Step\s*1)\b/i.test(c)
    || /\b(Solution|Answer)\s*:/i.test(c);
}

// Run the AI "generate solutions" route for one card and return the full generated content.
// Reuses the same SSE endpoint the editor's quick action uses.
async function generateSolutionForCard(card: Card, lesson: Lesson, pw: string): Promise<string> {
  const res = await fetch('/api/edit-cards-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: GENERATE_SOLUTIONS_INSTRUCTION,
      currentTitle: card.card_title ?? '',
      currentContent: card.content ?? '',
      level: lesson.level,
      topic: lesson.topics?.[0] ?? '',
      subgroupName: card.section_name || 'Practice',
      subgroupDescription: `Lesson section "${card.section_name}". Topics: ${(lesson.topics ?? []).join(', ')}.`,
      content_kind: 'practice',
      password: pw,
    }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({} as { error?: string })); throw new Error(j.error || `HTTP ${res.status}`); }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '', result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      const data = JSON.parse(part.slice(6));
      if (data.error) throw new Error(data.error);
      if (data.chunk) result += data.chunk;
    }
  }
  return result.trim();
}

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

// Build the lesson .docx in-browser (native Word/OMML equations) and download it.
async function downloadDocx(lesson: Lesson, cards: Card[], auth: string) {
  try {
    // Source tags for bank-linked cards: [2023/JC2/Prelim/ACJC/P1/Q8]. Cosmetic — export proceeds
    // without them if the lookup fails.
    const tagById = new Map<string, string>();
    const srcIds = [...new Set(cards.map(c => c.source_question_id).filter(Boolean))] as string[];
    if (srcIds.length > 0) {
      try {
        const res = await fetch(`/api/admin/lessons/question-meta?ids=${srcIds.join(',')}`, { headers: { Authorization: `Bearer ${auth}` } });
        if (res.ok) {
          const j = await res.json() as { questions?: { id: string; school: string; year: number; paper: string; question_number: string; level: string | null; exam_type: string | null }[] };
          for (const q of j.questions ?? []) {
            const bits = [q.year, q.level, q.exam_type, q.school, `P${q.paper}`, `Q${q.question_number}`].filter(Boolean);
            tagById.set(q.id, bits.join('/'));
          }
        }
      } catch { /* ignore — fall back to card titles */ }
    }
    const { buildLessonDocx } = await import('@/lib/lesson-docx-build');
    const blob = await buildLessonDocx(
      { name: lesson.name, level: lesson.level, description: lesson.description, topics: lesson.topics, section_order: lesson.section_order },
      cards.map(c => ({
        id: c.id, content_kind: c.content_kind, section_name: c.section_name, card_title: c.card_title,
        content: c.content, marks: c.marks, is_advanced: c.is_advanced, order_index: c.order_index,
        source_tag: c.source_question_id ? tagById.get(c.source_question_id) ?? null : null,
      })),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${lesson.name.replace(/[^a-z0-9-]+/gi, '_')}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('DOCX export failed: ' + (e as Error).message);
  }
}

async function deleteLesson(id: string, pw: string, router: ReturnType<typeof useRouter>) {
  if (!confirm('Delete this lesson and all its cards? This cannot be undone.')) return;
  await fetch(`/api/admin/lessons/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${pw}` } });
  router.push('/admin/lessons');
}
