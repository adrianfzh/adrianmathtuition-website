// The Notebook as ONE stream (SPEC-NOTEBOOK-V2 §9, Adrian 11 Sep 2026: "build
// this"). Every kind of thing in the book — a mistake pattern, a saved answer, a
// photo, a clipping, a page from Adrian, a skill that keeps coming up, a note
// the student wrote — becomes one StreamItem with an icon, a title, a line
// under it, a date to sort by, a topic to file by and a haystack to search in.
// Newest first, nothing to file, chips to narrow, one search box. Pure: the
// page builds the items, the client filters them.
import type { MistakeRow } from './notebook-mistakes-store';
import { bandOf, latestSighting, sightingLine, stateLabel } from './notebook-mistakes';
import type { SaveRow } from './notebook-saves';
import type { MyNoteRow } from './portal-notes';
import { noteKind } from './portal-notes';
import type { AssignmentRow } from './assignments';
import type { AskSignalLine } from './ask-signal';
import { askLineContext, askLineTitle, askSignalLine, askStateLabel } from './ask-signal';
import { privateNoteTitle, type PrivateNoteRow } from './notebook-private-notes';

export type StreamKind = 'mistake' | 'saved' | 'photo' | 'clip' | 'adrian' | 'skill' | 'private';

export interface StreamTag { text: string; tone: 'rose' | 'amber' | 'emerald' | 'sky' | 'slate' | 'indigo' }

export interface StreamItem {
  id: string;
  kind: StreamKind;
  title: string;
  subtitle: string;
  /** ISO — the sort key (newest first). */
  at: string;
  /** The topic the item is filed under, when known — Before the paper and the formula sheet file by it. */
  topic?: string | null;
  /** 'A Math' | 'E Math' | 'H2 Math' when the source knew (a mistake's paper). */
  subject?: string | null;
  tag?: StreamTag;
  /** A page from Adrian opens its own route. */
  href?: string;
  /** Lower-cased text the search box matches against. */
  haystack: string;
  /** Inline detail payloads — exactly one is set, by kind. */
  save?: SaveRow;
  note?: MyNoteRow;
  mistake?: { id: string; state: MistakeRow['state']; live: boolean; seen: number; cameBack: boolean; where: string; practice: { id: string; title: string }[] };
  skill?: AskSignalLine;
  /** A private note (SPEC-NOTEBOOK-V2 §8) — the student's own words, never read by anything else. */
  priv?: PrivateNoteRow;
}

export const CHIPS: { key: 'all' | StreamKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mistake', label: 'Mistakes' },
  { key: 'saved', label: 'Saved' },
  { key: 'photo', label: 'Photos' },
  { key: 'private', label: 'My notes' },
  { key: 'adrian', label: 'From Adrian' },
];

const fold = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** One private note → one stream item (the client uses this too when a note is written or edited). */
export function privateNoteItem(n: PrivateNoteRow): StreamItem {
  return {
    id: `private:${n.id}`, kind: 'private', title: privateNoteTitle(n.body),
    subtitle: 'My note',
    at: n.updated_at || n.created_at,
    haystack: fold(n.body),
    priv: n,
  };
}

export function buildStreamItems(input: {
  mistakes: MistakeRow[];
  practiceFor: (m: MistakeRow) => { id: string; title: string }[];
  saves: SaveRow[];
  notes: MyNoteRow[];
  pages: Pick<AssignmentRow, 'id' | 'title' | 'topic' | 'note' | 'created_at'>[];
  skills: AskSignalLine[];
  privateNotes?: PrivateNoteRow[];
}): StreamItem[] {
  const items: StreamItem[] = [];

  for (const m of input.mistakes) {
    const seen = latestSighting(m);
    const where = sightingLine(seen);
    const live = m.state === 'dark' || m.state === 'light';
    const at = m.last_seen_at ?? m.last_clean_at ?? m.student_fixed_at ?? new Date(0).toISOString();
    const band = bandOf(m.state);
    items.push({
      id: `mistake:${m.id}`, kind: 'mistake', title: m.title,
      subtitle: [where, m.seen_count > 1 ? `seen ${m.seen_count} times` : ''].filter(Boolean).join(' · '),
      at, topic: m.topic, subject: m.subject,
      tag: { text: stateLabel(m.state), tone: band === 'still-happening' ? 'rose' : band === 'getting-better' ? 'amber' : 'emerald' },
      haystack: fold([m.title, m.topic, m.error_kind, where].join(' ')),
      mistake: { id: m.id, state: m.state, live, seen: m.seen_count, cameBack: m.came_back, where, practice: input.practiceFor(m) },
    });
  }

  for (const s of input.saves) {
    items.push({
      id: `saved:${s.id}`, kind: 'saved', title: s.title,
      subtitle: ['Saved answer', s.topic].filter(Boolean).join(' · '),
      at: s.created_at, topic: s.topic,
      tag: s.skill ? { text: s.skill, tone: 'sky' } : undefined,
      haystack: fold([s.title, s.topic, s.skill, s.question_text, s.answer_text].join(' ')),
      save: s,
    });
  }

  for (const n of input.notes) {
    const photo = noteKind(n.image_url) === 'photo';
    const guessed = n.topic || n.auto_topic || null;
    items.push({
      id: `note:${n.id}`, kind: photo ? 'photo' : 'clip',
      title: n.note?.trim() || (photo ? 'Photo' : `Clipping · ${n.source_label}`),
      subtitle: [photo ? 'Photo' : n.source_label, guessed].filter(Boolean).join(' · '),
      at: n.created_at, topic: guessed,
      tag: n.auto_skill ? { text: n.auto_skill, tone: 'sky' } : undefined,
      haystack: fold([n.note, guessed, n.auto_skill, n.source_label, n.ocr_text].join(' ')),
      note: n,
    });
  }

  for (const p of input.pages) {
    items.push({
      id: `adrian:${p.id}`, kind: 'adrian', title: p.title,
      subtitle: ['From Adrian', p.topic, p.note ? `“${p.note}”` : ''].filter(Boolean).join(' · '),
      at: p.created_at, topic: p.topic, href: `/app/assignments/${p.id}`,
      tag: { text: 'Page', tone: 'indigo' },
      haystack: fold([p.title, p.topic, p.note].join(' ')),
    });
  }

  for (const l of input.skills) {
    items.push({
      id: `skill:${l.key}`, kind: 'skill', title: askLineTitle(l),
      subtitle: [askLineContext(l), askSignalLine(l)].filter(Boolean).join(' · '),
      at: l.lastAt, topic: l.topic,
      tag: { text: askStateLabel(l.state), tone: l.state === 'up' ? 'sky' : 'slate' },
      haystack: fold([l.skill, l.topic, 'keeps coming up'].join(' ')),
      skill: l,
    });
  }

  for (const n of input.privateNotes ?? []) items.push(privateNoteItem(n));

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
}

/** The chip + search filter the client runs. `kind` 'all' keeps every kind; the Photos chip shows clippings too. */
export function filterStream(items: readonly StreamItem[], kind: 'all' | StreamKind, query: string): StreamItem[] {
  const needle = fold(query);
  return items.filter(it => {
    const kindOk = kind === 'all' || it.kind === kind || (kind === 'photo' && it.kind === 'clip');
    if (!kindOk) return false;
    if (!needle) return true;
    return needle.split(' ').every(w => it.haystack.includes(w) || fold(it.title).includes(w));
  });
}
