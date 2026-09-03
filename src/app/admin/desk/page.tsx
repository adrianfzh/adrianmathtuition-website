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

import 'katex/dist/katex.min.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import StudentPicker from '@/components/StudentPicker';
import SubjectChip from '@/components/SubjectChip';
import GroundingChip from '@/components/GroundingChip';
import RulesTag from '@/components/RulesTag';
import { mathHtml } from '@/lib/math-inline';
import { DESK_LANES, LANE_LABEL, type DeskLane } from '@/lib/desk-state';
import { ERROR_KINDS, ERROR_KIND_HINT, isErrorKind } from '@/lib/error-kinds';
import type { TriageQuestion } from '@/lib/mark-triage';
import type { Diagnosis } from '@/lib/sheet-diagnosis';
import { pdfToPageImages } from '@/lib/pdf-pages';

// ── Shapes the two desk routes return ────────────────────────────────────────
type Row = {
  id: string; createdAt: string; paperName: string; subject: string;
  studentId: string | null; studentName: string | null;
  awarded: number; max: number; pct: number | null; questions: number; pending: number;
  lane: DeskLane; releasedAt: string | null; releasedVia: string | null; pdfStale: boolean;
  sheet: { jobId: string; status: string; stage: string | null; error: string | null; label: string; completedAt: string | null } | null;
  flags: string[]; amended: string | null; assignments: number;
  folder: string; folderUrl: string;
  annotatedPdfUrl: string | null; photosPdfUrl: string | null; pdfUrl: string | null;
};

type Counts = Record<DeskLane, number>;

type Question = TriageQuestion & { flagged: boolean };

type Detail = {
  run: {
    id: string; createdAt: string; paperName: string; subject: string; rulesVersion: string | null;
    studentId: string | null; studentName: string | null;
    awarded: number; max: number; totalQuestions: number;
    releasedAt: string | null; releasedVia: string | null; archivedAt: string | null; checkedAt: string | null;
    pdfUrl: string | null; annotatedPdfUrl: string | null; photosPdfUrl: string | null;
    pdfStale: boolean; grounding: string | null; unattempted: string[]; portalSubmission: boolean;
  };
  lane: DeskLane;
  pending: number;
  overrides: { against: number; forStudent: number; reviewed: number };
  totalWarning: string | null;
  autoHold: { hold: boolean; reasons: string[] };
  questions: Question[];
  annotatedPhotos: { photoIndex: number; url: string; urlWithSolutions: string | null; method: string | null }[];
  diagnosis: Diagnosis | null;
  sheetJob: {
    id: string; status: string; stage: string | null; error: string | null; attempts: number; focus: string | null;
    claimedBy: string | null; createdAt: string; completedAt: string | null; label: string;
    result: {
      docxPath: string | null; pdfPath: string | null; wave: string[]; shelved: string[]; verified: string;
      /** The worker read the paper and there was nothing worth practising (3 Sep 2026). */
      noSheet: boolean; reason: string;
    } | null;
  } | null;
  assignments: number;
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
  released: { bg: '#f3f4f6', fg: '#374151' },
};

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

