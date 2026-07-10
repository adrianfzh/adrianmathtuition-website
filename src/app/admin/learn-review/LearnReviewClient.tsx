'use client';

// /admin/learn-review — Adrian's review gate for interactive learning_units.
// Subject → topic → unit list. Each unit gets a full static preview (everything
// shown at once, not tap-through) so review is fast, plus approve/reject/edit.
// Edit mode validates the payload JSON and katex-render-checks every math string
// before saving. Students only ever see approved units in the portal player.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

// ── Types ────────────────────────────────────────────────────────────────────

type Status = 'pending' | 'approved' | 'rejected';
type Kind = 'core' | 'example' | 'check' | 'autopsy' | 'try';

interface Unit {
  id: string;
  subject: string;
  topic: string;
  unit_order: number | null;
  kind: Kind;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  status: Status;
  updated_at: string | null;
}

interface TopicSummary {
  topic: string;
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface Toast {
  msg: string;
  kind: 'success' | 'error';
}

const SUBJECTS: { key: string; label: string }[] = [
  { key: 'AM', label: 'A-Math' },
  { key: 'EM', label: 'E-Math' },
  { key: 'JC', label: 'JC H2' },
  { key: 'S1', label: 'Sec 1' },
  { key: 'S2', label: 'Sec 2' },
];

const KIND_ICON: Record<Kind, string> = {
  core: '🧠',
  example: '✏️',
  check: '⚡',
  autopsy: '🔍',
  try: '🎯',
};

const KIND_LABEL: Record<Kind, string> = {
  core: 'Core',
  example: 'Example',
  check: 'Check',
  autopsy: 'Autopsy',
  try: 'Try',
};

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// ── Markdown + KaTeX helpers ─────────────────────────────────────────────────

function Md({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`prose prose-sm max-w-none text-slate-800 leading-relaxed ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{children || ''}</ReactMarkdown>
    </div>
  );
}

// Raw LaTeX (a step's `math` field carries no $ delimiters) → wrap for display.
function MathBlock({ tex }: { tex: string }) {
  return <Md>{`$$${tex}$$`}</Md>;
}

// Pull $$…$$ (display) and $…$ (inline) math segments out of a markdown string.
function findMathSegments(s: string): { tex: string; display: boolean }[] {
  const segs: { tex: string; display: boolean }[] = [];
  const withoutDisplay = s.replace(/\$\$([\s\S]+?)\$\$/g, (full, tex) => {
    segs.push({ tex, display: true });
    return ' '.repeat(full.length);
  });
  const inlineRe = /\$([^$\n]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(withoutDisplay)) !== null) {
    segs.push({ tex: m[1], display: false });
  }
  return segs;
}

// Walk every string value in the payload; render-check each math segment (and
// the whole value for raw-LaTeX `math` fields). Returns human-readable errors.
function collectKatexErrors(root: unknown): string[] {
  const errors: string[] = [];
  const walk = (val: unknown, key: string, path: string) => {
    if (typeof val === 'string') {
      if (key === 'math') {
        try {
          katex.renderToString(val, { displayMode: true, throwOnError: true });
        } catch (e) {
          errors.push(`${path}: ${(e as Error).message}`);
        }
      } else {
        for (const seg of findMathSegments(val)) {
          try {
            katex.renderToString(seg.tex, { displayMode: seg.display, throwOnError: true });
          } catch (e) {
            const snip = seg.tex.length > 40 ? seg.tex.slice(0, 40) + '…' : seg.tex;
            errors.push(`${path} ("${snip}"): ${(e as Error).message}`);
          }
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach((v, i) => walk(v, key, `${path}[${i}]`));
    } else if (val && typeof val === 'object') {
      for (const k of Object.keys(val as Record<string, unknown>)) {
        walk((val as Record<string, unknown>)[k], k, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(root, '', '');
  return errors;
}

// ── Per-kind static previews ─────────────────────────────────────────────────

interface DecisionOption { label_md: string; ok?: boolean; feedback_md?: string }
interface Decision {
  after_step?: number;
  context_strip_md?: string;
  prompt_md?: string;
  options?: DecisionOption[];
}

function OptionRow({ opt }: { opt: DecisionOption }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${opt.ok ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        <span className="text-xs pt-0.5">{opt.ok ? '✅' : '○'}</span>
        <div className="min-w-0 flex-1">
          <Md className="!text-sm">{opt.label_md || ''}</Md>
          {opt.feedback_md && (
            <div className="text-[12px] text-slate-500 mt-0.5">
              <Md className="!text-[12px] !text-slate-500 !leading-snug">{opt.feedback_md}</Md>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ d }: { d: Decision }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 my-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-violet-600 mb-1">
        Decision{typeof d.after_step === 'number' ? ` · after step ${d.after_step}` : ''}
        <span className="ml-2 normal-case font-medium text-violet-400">— quiz data, currently hidden from students</span>
      </div>
      {d.context_strip_md && (
        <div className="text-[12px] text-slate-500 border-l-2 border-slate-200 pl-2 mb-2">
          <Md className="!text-[12px] !text-slate-500">{d.context_strip_md}</Md>
        </div>
      )}
      {d.prompt_md && <div className="font-medium mb-2"><Md>{d.prompt_md}</Md></div>}
      <div className="space-y-1.5">
        {(d.options ?? []).map((o, i) => <OptionRow key={i} opt={o} />)}
      </div>
    </div>
  );
}

function AnnotationBubble({ children }: { children: string }) {
  return (
    <div className="rounded-lg bg-[hsl(45,90%,94%)] border border-[hsl(42,80%,72%)] px-3 py-2 mt-1.5">
      <Md className="!text-[13px] !text-[hsl(35,50%,30%)]">{children}</Md>
    </div>
  );
}

// Inline SVG figure preview (same defensive strip as the player).
function FigurePreview({ svg }: { svg: string }) {
  const clean = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  if (!/^\s*<svg[\s>]/i.test(clean)) return null;
  return <div className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto my-2" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function CorePreview({ p }: { p: { summary_md?: string; formula_md?: string; remember_md?: string; figure_svg?: string } }) {
  return (
    <div className="space-y-3">
      {p.figure_svg && <FigurePreview svg={p.figure_svg} />}
      {p.summary_md && <Md>{p.summary_md}</Md>}
      {p.formula_md && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <Md>{p.formula_md}</Md>
        </div>
      )}
      {p.remember_md && (
        <div className="rounded-xl bg-[hsl(45,90%,95%)] border border-[hsl(42,80%,72%)] px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[hsl(35,60%,38%)] mb-1">Remember</div>
          <Md className="!text-[hsl(30,45%,25%)]">{p.remember_md}</Md>
        </div>
      )}
    </div>
  );
}

interface Step { label?: string; math?: string; annotation_md?: string; more_md?: string; figure_svg?: string }

function ExamplePreview({ p }: { p: { problem_md?: string; steps?: Step[]; decisions?: Decision[]; answer_md?: string } }) {
  const steps = p.steps ?? [];
  const decisions = p.decisions ?? [];
  return (
    <div className="space-y-3">
      {p.problem_md && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Problem</div>
          <Md>{p.problem_md}</Md>
        </div>
      )}
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-300 shrink-0">{i + 1}</span>
              {s.label && <span className="text-sm font-semibold text-slate-700">{s.label}</span>}
            </div>
            {s.figure_svg && <FigurePreview svg={s.figure_svg} />}
            {s.math && <div className="mt-1"><MathBlock tex={s.math} /></div>}
            {s.annotation_md && <AnnotationBubble>{s.annotation_md}</AnnotationBubble>}
            {s.more_md && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mt-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Why (tap-to-expand for students)</div>
                <Md className="!text-[13px] !text-slate-500">{s.more_md}</Md>
              </div>
            )}
            {decisions.filter(d => d.after_step === i + 1).map((d, di) => <DecisionCard key={di} d={d} />)}
          </li>
        ))}
      </ol>
      {/* Decisions that don't map to a rendered step still get shown. */}
      {decisions.filter(d => typeof d.after_step !== 'number' || d.after_step < 1 || d.after_step > steps.length).map((d, di) => (
        <DecisionCard key={`orphan-${di}`} d={d} />
      ))}
      {p.answer_md && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Answer</div>
          <Md>{p.answer_md}</Md>
        </div>
      )}
    </div>
  );
}

function CheckPreview({ p }: { p: { prompt_md?: string; options?: DecisionOption[] } }) {
  return (
    <div className="space-y-2">
      {p.prompt_md && <div className="font-medium"><Md>{p.prompt_md}</Md></div>}
      <div className="space-y-1.5">
        {(p.options ?? []).map((o, i) => <OptionRow key={i} opt={o} />)}
      </div>
    </div>
  );
}

function AutopsyPreview({ p }: { p: { problem_md?: string; working?: string[]; wrong_line?: number; why_md?: string; fix_md?: string } }) {
  const working = p.working ?? [];
  return (
    <div className="space-y-3">
      {p.problem_md && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Problem</div>
          <Md>{p.problem_md}</Md>
        </div>
      )}
      <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
        {working.map((line, i) => {
          const isWrong = p.wrong_line === i + 1;
          return (
            <div key={i} className={`px-4 py-2 flex gap-2 items-start ${isWrong ? 'bg-rose-50' : ''}`}>
              <span className="text-xs font-mono text-slate-300 pt-1 w-5 shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1"><Md className="!text-sm">{line}</Md></div>
              {isWrong && <span className="text-rose-500 text-sm shrink-0">✗</span>}
            </div>
          );
        })}
      </div>
      {p.why_md && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600 mb-1">Why it&apos;s wrong</div>
          <Md>{p.why_md}</Md>
        </div>
      )}
      {p.fix_md && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Fix</div>
          <Md>{p.fix_md}</Md>
        </div>
      )}
    </div>
  );
}

function TryPreview({ p }: { p: { problem_md?: string; answer_md?: string; note_md?: string } }) {
  return (
    <div className="space-y-3">
      {p.problem_md && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Problem</div>
          <Md>{p.problem_md}</Md>
        </div>
      )}
      {p.answer_md && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Answer</div>
          <Md>{p.answer_md}</Md>
        </div>
      )}
      {p.note_md && (
        <div className="text-[13px] text-slate-500 italic"><Md className="!text-[13px] !text-slate-500">{p.note_md}</Md></div>
      )}
    </div>
  );
}

function UnitPreview({ unit }: { unit: Unit }) {
  const p = unit.payload ?? {};
  try {
    switch (unit.kind) {
      case 'core': return <CorePreview p={p} />;
      case 'example': return <ExamplePreview p={p} />;
      case 'check': return <CheckPreview p={p} />;
      case 'autopsy': return <AutopsyPreview p={p} />;
      case 'try': return <TryPreview p={p} />;
      default: return <pre className="text-xs overflow-x-auto">{JSON.stringify(p, null, 2)}</pre>;
    }
  } catch {
    return <pre className="text-xs text-rose-600 overflow-x-auto">Could not render payload — check the JSON.</pre>;
  }
}

// ── Unit card (with edit mode) ───────────────────────────────────────────────

// Sortable wrapper: whole-card drag via the ⠿ handle only, so buttons,
// text selection and scrolling inside the card keep working.
// Module-level component — required because it uses the useSortable hook.
function SortableUnitRow({ unit, children }: { unit: Unit; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-80 shadow-xl' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute right-2 top-2 z-10 cursor-grab active:cursor-grabbing rounded-lg px-2 py-1 text-slate-300 hover:text-slate-500 hover:bg-slate-50 text-lg leading-none select-none"
        style={{ touchAction: 'none' }}
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

function UnitCard({
  unit,
  onStatus,
  onSaveEdit,
  busy,
}: {
  unit: Unit;
  onStatus: (id: string, action: 'approve' | 'reject' | 'pending') => void;
  onSaveEdit: (id: string, title: string, payload: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(unit.title);
  const [json, setJson] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setTitle(unit.title);
    setJson(JSON.stringify(unit.payload ?? {}, null, 2));
    setErrors([]);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setErrors([]);
  }
  async function save() {
    setErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setErrors([`Invalid JSON: ${(e as Error).message}`]);
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setErrors(['Payload must be a JSON object (not an array or primitive).']);
      return;
    }
    const katexErrors = collectKatexErrors(parsed);
    if (katexErrors.length) {
      setErrors([`${katexErrors.length} LaTeX error${katexErrors.length === 1 ? '' : 's'} — fix before saving:`, ...katexErrors]);
      return;
    }
    setSaving(true);
    const ok = await onSaveEdit(unit.id, title, parsed);
    setSaving(false);
    if (ok) setEditing(false);
  }

  const meta = STATUS_META[unit.status];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none shrink-0" title={KIND_LABEL[unit.kind]}>{KIND_ICON[unit.kind]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{KIND_LABEL[unit.kind]}</span>
            {unit.unit_order != null && <span className="text-[11px] text-slate-300">#{unit.unit_order}</span>}
            <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
          </div>
          <div className="font-semibold text-navy text-[15px] mt-0.5 break-words">{unit.title}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => onStatus(unit.id, 'approve')} disabled={busy || editing || unit.status === 'approved'}
          className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-40">
          ✅ Approve
        </button>
        <button onClick={() => onStatus(unit.id, 'reject')} disabled={busy || editing || unit.status === 'rejected'}
          className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-40">
          ❌ Reject
        </button>
        <button onClick={editing ? cancelEdit : startEdit} disabled={busy}
          className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
          {editing ? '✕ Close editor' : '✎ Edit'}
        </button>
        {unit.status !== 'pending' && (
          <button onClick={() => onStatus(unit.id, 'pending')} disabled={busy || editing}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-300 text-slate-500 bg-white hover:bg-slate-50 disabled:opacity-40">
            ↩ Back to pending
          </button>
        )}
      </div>

      {/* Edit mode */}
      {editing && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/30" />
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 pt-1">Payload JSON</label>
          <textarea value={json} onChange={e => setJson(e.target.value)} spellCheck={false}
            rows={Math.min(30, Math.max(10, json.split('\n').length + 1))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono leading-5 bg-white focus:outline-none focus:ring-2 focus:ring-navy/30" />
          {errors.length > 0 && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 space-y-1">
              {errors.map((e, i) => <div key={i} className={i === 0 ? 'font-semibold' : 'font-mono break-words'}>{e}</div>)}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="text-sm font-semibold rounded-lg px-4 py-2 bg-navy text-[hsl(45,100%,96%)] disabled:opacity-40">
              {saving ? 'Saving…' : '💾 Validate & save'}
            </button>
            <button onClick={cancelEdit} disabled={saving}
              className="text-sm font-semibold rounded-lg px-4 py-2 border border-slate-300 text-slate-600 bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Static preview */}
      <div className="border-t border-slate-100 pt-3">
        <UnitPreview unit={unit} />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function LearnReviewClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [subject, setSubject] = useState('AM');
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState('');

  const showToast = useCallback((msg: string, kind: 'success' | 'error' = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => setAuthed(ok)); }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const ok = await loginAdminSession(password);
    setAuthLoading(false);
    if (ok) setAuthed(true);
    else setAuthError('Incorrect password');
  }

  const loadTopics = useCallback(async (subj: string) => {
    setTopicsLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/learn-review?subject=${encodeURIComponent(subj)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Could not load topics'); setTopics([]); return; }
      setTopics(d.topics || []);
    } catch {
      setError('Connection error loading topics');
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const loadUnits = useCallback(async (subj: string, topic: string) => {
    setUnitsLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/learn-review?subject=${encodeURIComponent(subj)}&topic=${encodeURIComponent(topic)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Could not load units'); setUnits([]); return; }
      setUnits(d.units || []);
    } catch {
      setError('Connection error loading units');
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    setSelectedTopic(null);
    setUnits([]);
    loadTopics(subject);
  }, [authed, subject, loadTopics]);

  function openTopic(topic: string) {
    setSelectedTopic(topic);
    setConfirmApproveAll(false);
    loadUnits(subject, topic);
  }
  function backToTopics() {
    setSelectedTopic(null);
    setConfirmApproveAll(false);
    loadTopics(subject);
  }

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/admin/learn-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }

  // Drag-to-reorder. The topic's existing unit_order values are fixed slots;
  // the new visual order decides which unit occupies which slot (Part headers
  // stay in place, units move across them). Optimistic; reverts on failure.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !selectedTopic) return;
    const oldIndex = units.findIndex(u => u.id === active.id);
    const newIndex = units.findIndex(u => u.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = units;
    const slots = [...units.map(u => u.unit_order)].sort((a, b) => (a ?? 0) - (b ?? 0));
    const moved = arrayMove(units, oldIndex, newIndex).map((u, i) => ({ ...u, unit_order: slots[i] }));
    setUnits(moved);
    try {
      await post({ action: 'reorder', subject, topic: selectedTopic, orderedIds: moved.map(u => u.id) });
      showToast('Order saved');
    } catch (err) {
      setUnits(prev);
      showToast((err as Error).message, 'error');
    }
  }

  async function handleStatus(id: string, action: 'approve' | 'reject' | 'pending') {
    setBusyId(id);
    try {
      const d = await post({ id, action });
      const newStatus: Status = d.unit?.status ?? (action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending');
      setUnits(us => us.map(u => u.id === id ? { ...u, status: newStatus } : u));
      showToast(action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Back to pending');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(id: string, title: string, payload: unknown): Promise<boolean> {
    setBusyId(id);
    try {
      const d = await post({ id, action: 'edit', title, payload });
      if (d.unit) {
        setUnits(us => us.map(u => u.id === id ? { ...u, title: d.unit.title, payload: d.unit.payload } : u));
      } else {
        setUnits(us => us.map(u => u.id === id ? { ...u, title, payload } : u));
      }
      showToast('Saved');
      return true;
    } catch (e) {
      showToast((e as Error).message, 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveAll() {
    if (!selectedTopic) return;
    setBulkBusy(true);
    try {
      const d = await post({ subject, topic: selectedTopic, action: 'approve_topic' });
      setUnits(us => us.map(u => u.status === 'pending' ? { ...u, status: 'approved' } : u));
      showToast(`Approved ${d.updated ?? 0} pending unit${d.updated === 1 ? '' : 's'}`);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBulkBusy(false);
      setConfirmApproveAll(false);
    }
  }

  // ── Auth screen ──
  if (authed === null) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (!authed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-7 text-center">
          <div className="text-3xl mb-2">🎓</div>
          <h1 className="text-lg font-bold text-slate-800 mb-1">Learn Review</h1>
          <p className="text-xs text-slate-400 mb-5">Enter the admin password to review interactive units.</p>
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthError(''); }}
            placeholder="Admin password" autoFocus disabled={authLoading}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-navy/30" />
          {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
          <button type="submit" disabled={authLoading || !password}
            className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">
            {authLoading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  const pendingCount = units.filter(u => u.status === 'pending').length;

  return (
    <div className="pb-24 max-w-3xl mx-auto px-3 sm:px-4 pt-12">
      <h1 className="text-xl font-bold text-navy mb-1">Learn Review</h1>
      <p className="text-sm text-slate-500 mb-4">Approve, reject, or edit interactive learning units before students see them.</p>

      {/* Subject chips */}
      <div className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        {SUBJECTS.map(s => (
          <button key={s.key} onClick={() => setSubject(s.key)}
            className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${subject === s.key ? 'bg-navy text-[hsl(45,100%,96%)]' : 'text-slate-500 hover:text-navy'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Topic-level view */}
      {!selectedTopic && (
        topicsLoading ? (
          <p className="text-sm text-slate-400">Loading topics…</p>
        ) : topics.length === 0 ? (
          <p className="text-sm text-slate-400">No learning units for {SUBJECTS.find(s => s.key === subject)?.label ?? subject} yet.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {topics.map(t => (
              <button key={t.topic} onClick={() => openTopic(t.topic)}
                className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-navy/30">
                <div className="font-semibold text-navy text-sm mb-2 break-words">{t.topic}</div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  {t.pending > 0 && <span className="font-medium border rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200">{t.pending} pending</span>}
                  {t.approved > 0 && <span className="font-medium border rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">{t.approved} approved</span>}
                  {t.rejected > 0 && <span className="font-medium border rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 border-rose-200">{t.rejected} rejected</span>}
                  <span className="text-slate-400">{t.total} total</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* Unit-level view */}
      {selectedTopic && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <button onClick={backToTopics} className="text-sm font-semibold text-slate-500 hover:text-navy">‹ All topics</button>
            {pendingCount > 0 && (
              confirmApproveAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Approve all {pendingCount} pending?</span>
                  <button onClick={handleApproveAll} disabled={bulkBusy}
                    className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-emerald-600 text-white disabled:opacity-40">
                    {bulkBusy ? 'Approving…' : 'Yes, approve all'}
                  </button>
                  <button onClick={() => setConfirmApproveAll(false)} disabled={bulkBusy}
                    className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-300 text-slate-600 bg-white">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmApproveAll(true)}
                  className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50">
                  ✅ Approve all pending ({pendingCount})
                </button>
              )
            )}
          </div>

          <div className="mb-4">
            <div className="font-bold text-navy text-lg break-words">{selectedTopic}</div>
            <div className="text-xs text-slate-400">{units.length} unit{units.length === 1 ? '' : 's'} · {pendingCount} pending</div>
          </div>

          {unitsLoading ? (
            <p className="text-sm text-slate-400">Loading units…</p>
          ) : units.length === 0 ? (
            <p className="text-sm text-slate-400">No units in this topic.</p>
          ) : (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={units.map(u => u.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {units.map(u => (
                    <SortableUnitRow key={u.id} unit={u}>
                      <UnitCard unit={u} onStatus={handleStatus} onSaveEdit={handleSaveEdit} busy={busyId === u.id} />
                    </SortableUnitRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${toast.kind === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
