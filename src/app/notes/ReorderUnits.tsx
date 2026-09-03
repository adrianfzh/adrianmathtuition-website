'use client';

// Hold-and-drag reordering of unit cards on /notes/<level>/<topic>/learn —
// review mode only (Adrian, 3 Sep 2026: "can I arrange the order of the cards
// by holding and moving them with the finger?"). The server component
// (NotesUnits) renders this island ONLY for the admin viewer, so a student's
// page never references it and its chunk (dnd-kit) is never sent to them.
//
// Same machinery as /admin/learn-review: dnd-kit sortable, whole-card drag via
// the ⠿ handle only (text selection, <details> toggles and the flag pill inside
// the card keep working), and the fixed-slots rule from lib/unit-reorder —
// the group's existing unit_order values are the slots, the drop decides who
// sits where. Optimistic: the card lands instantly, the write goes out, and a
// failure puts the old order back with an inline error. Success refreshes the
// server page so the rendered order and the stored order are the same thing.
//
// Sensors: TouchSensor needs a 250 ms hold (5 px tolerance) so a scroll that
// happens to start on the handle never becomes a drag; MouseSensor gives the
// desktop a plain 6 px drag. MouseSensor rather than PointerSensor on purpose —
// pointer events fire for fingers too, and a distance-activated pointer sensor
// would start the drag before the hold elapsed.

import { Children, useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reassignSlots, slotChanges, type SlotUnit } from '@/lib/unit-reorder';

export interface ReorderItem {
  id: string;
  /** The unit's current `unit_order` — its slot. */
  order: number;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

async function postReorder(body: {
  level: string;
  topic: string;
  orders: { id: string; unit_order: number | null }[];
}): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/notes-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return (data && typeof data.error === 'string' && data.error) || `HTTP ${res.status}`;
    }
    return null;
  } catch {
    return 'network error';
  }
}

/** One card: the wrapper takes the sortable transform, the ⠿ button is the
 *  only activator. `touch-action: none` lives on the handle (notes.css), not
 *  the card, so the page still scrolls from anywhere else. */
function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="nx-sort"
      data-dragging={isDragging ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="nx-sort-handle"
        aria-label="Hold and drag to reorder"
        title="Hold and drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

/**
 * Wraps one group of cards (a section's teaching blocks, or its practice
 * expander) in a sortable list. `units` and `children` are parallel arrays in
 * the group's current slot order — the child at index i is the card for
 * units[i]. Anything else (a length mismatch) renders the children untouched.
 */
export default function ReorderUnits({
  level,
  topic,
  units,
  children,
}: {
  level: string;
  topic: string;
  units: ReorderItem[];
  children: ReactNode;
}) {
  const router = useRouter();
  // dnd-kit numbers its aria-describedby ids from a module counter, which
  // runs differently on the server and the client (several groups per page,
  // rendered in different orders) — a hydration mismatch on every card. A
  // React-stable id per context makes the two agree.
  const dndId = useId();
  const kids = Children.toArray(children);
  const cardOf = new Map(units.map((u, i) => [u.id, kids[i]]));

  // Order state, re-derived whenever the server sends a different list — after
  // router.refresh() the props already agree with the optimistic order, so this
  // is a no-op then; it matters when a peer session moved something.
  const fromProps: SlotUnit[] = units.map(u => ({ id: u.id, unit_order: u.order }));
  const propsKey = fromProps.map(u => `${u.id}:${u.unit_order}`).join('|');
  const [seenKey, setSeenKey] = useState(propsKey);
  const [order, setOrder] = useState<SlotUnit[]>(fromProps);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setOrder(fromProps);
  }
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  if (kids.length !== units.length) return <>{children}</>;

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.findIndex(u => u.id === active.id);
    const to = order.findIndex(u => u.id === over.id);
    if (from < 0 || to < 0) return;
    const prev = order;
    const next = reassignSlots(prev, from, to);
    const changes = slotChanges(prev, next);
    setOrder(next);
    setError(null);
    if (changes.length === 0) return;
    setStatus('saving');
    const err = await postReorder({ level, topic, orders: changes });
    if (err) {
      setOrder(prev);
      setError(err);
      setStatus('error');
      return;
    }
    setStatus('saved');
    setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1800);
    router.refresh();
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order.map(u => u.id)} strategy={verticalListSortingStrategy}>
        {order.map(u => (
          <SortableCard key={u.id} id={u.id}>
            {cardOf.get(u.id)}
          </SortableCard>
        ))}
      </SortableContext>
      {status !== 'idle' && (
        <p className="nx-sort-status" data-kind={status} role={status === 'error' ? 'alert' : 'status'}>
          {status === 'saving'
            ? 'Saving order…'
            : status === 'saved'
              ? 'Order saved ✓'
              : `Could not save the order — ${error ?? 'unknown error'}. The cards are back where they were.`}
        </p>
      )}
    </DndContext>
  );
}