const LANE_HINT: Record<DeskLane, string> = {
  untagged: 'A paper with no student reaches nobody — tag it and the sheet queues itself.',
  'awaiting-sheet': 'The self-study sheet is being written on the Mac. Vet the marking meanwhile; the paper moves to Ready to vet when the sheet lands.',
  ready: 'Script and sheet are both here. Open one, agree or override every question, read the sheet, then Approve & release.',
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
    const awarded = Number(editAwarded);
    if (!Number.isFinite(awarded)) return;
    setBusy(`q:${q.index}`);
    const errorKind = isErrorKind(editKind) ? editKind : null;
    const { ok, d } = await postJson('/api/admin/mark-triage', {
      action: 'override', runId: id, questionIdx: q.index, awarded, note: editNote, errorKind: errorKind ?? undefined,
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
    setEditing(null); setEditAwarded(''); setEditNote(''); setEditKind('');
    setToast('Saved. The PDF still prints the old total — save your Marked (Adrian).pdf into the folder, or Rebuild PDFs.');
    refresh(id);
  }

  async function tag(studentId: string, name: string) {
    if (!detail || !studentId) return;
    const id = detail.run.id;
    setBusy('tag'); setTagging(false);
    const { ok, d } = await postJson('/api/admin/papers', { runId: id, studentId });
    setBusy('');
    if (!ok) { setToast(d.error || 'Could not tag'); return; }
    setToast(`Tagged to ${d.studentName || name}${d.sheet === 'queued' ? ' — self-study sheet queued' : ''}`);
    refresh(id);
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

  // Approve & release — the one big button. release-with-sheet attaches the
  // amended copy by name, assigns the sheet, releases, notifies. The ambiguous
  // case (two "Practice Again…" PDFs) asks, exactly as triage does.
  async function approve() {
    if (!detail) return;
    const id = detail.run.id;
    setBusy('approve');
    try {
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
  const laneRows = rows.filter(r => r.lane === activeLane);

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

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>
          {runId ? (
            <button onClick={() => go({ run: null })} style={{ border: 'none', background: 'none', font: 'inherit', color: C.link, cursor: 'pointer', padding: 0 }}>← Marking desk</button>
          ) : '🖊 Marking desk'}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/admin/mark-paper" style={{ ...btn(C.ink, '#fff'), textDecoration: 'none', padding: '6px 10px', fontSize: 13 }}>✍️ Mark a new paper</a>
          <button onClick={() => { loadQueue(); if (runId) loadRun(runId); }} style={{ ...btn('#fff', '#374151', C.border), padding: '6px 10px', fontSize: 13 }}>↻ Refresh</button>
        </div>
      </header>

      {/* ── queue ─────────────────────────────────────────────────────────── */}
      {!runId && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
            {DESK_LANES.map(l => (
              <button key={l} className={`desk-tab${activeLane === l ? ' on' : ''}`} onClick={() => go({ lane: l })}>
                {LANE_LABEL[l]}<span className="n">{counts ? counts[l] : '·'}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 12px' }}>{LANE_HINT[activeLane]}</p>

          {queueError && <p style={{ color: C.danger }}>{queueError}</p>}
          {queueLoading && rows.length === 0 && <p style={{ color: C.muted }}>Loading…</p>}
          {!queueLoading && !queueError && laneRows.length === 0 && (
            <p style={{ color: C.muted, padding: '32px 0', textAlign: 'center' }}>
              {activeLane === 'ready' ? 'Nothing ready to vet — the sheets are on their way. 🎉' : 'Nothing here.'}
            </p>
          )}

          <div style={{ border: laneRows.length ? `1px solid ${C.border}` : 'none', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            {laneRows.map(row => (
              <div key={row.id} className="desk-row" role="button" tabIndex={0}
                onClick={() => go({ run: row.id })}
                onKeyDown={e => { if (e.key === 'Enter') go({ run: row.id }); }}
                style={{ display: 'flex', gap: 10, padding: '11px 12px', borderTop: `1px solid ${C.border}`, cursor: 'pointer', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {row.studentName || <span style={{ color: C.flag }}>⚠ Needs a student</span>}
                    <span style={{ color: C.muted, fontWeight: 400 }}>·</span>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{row.paperName}</span>
                    <SubjectChip subject={row.subject} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>marked {fmtDate(row.createdAt)}</span>
                    {row.lane !== 'released' && (
                      <span style={{ color: row.sheet?.status === 'done' ? C.ok : row.sheet?.status === 'failed' ? C.danger : C.link }}>
                        📘 {row.sheet?.label ?? 'no sheet yet'}
                      </span>
                    )}
                    {row.lane === 'released' && row.releasedAt && <span>released {fmtDate(row.releasedAt)}{row.assignments ? ' + sheet' : ''}</span>}
                    {row.pending > 0 && <span style={{ color: C.flag, fontWeight: 600 }}>⏳ {row.pending} to check</span>}
                    {row.flags.map(f => <span key={f} style={{ color: C.flag, fontWeight: 600 }}>⚠ {f}</span>)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: scoreColour(row.pct) }}>{row.max > 0 ? `${row.awarded}/${row.max}` : '—'}</div>
                  {row.pct !== null && <div style={{ fontSize: 11.5, color: C.faint }}>{row.pct}%</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 22, fontSize: 12.5, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Other views:</span>
            <a href="/admin/mark-paper" style={{ color: C.link, textDecoration: 'none' }}>✍️ Mark a paper</a>
            <a href="/admin/mark/triage" style={{ color: C.link, textDecoration: 'none' }}>🔍 Triage</a>
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
          editKind={editKind} setEditKind={setEditKind}
          onAgree={agree} onOverride={override} onTag={tag} onAttach={attachMyCopy} onRebuild={rebuild}
          onQueueSheet={queueSheet} onCancelSheet={cancelSheet} onApprove={approve} onReleaseOnly={releaseWithoutSheet}
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
  busy: string; editing: number | null; editAwarded: string; editNote: string; editKind: string; focus: string; tagging: boolean;
  setEditing: (v: number | null) => void; setEditAwarded: (v: string) => void; setEditNote: (v: string) => void; setEditKind: (v: string) => void;
  setFocus: (v: string) => void; setTagging: (v: boolean) => void;
  onAgree: (q: Question) => void; onOverride: (q: Question) => void; onTag: (id: string, name: string) => void;
  onAttach: () => void; onRebuild: () => void; onQueueSheet: () => void; onCancelSheet: () => void;
  onApprove: () => void; onReleaseOnly: () => void;
}) {
  const { detail: d, cover, busy } = p;
  const run = d.run;
  const released = !!run.releasedAt;
  const tone = LANE_TONE[d.lane];
  const pct = run.max > 0 ? Math.round((run.awarded / run.max) * 100) : null;
  const canApprove = d.approveBlockers.length === 0 && !released;
  const canReleaseOnly = d.releaseBlockers.length === 0 && !released && !canApprove;
  // The sheet worker's honest "nothing here is worth practising" — the paper
  // still goes out, on its own, and the button says which it is doing.
  const noSheet = !!d.sheetJob?.result?.noSheet;
  const pages = d.annotatedPhotos;
  const byPage = new Map<number, Question[]>();
  const unplaced: Question[] = [];
  for (const q of d.questions) {
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
              <SubjectChip subject={run.subject} /><GroundingChip source={run.grounding} /><RulesTag v={run.rulesVersion} />
              <span>· marked {fmtWhen(run.createdAt)} · {run.totalQuestions} question{run.totalQuestions === 1 ? '' : 's'}</span>
              {run.portalSubmission && <Chip label="📱 hand-in" bg="#eff6ff" color={C.link} />}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={LANE_LABEL[d.lane]} bg={tone.bg} color={tone.fg} />
              {d.pending > 0
                ? <Chip label={`⏳ ${d.pending} to check`} bg={C.flagBg} color={C.flag} />
                : <Chip label="✓ nothing left to check" bg={C.okBg} color={C.ok} title="No question is waiting on you — the marker flagged none, or you have answered every flag. Any question can still be overridden below." />}
              {d.overrides.reviewed > 0 && (
                <Chip label={`${d.overrides.reviewed} checked · +${d.overrides.against} for the student · −${d.overrides.forStudent}`}
                  title="Corrections you have made on this paper: marks added (the marker withheld them wrongly) and marks removed" />
              )}
              {d.assignments > 0 && <Chip label={`📘 sheet assigned${d.assignments > 1 ? ` ×${d.assignments}` : ''}`} bg={C.okBg} color={C.ok} />}
              {released && <Chip label={`released ${fmtWhen(run.releasedAt!)}${run.releasedVia ? ` · ${run.releasedVia}` : ''}`} />}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: scoreColour(pct) }}>{run.max > 0 ? `${run.awarded}/${run.max}` : '—'}</div>
            {pct !== null && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{pct}%</div>}
          </div>
        </div>

        {d.totalWarning && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: C.dangerBg, border: '1px solid #fecaca', borderRadius: 8, color: C.danger, fontSize: 13 }}>⚠ {d.totalWarning}</div>
        )}
        {d.autoHold.hold && run.portalSubmission && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: C.flagBg, border: `1px solid ${C.flagBorder}`, borderRadius: 8, color: C.flag, fontSize: 13 }}>
            ⚠ Held from auto-release: {d.autoHold.reasons.join(' · ')}
          </div>
        )}
        {run.unattempted.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: C.muted }}>Not attempted: {run.unattempted.map(n => `Q${n}`).join(', ')}</div>
        )}

        {/* files + my copy + rebuild */}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
          <a href={d.folder.url} target="_blank" rel="noreferrer" title={`Dropbox ▸ ${d.folder.path}`} style={{ color: C.link, textDecoration: 'none', fontWeight: 600 }}>📂 Folder ↗</a>
          {run.annotatedPdfUrl && <a href={run.annotatedPdfUrl} target="_blank" rel="noreferrer" style={{ color: C.pen, textDecoration: 'none' }}>✍️ Annotated ↗</a>}
          {run.photosPdfUrl && <a href={run.photosPdfUrl} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>🖼 Images ↗</a>}
          {run.pdfUrl && <a href={run.pdfUrl} target="_blank" rel="noreferrer" style={{ color: C.link, textDecoration: 'none' }}>📄 Full ↗</a>}
          <a href={`/admin/mark-paper?run=${run.id}&annotate=1`} style={{ color: C.pen, textDecoration: 'none' }}>✏️ Annotate</a>
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
          {run.pdfStale && <span style={{ color: C.flag, fontWeight: 600 }} title="A mark was changed after this PDF was drawn — it still prints the old total.">⚠ PDF shows the old total</span>}
        </div>

        {/* the one big button */}
        {!released && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={p.onApprove} disabled={!canApprove || busy === 'approve'}
              title={canApprove
                ? (noSheet
                  ? 'Attach your copy if newer, release the paper, and tell the student — there is no sheet for this one on purpose'
                  : 'Attach your copy if newer, assign the sheet, release the paper, and tell the student — one tap')
                : d.approveBlockers.join(' · ')}
              style={{ ...btn(canApprove ? C.ok : '#e5e7eb', canApprove ? '#fff' : '#9ca3af'), padding: '13px 18px', fontSize: 16, fontWeight: 700, flex: '1 1 260px', cursor: canApprove ? 'pointer' : 'not-allowed' }}>
              {busy === 'approve' ? 'Releasing…'
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
          <CoverCard cover={cover} />

          {pages.length === 0 && (
            <p style={{ color: C.muted, fontSize: 13.5 }}>No annotated page images on this run.</p>
          )}
          {pages.map(pg => (
            <section key={pg.photoIndex} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted, display: 'flex', justifyContent: 'space-between' }}>
                <span>Page {pg.photoIndex + 1}</span>
                {pg.method && pg.method !== 'line' && <span style={{ color: C.flag }} title="Tick placement fell back on this page — the marks are the same, the ink is coarser">{pg.method} ticks</span>}
              </div>
              <a href={pg.urlWithSolutions || pg.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pg.urlWithSolutions || pg.url} alt={`Marked page ${pg.photoIndex + 1}`} loading="lazy" style={{ width: '100%', display: 'block' }} />
              </a>
              <div style={{ padding: '4px 0' }}>
                {(byPage.get(pg.photoIndex) ?? []).map(q => (
                  <QuestionCard key={q.index} q={q} released={released} busy={busy} editing={p.editing} editAwarded={p.editAwarded} editNote={p.editNote}
                    setEditing={p.setEditing} setEditAwarded={p.setEditAwarded} setEditNote={p.setEditNote} editKind={p.editKind} setEditKind={p.setEditKind} onAgree={p.onAgree} onOverride={p.onOverride} />
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
              {unplaced.map(q => (
                <QuestionCard key={q.index} q={q} released={released} busy={busy} editing={p.editing} editAwarded={p.editAwarded} editNote={p.editNote}
                  setEditing={p.setEditing} setEditAwarded={p.setEditAwarded} setEditNote={p.setEditNote} editKind={p.editKind} setEditKind={p.setEditKind} onAgree={p.onAgree} onOverride={p.onOverride} />
              ))}
            </section>
          )}
        </div>

        {/* ── right: the sheet ── */}
        <div className="desk-right" style={{ minWidth: 0 }}>
          <SheetPane d={d} sheetPages={p.sheetPages} sheetNote={p.sheetNote} busy={busy} focus={p.focus} setFocus={p.setFocus}
            onQueueSheet={p.onQueueSheet} onCancelSheet={p.onCancelSheet} />
        </div>
      </div>
    </>
  );
}

// ── The cover: "where the marks went", from /api/admin/paper-analysis ────────
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
  q: Question; released: boolean; busy: string; editing: number | null; editAwarded: string; editNote: string; editKind: string;
  setEditing: (v: number | null) => void; setEditAwarded: (v: string) => void; setEditNote: (v: string) => void; setEditKind: (v: string) => void;
  onAgree: (q: Question) => void; onOverride: (q: Question) => void;
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
      </div>

      {q.reviewReasons.map((reason, i) => (
        <div key={i} style={{ marginTop: 6, background: C.flagBg, border: `1px solid ${C.flagBorder}`, color: C.flag, borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>⚠ {reason}</div>
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
          <input type="number" inputMode="numeric" min={0} max={q.max} value={p.editAwarded} onChange={e => p.setEditAwarded(e.target.value)} autoFocus
            style={{ width: 68, padding: 8, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 6 }} />
          <span style={{ color: C.muted }}>/ {q.max}</span>
          <input value={p.editNote} onChange={e => p.setEditNote(e.target.value)} placeholder="Why (optional)"
            style={{ flex: 1, minWidth: 140, padding: 8, fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 6 }} />
          {/* The kind of error he saw — optional, and deliberately NOT pre-filled from
              the marker's own label: this is the ground truth that label is measured against. */}
          <select value={p.editKind} onChange={e => p.setEditKind(e.target.value)} title="What kind of error was it? Becomes the truth the marker's labels are calibrated against"
            style={{ padding: 8, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff', maxWidth: 260 }}>
            <option value="">— kind of error</option>
            {ERROR_KINDS.map(k => <option key={k} value={k}>{k} — {ERROR_KIND_HINT[k]}</option>)}
          </select>
          <button onClick={() => p.onOverride(q)} disabled={isBusy || p.editAwarded === ''} style={btn(C.ink, '#fff')}>{isBusy ? '…' : 'Save'}</button>
          <button onClick={() => p.setEditing(null)} style={btn('#fff', '#374151', C.border)}>Cancel</button>
        </div>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!q.reviewed && (
            <button onClick={() => p.onAgree(q)} disabled={isBusy} style={btn(C.okBg, C.ok, C.okBorder)}>{isBusy ? '…' : '✓ Agree'}</button>
          )}
          <button onClick={() => { p.setEditing(q.index); p.setEditAwarded(String(q.awarded)); p.setEditNote(''); p.setEditKind(q.override?.errorKind ?? ''); }}
            style={q.reviewed ? { ...btn('#fff', C.muted, C.border), padding: '4px 9px', fontSize: 12.5 } : btn('#fff', '#374151', C.border)}>
            {q.reviewed ? 'change' : '✏️ Override'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── The sheet pane: the PDF, re-queue, and the diagnosis it was built on ─────
function SheetPane(p: {
  d: Detail; sheetPages: string[] | null; sheetNote: string; busy: string; focus: string; setFocus: (v: string) => void;
  onQueueSheet: () => void; onCancelSheet: () => void;
}) {
  const { d, busy } = p;
  const job = d.sheetJob;
  const released = !!d.run.releasedAt;
  const inFlight = job?.status === 'queued' || job?.status === 'claimed';
  // A "no sheet needed" job is finished but has no files — it gets its own
  // panel rather than the PDF viewer and an error where the sheet would be.
  const noSheet = job?.status === 'done' && !!job.result?.noSheet;
  const done = job?.status === 'done' && !noSheet;
  const openHref = (kind: 'pdf' | 'docx') => `/api/admin/sheet-open?runId=${encodeURIComponent(d.run.id)}&kind=${kind}`;
  return (
    <>
      <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#fafafa', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15 }}>📘 Practice Again</strong>
          <span style={{ fontSize: 13, color: done ? C.ok : job?.status === 'failed' ? C.danger : C.link, fontWeight: 600 }}>{job ? job.label : 'no sheet yet'}</span>
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

        {!done && !noSheet && (
          <div style={{ padding: 14, fontSize: 13.5, color: C.muted }}>
            {!job && (d.run.studentId
              ? 'No sheet has been queued for this paper.'
              : 'Tag the paper to a student — the sheet queues itself the moment it has someone to be for.')}
            {job?.status === 'queued' && 'Queued — the Mac worker polls every ~15 min and writes a sheet in about 15 more.'}
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
                  title={d.run.studentId ? undefined : 'Tag a student first'}>
                  {busy === 'sheet' ? '…' : job ? (job.status === 'failed' ? '🔁 Retry sheet' : '🔁 Re-queue sheet') : '📘 Queue sheet'}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {d.diagnosis && d.diagnosis.skills.length > 0 && (
        <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>The sheet&rsquo;s diagnosis — in the sheet&rsquo;s order; compare with the front page</div>
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
