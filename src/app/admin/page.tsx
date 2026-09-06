'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  DndContext, closestCenter, useSensor, useSensors,
  PointerSensor, TouchSensor, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import type { ActivitySummary } from '@/lib/portal-activity';

// Mini calculator icon for the launcher (replaces the abacus emoji).
const CalcIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2.6" fill="#f4f4f1" stroke="#c9c9c4" strokeWidth="0.8" />
    <rect x="6.2" y="4" width="11.6" height="5.4" rx="1" fill="#16241a" />
    <circle cx="7.8" cy="13" r="1.05" fill="#2f6cab" />
    <circle cx="12" cy="13" r="1.05" fill="#3a3a3d" />
    <circle cx="16.2" cy="13" r="1.05" fill="#47993d" />
    <circle cx="7.8" cy="16.4" r="1.05" fill="#3a3a3d" />
    <circle cx="12" cy="16.4" r="1.05" fill="#3a3a3d" />
    <circle cx="16.2" cy="16.4" r="1.05" fill="#3a3a3d" />
    <circle cx="7.8" cy="19.8" r="1.05" fill="#3a3a3d" />
    <circle cx="12" cy="19.8" r="1.05" fill="#3a3a3d" />
    <circle cx="16.2" cy="19.8" r="1.05" fill="#c79a2e" />
  </svg>
);

// Black Casio fx-97SG X style icon for the Casio launcher tile.
const CasioIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2.6" fill="#1b1c1e" stroke="#000" strokeWidth="0.7" />
    <rect x="6.1" y="3.9" width="11.8" height="5.2" rx="0.8" fill="#c4d2bb" />
    <circle cx="7.7" cy="12.3" r="1.05" fill="#e8942f" />
    <circle cx="12" cy="12.3" r="1.05" fill="#9aa0a8" />
    <circle cx="16.3" cy="12.3" r="1.05" fill="#9aa0a8" />
    <circle cx="7.7" cy="15.7" r="1.05" fill="#9aa0a8" />
    <circle cx="12" cy="15.7" r="1.05" fill="#9aa0a8" />
    <circle cx="16.3" cy="15.7" r="1.05" fill="#d8b24e" />
    <circle cx="7.7" cy="19.1" r="1.05" fill="#9aa0a8" />
    <circle cx="12" cy="19.1" r="1.05" fill="#9aa0a8" />
    <circle cx="16.3" cy="19.1" r="1.05" fill="#9aa0a8" />
  </svg>
);

