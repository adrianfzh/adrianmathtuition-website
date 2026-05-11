'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardRow {
  id: string;
  subgroup_id: number;
  order_index: number;
  card_title: string;
  is_published: boolean;
  source_kb_entry_id: string | null;
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

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── Sortable card row ──────────────────────────────────────────────────────────

function SortableCardRow({
  card,
  index,
  onEdit,
}: {
  card: CardRow;
  index: number;
  onEdit: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    touchAction: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded hover:bg-slate-50 group"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-slate-400 cursor-grab active:cursor-grabbing select-none text-lg leading-none"
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className="text-slate-400 text-sm w-5 text-right shrink-0">{index + 1}.</span>
      <span className="flex-1 text-sm text-slate-800 truncate min-w-0">
        {card.card_title || <em className="text-slate-400">Untitled</em>}
      </span>
      <span
        className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
          card.is_published
            ? 'bg-green-100 text-green-800'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        {card.is_published ? 'Pub' : 'Draft'}
      </span>
      {card.source_kb_entry_id && (
        <span className="text-xs text-slate-400 shrink-0" title="Linked to KB entry">
          🔗 KB
        </span>
      )}
      <button
        onClick={() => onEdit(card.id)}
        className="text-sm px-3 py-1 border border-slate-300 rounded hover:bg-slate-100 shrink-0"
      >
        Edit
      </button>
    </div>
  );
}

// ── Dragging overlay ───────────────────────────────────────────────────────────

function DragCard({ card }: { card: CardRow }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-blue-400 rounded shadow-lg opacity-90">
      <span className="text-slate-400 text-lg leading-none">⠿</span>
      <span className="flex-1 text-sm text-slate-800 truncate">
        {card.card_title || 'Untitled'}
      </span>
    </div>
  );
}

// ── New card modal ─────────────────────────────────────────────────────────────

