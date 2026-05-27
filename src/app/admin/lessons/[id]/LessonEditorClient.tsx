'use client';

/* eslint-disable @next/next/no-img-element */
// Lesson editor — cards-editor-style UX for multi-topic teaching decks.
// All store calls go through `api()` so Phase 2 (offline) can swap the backend.
import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTopicsForLevel } from '@/lib/canonical-topics';

interface Lesson {
  id: string;
  name: string;
  level: string;
  topics: string[];
  description: string | null;
  updated_at: string;
}

interface Card {
  id: string;
  source_card_id: string | null;
  source_question_id: string | null;
  content_kind: 'refresher' | 'worked_example' | 'practice';
  section_name: string;
  card_title: string | null;
  content: string | null;
  marks: number | null;
  order_index: number;
}

interface BankQuestion {
  id: string;
  school: string;
  year: number;
  paper: string;
  question_number: string;
  topic: string;
  difficulty: string | null;
  total_marks: number | null;
  embedding_text: string | null;
  image_url: string | null;
  has_image: boolean;
}

const KIND_ORDER: Card['content_kind'][] = ['refresher', 'worked_example', 'practice'];
const KIND_LABEL: Record<Card['content_kind'], string> = {
  refresher: '🧠 Refreshers',
  worked_example: '💡 Worked Examples',
  practice: '✏️ Practice',
};
const KIND_COLOR: Record<Card['content_kind'], string> = {
  refresher: 'bg-emerald-50 border-emerald-300',
  worked_example: 'bg-blue-50 border-blue-300',
  practice: 'bg-orange-50 border-orange-300',
};

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

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
  const [bankOpen, setBankOpen] = useState(false);

  useEffect(() => {
    const cookiePw = getCookie('admin_pw') || getCookie('schedule_pw');
    pw.current = cookiePw;
    setAuthed(!!cookiePw);
  }, []);

  useEffect(() => {
    if (!authed || !id) return;
    api(`/api/admin/lessons/${id}`, pw.current)
      .then(d => {
        setLesson(d.lesson);
        setCards(d.cards ?? []);
      })
      .finally(() => setLoading(false));
  }, [authed, id]);

  async function saveLessonMeta(patch: Partial<Lesson>) {
    if (!lesson) return;
    const optimistic = { ...lesson, ...patch };
    setLesson(optimistic);
    const d = await api(`/api/admin/lessons/${id}`, pw.current, { method: 'PATCH', body: JSON.stringify(patch) });
    if (d.lesson) {
      setLesson(d.lesson);
      setSavedAt(new Date());
    }
  }

  async function addCard(kind: Card['content_kind'], extra: Partial<Card> = {}) {
    const d = await api(`/api/admin/lessons/${id}/cards`, pw.current, {
      method: 'POST',
      body: JSON.stringify({ content_kind: kind, content: '', card_title: '', ...extra }),
    });
    if (d.card) {
      setCards(prev => [...prev, d.card]);
      setSavedAt(new Date());
    }
  }

  async function updateCard(cardId: string, patch: Partial<Card>) {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, ...patch } : c));
    const d = await api(`/api/admin/lessons/cards/${cardId}`, pw.current, { method: 'PATCH', body: JSON.stringify(patch) });
    if (d.card) setSavedAt(new Date());
  }

  async function deleteCard(cardId: string) {
    if (!confirm('Delete this card?')) return;
    setCards(prev => prev.filter(c => c.id !== cardId));
    await api(`/api/admin/lessons/cards/${cardId}`, pw.current, { method: 'DELETE' });
    setSavedAt(new Date());
  }

  async function reorderWithin(kind: Card['content_kind'], section: string, orderedIds: string[]) {
    setCards(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      orderedIds.forEach((cid, idx) => {
        const c = map.get(cid);
        if (c && c.content_kind === kind && c.section_name === section) c.order_index = idx;
      });
      return Array.from(map.values()).sort((a, b) =>
        a.content_kind === b.content_kind && a.section_name === b.section_name
          ? a.order_index - b.order_index
          : 0
      );
    });
    await api('/api/admin/lessons/cards/reorder', pw.current, { method: 'POST', body: JSON.stringify({ orderedIds }) });
    setSavedAt(new Date());
  }

  async function insertFromBank(q: BankQuestion, kind: Card['content_kind']) {
    const title = `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
    const body = q.embedding_text?.slice(0, 800) ?? '';
    await addCard(kind, { card_title: title, content: body, source_question_id: q.id, marks: q.total_marks ?? null });
  }

  if (authed === null || loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!authed) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xl font-semibold text-slate-700">Admin login required</p>
      <a className="text-blue-600 underline text-sm" href="/admin">/admin</a>
    </main>
  );
  if (!lesson) return <div className="p-8 text-red-500">Lesson not found.</div>;

  const cardsByKindSection: Record<string, Card[]> = {};
  for (const c of cards) {
    const k = `${c.content_kind}::${c.section_name}`;
    if (!cardsByKindSection[k]) cardsByKindSection[k] = [];
    cardsByKindSection[k].push(c);
  }
  for (const k of Object.keys(cardsByKindSection)) {
    cardsByKindSection[k].sort((a, b) => a.order_index - b.order_index);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center gap-3 text-sm">
          <a href="/admin/lessons" className="hover:text-emerald-300 font-medium">📚 Lessons</a>
          <span className="text-slate-400">/</span>
          <span className="text-emerald-300 font-medium truncate">{lesson.name}</span>
          <span className="flex-1" />
          {savedAt && <span className="text-xs text-emerald-300">Saved {savedAt.toLocaleTimeString()}</span>}
          <button onClick={() => generatePDF(id, pw.current, lesson.name)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 rounded text-xs font-medium">
            📄 Generate PDF
          </button>
          <button onClick={() => setBankOpen(o => !o)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-medium">
            {bankOpen ? 'Hide bank' : '+ From bank'}
          </button>
        </div>
      </div>

      {/* Lesson metadata bar */}
      <LessonHeader lesson={lesson} onSave={saveLessonMeta} />

      <div className="flex max-w-6xl mx-auto gap-4 px-4 py-4">
        {/* Cards column */}
        <div className="flex-1 space-y-6">
          {KIND_ORDER.map(kind => (
            <KindBlock key={kind} kind={kind}
              groups={Object.entries(cardsByKindSection).filter(([k]) => k.startsWith(kind + '::'))}
              onAdd={(section) => addCard(kind, { section_name: section })}
              onUpdate={updateCard}
              onDelete={deleteCard}
              onReorder={reorderWithin}
            />
          ))}
        </div>

        {/* Bank panel */}
        {bankOpen && (
          <BankPanel
            level={lesson.level}
            topics={lesson.topics}
            pw={pw.current}
            onInsert={insertFromBank}
          />
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-12 text-xs text-slate-400">
        <button onClick={() => deleteLesson(id, pw.current, router)}
                className="text-rose-500 hover:underline">Delete this lesson</button>
      </div>
    </main>
  );
}

// ── Lesson header ──

function LessonHeader({ lesson, onSave }: { lesson: Lesson; onSave: (patch: Partial<Lesson>) => void }) {
  const [name, setName] = useState(lesson.name);
  const [desc, setDesc] = useState(lesson.description ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setName(lesson.name); setDesc(lesson.description ?? ''); }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
                 onBlur={() => name !== lesson.name && onSave({ name })}
                 className="flex-1 px-2 py-1 text-lg font-semibold text-slate-800 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded"
                 placeholder="Lesson name" />
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded font-mono">{lesson.level}</span>
        </div>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
               onBlur={() => desc !== (lesson.description ?? '') && onSave({ description: desc || null } as Partial<Lesson>)}
               placeholder="Description (optional)"
               className="w-full px-2 py-1 text-sm text-slate-600 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded" />
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-slate-500 mt-1">Topics:</span>
          {lesson.topics.map(t => (
            <span key={t} className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded flex items-center gap-1">
              {t}
              <button onClick={() => onSave({ topics: lesson.topics.filter(x => x !== t) })}
                      className="hover:text-rose-600">✕</button>
            </span>
          ))}
          <button onClick={() => setPickerOpen(o => !o)}
                  className="text-xs px-2 py-0.5 border border-dashed border-slate-400 rounded text-slate-600 hover:border-emerald-500 hover:text-emerald-700">
            + Add topic
          </button>
        </div>
        {pickerOpen && <TopicPicker level={lesson.level} selected={lesson.topics}
          onPick={t => { onSave({ topics: [...lesson.topics, t] }); setPickerOpen(false); }} />}
      </div>
    </div>
  );
}

function TopicPicker({ level, selected, onPick }: { level: string; selected: string[]; onPick: (t: string) => void }) {
  const cats = getTopicsForLevel(level);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 mt-2 max-h-72 overflow-y-auto">
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

// ── Kind block (section group within a kind) ──

function KindBlock({
  kind, groups, onAdd, onUpdate, onDelete, onReorder,
}: {
  kind: Card['content_kind'];
  groups: [string, Card[]][];
  onAdd: (section: string) => void;
  onUpdate: (id: string, patch: Partial<Card>) => void;
  onDelete: (id: string) => void;
  onReorder: (kind: Card['content_kind'], section: string, orderedIds: string[]) => void;
}) {
  const defaultSection = kind === 'refresher' ? 'Refreshers' : kind === 'worked_example' ? 'Worked Examples' : 'Practice';
  const isEmpty = groups.length === 0 || groups.every(([, cs]) => cs.length === 0);

  return (
    <section className={`border-l-4 ${KIND_COLOR[kind]} bg-white rounded shadow-sm`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
        <span className="font-semibold text-slate-800">{KIND_LABEL[kind]}</span>
        <span className="text-xs text-slate-500">
          ({groups.reduce((acc, [, cs]) => acc + cs.length, 0)} card{groups.reduce((acc, [, cs]) => acc + cs.length, 0) === 1 ? '' : 's'})
        </span>
        <span className="flex-1" />
        <button onClick={() => onAdd(defaultSection)} className="text-xs text-emerald-700 hover:underline">+ Add {kind}</button>
      </div>
      <div className="p-3 space-y-3">
        {isEmpty && <div className="text-sm text-slate-400 italic text-center py-4">No {kind} cards. Click "+ Add {kind}" or insert from bank.</div>}
        {groups.map(([key, list]) => {
          const section = key.split('::')[1];
          return (
            <div key={key}>
              {groups.length > 1 && (
                <div className="text-xs font-semibold text-slate-500 px-1 mb-1">{section}</div>
              )}
              <div className="space-y-2">
                {list.map((c, idx) => (
                  <CardRow key={c.id} card={c}
                    onUpdate={(p) => onUpdate(c.id, p)}
                    onDelete={() => onDelete(c.id)}
                    onMoveUp={idx > 0 ? () => onReorder(kind, section, swap(list.map(x => x.id), idx, idx - 1)) : undefined}
                    onMoveDown={idx < list.length - 1 ? () => onReorder(kind, section, swap(list.map(x => x.id), idx, idx + 1)) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

// ── Card row ──

function CardRow({
  card, onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  card: Card;
  onUpdate: (p: Partial<Card>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [title, setTitle] = useState(card.card_title ?? '');
  const [content, setContent] = useState(card.content ?? '');
  const [marks, setMarks] = useState(card.marks?.toString() ?? '');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setTitle(card.card_title ?? ''); setContent(card.content ?? ''); setMarks(card.marks?.toString() ?? ''); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-slate-50 border border-slate-200 rounded">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex flex-col text-xs text-slate-400">
          {onMoveUp && <button onClick={onMoveUp}>▲</button>}
          {onMoveDown && <button onClick={onMoveDown}>▼</button>}
        </div>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
               onBlur={() => title !== (card.card_title ?? '') && onUpdate({ card_title: title })}
               placeholder="Card title (e.g. 'Differentiation chain rule')"
               className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-sm" />
        {card.content_kind === 'practice' && (
          <input type="number" value={marks} onChange={e => setMarks(e.target.value)}
                 onBlur={() => {
                   const m = parseInt(marks, 10);
                   if (!isNaN(m) && m !== card.marks) onUpdate({ marks: m });
                 }}
                 placeholder="marks"
                 className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-right" />
        )}
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-slate-500 hover:text-slate-800">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onDelete} className="text-rose-500 hover:text-rose-700 text-sm">✕</button>
      </div>
      {expanded && (
        <div className="px-3 pb-2">
          <textarea value={content} onChange={e => setContent(e.target.value)}
                    onBlur={() => content !== (card.content ?? '') && onUpdate({ content })}
                    placeholder="Card content (Markdown + LaTeX with $...$ for inline, $$...$$ for display)"
                    className="w-full min-h-[120px] px-2 py-1 bg-white border border-slate-300 rounded text-sm font-mono"
          />
          {card.source_question_id && (
            <div className="mt-1 text-xs text-blue-600">📎 Linked to bank question</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bank panel ──

function BankPanel({ level, topics, pw, onInsert }: { level: string; topics: string[]; pw: string; onInsert: (q: BankQuestion, kind: Card['content_kind']) => void }) {
  const [qs, setQs] = useState<BankQuestion[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topics.length === 0) { setQs([]); return; }
    setLoading(true);
    const url = `/api/admin/lessons/bank?level=${encodeURIComponent(level)}&topics=${encodeURIComponent(topics.join(','))}${search ? '&q=' + encodeURIComponent(search) : ''}`;
    api(url, pw).then(d => setQs(d.questions ?? [])).finally(() => setLoading(false));
  }, [level, topics, pw, search]);

  return (
    <aside className="w-96 bg-white border border-slate-200 rounded shadow-sm self-start sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
      <div className="p-3 border-b border-slate-100">
        <div className="text-sm font-semibold mb-2 text-slate-800">Question bank</div>
        <input type="text" placeholder={topics.length === 0 ? 'Add topics to enable bank' : 'Search…'}
               disabled={topics.length === 0}
               value={search} onChange={e => setSearch(e.target.value)}
               className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
      </div>
      {loading && <div className="p-3 text-sm text-slate-400">Loading…</div>}
      {!loading && qs.length === 0 && topics.length > 0 && <div className="p-3 text-sm text-slate-400 italic">No matches.</div>}
      <div className="divide-y divide-slate-100">
        {qs.slice(0, 100).map(q => (
          <div key={q.id} className="px-3 py-2 text-xs hover:bg-slate-50">
            <div className="font-semibold text-slate-700">{q.school} {q.year} P{q.paper} Q{q.question_number}</div>
            <div className="text-slate-500 truncate">{q.topic} {q.total_marks && `· ${q.total_marks}m`}</div>
            <div className="text-slate-600 mt-1 line-clamp-2">{q.embedding_text}</div>
            <div className="mt-2 flex gap-1">
              <button onClick={() => onInsert(q, 'worked_example')} className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-800 rounded hover:bg-blue-200">+ WE</button>
              <button onClick={() => onInsert(q, 'practice')} className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-800 rounded hover:bg-orange-200">+ Practice</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Helpers ──

async function api(url: string, pw: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${pw}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
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

async function deleteLesson(id: string, pw: string, router: ReturnType<typeof useRouter>) {
  if (!confirm('Delete this lesson and all its cards? This cannot be undone.')) return;
  await fetch(`/api/admin/lessons/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${pw}` } });
  router.push('/admin/lessons');
}