function shortModelName(raw: string): string {
  const isFollowUp = /follow.?up/i.test(raw);
  const base = raw
    .replace(/\s*\(.*?\)\s*/g, '')   // strip parenthetical e.g. "(image follow-up)"
    .replace(/claude-[\w.-]+/gi, '')  // strip API slug e.g. "claude-sonnet-4-6"
    .replace(/Claude\s+/i, '')        // strip "Claude "
    .replace(/\s*4\.?\d*\s*/g, '')    // strip version numbers "4.6" / "4"
    .replace(/Gemini[\s\d.]+Flash.*/i, 'Gemini')
    .trim() || raw.slice(0, 8);
  return isFollowUp ? `${base} (img)` : base;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stats {
  today: { total: number; logged: number };
  invoices: { count: number; totalOwed: number };
  makeups: { count: number };
  thisWeek: { count: number; weekLabel: string };
  // Attention counts (each null when its sub-fetch failed server-side;
  // examGaps is also null outside an exam season) — cards hide on 0/null.
  pendingPapers?: { count: number; possiblyMarking: number } | null;
  unmarkedLessons?: number | null;
  lessonsToLog?: number | null;
  examGaps?: { examType: string; count: number } | null;
  triage?: { flagged: number; readyToRelease: number } | null;
}

interface BotStats {
  totalQuestions: number;
  totalCost: number;
  modelStats: { model: string; count: number; cost: number }[];
}

// ── Hub page ───────────────────────────────────────────────────────────────────

export default function AdminHub() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Drag-to-arrange launcher order (persisted per device).
  const [order, setOrder] = useState<string[]>(loadHubOrder);
  // Set true when a real drag occurs so the trailing click doesn't navigate.
  const suppressClickRef = useRef(false);
  // iOS-home-screen arrange mode. On iPhone the plain long-press-drag never worked:
  // tiles carry touchAction 'manipulation' so the page can scroll, and Safari computes
  // touch-action at GESTURE START — by the time the 500ms TouchSensor hold elapses,
  // moving the finger scrolls the page and kills the drag. The reliable pattern is
  // Apple's own: long-press ENTERS a jiggle mode (this gesture just arms it), the NEXT
  // touch starts on tiles whose touchAction is already 'none', and dragging works.
  const [arrangeMode, setArrangeMode] = useState(false);
  const enterArrange = () => { setArrangeMode(true); try { navigator.vibrate?.(30); } catch { /* no haptics */ } };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // In arrange mode the hold is a token 150ms — taps don't navigate there anyway, so
    // drag can start almost immediately, like wiggling home-screen icons.
    useSensor(TouchSensor, { activationConstraint: arrangeMode ? { delay: 150, tolerance: 8 } : { delay: 500, tolerance: 8 } }),
  );

  const launcherByHref = new Map(LAUNCHERS.map(l => [l.href, l]));
  const orderedLaunchers = order.map(h => launcherByHref.get(h)).filter(Boolean) as Launcher[];

  function handleDragEnd(e: DragEndEvent) {
    // A drag just completed → cancel the synthetic click that follows drop.
    suppressClickRef.current = true;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from < 0 || to < 0) return prev;
      const next = arrayMove(prev, from, to);
      saveHubOrder(next);
      return next;
    });
  }

  function resetHubOrder() {
    const defaults = LAUNCHERS.map(l => l.href);
    setOrder(defaults);
    saveHubOrder(defaults);
  }

  useEffect(() => {
    // Preferred: signed httpOnly session (lib/admin-session.ts). The helper
    // bootstrap-upgrades a legacy raw-password cookie to a session and expires
    // the plaintext cookie (it held the actual admin password — see the
    // 2026-07-06 security audit).
    ensureAdminSession().then(ok => { if (ok) setAuthed(true); });
  }, []);

  // Attention cards (papers to mark · unmarked lessons · exam info gaps).
  // Best-effort: a failed fetch just leaves the strip hidden — the launcher
  // grid must never wait on (or break with) the stats endpoint. The session
  // cookie rides same-origin fetches, so no Authorization header is needed.
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    fetch('/api/admin-stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setStats(d); })
      .catch(() => { /* strip stays hidden */ });
    return () => { cancelled = true; };
  }, [authed]);

  // Portal activity visibility (2026-09-03, lib/portal-activity.ts) — same
  // fail-soft shape as the stats fetch above: a failed call just leaves the
  // card hidden, never blocks the grid.
  const [portalActivity, setPortalActivity] = useState<ActivitySummary | null>(null);
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    fetch('/api/admin/portal-activity')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setPortalActivity(d); })
      .catch(() => { /* card stays hidden */ });
    return () => { cancelled = true; };
  }, [authed]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const ok = await loginAdminSession(password);
    setAuthLoading(false);
    if (ok) setAuthed(true);
    else setAuthError('Incorrect password');
  }


  // ── Auth screen ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{loginCSS}</style>
        <div className="hub-login-wrap">
          <div className="hub-login-card">
            <div className="hub-login-icon">🎓</div>
            <h1>Admin Hub</h1>
            <p>Adrian&apos;s Math Tuition</p>
            <form onSubmit={handleLogin}>
              <PasswordInput
                className="hub-pw-input"
                placeholder="Admin password"
                value={password}
                onChange={v => { setPassword(v); setAuthError(''); }}
                autoFocus
                disabled={authLoading}
              />
              {authError && <div className="hub-pw-error">{authError}</div>}
              <button type="submit" className="hub-pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'Enter'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Hub ──────────────────────────────────────────────────────────────────────
  // Attention cards — shown only when the count is non-zero (a clean day keeps
  // the hub as bare as before). Same .stat-card markup/classes as the original
  // status strip (2×2 grid, whole card is the tap target).
  const papersCard = stats?.pendingPapers && stats.pendingPapers.count > 0 ? stats.pendingPapers : null;
  const unmarkedCard = typeof stats?.unmarkedLessons === 'number' && stats.unmarkedLessons > 0 ? stats.unmarkedLessons : null;
  const logCard = typeof stats?.lessonsToLog === 'number' && stats.lessonsToLog > 0 ? stats.lessonsToLog : null;
  const examGapsCard = stats?.examGaps && stats.examGaps.count > 0 ? stats.examGaps : null;
  const triageCard = stats?.triage && (stats.triage.flagged > 0 || stats.triage.readyToRelease > 0) ? stats.triage : null;
  const portalCard = portalActivity && portalActivity.totals.accounts > 0 ? portalActivity.totals : null;
  const hasAttentionCards = !!(papersCard || unmarkedCard || examGapsCard || triageCard || logCard || portalCard);

  return (
    <>
      <style>{hubCSS}</style>
      <div className="hub-wrap">

        {/* Header */}
        <div className="hub-header">
          <div className="hub-header-inner">
            <span className="hub-title">Admin</span>
            <button className="hub-reset" onClick={resetHubOrder} title="Reset tile order">
              ↺ Reset order
            </button>
          </div>
        </div>

        <div className="hub-body">

          {/* Status strip — live attention counts */}
          {hasAttentionCards && (
            <div className="status-grid">
              {papersCard && (
                <a href="/admin/mark-paper" className="stat-card" style={{ borderLeftColor: '#b45309' }}>
                  <div className="stat-top">
                    <span className="stat-num">{papersCard.count}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">⏳ Papers to mark</div>
                  {papersCard.possiblyMarking > 0 && (
                    <div className="stat-label">+{papersCard.possiblyMarking} possibly marking now</div>
                  )}
                </a>
              )}
              {triageCard && (
                <a href="/admin/desk" className="stat-card" style={{ borderLeftColor: '#7c3aed' }}>
                  <div className="stat-top">
                    <span className="stat-num">{triageCard.flagged || triageCard.readyToRelease}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">
                    {triageCard.flagged > 0 ? '🔍 Questions to check' : '📤 Scripts ready to release'}
                  </div>
                  {triageCard.flagged > 0 && triageCard.readyToRelease > 0 && (
                    <div className="stat-label">+{triageCard.readyToRelease} ready to release</div>
                  )}
                </a>
              )}
              {logCard !== null && (
                <a href="/admin/log" className="stat-card" style={{ borderLeftColor: '#0f766e' }}>
                  <div className="stat-top">
                    <span className="stat-num">{logCard}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">✏️ Lessons to log</div>
                </a>
              )}
              {unmarkedCard !== null && (
                <a href="/admin/schedule" className="stat-card" style={{ borderLeftColor: '#b45309' }}>
                  <div className="stat-top">
                    <span className="stat-num">{unmarkedCard}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">❓ Unmarked lessons</div>
                </a>
              )}
              {examGapsCard && (
                <a href="/admin/schedule" className="stat-card" style={{ borderLeftColor: '#d97706' }}>
                  <div className="stat-top">
                    <span className="stat-num">{examGapsCard.count}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">⚠ {examGapsCard.examType} info gaps</div>
                </a>
              )}
              {portalCard && (
                <Link href="/admin/students" className="stat-card" style={{ borderLeftColor: '#0891b2' }}>
                  <div className="stat-top">
                    <span className="stat-num">{portalCard.active7d}</span>
                    <span className="stat-arrow">›</span>
                  </div>
                  <div className="stat-label">📱 active on the portal this week</div>
                  {portalCard.neverSignedIn > 0 && (
                    <div className="stat-label">{portalCard.neverSignedIn} never signed in</div>
                  )}
                </Link>
              )}
            </div>
          )}

          <div className="hub-hint">
            {arrangeMode ? (
              <>Drag tiles into place · <button className="hub-arrange-done" onClick={() => setArrangeMode(false)}>✓ Done</button></>
            ) : 'Drag tiles to rearrange (long-press on phone) · tap to open'}
          </div>
          {/* Home-screen jiggle while arranging. Inline keyframes: the hub's styles are
              global CSS and this animation belongs to this one feature. */}
          <style>{`
            @keyframes hubJiggle { from { transform: rotate(-1.1deg); } to { transform: rotate(1.1deg); } }
            .hub-arrange-done { border: none; background: #16a34a; color: white; border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
          `}</style>

          {/* Launcher grid — drag to rearrange (order saved on this device) */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={rectSortingStrategy}>
              {/* Every fresh press clears the suppress flag, so a drag that emits
                  no trailing click can never block the next genuine tap. */}
              <div className="launcher-grid" onPointerDownCapture={() => { suppressClickRef.current = false; }}>
                {orderedLaunchers.map((launcher, i) => (
                  <SortableLauncherCard
                    key={launcher.href}
                    launcher={launcher}
                    suppressClickRef={suppressClickRef}
                    index={i}
                    arrangeMode={arrangeMode}
                    onLongPress={enterArrange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

        </div>
      </div>
    </>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

type Launcher = { emoji: string; title: string; sub: string; href: string; icon?: ReactNode };

const LAUNCHERS: Launcher[] = [
  { emoji: '📅', title: 'Schedule',  sub: 'Weekly lessons · drag to reschedule', href: '/admin/schedule'  },
  { emoji: '📚', title: 'Question Bank', sub: 'Search 26k questions · whole papers · solutions', href: '/admin/questions' },
  { emoji: '🖼', title: 'Bank Figures', sub: 'Eyeball every bank scan · flag ones to fix', href: '/admin/figures-bank' },
  { emoji: '🤖', title: 'Bot',           sub: 'Metrics · analytics · API usage',     href: '/admin/bot'          },
  { emoji: '💰', title: 'Invoices',  sub: 'Generate · send · track payments',     href: '/admin/invoices'  },
  { emoji: '📨', title: 'Email Log',     sub: 'All sent invoices & receipts',               href: '/admin/emails'       },
  { emoji: '✏️', title: 'Log lessons',   sub: 'Write up the day in one tap each',      href: '/admin/log'          },
  { emoji: '🎯', title: 'Lesson prep',   sub: 'One card per student · today at a glance', href: '/admin/prep'      },
  { emoji: '📬', title: 'Parent Digests', sub: 'Weekly · monthly · term drafts',       href: '/admin/digests'      },
  { emoji: '🩺', title: 'Ops',           sub: 'Every job & queue · last run · alarms', href: '/admin/ops'          },
  // 🖊 The marking desk is the front door for everything after marking (2 Sep
  // 2026, SPEC-MARKING-DESK.md): the old triage + papers-library tiles fold into
  // it and stay reachable from its "Other views" row. Mark a paper stays — it is
  // where a paper enters, not where it is looked at.
  { emoji: '🖊', title: 'Marking desk', sub: 'Marked papers → vet script + sheet → Approve & release', href: '/admin/desk' },
  { emoji: '🖨️', title: 'Notes',     sub: 'Print revision notes · AirPrint',      href: '/admin/notes'     },
  { emoji: '✍️', title: 'Mark a paper',   sub: 'Question PDF + working photos → marks', href: '/admin/mark-paper'  },
  { emoji: '🎯', title: 'Game Plans',      sub: 'Per-student plans from marked papers · review & activate', href: '/admin/remediation' },
  { emoji: '🔎', title: 'Practice checks', sub: 'Spot-check portal practice grades',     href: '/admin/practice-checks' },
  { emoji: '🎯', title: 'Trap review',     sub: 'Approve the traps students get told about', href: '/admin/pitfalls' },
  { emoji: '📄', title: 'Prelim Builder', sub: 'Assemble full papers from the blueprint', href: '/admin/prelim-builder' },
  { emoji: '📝', title: 'Print a paper', sub: 'Student self-serve mock / topic / weak-spot papers', href: '/app/print' },
  { emoji: '⚡', title: 'Revision Decks', sub: 'Quick recall · worked examples by topic', href: '/revise/am' },
  { emoji: '🖥️', title: 'Kiosk control', sub: 'Open / close the centre kiosk', href: '/admin/kiosk' },
  { emoji: '🧾', title: 'Kiosk (student view)', sub: 'QR sign-in · print worksheets & notes', href: '/kiosk' },
  { emoji: '🗒️', title: 'Topic Cards', sub: 'Worksheet notes · edit & approve', href: '/admin/topic-cards' },
  { emoji: '🖼️', title: 'Figure review', sub: 'Flag figures to regenerate', href: '/admin/figures' },
  { emoji: '👤', title: 'Students', sub: 'Profiles · attendance · slots', href: '/admin/students' },
  { emoji: '📊', title: 'Exams', sub: 'Dates · topics · results', href: '/admin/exams' },
  { emoji: '📌', title: 'Follow-ups',      sub: 'Parent promises · daily 8am digest', href: '/admin/followups' },
  { emoji: '🖊️', title: 'Red Pen Playbook', sub: 'Positioning · ready-to-send marketing kit', href: 'https://claude.ai/code/artifact/c1d32aba-b358-4163-91ff-9f74af679468' },
  { emoji: '⏳', title: 'Waitlist',        sub: 'Prospects · auto-alert on slot opening', href: '/admin/waitlist' },
  { emoji: '📥', title: 'Question Proposals', sub: 'Questions the sheets wrote — vet before the bank', href: '/admin/question-proposals' },
  { emoji: '📝', title: 'My To-Dos',       sub: 'Personal — things I need to do',       href: '/admin/my-todos' },
  { emoji: '🔁', title: 'Loop Tasks',      sub: 'Build-test-fix /loop queue for Claude', href: '/admin/todo' },
  { emoji: '📏', title: 'Grading Rubrics', sub: 'The standard Solo marks against',       href: '/admin/rubrics' },
  { emoji: '📐', title: 'Math Tools',      sub: 'Interactive visualisers · graphs · drills', href: '/tools' },
  { emoji: '🧮', title: 'TI-84',           sub: 'TI-84 CE · graphing calculator',      href: '/calculator?real=1', icon: CalcIcon },
  { emoji: '🧮', title: 'Casio fx-97SG X',  sub: 'ClassWiz · scientific calculator',     href: '/calculator/casio', icon: CasioIcon },
  { emoji: '🎓', title: 'Teaching decks',  sub: 'Multi-topic teaching decks · PDF',    href: '/admin/lessons'       },
  // Tiles removed 2026-08-26 (Adrian's cull; pages stay URL-reachable, revive
  // by re-adding the entry): Flashcard decks (/admin/cards-preview — Revision
  // Decks is the kept door), Worksheet Builder (QB basket + skills cover it),
  // Learn Review + Learn student view (hidden until the full-portal switch),
  // Revision Sign-ups + June Revision (seasonal — restore next April), and
  // At a glance /admin/status (the hub's own cards superseded it).
  { emoji: '📣', title: 'Marketing Calendar', sub: 'Post ideas vs SG exam calendar', href: '/admin/calendar-marketing-post' },
  { emoji: '🩺', title: 'Bank Health', sub: 'QB coverage · gaps · flagged questions', href: '/admin/bank-health' },
  { emoji: '🧭', title: 'Curriculum', sub: 'Strategy layer · dependency graph', href: '/admin/curriculum' },
  // Last on purpose (2026-09-02): a saved tile order appends unknown hrefs at the
  // end, so a new tile lands at the bottom on every device either way.
  { emoji: '⚖️', title: 'Calibration', sub: 'AI marks vs the human standard · gate per subject', href: '/admin/calibration' },
  { emoji: '📘', title: 'Mark schemes', sub: 'schemes you attached, kept for the next hand-in of that paper', href: '/admin/schemes' },
];

// ── Custom launcher order (drag-to-arrange, per-device) ─────────────────────────
// Single admin, no server-side profile store, so the arrangement lives in
// localStorage — same approach as the schedule view-mode preference. `href` is
// the stable id (every launcher's is unique). The saved list is reconciled
// against the live LAUNCHERS on every load so tiles added/removed in code still
// appear (new ones append to the end) and stale hrefs drop out.
const HUB_ORDER_KEY = 'admin_hub_order_v1';

function loadHubOrder(): string[] {
  const allHrefs = LAUNCHERS.map(l => l.href);
  if (typeof window === 'undefined') return allHrefs;
  try {
    const saved = JSON.parse(localStorage.getItem(HUB_ORDER_KEY) || '[]');
    if (!Array.isArray(saved)) return allHrefs;
    const known = new Set(allHrefs);
    const valid = saved.filter((h: unknown): h is string => typeof h === 'string' && known.has(h));
    const missing = allHrefs.filter(h => !valid.includes(h)); // new launchers → append
    return [...valid, ...missing];
  } catch {
    return allHrefs;
  }
}

function saveHubOrder(order: string[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HUB_ORDER_KEY, JSON.stringify(order)); } catch { /* best-effort */ }
}

// One draggable launcher tile. Module-level (not inline) so its useSortable hook
// keeps a stable identity across the parent's re-renders. A plain tap still
// navigates: the sensors only start a drag past an 8px move (mouse) or a 500ms
// hold (touch); when a real drag happened, `suppressClickRef` cancels the
// trailing synthetic click so we don't navigate on drop.
function SortableLauncherCard({ launcher, suppressClickRef, index, arrangeMode, onLongPress }: {
  launcher: Launcher;
  suppressClickRef: RefObject<boolean>;
  index: number;
  arrangeMode: boolean;
  onLongPress: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: launcher.href });
  // Long-press-to-enter-arrange detection, on POINTER events with pointerType 'touch'
  // (iOS Safari 13+ fires them; a mouse never enters jiggle mode — desktop drags
  // directly). Runs only OUTSIDE arrange mode; a move of more than ~10px (a scroll) or
  // lifting the finger cancels it. The press that arms the mode cannot itself drag
  // (Safari fixed touch-action at gesture start) — the user lifts and drags on the
  // next touch, exactly like home-screen icons. COMPOSED with dnd-kit's own
  // onPointerDown rather than spread over it: overriding it would kill mouse drag.
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const cancelLp = () => { if (lpTimer.current) clearTimeout(lpTimer.current); lpTimer.current = null; lpStart.current = null; };
  const dndPointerDown = (listeners as Record<string, (e: React.PointerEvent) => void> | undefined)?.onPointerDown;
  const pressProps = {
    onPointerDown: (e: React.PointerEvent) => {
      dndPointerDown?.(e);
      if (arrangeMode || e.pointerType !== 'touch') return;
      cancelLp();
      lpStart.current = { x: e.clientX, y: e.clientY };
      lpTimer.current = setTimeout(() => { lpTimer.current = null; onLongPress(); }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = lpStart.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelLp();
    },
    onPointerUp: cancelLp,
    onPointerCancel: cancelLp,
  };
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 20 : undefined,
    // Arrange mode owns the gesture outright; otherwise the page must stay scrollable.
    touchAction: arrangeMode ? 'none' : 'manipulation',
    ...(arrangeMode && !isDragging ? { animation: `hubJiggle 0.32s ease-in-out ${(index % 3) * 0.09}s infinite alternate` } : {}),
  };
  return (
    <a
      ref={setNodeRef}
      style={style}
      href={launcher.href}
      className={`launcher-card${isDragging ? ' dragging' : ''}`}
      onClick={e => {
        // In arrange mode tiles never navigate — tap Done to leave.
        if (arrangeMode || suppressClickRef.current) { e.preventDefault(); suppressClickRef.current = false; }
      }}
      {...attributes}
      {...listeners}
      {...pressProps}
    >
      <div className="launcher-emoji">{launcher.icon ?? launcher.emoji}</div>
      <div className="launcher-title">{launcher.title}</div>
      <div className="launcher-sub">{launcher.sub}</div>
    </a>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const loginCSS = `
.hub-login-wrap {
  min-height: 100vh;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.hub-login-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  padding: 32px 28px;
  text-align: center;
}
.hub-login-icon { font-size: 40px; margin-bottom: 12px; }
.hub-login-card h1 {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}
.hub-login-card p {
  font-size: 13px;
  color: #9ca3af;
  margin: 0 0 24px;
}
.hub-pw-input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 10px;
  color: #111;
}
.hub-pw-input:focus { border-color: #1e3a5f; }
.hub-pw-error { font-size: 13px; color: #ef4444; margin-bottom: 10px; }
.hub-pw-btn {
  width: 100%;
  background: #1e3a5f;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 13px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.hub-pw-btn:disabled { opacity: 0.45; cursor: default; }
`;

const hubCSS = `
.hub-wrap {
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: 32px;
}
.hub-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.hub-header-inner {
  max-width: 620px;
  margin: 0 auto;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hub-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}
.hub-reset {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.1s;
}
.hub-reset:hover { background: #f3f4f6; color: #374151; }
.hub-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 10px;
  padding-left: 2px;
}
.hub-refresh {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 8px;
}
.hub-refresh:hover { background: #f3f4f6; color: #374151; }
.hub-refresh:disabled { opacity: 0.4; cursor: default; }
.hub-refresh-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s;
}
.hub-refresh-icon.spinning {
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.hub-body {
  max-width: 620px;
  margin: 0 auto;
  padding: 16px;
}

/* Status strip */
.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}
.stat-card {
  display: block;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #9ca3af;
  border-radius: 12px;
  padding: 14px 14px 12px;
  transition: background 0.1s;
}
.stat-card:active { background: #f9fafb; }
@media (hover: hover) { .stat-card:hover { background: #f9fafb; } }
.stat-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}
.stat-num {
  font-size: 30px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.5px;
  line-height: 1;
}
.stat-arrow {
  font-size: 18px;
  color: #d1d5db;
  line-height: 1;
}
.stat-label {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.3;
}

.stats-error {
  font-size: 13px;
  color: #ef4444;
  text-align: center;
  margin-bottom: 12px;
}
.stats-retry {
  background: none;
  border: none;
  color: #ef4444;
  text-decoration: underline;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

/* Analytics strip */
.analytics-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 11px 14px;
  text-decoration: none;
  color: inherit;
  margin-bottom: 10px;
}
.analytics-strip:hover { background: #f9fafb; }
.analytics-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.analytics-pills {
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}
.analytics-pill {
  display: flex;
  align-items: baseline;
  gap: 3px;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 3px 8px;
}
.analytics-pill-val {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a5f;
}
.analytics-pill-lbl {
  font-size: 11px;
  color: #6b7280;
}
.analytics-arrow {
  font-size: 18px;
  color: #9ca3af;
  margin-left: auto;
}

/* Launcher grid */
.launcher-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.launcher-card {
  display: block;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 22px 18px 20px;
  transition: background 0.1s;
}
.launcher-card:active { background: #f9fafb; }
@media (hover: hover) { .launcher-card:hover { background: #f9fafb; } }
.launcher-card { cursor: grab; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.launcher-card.dragging {
  cursor: grabbing;
  box-shadow: 0 10px 24px rgba(17, 24, 39, 0.16);
  border-color: #cbd5e1;
}
.launcher-emoji {
  font-size: 36px;
  margin-bottom: 12px;
  line-height: 1;
}
.launcher-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}
.launcher-sub {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}
`;
