'use client';
// /admin/desk — the marking desk (SPEC-MARKING-DESK.md, 2 Sep 2026).
//
// Adrian: "now i have 3 places to look at for marking — mark paper, triage,
// and papers, it's complicated and not user friendly. the flow should just be
// a marked paper appears (with analysis and total marks on the first page) and
// self learning sheet auto generates, i vet the marked copy and the self
// learning sheet, approve, then release."
//
// One page: a queue of papers in four derived lanes (lib/desk-state.ts), and a
// detail view with the marked script on the left (cover, every page, every
// question with Agree / Override) and the self-study sheet on the right, ending
// in ONE button — Approve & release. Nothing here writes on its own: every tap
// goes through the route that already owns that action (mark-triage,
// release-with-sheet, sheet-jobs, papers, desk/rebuild), so the desk can never
// disagree with triage about what happened.
//
// Built for the iPad (portrait stacks the panes, landscape puts them side by
// side) and the phone between lessons. Same palette and buttons as triage so
// it reads as the same product.

import { uploadStudentFile } from '@/lib/student-files-client';
import 'katex/dist/katex.min.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { LayerMeta } from '@/lib/annotate/layer';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import StudentPicker from '@/components/StudentPicker';
import SubjectChip from '@/components/SubjectChip';
import GroundingChip from '@/components/GroundingChip';
import RulesTag from '@/components/RulesTag';
import { mathHtml } from '@/lib/math-inline';
import { DESK_LANES, LANES_HIDDEN_AT_ZERO, releasedViaLabel, LANE_LABEL, orderLane, HANDIN_ORIGIN_LABEL, type DeskLane, type HandinOrigin, revisingLabel, type Revising, type SheetOutcome } from '@/lib/desk-state';
import { ERROR_KINDS, ERROR_KIND_HINT, isErrorKind } from '@/lib/error-kinds';
import { PAPER_SUBJECTS, subjectPill } from '@/lib/portal-subjects';
// The pen, in place (desk round 3, 8 Sep 2026): the same overlay mark-paper uses.
const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });
import type { TriageQuestion } from '@/lib/mark-triage';
import { secondLookSuggestedMark } from '@/lib/mark-triage';
import type { Diagnosis } from '@/lib/sheet-diagnosis';
import { pdfToPageImages } from '@/lib/pdf-pages';

import { fileHref } from '@/lib/student-files-url';
// ── Shapes the two desk routes return ────────────────────────────────────────
type Row = {
  id: string; createdAt: string; paperName: string; subject: string;
  /** Which maths (A Math / E Math / H2 Math / Other / null) — the AM/EM/H2 pill. `subject` above is the marking lane. */
  paperSubject: string | null;
  studentId: string | null; studentName: string | null;
  awarded: number; max: number; pct: number | null; questions: number; pending: number;
  lane: DeskLane; releasedAt: string | null; releasedVia: string | null; pdfStale: boolean;
  /** The sheet is back with the worker for a revision — pinned at the top of its lane, and back on the to-do tab if released. */
  revising?: Revising | null;
  sheet: { jobId: string; status: string; stage: string | null; error: string | null; label: string; completedAt: string | null; requestedBy?: string | null } | null;
  /** What the sheet did after it was written — released · handed in · marked, when, compulsory (10 Sep 2026). */
  sheetOutcome?: SheetOutcome | null;
  flags: string[]; amended: string | null; assignments: number; assignmentsHeld?: number; practiceAgain?: boolean; origin?: HandinOrigin;
  folder: string; folderUrl: string;
  annotatedPdfUrl: string | null; photosPdfUrl: string | null; pdfUrl: string | null;
};

type Counts = Record<DeskLane, number>;

type InkHint = { photo_index: number; q: string; part: string | null; to: 'tick' | 'cross'; awarded_now?: number; max?: number; suggested?: number };
type Question = TriageQuestion & { flagged: boolean; inkHints?: InkHint[] };

type Detail = {
  run: {
    id: string; createdAt: string; paperName: string; subject: string; paperSubject: string | null; rulesVersion: string | null;
    studentId: string | null; studentName: string | null;
    awarded: number; max: number; totalQuestions: number;
    releasedAt: string | null; releasedVia: string | null; archivedAt: string | null; checkedAt: string | null;
    pdfUrl: string | null; annotatedPdfUrl: string | null; photosPdfUrl: string | null;
    pdfStale: boolean; grounding: string | null; unattempted: string[]; portalSubmission: boolean; practiceAgain?: boolean; origin?: HandinOrigin;
    paperMatch: PaperMatch | null;
    remarking: boolean; remarkPages: number[];
    remark: RemarkPanel | null;
    scheme: SchemeState | null;
    allocationAudit: { at: string | null; added: { q: string; part: string; marks: number }[]; maxDiffs: { q: string; part: string; marked: number; recorded: number }[]; countedBefore: number | null; countedAfter: number | null } | null;
  };
  lane: DeskLane;
  revising?: Revising | null;
  pending: number;
  overrides: { against: number; forStudent: number; reviewed: number };
  totalWarning: string | null;
  autoHold: { hold: boolean; reasons: string[] };
  autoRelease?: { at?: string; outcome?: string; note?: string; attempts?: number; sweep?: boolean } | null;
  questions: Question[];
  annotatedPhotos: { photoIndex: number; url: string; urlWithSolutions: string | null; overflowUrl: string | null; method: string | null; layerUrl?: string | null; layer?: LayerMeta | null; inkUrl?: string | null; editedAt?: string | null }[];
  pageSources?: Record<number, { originalUrl: string | null; rot: number }>;
  inkHints?: InkHint[];
  diagnosis: Diagnosis | null;
  sheetJob: {
    id: string; status: string; stage: string | null; error: string | null; attempts: number; focus: string | null;
    claimedBy: string | null; createdAt: string; completedAt: string | null; label: string;
    autoReleaseAt?: string | null; heldAt?: string | null; autoReleasedAt?: string | null;
    /** 'student' = asked for from the app (goes out on its own once it clears the gate); 'adrian' = queued here (compulsory once released). */
    requestedBy?: string | null;
    /** A batch sheet (10 Sep 2026): every paper it covers, the primary first. */
    runIds?: string[];
    result: {
      docxPath: string | null; pdfPath: string | null; wave: string[]; shelved: string[]; verified: string;
      /** The worker read the paper and there was nothing worth practising (3 Sep 2026). */
      noSheet: boolean; reason: string;
    } | null;
  } | null;
  assignments: number; assignmentsHeld?: number; sheetSent?: boolean;
  folder: { path: string; url: string; listed: boolean; exists: boolean; error: string | null; sheetPdf: boolean; sheetPdfName: string | null; markedAi: boolean };
  amended: { status: 'none' | 'found' | 'newer-than-attached' | 'unknown'; name?: string; modified?: string | null };
  flags: string[];
  approveBlockers: string[];
  releaseBlockers: string[];
};

type Cover = {
  headline: string;
  source: 'sheet' | 'marker';
  themes: { key: string; title: string; marks: number; examples: { question: string; why: string }[]; tier?: string; questions?: string[] }[];
  worstQuestions: { question: string; lost: number; max: number; why: string }[];
};

// Same palette as /admin/mark/triage — one product, two screens.
const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  faint: '#9ca3af',
  ink: '#111827',
  link: '#1d4ed8',
  flag: '#b45309',
  flagBg: '#fffbeb',
  flagBorder: '#fde68a',
  ok: '#15803d',
  okBg: '#f0fdf4',
  okBorder: '#bbf7d0',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
  pen: '#7c3aed',
};

const LANE_TONE: Record<DeskLane, { bg: string; fg: string }> = {
  untagged: { bg: '#fffbeb', fg: '#a16207' },
  'awaiting-sheet': { bg: '#eff6ff', fg: '#1d4ed8' },
  ready: { bg: '#f0fdf4', fg: '#15803d' },
  auto: { bg: '#ecfeff', fg: '#0e7490' },
  released: { bg: '#f3f4f6', fg: '#374151' },
};