function NewCardModal({
  subgroups,
  level,
  topic,
  onClose,
  onCreated,
  auth,
}: {
  subgroups: Subgroup[];
  level: string;
  topic: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  auth: string;
}) {
  const [sgId, setSgId] = useState<number>(subgroups[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    if (!sgId) { setErr('Pick a sub-group'); return; }
    setCreating(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ level, topic, subgroup_id: sgId, card_title: title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">New card</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sub-group</label>
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={sgId}
              onChange={(e) => setSgId(Number(e.target.value))}
            >
              {subgroups.map((sg) => (
                <option key={sg.id} value={sg.id}>
                  {sg.name} (sg{sg.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Card title <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. Simplify √72"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              autoFocus
            />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={creating}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
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
  const [reorderStatus, setReorderStatus] = useState<Record<number, SaveStatus>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reorderTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!pw) { window.location.href = '/admin'; return; }
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

  // Persist filters to URL + localStorage
  useEffect(() => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (topic) params.set('topic', topic);
    if (subgroupFilter) params.set('subgroup', subgroupFilter);
    router.replace(`/admin/edit-cards?${params.toString()}`, { scroll: false });
    localStorage.setItem('edit_cards_filters', JSON.stringify({ level, topic, subgroup: subgroupFilter }));
  }, [level, topic, subgroupFilter, router]);

  // Fetch topics when level changes
  useEffect(() => {
    if (!level) { setTopics([]); setTopic(''); return; }
    fetchTopics(level);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  async function fetchTopics(lv: string) {
    try {
      const res = await fetch(`/api/admin/cards/topics?level=${encodeURIComponent(lv)}`, {
        headers: { Authorization: `Bearer ${auth}` },
      });
      if (res.ok) {
        const json = await res.json();
        setTopics(json.topics ?? []);
      }
    } catch { /* ignore */ }
  }

  // Fetch cards + subgroups when level+topic change
  const fetchCards = useCallback(async () => {
    if (!level || !topic) { setCards([]); setSubgroups([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ level, topic });
      if (subgroupFilter) params.set('subgroupId', subgroupFilter);
      if (unpublishedOnly) params.set('publishedOnly', 'false');
      const res = await fetch(`/api/admin/cards/list?${params}`, {
        headers: { Authorization: `Bearer ${auth}` },
      });
      const json = await res.json();
      setCards(json.cards ?? []);
      setSubgroups(json.subgroups ?? []);
    } finally {
      setLoading(false);
    }
  }, [level, topic, subgroupFilter, unpublishedOnly, auth]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCard = cards.find((c) => c.id === active.id);
    const overCard = cards.find((c) => c.id === over.id);
    if (!activeCard || !overCard) return;

    // Only allow reorder within same subgroup
    if (activeCard.subgroup_id !== overCard.subgroup_id) return;

    const sgId = activeCard.subgroup_id;
    const sgCards = cards.filter((c) => c.subgroup_id === sgId);
    const oldIdx = sgCards.findIndex((c) => c.id === active.id);
    const newIdx = sgCards.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(sgCards, oldIdx, newIdx);
    setCards((prev) => {
      const others = prev.filter((c) => c.subgroup_id !== sgId);
      return [...others, ...reordered].sort((a, b) =>
        a.subgroup_id !== b.subgroup_id ? a.subgroup_id - b.subgroup_id : 0
      );
    });

    // Debounce save
    if (reorderTimers.current[sgId]) clearTimeout(reorderTimers.current[sgId]);
    setReorderStatus((s) => ({ ...s, [sgId]: 'saving' }));
    reorderTimers.current[sgId] = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/cards/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
        });
        if (!res.ok) throw new Error();
        setReorderStatus((s) => ({ ...s, [sgId]: 'saved' }));
        setTimeout(() => setReorderStatus((s) => ({ ...s, [sgId]: 'idle' })), 2000);
      } catch {
        setReorderStatus((s) => ({ ...s, [sgId]: 'error' }));
      }
    }, 600);
  }

  function handleEdit(id: string) {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (topic) params.set('topic', topic);
    router.push(`/admin/edit-cards/${id}?${params.toString()}`);
  }

  // Group cards by subgroup
  const cardsBySg: Record<number, CardRow[]> = {};
  const filteredCards = unpublishedOnly ? cards.filter((c) => !c.is_published) : cards;
  for (const c of filteredCards) {
    if (!cardsBySg[c.subgroup_id]) cardsBySg[c.subgroup_id] = [];
    cardsBySg[c.subgroup_id].push(c);
  }

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Cards editor</h1>
        <button
          onClick={() => setShowNewModal(true)}
          disabled={!level || !topic || subgroups.length === 0}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          + New card
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Level:</label>
          <select
            className="border border-slate-300 rounded px-3 py-1.5 text-sm"
            value={level}
            onChange={(e) => { setLevel(e.target.value); setTopic(''); setSubgroupFilter(''); }}
          >
            <option value="">—</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Topic:</label>
          <select
            className="border border-slate-300 rounded px-3 py-1.5 text-sm"
            value={topic}
            onChange={(e) => { setTopic(e.target.value); setSubgroupFilter(''); }}
            disabled={!level}
          >
            <option value="">—</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Sub-group:</label>
          <select
            className="border border-slate-300 rounded px-3 py-1.5 text-sm"
            value={subgroupFilter}
            onChange={(e) => setSubgroupFilter(e.target.value)}
            disabled={!topic}
          >
            <option value="">All</option>
            {subgroups.map((sg) => (
              <option key={sg.id} value={String(sg.id)}>
                {sg.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={unpublishedOnly}
            onChange={(e) => setUnpublishedOnly(e.target.checked)}
            className="rounded"
          />
          Show unpublished only
        </label>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {!level || !topic ? (
          <p className="text-slate-500 text-center py-16">Pick a level and topic to start editing.</p>
        ) : loading ? (
          <p className="text-slate-500 text-center py-16">Loading…</p>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 mb-3">No cards yet for {topic}.</p>
            <button
              onClick={() => setShowNewModal(true)}
              disabled={subgroups.length === 0}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              + Create the first one
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {subgroups
                .filter((sg) => !subgroupFilter || String(sg.id) === subgroupFilter)
                .map((sg) => {
                  const sgCards = cardsBySg[sg.id] ?? [];
                  if (sgCards.length === 0 && subgroupFilter) return null;
                  const status = reorderStatus[sg.id];
                  return (
                    <div key={sg.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-sm font-semibold text-slate-600">
                          sg{sg.id} · {sg.name} ({sgCards.length} card{sgCards.length !== 1 ? 's' : ''})
                        </h2>
                        {status === 'saving' && (
                          <span className="text-xs text-slate-400">Saving order…</span>
                        )}
                        {status === 'saved' && (
                          <span className="text-xs text-green-600">Order saved</span>
                        )}
                        {status === 'error' && (
                          <span className="text-xs text-red-600">Save failed</span>
                        )}
                      </div>
                      <SortableContext
                        items={sgCards.map((c) => c.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-1.5">
                          {sgCards.map((card, i) => (
                            <SortableCardRow
                              key={card.id}
                              card={card}
                              index={i}
                              onEdit={handleEdit}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  );
                })}
            </div>
            <DragOverlay modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              {activeCard ? <DragCard card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* New card modal */}
      {showNewModal && level && topic && (
        <NewCardModal
          subgroups={subgroups}
          level={level}
          topic={topic}
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            handleEdit(id);
          }}
          auth={auth}
        />
      )}
    </div>
  );
}