// ▶️ The auto-release switch (8 Sep 2026): a setting, flipped here, reachable on
// a phone. Off = every marked hand-in waits for Adrian, as before 8 Sep.
function AutoReleaseSwitch() {
  const [state, setState] = useState<{ paused: boolean; at: string | null; by: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/admin/auto-release').then(r => r.json()).then(d => setState(d && typeof d.paused === 'boolean' ? d : null)).catch(() => {}); }, []);
  if (!state) return null;
  const on = !state.paused;
  return (
    <button disabled={busy} title={on
      ? 'Marked hand-ins that clear the accuracy gates go to students on their own. Tap to switch off.'
      : 'Every marked hand-in waits for you on the desk. Tap to switch on.'}
      onClick={async () => {
        if (!window.confirm(on ? 'Switch auto-release OFF? Every marked hand-in will wait for you.' : 'Switch auto-release ON? Hand-ins that clear the accuracy gates go to students as soon as they are marked; held ones still wait for you.')) return;
        setBusy(true);
        try { const r = await fetch('/api/admin/auto-release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: on }) }); const d = await r.json(); if (r.ok) setState(d); }
        finally { setBusy(false); }
      }}
      style={{ border: `1px solid ${on ? '#67e8f9' : '#fca5a5'}`, background: on ? '#ecfeff' : '#fef2f2', color: on ? '#0e7490' : '#b91c1c', borderRadius: 8, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {busy ? '…' : on ? '▶️ Auto-release on' : '⏸ Auto-release off'}
    </button>
  );
}

// 📐 The paper's mark scheme as a state (8 Sep 2026): the split the first
// marking used is recorded per paper and every later marking of that paper is
// held to it; Adrian's approval freezes it. `used` = what THIS marking marked to.
type SchemeState = {
  key: string; status: string; hasAllocation: boolean; approvedAt: string | null;
  allocationRunId: string | null; uses: number; used: string | null; recordedByThisRun: boolean;
};

function SchemeChip({ s, runId, busy, onApprove }: { s: SchemeState | null; runId: string; busy: string; onApprove: () => void }) {
  if (!s) return null;
  if (s.status === 'approved') {
    return <Chip label={`📐 scheme approved${s.approvedAt ? ` · ${fmtDate(s.approvedAt)}` : ''}`} bg="#ecfdf5" color="#065f46"
      title={`"${s.key}": every marking of this paper uses the approved per-part marks and split. ${s.used === 'approved' ? 'This marking used it.' : 'This marking was made before the approval.'}`} />;
  }
  if (!s.hasAllocation) return null;
  const from = s.recordedByThisRun ? 'recorded from this marking' : s.allocationRunId === runId ? 'recorded from this marking' : 'recorded from an earlier marking';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Chip label={`📐 scheme ${from}${s.used ? ' · used here' : ''}`} bg="#fffbeb" color="#92400e"
        title={`"${s.key}": the per-part marks and M/A split ${from}. Later markings of this paper are held to the same split; approving freezes it as this paper's scheme. Releasing a paper marked to it approves it too.`} />
      <button onClick={onApprove} disabled={busy === 'scheme'}
        style={{ background: 'transparent', border: '1px solid #f59e0b', borderRadius: 7, padding: '1px 8px', fontSize: 12, color: '#92400e', cursor: 'pointer' }}
        title="Freeze this paper's per-part marks and split — every later marking of it uses exactly these.">
        {busy === 'scheme' ? '…' : '✓ Approve scheme'}
      </button>
    </span>
  );
}

// 🔁 What the last re-mark changed (8 Sep 2026: "i remarked denise page 12 but
// i can't see what changed"). Shown while the marking that stepped aside is on
// the row; the next re-mark replaces it.
type RemarkPanel = {
  pages: number[] | null; at: string | null; previousAwarded: number | null; changed: number;
  parts: { q: string; part: string; before: { awarded: number; max: number } | null; after: { awarded: number; max: number; why: string } | null }[];
};

type PaperMatch = {
  key: string | null; source: string; trusted: boolean;
  shared: number | null; share: number | null; matched: number | null; reasons: string[];
};

// 🔍 What the paper was identified as (SPEC-PAPER-MATCH Phase 1, 3 Sep 2026)
// and whether the match was trusted. GroundingChip beside it says WHAT the
// marking was grounded on; this says WHICH paper and how sure. Silent when the
// run predates the stamp — an older run must not gain a "not matched" badge.
function PaperMatchChip({ pm }: { pm: PaperMatch | null }) {
  if (!pm) return null;
  const key = pm.key || 'paper not identified';
  if (pm.trusted) {
    const n = pm.matched ?? pm.shared;
    return <Chip label={`🔍 ${key}${n != null ? ` · ${n} matched` : ''}`} bg="#ecfdf5" color="#065f46"
      title={`Identified as "${key}" and matched on the printed questions (${pm.shared ?? '?'} shared, ${pm.share != null ? Math.round(pm.share * 100) : '?'}% of the smaller set). Source: ${pm.source}.`} />;
  }
  const why = pm.reasons.length ? pm.reasons.join(', ') : (pm.key ? 'no trusted match' : 'name carries no level or year');
  return <Chip label={`🔍 ${key} · not matched`} bg="#f3f4f6" color="#6b7280"
    title={`Marked on the rules alone. ${why}${pm.shared != null ? ` (${pm.shared} shared openings)` : ''}. A wrong match would mean a wrong scheme, so below the threshold nothing is used.`} />;
}

/** The released lane's sheet suffix: " · sheet released, not handed in" / " · sheet handed in" / " · sheet marked". */
function sheetOutcomeShort(row: { assignments: number; sheetOutcome?: SheetOutcome | null }): string {
  const o = row.sheetOutcome;
  if (!o) return row.assignments ? ' + sheet' : '';
  const when = o.at ? ` ${fmtDate(o.at)}` : '';
  const req = o.required ? ' (compulsory)' : '';
  if (o.state === 'marked') return ` · sheet handed in, marked${when}${req}`;
  if (o.state === 'handed-in') return ` · sheet handed in${when}${req}`;
  return ` · sheet released${when}, not handed in yet${req}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}
function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function scoreColour(pct: number | null) {
  if (pct === null) return C.muted;
  if (pct >= 80) return C.ok;
  if (pct >= 60) return '#a16207';
  return C.danger;
}
function btn(bg: string, color: string, border?: string) {
  return {
    background: bg, color, border: `1px solid ${border || bg}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer', font: 'inherit',
  } as const;
}
function Tex({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
function Chip({ label, bg = '#f3f4f6', color = '#374151', title }: { label: string; bg?: string; color?: string; title?: string }) {
  return <span title={title} style={{ background: bg, color, borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>;
}

// Which maths the paper is (paper_subject, SPEC-PORTAL-V2 §1) — the same
// AM / EM / H2 letters and hues the student's Papers page wears
// (components/PaperSubjectPill), inline-styled like the rest of this page.
// "Other" shows as a grey chip here (Adrian needs to see the untagged ones);
// null shows nothing.
const PAPER_SUBJECT_TONE: Record<string, { bg: string; fg: string }> = {
  am: { bg: '#e0e7ff', fg: '#3730a3' },
  em: { bg: '#e0f2fe', fg: '#075985' },
  h2: { bg: '#fae8ff', fg: '#86198f' },
  other: { bg: '#f3f4f6', fg: '#6b7280' },
};
const PAPER_SUBJECT_OPTIONS: readonly string[] = [...PAPER_SUBJECTS, 'Other'];
/** Who handed the paper in — the student from the app or Telegram, or Adrian via the scanner / mark-paper. */
function OriginChip({ origin }: { origin: HandinOrigin }) {
  const student = origin === 'app' || origin === 'telegram';
  return <Chip label={HANDIN_ORIGIN_LABEL[origin]} bg={student ? '#eff6ff' : '#f5f3ff'} color={student ? '#1d4ed8' : '#6d28d9'}
    title={student ? 'The student handed this in themselves.' : 'You put this paper in.'} />;
}
function PaperSubjectChip({ subject }: { subject: string | null | undefined }) {
  const pill = subjectPill(subject);
  if (!pill) return null;
  const t = PAPER_SUBJECT_TONE[pill.tone];
  return <span title={`${subject} paper`} style={{ background: t.bg, color: t.fg, borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700, lineHeight: '16px', whiteSpace: 'nowrap' }}>{pill.text}</span>;
}

const LANE_HINT: Record<DeskLane, string> = {
  untagged: 'A paper with no student reaches nobody — tag it so it reaches them.',
  'awaiting-sheet': 'Marked, and nobody has asked for a sheet. Vet the marking; Approve & release sends the paper on its own. A sheet you queue here and release is compulsory — the app reminds the student until it is handed in. Students can ask for their own from the app once the paper is out; those go out by themselves once they clear the gate.',
  ready: 'Marked, sheet written, not yet with the student. It goes out by itself on the 12-hour clock unless something holds it — the reasons sit under the button. Open one to agree or override, read the sheet, or Approve & release without waiting.',
  auto: 'Released by the system and not yet looked at — or a sheet being revised. Look it over if you want: Agree or Override still work here (an override re-issues their copy), ✓ Looked at moves it to Completed; anything you leave files itself under Completed after 7 days. A paper whose sheet is being revised sits at the top until the revised sheet is filed, then goes back to where it was.',
  released: 'With the student. Read-only — the folder link is the record.',
};

export default function DeskPage() {
  // ── auth ───────────────────────────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // ── queue ──────────────────────────────────────────────────────────────────
  const [lane, setLane] = useState<DeskLane | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');

  // ── detail ─────────────────────────────────────────────────────────────────
  const [runId, setRunId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [cover, setCover] = useState<Cover | null>(null);
  const [sheetPages, setSheetPages] = useState<string[] | null>(null);
  const [sheetNote, setSheetNote] = useState('');
  const sheetForRef = useRef<string>('');

  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editAwarded, setEditAwarded] = useState('');
  const [editNote, setEditNote] = useState('');
  // The kind of error Adrian saw ('' = not said) — stored as triage_override.error_kind,
  // the ground truth the marker's own labels are calibrated against.
  const [editKind, setEditKind] = useState('');
  // Per-part marks while editing one question: label → typed value (8 Sep 2026).
  const [editParts, setEditParts] = useState<Record<string, string>>({});
  // 🧺 questions parked on the student's shelf from this sitting (index → shown as Shelved ✓)
  const [shelved, setShelved] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState('');
  const [tagging, setTagging] = useState(false);

  // ── URL ↔ state (window, not useSearchParams — no Suspense needed) ───────────
  const readUrl = useCallback(() => {
    const q = new URLSearchParams(window.location.search);
    setRunId(q.get('run'));
    const l = q.get('lane');
    setLane(l && (DESK_LANES as readonly string[]).includes(l) ? (l as DeskLane) : null);
  }, []);
  useEffect(() => {
    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [readUrl]);
  function go(next: { run?: string | null; lane?: DeskLane | null }) {
    const q = new URLSearchParams();
    const l = next.lane === undefined ? lane : next.lane;
    const r = next.run === undefined ? runId : next.run;
    if (r) q.set('run', r); else if (l) q.set('lane', l);
    const url = `/admin/desk${q.toString() ? `?${q}` : ''}`;
    window.history.pushState({}, '', url);
    setRunId(r ?? null);
    if (next.lane !== undefined) setLane(next.lane);
    if (!r) { setDetail(null); setCover(null); setSheetPages(null); setEditing(null); }
  }

  // ── loads ──────────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async (spinner = true) => {
    if (spinner) setQueueLoading(true);
    try {
      const r = await fetch('/api/admin/desk?days=60');
      const d = await r.json();
      if (!r.ok || d.error) { setQueueError(d.error || 'Failed to load'); return; }
      setRows(d.rows || []);
      setCounts(d.counts || null);
      setLane(prev => prev ?? d.defaultLane ?? 'awaiting-sheet');
      setQueueError('');
    } catch { setQueueError('Connection error'); }
    finally { setQueueLoading(false); }
  }, []);

  const loadSheet = useCallback(async (id: string) => {
    // Rasterise the sheet PDF with pdf.js rather than iframe it: an iframe'd PDF
    // on iPadOS shows only its first page. Same-origin bytes via sheet-open.
    setSheetNote('Loading the sheet…');
    try {
      const r = await fetch(`/api/admin/sheet-open?runId=${encodeURIComponent(id)}&kind=pdf&stream=1`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const file = new File([blob], 'Practice Again.pdf', { type: 'application/pdf' });
      const pages = await pdfToPageImages(file, () => {}, 1600);
      if (sheetForRef.current !== id) return; // moved on to another paper meanwhile
      setSheetPages(pages.map(p => URL.createObjectURL(p)));
      setSheetNote('');
    } catch (e) {
      if (sheetForRef.current !== id) return;
      setSheetPages(null);
      setSheetNote(`Could not show the sheet here — ${(e as Error).message}. Open it in Dropbox instead.`);
    }
  }, []);

  const loadRun = useCallback(async (id: string, quiet = false) => {
    if (!quiet) { setRunLoading(true); setRunError(''); }
    try {
      const [r, c] = await Promise.all([
        fetch(`/api/admin/desk/run?runId=${encodeURIComponent(id)}`),
        quiet ? Promise.resolve(null) : fetch(`/api/admin/paper-analysis?runId=${encodeURIComponent(id)}`),
      ]);
      const d = await r.json();
      if (!r.ok || d.error) { setRunError(d.error || 'Failed to load'); return; }
      setDetail(d as Detail);
      setRunError('');
      if (c) {
        const cd = await c.json().catch(() => null);
        if (c.ok && cd && !cd.error) setCover(cd as Cover);
      }
      // A "no sheet needed" job is done and has no PDF — never go looking for one.
      const job = (d as Detail).sheetJob;
      const done = job?.status === 'done' && !job.result?.noSheet;
      if (done && sheetForRef.current !== id) { sheetForRef.current = id; loadSheet(id); }
      if (!done) { sheetForRef.current = ''; setSheetPages(null); setSheetNote(''); }
    } catch { if (!quiet) setRunError('Connection error'); }
    finally { if (!quiet) setRunLoading(false); }
  }, [loadSheet]);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) loadQueue(); }, [authed, loadQueue]);
  useEffect(() => {
    if (!authed || !runId) return;
    setDetail(null); setCover(null); setEditing(null);
    if (sheetForRef.current !== runId) { setSheetPages(null); setSheetNote(''); }
    loadRun(runId);
  }, [authed, runId, loadRun]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  // Object URLs for the rendered sheet pages are released when they change.
  useEffect(() => () => { (sheetPages || []).forEach(u => URL.revokeObjectURL(u)); }, [sheetPages]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  // ── mutations — every one through the route that owns it ──────────────────
  async function postJson(url: string, body: Record<string, unknown>) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && !d.error, status: r.status, d };
  }
  function refresh(id: string) { loadRun(id, true); loadQueue(false); }

  async function agree(q: Question) {
    if (!detail) return;
    const id = detail.run.id;
    setBusy(`q:${q.index}`);
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'agree', runId: id, questionIdx: q.index });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not save'); return; }
    setDetail(prev => prev && {
      ...prev,
      pending: typeof d.pending === 'number' ? d.pending : prev.pending,
      questions: prev.questions.map(x => (x.index === q.index ? { ...x, reviewed: true } : x)),
    });
    refresh(id);
  }

  async function override(q: Question) {
    if (!detail) return;
    const id = detail.run.id;
    // With parts, the marks are the per-part values and the total is their sum.
    const parts = q.parts.length
      ? q.parts.map(pt => ({ label: pt.label, awarded: Number(editParts[pt.label] ?? pt.awarded) }))
      : null;
    const awarded = parts ? parts.reduce((s, pt) => s + (Number.isFinite(pt.awarded) ? pt.awarded : 0), 0) : Number(editAwarded);
    if (!Number.isFinite(awarded) || (parts && parts.some(pt => !Number.isFinite(pt.awarded)))) return;
    const partsChanged = !!parts && parts.some(pt => pt.awarded !== (q.parts.find(x => x.label === pt.label)?.awarded ?? NaN));
    setBusy(`q:${q.index}`);
    const errorKind = isErrorKind(editKind) ? editKind : null;
    const { ok, d } = await postJson('/api/admin/mark-triage', {
      action: 'override', runId: id, questionIdx: q.index, awarded, note: editNote, errorKind: errorKind ?? undefined,
      ...(parts ? { parts } : {}),
    });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not save'); return; }
    setDetail(prev => prev && {
      ...prev,
      pending: typeof d.pending === 'number' ? d.pending : prev.pending,
      run: { ...prev.run, awarded: typeof d.awarded === 'number' ? d.awarded : prev.run.awarded, pdfStale: true },
      questions: prev.questions.map(x => (x.index === q.index ? {
        ...x, reviewed: true, awarded: Math.min(Math.max(awarded, 0), x.max),
        override: { awarded, previous: x.override?.previous ?? x.awarded, note: editNote, at: new Date().toISOString(), errorKind },
      } : x)),
    });
    setEditing(null); setEditAwarded(''); setEditNote(''); setEditKind(''); setEditParts({});
    // The red pen follows the record (8 Sep 2026): a part-level change redraws
    // that page from the original with the new marks. ~20 s, a few cents.
    if (partsChanged && q.photoIndex != null) {
      setToast(`Saved. Redrawing page ${q.photoIndex + 1} with the new marks — up to a minute…`);
      setBusy('redraw');
      const rd = await postJson('/api/admin/desk/redraw', { runId: id, photoIndex: q.photoIndex });
      setBusy('');
      setToast(rd.ok
        ? `Page ${q.photoIndex + 1} redrawn with the new marks. The PDFs still print the old total — the release button rebuilds them.`
        : `Saved, but the page could not be redrawn: ${rd.d.error || 'bot error'}. The marks are right; the ink on that page is still the marker's.`);
    } else {
      setToast('Saved. The PDF still prints the old total — the release button rebuilds it, or Rebuild PDFs now.');
    }
    if (detail.run.releasedAt) {
      // The student already has this paper — rebuild their copy and tell them.
      const re = await postJson('/api/admin/mark-triage', { action: 'reissue', runId: id });
      setToast(re.ok ? `Mark changed and re-issued to the student${re.d.via === 'telegram' ? ' — Telegram sent' : ''}.` : `Mark changed, but not re-issued: ${re.d.error || 'try again'}`);
    }
    refresh(id);
  }

  async function tag(studentId: string, name: string) {
    if (!detail || !studentId) return;
    const id = detail.run.id;
    setBusy('tag'); setTagging(false);
    const { ok, d } = await postJson('/api/admin/papers', { runId: id, studentId });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not tag'); return; }
    setToast(`Tagged to ${d.studentName || name}`);
    refresh(id);
  }

  // Which maths the paper is — paper_subject only (mark-triage {action:'subject'}).
  // Allowed after release: the student sees a different pill, never a different mark.
  async function setPaperSubject(subject: string) {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('subject');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'subject', runId: id, subject });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not save the subject'); return; }
    setDetail(prev => prev && { ...prev, run: { ...prev.run, paperSubject: subject } });
    setToast(`Subject set to ${subject}.`);
    loadQueue(false);
  }

  async function attachMyCopy() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('attach');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'attach-amended-from-dropbox', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not attach'); return; }
    setToast(d.unchanged ? `${d.name} is already the attached copy.` : `Attached ${d.name} — that is now the copy the student gets.`);
    refresh(id);
  }

  // ── moved here from /admin/mark/triage when it was retired (8 Sep 2026) ──
  // 👁 Seen — a paper Adrian marked by hand and handed back in class is never
  // released; archived_at is the third state: it leaves the desk, the hub card
  // and the morning reminder, the student's app never shows it, and
  // /admin/papers still lists it.
  async function markSeen() {
    if (!detail) return;
    const id = detail.run.id;
    if (!window.confirm(`Mark "${detail.run.paperName || 'this paper'}" as seen? It leaves the desk WITHOUT being released — the student never gets it in the app.`)) return;
    setBusy('seen');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'archive', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not mark it seen'); return; }
    setToast('Marked as seen — off the desk, nothing sent to the student.');
    go({ run: null });
    loadQueue(false);
  }
  async function markAllSeen() {
    if (!window.confirm('Mark EVERY unreleased paper as seen (not released)? Held student hand-ins are kept. Nothing is sent to anyone.')) return;
    setBusy('seen-all');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'archive-all' });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not mark them seen'); return; }
    setToast(`${d.archived ?? 0} marked as seen` + (d.skippedStudent ? ` — ${d.skippedStudent} student hand-in${d.skippedStudent === 1 ? '' : 's'} kept` : ''));
    loadQueue(false);
  }
  // ✍️ Upload amended — the marked PDF after Adrian wrote on it (Notability etc.)
  // becomes the copy the student opens. Straight into the private student-files
  // bucket (never Blob — 5 Sep 2026 rule); attach-amended stores the canonical URL.
  async function uploadAmended(file: File) {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('amend');
    try {
      const up = await uploadStudentFile(
        `/api/admin/mark-paper-annotated-token?runId=${encodeURIComponent(id)}&filename=${encodeURIComponent(file.name)}`,
        file, { contentType: 'application/pdf' },
      );
      const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'attach-amended', runId: id, url: up.url });
      if (!ok) throw new Error(d.error || 'could not attach it');
      setToast('Your amended copy is now the one the student gets.');
      refresh(id);
    } catch (e) { setToast(`Upload failed — ${(e as Error).message}`); }
    finally { setBusy(''); }
  }
  // 🧺 Shelve — park this weakness for a later teaching round WITH its evidence
  // (IDEAS.md "wave 2 waiting"): the shelf API grabs the question's page, the
  // marker's note and the topic from the run. Needs a tagged run (the shelf is
  // per-student). Deliberately does NOT review the question — parking a topic
  // for later is not the same as agreeing with the mark.
  async function shelve(q: Question) {
    if (!detail) return;
    const id = detail.run.id;
    setBusy(`shelve:${q.index}`);
    try {
      const r = await fetch('/api/admin/shelf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromRun: { runId: id, questionNumber: q.questionNumber }, ...(q.topic ? { topic: q.topic } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { setShelved(prev => new Set(prev).add(`${id}:${q.index}`)); setToast(`Q${q.questionNumber} is already on the shelf.`); }
      else if (!r.ok) setToast(d.error || 'Could not shelve it');
      else { setShelved(prev => new Set(prev).add(`${id}:${q.index}`)); setToast(`🧺 On the shelf — Q${q.questionNumber}${q.topic ? ` · ${q.topic}` : ''}`); }
    } catch { setToast('Connection error'); }
    finally { setBusy(''); }
  }

  async function rebuild() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('rebuild');
    setToast('Rebuilding both PDFs — the full copy can take a minute or two…');
    const { ok, d } = await postJson('/api/admin/desk/rebuild', { runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || (d.errors && d.errors.join(' · ')) || d.skipped || 'Rebuild failed'); refresh(id); return; }
    setToast(d.pdfStaleCleared
      ? 'Rebuilt — the total strip now matches the corrected marks. The per-question boxes still show the marker’s ink; write on your copy if that matters.'
      : 'Both PDFs rebuilt.');
    refresh(id);
  }

  async function queueSheet() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('sheet');
    const { ok, status, d } = await postJson('/api/admin/sheet-jobs', { runId: id, ...(focus.trim() ? { focus: focus.trim() } : {}) });
    setBusy('');
    if (!ok) { setToast(status === 409 ? 'A sheet for this paper is already queued.' : d.error || 'Could not queue'); return; }
    setFocus('');
    setToast('Sheet queued — the Mac picks it up within ~15 min.');
    refresh(id);
  }

  // Release-by-silence (6 Sep 2026): hold keeps the sheet on the desk; resume restarts the window.
  async function autoRelease(action: 'hold' | 'unhold') {
    if (!detail?.sheetJob) return;
    const id = detail.run.id;
    setBusy('sheet');
    const { ok, d } = await postJson('/api/admin/sheet-jobs', { action, id: detail.sheetJob.id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not update the auto-release'); return; }
    setToast(action === 'hold' ? 'Held — release it from the desk when you are ready.' : 'Auto-release resumed — the 12-hour window restarts now.');
    refresh(id);
  }


  async function cancelSheet() {
    if (!detail?.sheetJob) return;
    const id = detail.run.id;
    if (detail.sheetJob.status === 'claimed' && !window.confirm('The sheet is being written right now. Stop it?')) return;
    setBusy('sheet');
    const { ok, d } = await postJson('/api/admin/sheet-jobs', { action: 'cancel', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not cancel'); return; }
    setToast('Sheet cancelled.');
    refresh(id);
  }

  // ✏️ Revise the sheet (Adrian, 8 Sep 2026: "changes to be made just to a
  // certain section, a certain example, a certain phrasing"): a note to the
  // worker. Only what the note names changes; the previous version is kept.
  // 📘 Send a written sheet to a student whose paper is already out (9 Sep 2026).
  async function sendSheetNow() {
    if (!detail?.sheetJob) return;
    const id = detail.run.id;
    setBusy('sheet');
    const { ok, d } = await postJson('/api/admin/sheet-jobs', { action: 'send', id: detail.sheetJob.id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not send the sheet'); return; }
    setToast('Sheet sent — it is in the app under From Adrian, and the student was told.');
    refresh(id);
  }

  async function reviseSheet(instructions: string) {
    if (!detail?.sheetJob) return;
    const id = detail.run.id;
    setBusy('sheet');
    const { ok, d } = await postJson('/api/admin/sheet-jobs', { action: 'revise', id: detail.sheetJob.id, instructions });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not send the revision'); return; }
    setToast(`Revision ${d.round} sent — the Mac changes only what you named and re-files the sheet.`);
    refresh(id);
  }

  // 🔁 Re-mark ONE page (Adrian, 8 Sep 2026: "sometimes there is no need to
  // remark an entire pdf because of a small change"): every other page keeps
  // its marking; the Mac reads this page again, the paper is redrawn, and the
  // sheet is revised for whatever changed. Through the 🌙 queue, like a re-mark.
  async function remarkPage(photoIndex: number) {
    if (!detail) return;
    const id = detail.run.id;
    const released = !!detail.run.releasedAt;
    if (!window.confirm(`Re-mark page ${photoIndex + 1} only? The other pages keep their marking. The Mac reads this page again on your plan when a slot is free, the paper is redrawn, and the Practice Again sheet is revised for what changed.${released ? ' The student\u2019s released copy is replaced.' : ''}`)) return;
    setBusy('remark');
    const { ok, d } = await postJson('/api/admin/mark-paper', { phase: 'enqueue', id, model: 'opus', style: 'teacher', remark: true, pages: [photoIndex] });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not queue the page'); return; }
    setToast(`Page ${photoIndex + 1} queued for re-marking${typeof d.etaMinutes === 'number' ? ` — about ${d.etaMinutes} min` : ''}.`);
    refresh(id);
  }

  // 🧮 Fill the parts the marker never scored from the paper's recorded
  // allocation (Adrian, 8 Sep 2026: "can't the marker check the total marks?"),
  // then redraw the PDFs so the cover prints the right total.
  async function auditAllocation() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('audit');
    try {
      const { ok, d } = await postJson('/api/admin/mark-paper', { phase: 'audit-allocation', id });
      if (!ok) { setToast(d.error || 'Could not audit the allocation'); return; }
      if (!Array.isArray(d.added) || !d.added.length) { setToast(d.line || 'Every allocated part is already marked.'); return; }
      setToast(`${d.line} — redrawing the PDFs…`);
      const rb = await postJson('/api/admin/desk/rebuild', { runId: id });
      setToast(rb.ok ? `${d.line}. PDFs redrawn.` : `${d.line}. PDFs not redrawn (${rb.d.error || 'try Rebuild PDFs'}).`);
    } catch { setToast('Connection error.'); }
    finally { setBusy(''); refresh(id); }
  }

  // ✓ Looked at (8 Sep 2026): an auto-released paper leaves the system lane.
  async function markChecked() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('checked');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'checked', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not mark it'); return; }
    setToast('Marked as looked at.');
    refresh(id);
  }

  // The same tap from a LIST row (9 Sep 2026 — Adrian: "i don't see a looked
  // at"): the button had lived only inside the paper's page.
  async function markCheckedRow(id: string) {
    setBusy('checked');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'checked', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not mark it'); return; }
    setToast('Marked as looked at — moved to Completed.');
    loadQueue(false);
  }

  // 📐 Approve this paper's scheme (8 Sep 2026): the recorded per-part marks and
  // split become the paper's fixed allocation. `quiet` = on release, fail-soft.
  async function approveScheme(quiet = false) {
    const s = detail?.run.scheme;
    if (!detail || !s || s.status === 'approved' || !s.hasAllocation) return;
    const id = detail.run.id;
    if (!quiet) setBusy('scheme');
    const { ok, d } = await postJson('/api/admin/paper-scheme', { action: 'approve', key: s.key, runId: id });
    if (!quiet) setBusy('');
    if (!ok) { if (!quiet) setToast(d.error || 'Could not approve the scheme'); return; }
    if (!quiet) { setToast(`📐 Scheme approved — every marking of "${s.key}" now uses this split.`); refresh(id); }
  }

  // Approve & release — the one big button. release-with-sheet attaches the
  // amended copy by name, assigns the sheet, releases, notifies. The ambiguous
  // case (two "Practice Again…" PDFs) asks, exactly as triage does.
  async function approve() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('approve');
    try {
      // An override after the PDF was drawn leaves the score strip printing the old
      // total. Rebuild first, then release — one tap (Adrian, 8 Sep 2026: "if we
      // override … is the pdf rebuilt or something?"). A rebuild that fails stops here.
      if (detail.run.pdfStale && !detail.run.annotatedPdfUrl) {
        setToast('Rebuilding the PDFs with the corrected total before release — a minute or two…');
        const rb = await postJson('/api/admin/desk/rebuild', { runId: id });
        if (!rb.ok) { setToast(rb.d.error || (rb.d.errors && rb.d.errors.join(' · ')) || rb.d.skipped || 'Rebuild failed — nothing released.'); refresh(id); return; }
      }
      // Nothing on this paper was worth practising, and the worker said so
      // (sheet job `result.noSheet`, 3 Sep 2026). There is no sheet to send, so
      // Approve is a plain release — no assignment, no PDF to hunt for.
      if (detail.sheetJob?.result?.noSheet) {
        const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'release', runId: id });
        if (!ok) { setToast(d.error || 'Release failed.'); refresh(id); return; }
        const res = Array.isArray(d.results) ? d.results[0] : null;
        if (res && !res.released) { setToast(`Not released — ${res.note || 'see triage'}`); refresh(id); return; }
        setToast(res?.via === 'none'
          ? '✅ Released (no sheet needed) — no Telegram linked, hand it back yourself.'
          : '✅ Released — no sheet needed for this one.');
        await approveScheme(true);
        refresh(id);
        return;
      }
      const look = await fetch(`/api/admin/release-with-sheet?runId=${encodeURIComponent(id)}`);
      const info = await look.json().catch(() => ({}));
      if (!look.ok) { setToast(info.error || 'Could not find the sheet.'); return; }
      let pdfPath: string | undefined;
      if (!info.ready) {
        if (info.kind === 'ambiguous' && Array.isArray(info.candidates) && info.candidates.length) {
          const list = info.candidates.map((c: { name: string }, i: number) => `${i + 1}. ${c.name}`).join('\n');
          const pick = window.prompt(`${info.note}\n\n${list}\n\nWhich number?`, '1');
          const n = Number(pick);
          if (!Number.isInteger(n) || n < 1 || n > info.candidates.length) { setToast('Nothing released.'); return; }
          pdfPath = info.candidates[n - 1].path;
        } else {
          setToast(info.note || 'No sheet PDF to send yet — export the DOCX to PDF in the folder first.');
          return;
        }
      }
      const { ok, d } = await postJson('/api/admin/release-with-sheet', { runId: id, ...(pdfPath ? { pdfPath } : {}) });
      if (!ok) { setToast(d.error || 'Release failed.'); refresh(id); return; }
      setToast(d.alreadyWasReleased ? 'Sheet sent — the paper was already released.' : '✅ Released, and the sheet is with them.');
      // Releasing = these marks are right = the split they were marked to is right.
      await approveScheme(true);
      refresh(id);
    } catch { setToast('Connection error.'); }
    finally { setBusy(''); }
  }

  async function releaseWithoutSheet() {
    if (!detail) return;
    const id = detail.run.id;
    if (!window.confirm('Release the marked paper WITHOUT a self-study sheet? The student gets the marks now and the practice later (or never).')) return;
    setBusy('approve');
    const { ok, d } = await postJson('/api/admin/mark-triage', { action: 'release', runId: id });
    setBusy('');
    if (!ok) { setToast(d.error || 'Release failed.'); refresh(id); return; }
    const res = Array.isArray(d.results) ? d.results[0] : null;
    if (res && !res.released) { setToast(`Not released — ${res.note || 'see triage'}`); refresh(id); return; }
    setToast(res?.via === 'none' ? 'Released — no Telegram linked, hand it back yourself.' : '✅ Released.');
    refresh(id);
  }

  // ── auth gate ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <form onSubmit={e => { e.preventDefault(); verify(password); }} style={{ width: '100%', maxWidth: 320 }}>
          <h1 style={{ fontSize: 20, marginBottom: 16 }}>🖊 Marking desk</h1>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ width: '100%', padding: 12, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8 }}
          />
          {authError && <p style={{ color: C.danger, fontSize: 14, marginTop: 8 }}>{authError}</p>}
          <button type="submit" disabled={authLoading}
            style={{ width: '100%', marginTop: 12, padding: 12, fontSize: 16, borderRadius: 8, border: 'none', background: C.ink, color: '#fff' }}>
            {authLoading ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  const activeLane: DeskLane = lane ?? 'awaiting-sheet';
  // Work lanes oldest first — the paper that has waited longest is at the top;
  // Released stays newest first (lib/desk-state orderLane, Adrian 7 Sep 2026).
  const laneRows = orderLane(rows.filter(r => r.lane === activeLane), activeLane);
  // ── One sheet for several papers (Adrian, 10 Sep 2026: "right now build only
  // what I tick on the desk"). A row can be ticked when its student has another
  // paper of the same maths in this lane; the bar below the list queues ONE
  // batch job for the ticked papers (POST /api/admin/sheet-jobs { runIds }).
  const tickable = (row: Row) => !row.practiceAgain && !!row.studentId && laneRows.some(o => o.id !== row.id && !o.practiceAgain && o.studentId === row.studentId && (o.paperSubject ?? '') === (row.paperSubject ?? ''));
  const tickedRows = laneRows.filter(r => ticked.has(r.id));
  const tickedStudent = tickedRows[0]?.studentName ?? null;
  const tickedMixed = new Set(tickedRows.map(r => r.studentId)).size > 1 || new Set(tickedRows.map(r => r.paperSubject ?? '')).size > 1;
  async function queueBatch() {
    const ids = tickedRows.map(r => r.id);
    if (ids.length < 2 || tickedMixed) return;
    if (!window.confirm(`One Practice Again sheet for ${tickedStudent}'s ${ids.length} ticked papers? The Mac writes a single merged sheet (the same gap in two papers becomes one section) and files it in a new dated folder; you vet it on the desk before it goes out. Any single sheet still being written for these papers is stopped.`)) return;
    setBusy('batch');
    const { ok, d } = await postJson('/api/admin/sheet-jobs', { runIds: ids });
    setBusy('');
    if (!ok) { setToast(`Not queued: ${d.error || 'error'}`); return; }
    setTicked(new Set());
    setToast(`📘 One sheet queued for ${ids.length} papers${d.cancelled ? ` (${d.cancelled} single sheet${d.cancelled === 1 ? '' : 's'} stopped)` : ''}. It shows on the newest paper's row.`);
    loadQueue();
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: runId ? 1400 : 820, margin: '0 auto', padding: '14px 12px 96px', color: C.ink }}>
      <style>{`
        .desk-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
        @media (min-width: 1024px) {
          .desk-grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
          .desk-right { position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow: auto; }
        }
        .desk-row:hover { background: #fafafa; }
        .desk-tab { border: 1px solid ${C.border}; background: #fff; border-radius: 999px; padding: 7px 12px; font-size: 13.5px; cursor: pointer; font: inherit; white-space: nowrap; }
        .desk-tab.on { background: ${C.ink}; color: #fff; border-color: ${C.ink}; }
        .desk-tab .n { display: inline-block; min-width: 18px; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: rgba(0,0,0,.08); font-size: 12px; font-weight: 700; }
        .desk-tab.on .n { background: rgba(255,255,255,.2); }
      `}</style>

      {/* Adrian, 5 Sep 2026: a way back to the hub above the desk, and the student hub beside the mark button. */}
      <div style={{ marginBottom: 6 }}><a href="/admin" style={{ fontSize: 13, color: C.link, textDecoration: 'none' }}>← Admin</a></div>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>
          {runId ? (
            <button onClick={() => go({ run: null })} style={{ border: 'none', background: 'none', font: 'inherit', color: C.link, cursor: 'pointer', padding: 0 }}>← Marking desk</button>
          ) : '🖊 Marking desk'}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/admin/students" style={{ ...btn('#fff', '#374151', C.border), textDecoration: 'none', padding: '6px 10px', fontSize: 13 }}>👥 Students</Link>
          <a href="/admin/mark-paper" style={{ ...btn(C.ink, '#fff'), textDecoration: 'none', padding: '6px 10px', fontSize: 13 }}>✍️ Mark a new paper</a>
          <button onClick={() => { loadQueue(); if (runId) loadRun(runId); }} style={{ ...btn('#fff', '#374151', C.border), padding: '6px 10px', fontSize: 13 }}>↻ Refresh</button>
        </div>
      </header>

      {/* ── queue ─────────────────────────────────────────────────────────── */}
      {!runId && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6, alignItems: 'center' }}>
            <AutoReleaseSwitch />
            {DESK_LANES.filter(l => !(LANES_HIDDEN_AT_ZERO.includes(l) && counts && !(counts[l] ?? 0) && activeLane !== l)).map(l => (
              <button key={l} className={`desk-tab${activeLane === l ? ' on' : ''}`} onClick={() => go({ lane: l })}>
                {LANE_LABEL[l]}<span className="n">{counts ? counts[l] : '·'}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12.5, color: C.muted, margin: 0, flex: '1 1 260px' }}>{LANE_HINT[activeLane]}</p>
            {activeLane !== 'released' && (
              <button onClick={markAllSeen} disabled={busy === 'seen-all'} className="desk-tab"
                title="Papers you marked by hand and handed back in class: mark every unreleased one as seen so it stops waiting here. Held student hand-ins are kept. Nothing is sent to anyone.">
                {busy === 'seen-all' ? '…' : '👁 All seen'}
              </button>
            )}
          </div>

          {queueError && <p style={{ color: C.danger }}>{queueError}</p>}
          {queueLoading && rows.length === 0 && <p style={{ color: C.muted }}>Loading…</p>}
          {!queueLoading && !queueError && laneRows.length === 0 && (
            <p style={{ color: C.muted, padding: '32px 0', textAlign: 'center' }}>
              {activeLane === 'ready' ? 'Nothing in process — the sheets are on their way. 🎉' : 'Nothing here.'}
            </p>
          )}

          <div style={{ border: laneRows.length ? `1px solid ${C.border}` : 'none', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            {laneRows.map(row => (
              <div key={row.id} className="desk-row" role="button" tabIndex={0}
                onClick={() => go({ run: row.id })}
                onKeyDown={e => { if (e.key === 'Enter') go({ run: row.id }); }}
                style={{ display: 'flex', gap: 10, padding: '11px 12px', borderTop: `1px solid ${C.border}`, cursor: 'pointer', alignItems: 'flex-start', background: ticked.has(row.id) ? '#eff6ff' : undefined }}>
                {tickable(row) && (
                  <input type="checkbox" checked={ticked.has(row.id)} aria-label="Tick for one merged Practice Again sheet"
                    title="Tick two or more of this student's papers (same maths) for ONE merged Practice Again sheet"
                    onClick={e => e.stopPropagation()}
                    onChange={() => setTicked(prev => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}
                    style={{ marginTop: 4, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {row.studentName || <span style={{ color: C.flag }}>⚠ Needs a student</span>}
                    <span style={{ color: C.muted, fontWeight: 400 }}>·</span>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{row.paperName}</span>
                    <PaperSubjectChip subject={row.paperSubject} />
                    <SubjectChip subject={row.subject} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>marked {fmtDate(row.createdAt)}</span>
                    {row.origin && <OriginChip origin={row.origin} />}
                    {row.practiceAgain && <Chip label="📘 Practice Again hand-in" bg="#ecfdf5" color="#047857" />}
                    {row.lane !== 'released' && !row.practiceAgain && (
                      <span style={{ color: row.sheet?.status === 'done' ? C.ok : row.sheet?.status === 'failed' ? C.danger : C.link }}>
                        📘 {row.sheet?.label ?? 'no sheet yet'}{row.sheet?.requestedBy === 'student' ? ' · asked by the student' : ''}
                      </span>
                    )}
                    {row.lane === 'released' && row.releasedAt && <span>released {fmtDate(row.releasedAt)}{sheetOutcomeShort(row)}</span>}
                    {row.pending > 0 && <span style={{ color: C.flag, fontWeight: 600 }}>⏳ {row.pending} to check</span>}
                    {row.flags.map(f => <span key={f} style={{ color: C.flag, fontWeight: 600 }}>⚠ {f}</span>)}
                    {row.revising && <Chip label={revisingLabel(row.revising)} bg="#fdf2f8" color="#9d174d" title="The sheet went back to the worker. This paper sits here, at the top, until the revised sheet is filed — then it goes back to where it was." />}
                    {row.lane === 'auto' && !row.revising && !['queued', 'claimed', 'failed'].includes(row.sheet?.status ?? '') && (
                      <button onClick={e => { e.stopPropagation(); markCheckedRow(row.id); }} disabled={busy === 'checked'}
                        title="Marks this paper as looked at — it moves to Completed. Nothing about the sheet changes."
                        style={{ border: '1px solid #67e8f9', background: '#ecfeff', color: '#0e7490', borderRadius: 8, padding: '1px 8px', fontSize: 12, cursor: 'pointer' }}>
                        ✓ Looked at
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: scoreColour(row.pct) }}>{row.max > 0 ? `${row.awarded}/${row.max}` : '—'}</div>
                  {row.pct !== null && <div style={{ fontSize: 11.5, color: C.faint }}>{row.pct}%</div>}
                </div>
              </div>
            ))}
          </div>

          {tickedRows.length > 0 && (
            <div style={{ position: 'sticky', bottom: 12, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, background: '#1e3a8a', color: '#fff', boxShadow: '0 8px 24px -10px rgba(0,0,0,.5)' }}>
              <span style={{ flex: '1 1 220px', fontSize: 13.5 }}>
                {tickedMixed
                  ? 'One sheet is for one student and one maths — untick the odd one out.'
                  : tickedRows.length < 2
                    ? `1 paper ticked — tick another of ${tickedStudent}'s to make one sheet.`
                    : `📘 One Practice Again sheet for ${tickedStudent}'s ${tickedRows.length} papers (${tickedRows[0]?.paperSubject || 'maths'})`}
              </span>
              <button onClick={queueBatch} disabled={busy === 'batch' || tickedMixed || tickedRows.length < 2}
                style={{ ...btn('#fff', '#1e3a8a'), opacity: tickedMixed || tickedRows.length < 2 ? 0.5 : 1 }}>{busy === 'batch' ? '…' : 'Queue one sheet'}</button>
              <button onClick={() => setTicked(new Set())} style={{ ...btn('transparent', '#fff', 'rgba(255,255,255,.4)') }}>Clear</button>
            </div>
          )}

          <div style={{ marginTop: 22, fontSize: 12.5, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Other views:</span>
            <a href="/admin/mark-paper" style={{ color: C.link, textDecoration: 'none' }}>✍️ Mark a paper</a>
            <a href="/admin/papers" style={{ color: C.link, textDecoration: 'none' }}>📑 Papers library</a>
            <a href="/admin" style={{ color: C.link, textDecoration: 'none' }}>← Admin</a>
          </div>
        </>
      )}

      {/* ── detail ────────────────────────────────────────────────────────── */}
      {runId && runError && <p style={{ color: C.danger }}>{runError}</p>}
      {runId && runLoading && !detail && <p style={{ color: C.muted }}>Loading…</p>}
      {runId && detail && (
        <DetailView
          detail={detail} cover={cover} sheetPages={sheetPages} sheetNote={sheetNote}
          busy={busy} editing={editing} editAwarded={editAwarded} editNote={editNote} focus={focus} tagging={tagging}
          setEditing={setEditing} setEditAwarded={setEditAwarded} setEditNote={setEditNote} setFocus={setFocus} setTagging={setTagging}
          editKind={editKind} setEditKind={setEditKind} editParts={editParts} setEditParts={setEditParts}
          onAgree={agree} onOverride={override} onTag={tag} onSubject={setPaperSubject} onAttach={attachMyCopy} onRebuild={rebuild}
          onQueueSheet={queueSheet} onCancelSheet={cancelSheet} onAutoRelease={autoRelease} onApprove={approve} onReleaseOnly={releaseWithoutSheet} onToast={setToast} onRefresh={() => refresh(detail.run.id)}
          onSeen={markSeen} onUploadAmended={uploadAmended} onShelve={shelve} shelved={shelved}
          onRevise={reviseSheet} onRemarkPage={remarkPage} onApproveScheme={() => approveScheme(false)} onAuditAllocation={auditAllocation} onChecked={markChecked}
          onSendSheet={sendSheetNow}
        />
      )}

      {toast && (
        <div onClick={() => setToast('')}
          style={{ position: 'fixed', left: 12, right: 12, bottom: 12, background: C.ink, color: '#fff', padding: '10px 14px', borderRadius: 10, fontSize: 14, maxWidth: 736, margin: '0 auto', zIndex: 20 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────
function DetailView(p: {
  detail: Detail; cover: Cover | null; sheetPages: string[] | null; sheetNote: string;
  busy: string; editing: number | null; editAwarded: string; editNote: string; editKind: string; editParts: Record<string, string>; setEditParts: (v: Record<string, string>) => void; focus: string; tagging: boolean;
  setEditing: (v: number | null) => void; setEditAwarded: (v: string) => void; setEditNote: (v: string) => void; setEditKind: (v: string) => void;
  setFocus: (v: string) => void; setTagging: (v: boolean) => void;
  onAgree: (q: Question) => void; onOverride: (q: Question) => void; onTag: (id: string, name: string) => void;
  onSubject: (subject: string) => void;
  onAttach: () => void; onRebuild: () => void; onQueueSheet: () => void; onCancelSheet: () => void; onToast: (message: string) => void; onRefresh: () => void;
  onAutoRelease: (action: 'hold' | 'unhold') => void;
  onApprove: () => void; onReleaseOnly: () => void;
  onSeen: () => void; onUploadAmended: (file: File) => void; onShelve: (q: Question) => void; shelved: Set<string>;
  onRevise: (instructions: string) => void; onRemarkPage: (photoIndex: number) => void;
  onApproveScheme: () => void; onAuditAllocation: () => void; onChecked: () => void;
  onSendSheet: () => void;
}) {
  // The pen opens on the page you tapped, right here on the desk (round 3).
  const [annotatePage, setAnnotatePage] = useState<number | null>(null);
  const { detail: d, cover, busy } = p;
  const run = d.run;
  const released = !!run.releasedAt;
  // 🖼 The desk shows the copy the STUDENT gets (Adrian, 8 Sep 2026: "both desk
  // and images pdf should show the same thing? but i am seeing it differently").
  // Since 2 Sep the Images PDF and the app carry the clean marked page and put
  // the worked solutions in a booklet at the back; the desk had kept showing
  // the twin with the solution drawn on the page. Default = the clean copy;
  // the toggle shows the solution-on-page twin for checking its placement.
  const [solutionsOnPage, setSolutionsOnPage] = useState(true);
  // "see page N" shows the page in the RIGHT pane, beside the question and in place
  // of the sheet, instead of scrolling the script down to it (Adrian, 8 Sep 2026:
  // "why not just have page 2 appear on the right panel"). 📘/📄 chips switch the
  // pane; on a one-column layout (phone) the old scroll-to-anchor stays.
  const [rightPane, setRightPane] = useState<'sheet' | 'page'>('sheet');
  const [rightPage, setRightPage] = useState<number | null>(null);
  const seePage = (photoIndex: number) => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) { document.getElementById(`page-${photoIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    setRightPage(photoIndex); setRightPane('page');
  };
  const tone = LANE_TONE[d.lane];
  const pct = run.max > 0 ? Math.round((run.awarded / run.max) * 100) : null;
  const canApprove = d.approveBlockers.length === 0 && !released;
  // The stale-PDF blocker is one the button can clear itself: rebuild, then release.
  const staleOnly = !released && !canApprove && run.pdfStale && !run.annotatedPdfUrl
    && d.approveBlockers.every(b => /overridden after the PDF was drawn/.test(b));
  const approveEnabled = canApprove || staleOnly;
  const canReleaseOnly = d.releaseBlockers.length === 0 && !released && !canApprove;
  // The sheet worker's honest "nothing here is worth practising" — the paper
  // still goes out, on its own, and the button says which it is doing.
  const noSheet = !!d.sheetJob?.result?.noSheet;
  const pages = d.annotatedPhotos;
  // Ink hints (a mark Adrian swapped in the pen) ride on their question.
  const questions: Question[] = d.questions.map(q => ({ ...q, inkHints: (d.inkHints || []).filter(h => h.part && String(h.q) === String(q.questionNumber)) }));
  // An auto-released paper (the 'auto' lane) is still reviewable: Agree/Override
  // work on it and an override re-issues the student's copy (8 Sep 2026).
  const reviewable = !released || d.lane === 'auto';
  const isOpenFlag = (q: Question) => q.flagged && !q.reviewed && reviewable;
  const toCheck = questions.filter(isOpenFlag);
  const byPage = new Map<number, Question[]>();
  const unplaced: Question[] = [];
  for (const q of questions) {
    if (q.photoIndex == null || !pages.some(pg => pg.photoIndex === q.photoIndex)) unplaced.push(q);
    else byPage.set(q.photoIndex, [...(byPage.get(q.photoIndex) ?? []), q]);
  }
  const amendedLine = (() => {
    const a = d.amended;
    if (a.status === 'unknown') return { text: d.folder.error ? `Dropbox could not be read (${d.folder.error})` : 'Dropbox could not be read', color: C.flag };
    if (a.status === 'none') return { text: 'Marked (Adrian).pdf not in the folder yet', color: C.muted };
    if (a.status === 'found') return { text: `${a.name} — ${run.annotatedPdfUrl ? 'attached' : 'found'}`, color: C.ok };
    return { text: `${a.name} — ${run.annotatedPdfUrl ? 'NEWER than the attached copy' : 'found, will attach on release'}`, color: C.flag };
  })();

  // Every topic this script dropped marks on — the per-question 📬 sends one; a
  // paper rarely fails on one thing, and three follow-ups used to mean three trips.
  const weakTopics = [...new Set(d.questions.filter(q => q.awarded < q.max && q.topic).map(q => q.topic as string))];
  return (
    <>
      {/* ── header bar ── */}
      <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {run.studentId ? (
                <a href={`/admin/students/${run.studentId}`} style={{ color: C.link, textDecoration: 'none' }}>👤 {run.studentName || 'Student'}</a>
              ) : (
                <span style={{ color: C.flag }}>⚠ No student linked</span>
              )}
              {!released && (
                p.tagging ? (
                  <>
                    <StudentPicker value={run.studentId || ''} autoFocus placeholder="Pick student…"
                      onChange={(id, s) => { if (id) p.onTag(id, s?.name || ''); }}
                      style={{ padding: '6px 10px', fontSize: 14, borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff' }} />
                    <button onClick={() => p.setTagging(false)} style={{ ...btn('#fff', '#374151', C.border), padding: '5px 9px', fontSize: 12 }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => p.setTagging(true)} disabled={busy === 'tag'}
                    style={run.studentId ? { ...btn('#fff', C.muted, C.border), padding: '3px 8px', fontSize: 12 } : { ...btn(C.flagBg, '#a16207', '#fcd34d'), fontWeight: 700 }}>
                    {busy === 'tag' ? '…' : run.studentId ? 'change' : '+ Tag a student'}
                  </button>
                )
              )}
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: C.ink, fontWeight: 500 }}>{run.paperName}</span>
              {run.origin && <OriginChip origin={run.origin} />}
              {run.practiceAgain && <Chip label="📘 Practice Again hand-in" bg="#ecfdf5" color="#047857" />}
              <PaperSubjectChip subject={run.paperSubject} />
              {/* Which maths this is — writes paper_subject only, so it stays live after release. */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5 }} title="Which maths this paper is — the student's Papers page pill and per-subject tiles key on it. Changes no mark.">
                <span>Subject:</span>
                <select value={run.paperSubject ?? ''} disabled={busy === 'subject'} onChange={e => { if (e.target.value) p.onSubject(e.target.value); }}
                  style={{ font: 'inherit', fontSize: 12.5, padding: '2px 6px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: run.paperSubject ? C.ink : C.flag }}>
                  {!run.paperSubject && <option value="">not set</option>}
                  {PAPER_SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <SubjectChip subject={run.subject} /><GroundingChip source={run.grounding} /><PaperMatchChip pm={run.paperMatch} /><SchemeChip s={run.scheme} runId={run.id} busy={busy} onApprove={p.onApproveScheme} /><RulesTag v={run.rulesVersion} />
              <span>· marked {fmtWhen(run.createdAt)} · {run.totalQuestions} question{run.totalQuestions === 1 ? '' : 's'}</span>
              {run.portalSubmission && <Chip label="📱 hand-in" bg="#eff6ff" color={C.link} />}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={LANE_LABEL[d.lane]} bg={tone.bg} color={tone.fg} />
              {d.revising && <Chip label={revisingLabel(d.revising)} bg="#fdf2f8" color="#9d174d" title="The sheet went back to the worker. The paper stays on the to-do tab until the revised sheet is filed, then goes back to where it was." />}
              {d.pending > 0
                ? <Chip label={`⏳ ${d.pending} to check`} bg={C.flagBg} color={C.flag} />
                : <Chip label="✓ nothing left to check" bg={C.okBg} color={C.ok} title="No question is waiting on you — the marker flagged none, or you have answered every flag. Any question can still be overridden below." />}
              {d.overrides.reviewed > 0 && (
                <Chip label={`${d.overrides.reviewed} checked · +${d.overrides.against} for the student · −${d.overrides.forStudent}`}
                  title="Corrections you have made on this paper: marks added (the marker withheld them wrongly) and marks removed" />
              )}
              {d.assignments > 0 && (() => {
                // The sheet's practice questions as app items — held until Approve &
                // release, live after (Adrian, 8 Sep 2026: "what does it mean by
                // sheet assigned x 4?" — it was four questions, not four sheets).
                const held = d.assignmentsHeld ?? 0;
                const live = d.assignments - held;
                const q = (n: number) => `${n} practice question${n === 1 ? '' : 's'}`;
                const label = held > 0 && live === 0 ? `📘 ${q(held)} held for release`
                  : held > 0 ? `📘 ${q(live)} in the app · ${q(held)} held`
                  : `📘 ${q(live)} in the app`;
                return <Chip label={label} bg={held > 0 && live === 0 ? C.flagBg : C.okBg} color={held > 0 && live === 0 ? C.flag : C.ok} />;
              })()}
              {released && <Chip label={`released ${fmtWhen(run.releasedAt!)}${run.releasedVia ? ` · ${releasedViaLabel(run.releasedVia)}` : ''}`} />}
              {d.lane === 'auto' && !d.revising && (
                <button onClick={p.onChecked} disabled={busy === 'checked'}
                  title="Released by the system without your vetting. Marks it as looked at — it leaves this lane; Agree/Override still work here and re-issue the student's copy."
                  style={{ border: '1px solid #67e8f9', background: '#ecfeff', color: '#0e7490', borderRadius: 8, padding: '3px 10px', fontSize: 12.5, cursor: 'pointer' }}>
                  {busy === 'checked' ? '…' : '✓ Looked at'}
                </button>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: scoreColour(pct) }}>{run.max > 0 ? `${run.awarded}/${run.max}` : '—'}</div>
            {pct !== null && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{pct}%</div>}
          </div>
        </div>

        {d.totalWarning && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: C.dangerBg, border: '1px solid #fecaca', borderRadius: 8, color: C.danger, fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span>⚠ {d.totalWarning}</span>
            {run.scheme?.hasAllocation && !released && (
              <button onClick={p.onAuditAllocation} disabled={busy === 'audit'}
                title="Compare this marking with the paper's recorded allocation: every part the marker never scored is added as 0 for you to check, and the PDFs are redrawn."
                style={{ background: '#fff', border: `1px solid ${C.danger}`, borderRadius: 7, padding: '2px 10px', fontSize: 12.5, color: C.danger, cursor: 'pointer' }}>
                {busy === 'audit' ? '…' : '🧮 Fill from the paper\u2019s scheme'}
              </button>
            )}
          </div>
        )}
        {run.allocationAudit && (run.allocationAudit.added.length > 0 || run.allocationAudit.maxDiffs.length > 0) && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: C.flagBg, border: `1px solid ${C.flagBorder}`, borderRadius: 8, color: C.flag, fontSize: 13, lineHeight: 1.5 }}>
            🧮 <b>Checked against the paper&rsquo;s recorded allocation</b>{run.allocationAudit.at ? ` · ${fmtDate(run.allocationAudit.at)}` : ''}
            {run.allocationAudit.added.length > 0 && <div>Added as 0 for you to check: {run.allocationAudit.added.map(x => `Q${x.q}${x.part} [${x.marks}]`).join(', ')}{run.allocationAudit.countedBefore != null && run.allocationAudit.countedAfter != null ? ` — counted ${run.allocationAudit.countedBefore} → ${run.allocationAudit.countedAfter}` : ''}.</div>}
            {run.allocationAudit.maxDiffs.length > 0 && <div>Marked out of a different max than the paper gives: {run.allocationAudit.maxDiffs.map(x => `Q${x.q}${x.part} ${x.marked} here, ${x.recorded} on the paper`).join('; ')} — Override if the paper is right.</div>}
          </div>
        )}
        {d.autoHold.hold && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: C.flagBg, border: `1px solid ${C.flagBorder}`, borderRadius: 8, color: C.flag, fontSize: 13 }}>
            ⚠ Watch out for: {d.autoHold.reasons.join(' · ')}
          </div>
        )}
        {!run.releasedAt && d.autoRelease && (d.autoRelease.outcome === 'failed' || d.autoRelease.outcome === 'held' || d.autoRelease.outcome === 'refused') && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: C.flagBg, border: `1px solid ${C.flagBorder}`, borderRadius: 8, color: C.flag, fontSize: 13 }}>
            {d.autoRelease.outcome === 'failed'
              ? <>⏳ Automatic release failed{d.autoRelease.note ? `: ${d.autoRelease.note}` : ''}{d.autoRelease.attempts ? ` (${d.autoRelease.attempts} ${d.autoRelease.attempts === 1 ? 'try' : 'tries'})` : ''} — the site retries every 10 min, or release it now.</>
              : d.autoRelease.outcome === 'held'
                ? <>⏸ Not auto-released{d.autoRelease.note ? `: ${d.autoRelease.note}` : ''} — re-mark, then release.</>
                : <>⏸ Automatic release refused{d.autoRelease.note ? `: ${d.autoRelease.note}` : ''} — release from here when it is right.</>}
          </div>
        )}
        {run.unattempted.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: C.muted }}>Not attempted: {run.unattempted.map(n => `Q${n}`).join(', ')}</div>
        )}

        {/* files + my copy + rebuild */}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
          <a href={d.folder.url} target="_blank" rel="noreferrer" title={`Dropbox ▸ ${d.folder.path}`} style={{ color: C.link, textDecoration: 'none', fontWeight: 600 }}>📂 Folder ↗</a>
          {/* A web page cannot open Finder; the next best thing is the local path on
              the clipboard — ⌘⇧G in Finder and paste (Adrian, 8 Sep 2026). */}
          <button type="button" title="Copy this folder's path on your Mac — then ⌘⇧G in Finder and paste"
            onClick={() => { const local = `~/Library/CloudStorage/Dropbox/Apps/AdrianMathNotes${d.folder.path}`; navigator.clipboard?.writeText(local).then(() => p.onToast('Copied the folder path — in Finder press ⌘⇧G and paste.')).catch(() => p.onToast(local)); }}
            style={{ ...btn('#fff', C.link, C.border), padding: '3px 8px', fontSize: 12.5 }}>📋 Copy local path</button>
          {!released && (
            <button type="button" onClick={p.onSeen} disabled={busy === 'seen'}
              title="Marked by hand and handed back in class? Mark it seen: it leaves the desk, the hub card and the morning reminder WITHOUT being released — the student never gets it in the app. The papers library still lists it."
              style={{ ...btn('#fff', '#374151', C.border), padding: '3px 8px', fontSize: 12.5 }}>{busy === 'seen' ? '…' : '👁 Seen'}</button>
          )}
          {!released && weakTopics.length >= 2 && run.studentId && (
            <a href={`/admin/students/${run.studentId}?send=${encodeURIComponent(weakTopics.join('|'))}`}
              style={{ color: C.link, textDecoration: 'none', fontWeight: 600 }} title={`Send follow-ups on all ${weakTopics.length} weak topics at once`}>
              📬 Follow up on all {weakTopics.length}
            </a>
          )}
          {run.annotatedPdfUrl && <a href={fileHref(run.annotatedPdfUrl)} target="_blank" rel="noreferrer" style={{ color: C.pen, textDecoration: 'none' }}>✍️ Annotated ↗</a>}
          {run.photosPdfUrl && <a href={fileHref(run.photosPdfUrl)} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>🖼 Images ↗</a>}
          {run.pdfUrl && <a href={fileHref(run.pdfUrl)} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>📄 Full ↗</a>}
          <a href={`/admin/mark-paper?run=${run.id}&annotate=1`} style={{ color: C.pen, textDecoration: 'none' }}>✏️ Annotate</a>
          <OpenInApp url={run.annotatedPdfUrl || run.pdfUrl} name={`${run.paperName || 'marked paper'}.pdf`} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
          <span style={{ color: C.muted }}>My copy:</span>
          <span style={{ color: amendedLine.color, fontWeight: 600 }}>{amendedLine.text}</span>
          {!released && (d.amended.status === 'found' || d.amended.status === 'newer-than-attached') && (
            <button onClick={p.onAttach} disabled={busy === 'attach'} style={{ ...btn('#fff', C.link, C.border), padding: '5px 10px', fontSize: 13 }}
              title="Copy the newest Marked (Adrian)*.pdf from the folder onto this run — it becomes the copy the student opens">
              {busy === 'attach' ? '…' : '📎 Attach my copy'}
            </button>
          )}
          {!released && (
            <button onClick={p.onRebuild} disabled={busy === 'rebuild'} style={{ ...btn('#fff', '#374151', C.border), padding: '5px 10px', fontSize: 13 }}
              title="Redraw both marked PDFs from the run — after an override changed the total, or so the cover follows the sheet's diagnosis">
              {busy === 'rebuild' ? 'Rebuilding…' : '🔁 Rebuild PDFs'}
            </button>
          )}
          {!released && (
            <label style={{ ...btn('#fff', C.link, C.border), padding: '5px 10px', fontSize: 13, cursor: busy === 'amend' ? 'default' : 'pointer' }}
              title="Upload the marked PDF after you have written on it — that copy becomes the one the student opens">
              {busy === 'amend' ? 'Uploading…' : '✍️ Upload amended'}
              <input type="file" accept="application/pdf" hidden disabled={busy === 'amend'}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUploadAmended(f); e.target.value = ''; }} />
            </label>
          )}
          {run.pdfStale && <span style={{ color: C.flag, fontWeight: 600 }} title="A mark was changed after this PDF was drawn — it still prints the old total.">⚠ PDF shows the old total</span>}
        </div>

        {/* the one big button */}
        {!released && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={p.onApprove} disabled={!approveEnabled || busy === 'approve'}
              title={staleOnly
                ? 'A mark was changed after the PDF was drawn — this rebuilds both PDFs with the corrected total, then releases. One tap.'
                : canApprove
                ? (noSheet
                  ? 'Attach your copy if newer, release the paper, and tell the student — there is no sheet for this one on purpose'
                  : 'Attach your copy if newer, assign the sheet, release the paper, and tell the student — one tap')
                : d.approveBlockers.join(' · ')}
              style={{ ...btn(approveEnabled ? C.ok : '#e5e7eb', approveEnabled ? '#fff' : '#9ca3af'), padding: '13px 18px', fontSize: 16, fontWeight: 700, flex: '1 1 260px', cursor: approveEnabled ? 'pointer' : 'not-allowed' }}>
              {busy === 'approve' ? 'Releasing…'
                : staleOnly ? (noSheet ? '🔁 Rebuild PDFs & release (paper only)' : '🔁 Rebuild PDFs & release (paper + sheet)')
                : noSheet ? '✅ Approve & release (paper only — no sheet needed)' : '✅ Approve & release (paper + sheet)'}
            </button>
            {canReleaseOnly && (
              <button onClick={p.onReleaseOnly} disabled={busy === 'approve'} style={{ ...btn('#fff', '#374151', C.border), fontSize: 13 }}
                title="Release the marked paper now, without a sheet — asks first">
                Release without sheet…
              </button>
            )}
          </div>
        )}
        {!released && d.approveBlockers.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: C.flag }}>
            {d.approveBlockers.map(b => <li key={b}>{b}</li>)}
          </ul>
        )}
        {released && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted }}>Released — marks are final. The folder holds the copies; nothing here changes what the student has.</p>
        )}
      </section>

      <div className="desk-grid">
        {/* ── left: the marked script ── */}
        <div style={{ minWidth: 0 }}>
          {/* Every question still waiting for a decision, first (Adrian, 8 Sep 2026:
              "bring all the flagged to the top so it's easy to vet"). Answer one and it
              leaves this block and reappears in its own place on its page below. */}
          {toCheck.length > 0 && !released && (
            <section style={{ border: `2px solid ${C.flagBorder}`, borderRadius: 12, background: '#fffdf5', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '9px 12px', background: C.flagBg, borderBottom: `1px solid ${C.flagBorder}`, fontSize: 13, fontWeight: 700, color: C.flag }}>
                ⚠ To check — {toCheck.length} question{toCheck.length === 1 ? '' : 's'} waiting for your decision. Each one goes back to its page once you have answered it.
              </div>
              {toCheck.map(q => (
                <div key={`chk-${q.index}`}>
                  {q.photoIndex != null && (
                    <div style={{ padding: '6px 12px 0', fontSize: 12, color: C.muted }}>
                      <button type="button" onClick={() => seePage(q.photoIndex as number)} title="Show this page on the right, beside the question"
                        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: C.link, cursor: 'pointer' }}>📄 see page {q.photoIndex + 1}</button>
                    </div>
                  )}
                  <QuestionCard q={q} released={released} busy={busy} editing={p.editing} editAwarded={p.editAwarded} editNote={p.editNote}
                    setEditing={p.setEditing} setEditAwarded={p.setEditAwarded} setEditNote={p.setEditNote} editKind={p.editKind} setEditKind={p.setEditKind} editParts={p.editParts} setEditParts={p.setEditParts} onAgree={p.onAgree} onOverride={p.onOverride} studentId={run.studentId} onShelve={p.onShelve} shelved={p.shelved} />
                </div>
              ))}
            </section>
          )}
          <CoverCard cover={cover} />

          {pages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12.5, color: C.muted, marginBottom: 10, flexWrap: 'wrap' }}>
              <span>
                {solutionsOnPage
                  ? 'These are the pages as the student gets them — the worked solution in the blank space or a small footer, and on its own sheet right after the page when it did not fit.'
                  : 'The clean copies — marks and notes only, no solutions (what the Full PDF and the booklet option use).'}
              </span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="Untick to see the clean copy of each page (marks and notes, no solution).">
                <input type="checkbox" checked={solutionsOnPage} onChange={e => setSolutionsOnPage(e.target.checked)} />
                Solutions on the page (what students get)
              </label>
            </div>
          )}
          {!run.remarking && run.remark && (
            <div style={{ background: '#f3e8ff', color: '#3b0764', border: '1px solid #d8b4fe', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              <b>🔁 {run.remark.pages ? `Page ${run.remark.pages.map(i => i + 1).join(', ')} re-marked` : 'Re-marked in full'}{run.remark.at ? ` · ${fmtDate(run.remark.at)}` : ''}</b>
              {' — '}
              {run.remark.changed === 0
                ? <>no marks changed{run.remark.previousAwarded != null ? ` (still ${run.awarded}/${run.max})` : ''}. What differs is the marker&rsquo;s reasoning — read the notes on the page below.</>
                : <>{run.remark.changed} part{run.remark.changed === 1 ? '' : 's'} changed{run.remark.previousAwarded != null ? `; total ${run.remark.previousAwarded} → ${run.awarded} / ${run.max}` : ''}.</>}
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {run.remark.parts.map((x, i) => {
                  const moved = !!x.before && !!x.after && x.before.awarded !== x.after.awarded;
                  const gone = !x.after, fresh = !x.before;
                  return (
                    <span key={i} title={x.after?.why || ''} style={{ fontWeight: moved || gone || fresh ? 700 : 400 }}>
                      Q{x.q}{x.part} {x.before ? `${x.before.awarded}/${x.before.max}` : '—'} → {x.after ? `${x.after.awarded}/${x.after.max}` : 'not marked'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {run.remarking && (
            <p style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
              🔁 {run.remarkPages.length
                ? `Page ${run.remarkPages.map(i => i + 1).join(', ')} is being re-marked — the other pages keep their marking. When it lands the paper is redrawn and the sheet is revised for what changed.`
                : 'This paper is being re-marked. When it lands the paper is redrawn and a new sheet is written.'}
              {' '}Progress shows on the <a href={`/admin/mark-paper?run=${run.id}`} style={{ color: C.link }}>marking page</a>.
            </p>
          )}
          {pages.length === 0 && !run.remarking && (
            <p style={{ color: C.muted, fontSize: 13.5 }}>No annotated page images on this run.</p>
          )}
          {pages.map(pg => (
            <section key={pg.photoIndex} id={`page-${pg.photoIndex}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted, display: 'flex', justifyContent: 'space-between' }}>
                <span>Page {pg.photoIndex + 1}
                  {!released && <button type="button" onClick={() => setAnnotatePage(pg.photoIndex)} style={{ ...btn('#fff', C.pen, '#ddd6fe'), marginLeft: 10, padding: '3px 9px', fontSize: 12.5 }} title="Open the pen on this page, right here — the marker's ink is editable">✏️ Annotate this page</button>}
                  <a href={fileHref(solutionsOnPage && pg.urlWithSolutions ? pg.urlWithSolutions : pg.url)} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: C.link, textDecoration: 'none', fontSize: 12 }} title="Open the page image on its own">open ↗</a>
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {pg.method && pg.method !== 'line' && <span style={{ color: C.flag }} title="Tick placement fell back on this page — the marks are the same, the ink is coarser">{pg.method} ticks</span>}
                  {!run.remarking && (
                    <button onClick={() => p.onRemarkPage(pg.photoIndex)} disabled={busy === 'remark'}
                      title="Read this page again and redraw the paper; every other page keeps its marking. The sheet is revised for what changed."
                      style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '2px 8px', fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                      {busy === 'remark' ? '…' : '🔁 Re-mark this page'}
                    </button>
                  )}
                </span>
              </div>
              {/* Tap the page to annotate it in place (released papers keep the plain image). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileHref(solutionsOnPage && pg.urlWithSolutions ? pg.urlWithSolutions : pg.url)} alt={`Marked page ${pg.photoIndex + 1}`} loading="lazy"
                onClick={() => { if (!released) setAnnotatePage(pg.photoIndex); }}
                title={released ? undefined : 'Tap to annotate this page'}
                style={{ width: '100%', display: 'block', cursor: released ? 'default' : 'pointer' }} />
              {solutionsOnPage && pg.urlWithSolutions && pg.overflowUrl && (
                <a href={fileHref(pg.overflowUrl)} target="_blank" rel="noreferrer" title="The worked solution did not fit on the page, so it is a sheet of its own, right after the page — the student sees it the same way.">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileHref(pg.overflowUrl)} alt={`Worked solution sheet after page ${pg.photoIndex + 1}`} loading="lazy" style={{ width: '100%', display: 'block', borderTop: `1px dashed ${C.border}` }} />
                </a>
              )}
              <div style={{ padding: '4px 0' }}>
                {(byPage.get(pg.photoIndex) ?? []).map(q => (isOpenFlag(q)
                  ? <div key={q.index} style={{ padding: '7px 12px', fontSize: 12.5, color: C.flag, borderTop: `1px solid ${C.border}` }}>⚠ Q{q.questionNumber} {q.awarded}/{q.max} — waiting for your decision in “To check” at the top ↑</div>
                  : <QuestionCard key={q.index} q={q} released={!reviewable} busy={busy} editing={p.editing} editAwarded={p.editAwarded} editNote={p.editNote}
                      setEditing={p.setEditing} setEditAwarded={p.setEditAwarded} setEditNote={p.setEditNote} editKind={p.editKind} setEditKind={p.setEditKind} editParts={p.editParts} setEditParts={p.setEditParts} onAgree={p.onAgree} onOverride={p.onOverride} studentId={run.studentId} onShelve={p.onShelve} shelved={p.shelved} />
                ))}
                {(byPage.get(pg.photoIndex) ?? []).length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12.5, color: C.faint }}>No questions marked on this page.</div>
                )}
              </div>
            </section>
          ))}
          {unplaced.length > 0 && (
            <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted }}>Questions not placed on a page</div>
              {unplaced.map(q => (isOpenFlag(q)
                ? <div key={q.index} style={{ padding: '7px 12px', fontSize: 12.5, color: C.flag }}>⚠ Q{q.questionNumber} {q.awarded}/{q.max} — waiting for your decision in “To check” at the top ↑</div>
                : <QuestionCard key={q.index} q={q} released={released} busy={busy} editing={p.editing} editAwarded={p.editAwarded} editNote={p.editNote}
                    setEditing={p.setEditing} setEditAwarded={p.setEditAwarded} setEditNote={p.setEditNote} editKind={p.editKind} setEditKind={p.setEditKind} editParts={p.editParts} setEditParts={p.setEditParts} onAgree={p.onAgree} onOverride={p.onOverride} studentId={run.studentId} onShelve={p.onShelve} shelved={p.shelved} />
              ))}
            </section>
          )}
        </div>

        {/* ── right: the sheet, or the page a "see page" asked for ── */}
        <div className="desk-right" style={{ minWidth: 0 }}>
          {rightPage != null && (() => {
            const order = pages.map(pg => pg.photoIndex);
            const at = order.indexOf(rightPage);
            return (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <button className={`desk-tab${rightPane === 'sheet' ? ' on' : ''}`} onClick={() => setRightPane('sheet')} title="Show the Practice Again sheet here">📘 Practice Again</button>
                <button className={`desk-tab${rightPane === 'page' ? ' on' : ''}`} onClick={() => setRightPane('page')} title="Show the marked page here">📄 Page {rightPage + 1}</button>
                {rightPane === 'page' && (
                  <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button className="desk-tab" disabled={at <= 0} onClick={() => setRightPage(order[at - 1])} title="Previous page" style={{ opacity: at <= 0 ? 0.4 : 1 }}>‹</button>
                    <button className="desk-tab" disabled={at < 0 || at >= order.length - 1} onClick={() => setRightPage(order[at + 1])} title="Next page" style={{ opacity: at < 0 || at >= order.length - 1 ? 0.4 : 1 }}>›</button>
                  </span>
                )}
              </div>
            );
          })()}
          {rightPane === 'page' && rightPage != null ? (() => {
            const pg = pages.find(x => x.photoIndex === rightPage);
            if (!pg) return <p style={{ color: C.muted, fontSize: 13 }}>Page {rightPage + 1} has no image on this run.</p>;
            const src = fileHref(solutionsOnPage && pg.urlWithSolutions ? pg.urlWithSolutions : pg.url);
            return (
              <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Page {pg.photoIndex + 1}
                    {!released && <button type="button" onClick={() => setAnnotatePage(pg.photoIndex)} style={{ ...btn('#fff', C.pen, '#ddd6fe'), marginLeft: 10, padding: '3px 9px', fontSize: 12.5 }} title="Open the pen on this page">✏️ Annotate this page</button>}
                    <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: C.link, textDecoration: 'none', fontSize: 12 }}>open ↗</a>
                  </span>
                  {!run.remarking && (
                    <button onClick={() => p.onRemarkPage(pg.photoIndex)} disabled={busy === 'remark'}
                      title="Read this page again and redraw the paper; every other page keeps its marking. The sheet is revised for what changed."
                      style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '2px 8px', fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                      {busy === 'remark' ? '…' : '🔁 Re-mark this page'}
                    </button>
                  )}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Marked page ${pg.photoIndex + 1}`} onClick={() => { if (!released) setAnnotatePage(pg.photoIndex); }}
                  title={released ? undefined : 'Tap to annotate this page'} style={{ width: '100%', display: 'block', cursor: released ? 'default' : 'pointer' }} />
                {solutionsOnPage && pg.urlWithSolutions && pg.overflowUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileHref(pg.overflowUrl)} alt={`Worked solution sheet after page ${pg.photoIndex + 1}`} loading="lazy" style={{ width: '100%', display: 'block', borderTop: `1px dashed ${C.border}` }} />
                )}
              </section>
            );
          })() : (
            <SheetPane d={d} sheetPages={p.sheetPages} sheetNote={p.sheetNote} busy={busy} focus={p.focus} setFocus={p.setFocus}
              onQueueSheet={p.onQueueSheet} onCancelSheet={p.onCancelSheet} onAutoRelease={p.onAutoRelease} onRevise={p.onRevise} onSendSheet={p.onSendSheet} />
          )}
        </div>
      </div>
      {annotatePage != null && !released && (
        <AnnotateOverlay
          runId={run.id}
          pages={d.annotatedPhotos.map(ph => ({
            photoIndex: ph.photoIndex,
            url: fileHref(ph.urlWithSolutions || ph.url),
            layerUrl: ph.layerUrl ? fileHref(ph.layerUrl) : null,
            layer: ph.layer ?? null,
            inkUrl: ph.inkUrl ? fileHref(ph.inkUrl) : null,
            originalUrl: d.pageSources?.[ph.photoIndex]?.originalUrl ? fileHref(d.pageSources[ph.photoIndex].originalUrl as string) : null,
            rot: d.pageSources?.[ph.photoIndex]?.rot ?? 0,
          }))}
          student={{ name: run.studentName || '', level: '' }}
          totals={{ awarded: run.awarded, max: run.max }}
          initialPage={annotatePage}
          onClose={() => setAnnotatePage(null)}
          onDone={({ linked }) => {
            setAnnotatePage(null);
            p.onToast(linked ? 'Saved — your copy is attached and the page images are updated.' : 'Saved — the copy could not be linked; attach it from the folder.');
            p.onRefresh();
          }}
        />
      )}
    </>
  );
}

// ── The cover: "where the marks went", from /api/admin/paper-analysis ────────
// 📤 Open in… — hand the marked PDF to the iPad's share sheet so Adrian can
// pick Notability (or GoodNotes, Files…) and annotate there. Adrian, 3 Sep
// 2026: "for annotation, is it possible for another button when click launch
// the pdf on notability also?" iOS has no URL scheme that opens a GIVEN file
// in Notability, so the share sheet is the one-tap-short-of-direct route: the
// PDF is fetched as a File and handed to navigator.share, which Safari on
// iPadOS supports for files. Where files can't be shared (desktop browsers,
// old iOS) the button opens the PDF in a new tab instead, whose own share
// button does the same job. Nothing here writes anything.
function OpenInApp({ url, name }: { url: string | null; name: string }) {
  const [busy, setBusy] = useState(false);
  if (!url) return null;
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const open = async () => {
    if (!canShareFiles) { window.open(url, '_blank', 'noopener'); return; }
    setBusy(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], name.replace(/[\\/:*?"<>|]/g, '-'), { type: 'application/pdf' });
      if (!navigator.canShare({ files: [file] })) { window.open(url, '_blank', 'noopener'); return; }
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      // AbortError = the sheet was dismissed; anything else falls back to a tab.
      if (!(e instanceof Error && e.name === 'AbortError')) window.open(url, '_blank', 'noopener');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={open} disabled={busy} title="Share sheet → Notability, GoodNotes, Files…"
      style={{ ...btn('#fff', C.pen, C.pen), padding: '2px 8px', fontSize: 13 }}>
      {busy ? '📤 Preparing…' : '📤 Open in…'}
    </button>
  );
}

function CoverCard({ cover }: { cover: Cover | null }) {
  if (!cover) return null;
  const themes = cover.themes.slice(0, 6);
  return (
    <section style={{ border: `1px solid ${C.border}`, borderLeft: '4px solid #f97362', borderRadius: 12, background: '#fff', marginBottom: 14, padding: 12 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>📄 Front page — where the marks went</span>
        <span title={cover.source === 'sheet' ? 'Ranked by the self-study sheet’s diagnosis' : 'Ranked from the marker’s notes (no sheet diagnosis yet)'}>
          {cover.source === 'sheet' ? 'from the sheet' : 'from the marker'}
        </span>
      </div>
      <div style={{ fontSize: 14, marginBottom: themes.length ? 8 : 0 }}>
        <Tex text={cover.headline.replace(/\*\*(.+?)\*\*/g, '$1')} />
      </div>
      {themes.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
          {themes.map(t => (
            <li key={t.key} style={{ marginBottom: 4 }}>
              <b>{t.title}</b> — {t.marks} mark{t.marks === 1 ? '' : 's'}
              {t.tier && t.tier !== 'teach' && <span style={{ color: C.faint }}> · {t.tier}</span>}
              {(t.questions?.length ? t.questions : t.examples.map(e => e.question).filter(Boolean)).length > 0 && (
                <span style={{ color: C.muted }}> · {(t.questions?.length ? t.questions : t.examples.map(e => e.question).filter(Boolean)).join(', ')}</span>
              )}
              {t.examples[0]?.why && <div style={{ fontSize: 12.5, color: C.muted }}><Tex text={t.examples[0].why} /></div>}
            </li>
          ))}
        </ol>
      )}
      {cover.worstQuestions.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.muted, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Most lost:</span>
          {cover.worstQuestions.slice(0, 5).map(w => (
            <Chip key={w.question} label={`${w.question} −${w.lost}`} bg={C.dangerBg} color={C.danger} title={w.why} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── One question, with Agree / Override on every one ─────────────────────────
function QuestionCard(p: {
  q: Question; released: boolean; busy: string; editing: number | null; editAwarded: string; editNote: string; editKind: string; editParts: Record<string, string>; setEditParts: (v: Record<string, string>) => void;
  setEditing: (v: number | null) => void; setEditAwarded: (v: string) => void; setEditNote: (v: string) => void; setEditKind: (v: string) => void;
  onAgree: (q: Question) => void; onOverride: (q: Question) => void;
  /** the run's student — the 📬 follow-up link and 🧺 Shelve need one */
  studentId: string | null; onShelve: (q: Question) => void; shelved: Set<string>;
}) {
  const { q, released, busy } = p;
  const isEditing = p.editing === q.index;
  const isBusy = busy === `q:${q.index}`;
  const lost = q.awarded < q.max;
  const open = q.flagged && !q.reviewed;
  return (
    <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, background: open ? '#fffdf5' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Q{q.questionNumber}</strong>
        <span style={{ fontWeight: 700, color: lost ? (q.awarded === 0 ? C.danger : '#a16207') : C.ok }}>{q.awarded}/{q.max}</span>
        {q.reviewed && <span style={{ color: C.ok, fontSize: 13, fontWeight: 700 }} title="You have agreed with or overridden this mark">✓ reviewed</span>}
        {open && <span style={{ color: C.flag, fontSize: 12.5, fontWeight: 700 }}>⚠ flagged</span>}
        {q.override && (
          <span style={{ fontSize: 12, color: C.muted }} title={q.override.note || undefined}>
            was {q.override.previous}{q.override.errorKind ? ` · ${q.override.errorKind}` : ''}{q.override.note ? ` · ${q.override.note}` : ''}
          </span>
        )}
        {q.topic && <span style={{ fontSize: 12, color: C.muted, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{q.topic}</span>}
        {/* 📬 From Adrian (SPEC-ASSIGN.md): a weak topic → an assigned question, pre-filled
            on the student profile. 🧺 parks the weakness for wave 2 with its evidence.
            Both came here from /admin/mark/triage when it was retired (8 Sep 2026). */}
        {!released && lost && q.topic && p.studentId && (
          <a href={`/admin/students/${p.studentId}?send=${encodeURIComponent(q.topic)}`}
            style={{ fontSize: 12, fontWeight: 600, color: C.link, textDecoration: 'none', whiteSpace: 'nowrap' }}
            title="Send a follow-up question on this topic">📬 Send follow-up</a>
        )}
        {!released && lost && p.studentId && (
          p.shelved.has(`${q.index}`) || p.shelved.has(`${p.studentId}:${q.index}`) || [...p.shelved].some(k => k.endsWith(`:${q.index}`))
            ? <span style={{ fontSize: 12, fontWeight: 600, color: '#6d28d9', whiteSpace: 'nowrap' }}>🧺 Shelved ✓</span>
            : <button onClick={() => p.onShelve(q)} disabled={busy === `shelve:${q.index}`}
                style={{ ...btn('#f5f3ff', '#6d28d9', '#ddd6fe'), padding: '2px 8px', fontSize: 12 }}
                title="Park this weakness on the student's shelf for a later teaching round — the page, the marker's note and the topic go with it">
                {busy === `shelve:${q.index}` ? '…' : '🧺 Shelve'}
              </button>
        )}
      </div>

      {/* The second reader's verdict, from result_json.second_look — structured, so it
          reads as a decision: which part, the marker's mark, the second reader's mark,
          and what each button would do about it. Its prose twin in reviewReasons
          ("Second look disagrees on …") is dropped when this card is shown. */}
      {q.secondLook.length > 0 && !q.reviewed && !released && (() => {
        const suggested = secondLookSuggestedMark(q);
        const partsText = q.secondLook.map(d => `${d.label || 'the question'}: marker ${d.first}/${d.max}, second reader ${d.second}/${d.max}`).join(' · ');
        const note = `second reader: ${q.secondLook.map(d => `${d.label || 'Q'} ${d.second}/${d.max} (marker ${d.first})`).join(', ')}`;
        return (
          <div style={{ marginTop: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 6, padding: '7px 9px', fontSize: 12.5, lineHeight: 1.45 }}>
            <div><strong>👀 A second reader disagrees with the marker</strong> — {partsText}.</div>
            <div style={{ marginTop: 3 }}>
              Look at {q.secondLook.map(d => d.label || 'the working').join(' and ')} on the page. If the second reader is right, Q{q.questionNumber} should be <strong>{suggested}/{q.max}</strong>; if the marker is right, it stays <strong>{q.awarded}/{q.max}</strong>.
            </div>
            {suggested !== q.awarded && (
              <button onClick={() => { p.setEditing(q.index); p.setEditAwarded(String(suggested)); p.setEditNote(note); p.setEditKind(q.override?.errorKind ?? ''); p.setEditParts(Object.fromEntries(q.secondLook.map(d => [d.label, String(d.second)]))); }}
                style={{ ...btn('#dbeafe', '#1e3a8a', '#bfdbfe'), marginTop: 6, padding: '5px 10px', fontSize: 12.5 }}>
                ✏️ Use the second reader&apos;s mark → {suggested}/{q.max}
              </button>
            )}
          </div>
        );
      })()}
      {/* Ink that contradicts the marks (round 3): a mark swapped in the pen suggests the
          obvious mark for that part — one tap opens the per-part editor pre-filled. */}
      {!released && (q.inkHints || []).map((h, i) => (
        <div key={`ink-${i}`} style={{ marginTop: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 6, padding: '7px 9px', fontSize: 12.5, lineHeight: 1.45 }}>
          <strong>🖊 Your ink says otherwise:</strong> you turned a {h.to === 'tick' ? 'cross into a tick' : 'tick into a cross'} on {h.part}; the marks still say {h.awarded_now}/{h.max}.
          {h.suggested != null && h.part && (
            <button onClick={() => { p.setEditing(q.index); p.setEditAwarded(''); p.setEditNote(`ink: ${h.part} → ${h.to}`); p.setEditKind(q.override?.errorKind ?? ''); p.setEditParts({ [h.part as string]: String(h.suggested) }); }}
              style={{ ...btn('#dcfce7', '#166534', '#bbf7d0'), marginLeft: 8, padding: '4px 10px', fontSize: 12.5 }}>
              Set {h.part} → {h.suggested}/{h.max}
            </button>
          )}
        </div>
      ))}
      {q.reviewReasons
        .filter(reason => !(q.secondLook.length > 0 && /^second look disagrees/i.test(reason)))
        .map((reason, i) => (
          <div key={i} style={{ marginTop: 6, background: C.flagBg, border: `1px solid ${C.flagBorder}`, color: C.flag, borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>
            <strong>Marker&apos;s note:</strong> {reason}
          </div>
        ))}
      {!q.questionFound && (
        <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>Max marks here are the marker&apos;s own allocation, not the paper&apos;s.</div>
      )}
      {q.parts.filter(pt => pt.errorSummary && pt.awarded < pt.max).map((pt, i) => (
        <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
          <strong>{pt.label} {pt.awarded}/{pt.max}</strong>
          {/* The marker's own label for the loss — what the red word beside the cross says. */}
          {pt.errorKind && <span title={ERROR_KIND_HINT[pt.errorKind]} style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: C.danger, background: C.dangerBg, borderRadius: 999, padding: '1px 7px' }}>{pt.errorKind}</span>}
          {' '}— <Tex text={pt.errorSummary!} />
        </div>
      ))}
      {q.parts.every(pt => !pt.errorSummary || pt.awarded >= pt.max) && lost && q.overallComment && (
        <div style={{ fontSize: 13, marginTop: 4, color: '#374151' }}><Tex text={q.overallComment} /></div>
      )}

      {!released && (isEditing ? (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {q.parts.length > 0 ? (
            <>
              {/* One box per part: the question total is their sum, and the page is
                  redrawn from these so the boxes on the photo say the same numbers. */}
              {q.parts.map((pt, i) => (
                <label key={pt.label || i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <span style={{ color: C.muted }}>{pt.label || 'Q'}</span>
                  <input type="number" inputMode="numeric" min={0} max={pt.max} autoFocus={i === 0}
                    value={p.editParts[pt.label] ?? String(pt.awarded)}
                    onChange={e => p.setEditParts({ ...p.editParts, [pt.label]: e.target.value })}
                    style={{ width: 56, padding: 8, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                  <span style={{ color: C.muted }}>/ {pt.max}</span>
                </label>
              ))}
              <strong style={{ fontSize: 15 }}>
                = {q.parts.reduce((s, pt) => s + (Number(p.editParts[pt.label] ?? pt.awarded) || 0), 0)}/{q.max}
              </strong>
            </>
          ) : (
            <>
              <input type="number" inputMode="numeric" min={0} max={q.max} value={p.editAwarded} onChange={e => p.setEditAwarded(e.target.value)} autoFocus
                style={{ width: 68, padding: 8, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 6 }} />
              <span style={{ color: C.muted }}>/ {q.max}</span>
            </>
          )}
          <input value={p.editNote} onChange={e => p.setEditNote(e.target.value)} placeholder="Why (optional)"
            style={{ flex: 1, minWidth: 140, padding: 8, fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 6 }} />
          {/* The kind of error he saw — optional, and deliberately NOT pre-filled from
              the marker's own label: this is the ground truth that label is measured against. */}
          <select value={p.editKind} onChange={e => p.setEditKind(e.target.value)} title="What kind of error was it? Becomes the truth the marker's labels are calibrated against"
            style={{ padding: 8, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff', maxWidth: 260 }}>
            <option value="">— kind of error</option>
            {ERROR_KINDS.map(k => <option key={k} value={k}>{k} — {ERROR_KIND_HINT[k]}</option>)}
          </select>
          <button onClick={() => p.onOverride(q)} disabled={isBusy || (q.parts.length === 0 && p.editAwarded === '')} style={btn(C.ink, '#fff')}
            title={q.parts.length ? 'Save the marks, then redraw this page so the ink matches' : 'Save the mark'}>{isBusy ? '…' : q.parts.length && q.photoIndex != null ? 'Save & redraw page' : 'Save'}</button>
          <button onClick={() => p.setEditing(null)} style={btn('#fff', '#374151', C.border)}>Cancel</button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!q.reviewed && (
              <button onClick={() => p.onAgree(q)} disabled={isBusy} style={btn(C.okBg, C.ok, C.okBorder)}
                title={`Keep the marker's ${q.awarded}/${q.max} for Q${q.questionNumber}`}>{isBusy ? '…' : `✓ Agree — keep ${q.awarded}/${q.max}`}</button>
            )}
            <button onClick={() => { p.setEditing(q.index); p.setEditAwarded(String(q.awarded)); p.setEditNote(''); p.setEditKind(q.override?.errorKind ?? ''); p.setEditParts({}); }}
              title={`Set Q${q.questionNumber}'s mark yourself`}
              style={q.reviewed ? { ...btn('#fff', C.muted, C.border), padding: '4px 9px', fontSize: 12.5 } : btn('#fff', '#374151', C.border)}>
              {q.reviewed ? 'change' : '✏️ Override — set the mark myself'}
            </button>
          </div>
          {open && (
            <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>
              Agree = the marker&apos;s {q.awarded}/{q.max} stands. Override = you type the mark that should stand (and why).
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── The sheet pane: the PDF, re-queue, and the diagnosis it was built on ─────
function SheetPane(p: {
  d: Detail; sheetPages: string[] | null; sheetNote: string; busy: string; focus: string; setFocus: (v: string) => void;
  onQueueSheet: () => void; onCancelSheet: () => void; onAutoRelease: (action: 'hold' | 'unhold') => void;
  onRevise: (instructions: string) => void; onSendSheet: () => void;
}) {
  const { d, busy } = p;
  const job = d.sheetJob;
  const [revise, setRevise] = useState('');
  const released = !!d.run.releasedAt;
  const inFlight = job?.status === 'queued' || job?.status === 'claimed';
  // A "no sheet needed" job is finished but has no files — it gets its own
  // panel rather than the PDF viewer and an error where the sheet would be.
  const noSheet = job?.status === 'done' && !!job.result?.noSheet;
  const sheetWithStudent = !!(d as { sheetSent?: boolean }).sheetSent;
  const done = job?.status === 'done' && !noSheet;
  const openHref = (kind: 'pdf' | 'docx') => `/api/admin/sheet-open?runId=${encodeURIComponent(d.run.id)}&kind=${kind}`;
  if (d.run.practiceAgain) {
    // A returned Practice Again sheet gets no sheet of its own (9 Sep 2026).
    return (
      <div style={{ padding: '12px 14px', fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
        📘 This is a returned <b>Practice Again</b> sheet, marked as a paper. It gets no sheet of its own — the marks above are the whole story.
      </div>
    );
  }
  return (
    <>
      <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15 }}>📘 Practice Again</strong>
          <span style={{ fontSize: 13, color: done ? C.ok : job?.status === 'failed' ? C.danger : C.link, fontWeight: 600 }}>{job ? job.label : 'no sheet yet'}</span>
          {job?.requestedBy === 'student' && <span style={{ fontSize: 12, color: C.muted }}>· asked by the student from the app — goes out on its own once it clears the gate</span>}
          {job && job.requestedBy !== 'student' && <span style={{ fontSize: 12, color: C.muted }}>· compulsory once released — the app reminds them until it is handed in</span>}
          {job?.completedAt && done && <span style={{ fontSize: 12, color: C.faint }}>· {fmtWhen(job.completedAt)}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 13 }}>
            {done && <a href={openHref('pdf')} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>PDF ↗</a>}
            {done && <a href={openHref('docx')} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>DOCX ↗</a>}
            <a href={d.folder.url} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>📂</a>
          </span>
        </div>

        {done && (
          <div style={{ padding: 8, background: '#f3f4f6' }}>
            {p.sheetPages ? p.sheetPages.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`Sheet page ${i + 1}`} style={{ width: '100%', display: 'block', marginBottom: 8, border: `1px solid ${C.border}`, background: '#fff' }} />
            )) : (
              <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 13.5 }}>{p.sheetNote || 'Loading the sheet…'}</div>
            )}
            {!d.folder.sheetPdf && d.folder.listed && (
              <div style={{ padding: '6px 4px', fontSize: 12.5, color: C.flag }}>
                ⚠ No &ldquo;Practice Again…pdf&rdquo; in the folder — after editing the DOCX, export it to PDF beside it, or the release has nothing to send.
              </div>
            )}
            {job?.result && (job.result.wave.length > 0 || job.result.shelved.length > 0 || job.result.verified) && (
              <div style={{ padding: '6px 4px 2px', fontSize: 12.5, color: C.muted }}>
                {job.result.wave.length > 0 && <div>Wave: {job.result.wave.join(' · ')}</div>}
                {job.result.shelved.length > 0 && <div>🧺 Shelved for later: {job.result.shelved.join(' · ')}</div>}
                {job.result.verified && <div>✓ {job.result.verified}</div>}
              </div>
            )}
            {job && (job.runIds?.length ?? 0) > 1 && (
              <div style={{ padding: '4px 4px 6px', fontSize: 12.5, color: '#1e3a8a' }}>
                📘 One sheet for {job.runIds!.length} papers — sending it here attaches it to every one of them (one row in the app, one hand-in, one reminder).
              </div>
            )}
          </div>
        )}

        {noSheet && (
          <div style={{ padding: 14, fontSize: 13.5, color: C.ink, background: C.okBg, borderBottom: `1px solid ${C.okBorder}` }}>
            <b>No sheet needed.</b> {job?.result?.reason}
            <div style={{ marginTop: 6, color: C.muted, fontSize: 12.5 }}>
              The worker read this paper and found nothing worth practising. Approve &amp; release sends the marked
              paper on its own — or re-queue below if you want a sheet anyway.
            </div>
          </div>
        )}

        {done && released && job && !noSheet && !sheetWithStudent && (() => {
          // The paper is out, the sheet is written, the student does not have it
          // (9 Sep 2026: eleven such sheets sat with no button to send them).
          const gate = (job.result as { auto_release_gate?: { ok?: boolean; reasons?: string[] } } | null | undefined)?.auto_release_gate;
          const when = job.autoReleaseAt ? new Date(job.autoReleaseAt).toLocaleString('en-SG', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' }) : null;
          return (
            <div style={{ padding: '10px 14px', fontSize: 13, borderTop: `1px solid ${C.border}`, lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                📘 <b>Written, not yet with the student.</b>{' '}
                {job.heldAt ? <>Held: {(job.stage || '').replace(/^held\s*[—–-]\s*/i, '')}.</>
                  : when ? <>Goes out by itself at <b>{when}</b>.</>
                  : gate?.reasons?.length ? <>It did not go by itself: {gate.reasons.join('; ')}.</>
                  : <>Nothing is scheduled to send it.</>}
              </span>
              <button onClick={p.onSendSheet} disabled={busy === 'sheet'} style={btn(C.ink, '#fff')}>{busy === 'sheet' ? '…' : '📘 Send the sheet now'}</button>
              {when && !job.heldAt && <button onClick={() => p.onAutoRelease('hold')} disabled={busy === 'sheet'} style={btn('#fff', C.danger, C.border)}>🖐 Hold</button>}
            </div>
          );
        })()}
        {done && !released && job && !job.autoReleaseAt && !job.heldAt && !noSheet && (() => {
          const gate = (job.result as { auto_release_gate?: { ok?: boolean; reasons?: string[] } } | null | undefined)?.auto_release_gate;
          return (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.border}`, lineHeight: 1.5 }}>
              ⏱ <b>No auto-release timer on this sheet</b> — it goes out only when you press Approve &amp; release.
              {gate?.reasons?.length ? <> Why: {gate.reasons.join('; ')}.</> : <> (This sheet predates the gate record, so the reason was not kept.)</>}
            </div>
          );
        })()}
        {done && !released && job && (job.autoReleaseAt || job.heldAt) && (
          <div style={{ padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}` }}>
            {job.heldAt
              ? <><span>🖐 Held by you — release with the button below when ready.</span>
                  <button onClick={() => p.onAutoRelease('unhold')} disabled={busy === 'sheet'} style={btn('#fff', C.ink, C.border)}>{busy === 'sheet' ? '…' : '▶ Resume auto-release'}</button></>
              : <><span>⏱ Goes out with the paper automatically at <b>{new Date(job.autoReleaseAt as string).toLocaleString('en-SG', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })}</b> unless you hold it.</span>
                  <button onClick={() => p.onAutoRelease('hold')} disabled={busy === 'sheet'} style={btn('#fff', C.danger, C.border)}>{busy === 'sheet' ? '…' : '🖐 Hold'}</button></>}
          </div>
        )}

        {!done && !noSheet && (
          <div style={{ padding: 14, fontSize: 13.5, color: C.muted }}>
            {!job && (d.run.studentId
              ? 'No sheet has been queued for this paper.'
              : 'Tag the paper to a student first — a sheet needs someone to be for.')}
            {job?.status === 'queued' && 'Queued — the Mac worker polls every ~5 min and writes a sheet in about 20 more.'}
            {job?.status === 'claimed' && <>Being written now{job.claimedBy ? ` by ${job.claimedBy}` : ''} — stage: <b>{job.stage || 'drafting'}</b>. Vet the marking meanwhile.</>}
            {job?.status === 'failed' && <span style={{ color: C.danger }}>Failed after {job.attempts} attempt{job.attempts === 1 ? '' : 's'}: {job.error || 'unknown'}</span>}
            {job?.focus && <div style={{ marginTop: 6, fontSize: 12.5 }}>Focus: {job.focus}</div>}
          </div>
        )}

        {!released && (
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {inFlight ? (
              <button onClick={p.onCancelSheet} disabled={busy === 'sheet'} style={btn('#fff', C.danger, C.border)}>{busy === 'sheet' ? '…' : '✕ Cancel sheet'}</button>
            ) : (
              <>
                <input value={p.focus} onChange={e => p.setFocus(e.target.value)} placeholder="Focus (optional) — e.g. logs only, skip vectors"
                  style={{ flex: 1, minWidth: 180, padding: '8px 10px', fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8 }} />
                <button onClick={p.onQueueSheet} disabled={busy === 'sheet' || !d.run.studentId} style={btn(C.ink, '#fff')}
                  title={d.run.studentId
                    ? 'Writes a NEW sheet and diagnosis from the marking as it stands now. Does not re-mark. The old sheet is replaced.'
                    : 'Tag a student first'}>
                  {busy === 'sheet' ? '…' : job ? (job.status === 'failed' ? '🔁 Retry sheet' : '🔁 New sheet from this marking') : '📘 Queue sheet'}
                </button>
                {/* Adrian, 7 Sep 2026: "make Re-queue clearer" — say what it does
                    and what it does not, and put the re-mark door right beside it. */}
                <span style={{ flexBasis: '100%', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                  {job ? 'New sheet' : 'Queue sheet'} = the Mac writes a fresh diagnosis and Practice Again sheet from the <b>current</b> marking; the old sheet
                  and its questions are replaced. It does <b>not</b> re-mark. To mark the paper again, use{' '}
                  <a href={`/admin/mark-paper?run=${d.run.id}`} style={{ color: C.link, fontWeight: 600 }}>✍️ Re-mark on the marking page</a>
                  {' '}— a re-mark replaces a sheet that already exists by itself; a paper with no sheet stays without one.
                  {' '}A sheet you queue here and release is <b>compulsory</b>: the app reminds the student until it is handed in.
                  {' '}Students can ask for their own from the app once the paper is out.
                </span>
              </>
            )}
          </div>
        )}
        {job?.status === 'done' && job.result?.docxPath && (
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}>
              <b>✏️ Revise this sheet</b> — say what to change: a section, an example, a practice set, a phrasing. The Mac changes only
              that, keeps everything else as it is, and re-files the sheet; the version before is kept in the folder&rsquo;s <code>_versions</code>.
              {released && <> The student already has this sheet — the re-filed copy replaces it in the app.</>}
            </div>
            <textarea value={revise} onChange={e => setRevise(e.target.value)} rows={2}
              placeholder="e.g. Example 3: say “remove the denominator”, not “clears it”. Add a practice question where the power is −1 so the integral becomes ln."
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit', lineHeight: 1.45 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              {!revise.trim() && <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center', marginRight: 10 }}>Type what to change first. This revises the sheet; it does not send it.</span>}
              <button onClick={() => { const t = revise.trim(); if (!t) return; p.onRevise(t); setRevise(''); }} disabled={busy === 'sheet' || !revise.trim()} style={btn(C.ink, '#fff')}>
                {busy === 'sheet' ? '…' : '✏️ Send the revision'}
              </button>
            </div>
          </div>
        )}
      </section>

      {d.diagnosis && d.diagnosis.skills.length > 0 && (
        <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}>
            <b>The sheet&rsquo;s diagnosis</b> — what the worker decided this student should work on, in the sheet&rsquo;s order.
            It drives the paper&rsquo;s cover page (&ldquo;Where your marks went&rdquo;) and the student&rsquo;s Notebook mistakes list.
            Check it targets the right things; if not, type a focus line above and make a new sheet.
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
            {d.diagnosis.skills.map((s, i) => (
              <li key={i} style={{ marginBottom: 5 }}>
                <b>{s.title}</b> — {s.marks} mark{s.marks === 1 ? '' : 's'}
                {s.tier !== 'teach' && <Chip label={s.tier} bg={s.tier === 'optional' ? '#f3f4f6' : '#eff6ff'} color={s.tier === 'optional' ? '#374151' : C.link} />}
                {s.questions.length > 0 && <span style={{ color: C.muted }}> · {s.questions.join(', ')}</span>}
                {s.why && <div style={{ fontSize: 12.5, color: C.muted }}><Tex text={s.why} /></div>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
