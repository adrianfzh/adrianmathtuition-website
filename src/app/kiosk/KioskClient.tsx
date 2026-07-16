'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import QRCode from 'qrcode';
import 'katex/dist/katex.min.css';
import PasswordInput from '@/components/PasswordInput';

// Reuse the practice page's markdown+LaTeX stack.
const REMARK = [remarkMath, remarkGfm];
// Notes cards: soft newlines become real line breaks, so each fact in a
// formula box sits on its own line (Adrian 2026-07-17 — no prose walls).
const REMARK_CARD = [remarkMath, remarkGfm, remarkBreaks];
const REHYPE = [rehypeRaw, rehypeKatex];

// Tutor palette.
const NAVY = '#1c3a5e';
const CREAM = 'hsl(45,100%,96%)';
const GOLD = '#E7A417';
const ANSWER_ORANGE = '#843C0C'; // STYLE.md practice-answer colour

// Practice level tokens (KIOSK_LEVELS in src/lib/kiosk-session.ts). The student's
// pairing token decides which of these are visible — the kiosk is hard-locked.
const LEVELS: { key: string; label: string }[] = [
  { key: 'S1', label: 'Sec 1' },
  { key: 'S2', label: 'Sec 2' },
  { key: 'EM', label: 'E Math' },
  { key: 'AM', label: 'A Math' },
  { key: 'JC2', label: 'H2 Math' },
];

// Notes exist for more levels than practice (S1/S2 too). Slugs match
// NOTE_SLUG_TO_LEVELS in src/lib/notes-list.ts.
const NOTE_LEVELS: { key: string; label: string }[] = [
  { key: 's1', label: 'Sec 1' },
  { key: 's2', label: 'Sec 2' },
  { key: 'em', label: 'E Math' },
  { key: 'am', label: 'A Math' },
  { key: 'jc', label: 'H2 Math' },
];

const COUNTS = [5, 8, 12, 15];
const IDLE_RESET_MS = 5 * 60 * 1000; // student session UI resets after 5 min idle

// Difficulty tiers. 'mixed' (default) sends no tier filter → draws from the whole
// verified pool; the others map onto questions.difficulty (see lib/practice-tiers).
type TierChoice = 'basic' | 'standard' | 'advanced' | 'mixed';
const TIER_CHOICES: { key: TierChoice; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'mixed', label: 'Mixed' },
];

type Topic = { topic: string; count: number };
type WsQuestion = { id: string; markdown: string; marks: number | null; figureUrl?: string | null; imageUrls?: string[]; answer?: string | null };
type WsCard = { title: string; contentMd: string; status: string };
type Worksheet = { title: string; level: string; topic: string; tier?: string; card?: WsCard | null; questions: WsQuestion[] };

// STYLE.md branded header: grey LEVEL • SUBJECT token per level.
const WS_LEVEL_LABEL: Record<string, string> = {
  S1: 'SEC 1 • MATH', S2: 'SEC 2 • MATH',
  EM: 'O LEVEL • EM', AM: 'O LEVEL • AM', JC2: 'JC • H2 MATH',
};
// Working space when a question has no per-part spacers (stem-only questions):
// same calibration as lib/kiosk-worksheet-images spaceMm (14mm/mark, 30–84mm).
function wsSpaceMm(marks: number | null): number {
  return Math.min(84, Math.max(30, (marks ?? 3) * 14));
}

type AuthState = 'checking' | 'setup' | 'ready';
type Student = {
  id: string;
  name: string;
  level: string;
  entitlements: { practice: string[]; notes: string[] };
};
type Pairing = { code: string; waUrl: string | null; expiresAt: string };

export default function KioskClient() {
  const [auth, setAuth] = useState<AuthState>('checking');

  // Setup card
  const [password, setPassword] = useState('');
  const [setupErr, setSetupErr] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);

  // Kiosk open/closed (master switch + hours). null = still checking.
  const [openState, setOpenState] = useState<{ open: boolean; admin: boolean; adminBypass: boolean; nextOpen: string | null } | null>(null);

  // ── Student session (QR pairing) ─────────────────────────────────────
  const [student, setStudent] = useState<Student | null>(null);
  const studentTokenRef = useRef<string | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairErr, setPairErr] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [printsUsed, setPrintsUsed] = useState<{ used: number; remaining: number } | null>(null);

  // Mode: quick practice worksheet (default) or browse/print notes.
  const [mode, setMode] = useState<'practice' | 'notes'>('practice');

  // Notes browser
  const [noteLevel, setNoteLevel] = useState<string>('am');
  const [notes, setNotes] = useState<{ id: string; title: string; pdfUrl: string }[] | null>(null);
  const [notesBusy, setNotesBusy] = useState(false);

  // Picker
  const [level, setLevel] = useState<string>('AM');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [topicsErr, setTopicsErr] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [count, setCount] = useState(8);
  const [tier, setTier] = useState<TierChoice>('mixed');

  // Print
  const [printing, setPrinting] = useState(false);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  // Type A revision worksheet: prepend the topic's notes/formula card as page 1.
  const [withCard, setWithCard] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const isAdmin = !!openState?.admin;
  // A student session (or admin) unlocks the pickers.
  const unlocked = isAdmin || !!student;

  // Levels this session may see (admin sees everything).
  const visibleLevels = isAdmin ? LEVELS : LEVELS.filter((l) => student?.entitlements.practice.includes(l.key));
  const visibleNoteLevels = isAdmin ? NOTE_LEVELS : NOTE_LEVELS.filter((l) => student?.entitlements.notes.includes(l.key));

  // Headers for content fetches — carries the signed student token when present.
  const contentHeaders = useCallback((): HeadersInit => {
    const t = studentTokenRef.current;
    return t ? { 'x-kiosk-student': t } : {};
  }, []);

  const endStudentSession = useCallback(() => {
    setStudent(null);
    studentTokenRef.current = null;
    setPairing(null);
    setQrDataUrl(null);
    setPrintsUsed(null);
    setSelectedTopic(null);
    setWorksheet(null);
  }, []);

  // ── Auth check on mount ──────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch('/api/kiosk/session?auth=check')
      .then((r) => (alive ? setAuth(r.ok ? 'ready' : 'setup') : null))
      .catch(() => alive && setAuth('setup'));
    return () => {
      alive = false;
    };
  }, []);

  // ── Open/closed status (once authorised; re-check every 5 min) ───────
  useEffect(() => {
    if (auth !== 'ready') return;
    let alive = true;
    const check = () => fetch('/api/kiosk/status')
      .then(r => r.json()).then(j => { if (alive) setOpenState({ open: !!j.open, admin: !!j.admin, adminBypass: !!j.adminBypass, nextOpen: j.nextOpen ?? null }); })
      .catch(() => { if (alive) setOpenState({ open: true, admin: false, adminBypass: false, nextOpen: null }); }); // fail open on network error
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [auth]);

  // ── QR pairing: create a code + poll for the WhatsApp claim ──────────
  const needsPairing = auth === 'ready' && !!openState?.open && !unlocked;

  useEffect(() => {
    if (!needsPairing) return;
    let alive = true;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const create = async () => {
      setPairErr('');
      try {
        const r = await fetch('/api/kiosk/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not start pairing');
        if (!alive) return;
        setPairing(j as Pairing);

        if (pollId) clearInterval(pollId);
        pollId = setInterval(async () => {
          try {
            const pr = await fetch(`/api/kiosk/pair?code=${encodeURIComponent(j.code)}`);
            const pj = await pr.json().catch(() => ({}));
            if (!alive) return;
            if (pj.student && pj.token) {
              if (pollId) clearInterval(pollId);
              studentTokenRef.current = pj.token as string;
              setStudent(pj.student as Student);
              setPairing(null);
              setQrDataUrl(null);
            } else if (pj.expired) {
              if (pollId) clearInterval(pollId);
              create(); // stale code → fresh QR
            } else if (pj.unmapped) {
              if (pollId) clearInterval(pollId);
              setPairErr(pj.error || 'This account has no kiosk content yet — tell Adrian.');
            }
          } catch {
            /* transient poll error — keep trying */
          }
        }, 2500);
      } catch (e) {
        if (alive) setPairErr(e instanceof Error ? e.message : 'Could not start pairing');
      }
    };

    create();
    return () => {
      alive = false;
      if (pollId) clearInterval(pollId);
    };
  }, [needsPairing]);

  // Render the QR whenever the pairing changes.
  useEffect(() => {
    if (!pairing?.waUrl) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(pairing.waUrl, { width: 480, margin: 1, color: { dark: NAVY, light: '#ffffff' } })
      .then((url) => alive && setQrDataUrl(url))
      .catch(() => alive && setQrDataUrl(null));
    return () => {
      alive = false;
    };
  }, [pairing]);

  // ── Idle reset: any 5-min gap in touches ends the student session ────
  useEffect(() => {
    if (!student) return;
    let timer = setTimeout(endStudentSession, IDLE_RESET_MS);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(endStudentSession, IDLE_RESET_MS);
    };
    window.addEventListener('pointerdown', bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
    };
  }, [student, endStudentSession]);

  // ── Defaults follow the entitlement set when a student pairs ─────────
  useEffect(() => {
    if (!student) return;
    const p = student.entitlements.practice;
    const n = student.entitlements.notes;
    if (p.length > 0) {
      setMode('practice');
      setLevel(p[0]);
    } else {
      setMode('notes'); // lower sec: notes only
    }
    if (n.length > 0) setNoteLevel(n[0]);
    // Pull the day's print usage for the indicator.
    fetch('/api/kiosk/print-log', { headers: contentHeaders() })
      .then((r) => r.json())
      .then((j) => setPrintsUsed({ used: j.used ?? 0, remaining: j.remaining ?? 0 }))
      .catch(() => setPrintsUsed(null));
  }, [student, contentHeaders]);

  // ── Fetch topics whenever level changes (once unlocked) ──────────────
  const loadTopics = useCallback(async (lvl: string) => {
    setTopicsBusy(true);
    setTopicsErr('');
    try {
      const r = await fetch(`/api/kiosk/topics?level=${encodeURIComponent(lvl)}`, { headers: contentHeaders() });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.studentRequired) {
        endStudentSession(); // token expired server-side → back to the QR screen
        return;
      }
      if (!r.ok) throw new Error(j.error || 'Could not load topics');
      setTopics(Array.isArray(j.topics) ? j.topics : []);
    } catch (e) {
      setTopics([]);
      setTopicsErr(e instanceof Error ? e.message : 'Could not load topics');
    } finally {
      setTopicsBusy(false);
    }
  }, [contentHeaders, endStudentSession]);

  useEffect(() => {
    if (auth !== 'ready' || !unlocked) return;
    setSelectedTopic(null);
    loadTopics(level);
  }, [auth, unlocked, level, loadTopics]);

  // ── Fetch notes whenever the notes level changes (in notes mode) ─────
  useEffect(() => {
    if (auth !== 'ready' || !unlocked || mode !== 'notes') return;
    let alive = true;
    setNotesBusy(true);
    fetch(`/api/kiosk/notes?level=${encodeURIComponent(noteLevel)}`, { headers: contentHeaders() })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive) setNotes(Array.isArray(j.notes) ? j.notes : []); })
      .catch(() => { if (alive) setNotes([]); })
      .finally(() => { if (alive) setNotesBusy(false); });
    return () => { alive = false; };
  }, [auth, unlocked, mode, noteLevel, contentHeaders]);

  // ── Print once the worksheet DOM is committed ────────────────────────
  useEffect(() => {
    if (!worksheet) return;
    // Two RAFs → KaTeX/layout settled before the AirPrint sheet opens.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        setPrinting(false);
      })
    );
    return () => cancelAnimationFrame(id);
  }, [worksheet]);

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupBusy(true);
    setSetupErr('');
    try {
      const r = await fetch('/api/kiosk/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setSetupErr('Incorrect password.');
        return;
      }
      setPassword('');
      setAuth('ready');
    } catch {
      setSetupErr('Something went wrong. Try again.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function print() {
    if (!selectedTopic) return;
    setPrinting(true);
    try {
      // 1. Gate + log against the daily cap (students only; admin passes).
      const gate = await fetch('/api/kiosk/print-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...contentHeaders() },
        body: JSON.stringify({ level, topic: selectedTopic, tier, count }),
      });
      const gj = await gate.json().catch(() => ({}));
      if (gate.status === 401 && gj.studentRequired) {
        endStudentSession();
        return;
      }
      if (!gate.ok) {
        showToast(gj.error || 'Could not print');
        if (gj.capReached) setPrintsUsed({ used: gj.used ?? 4, remaining: 0 });
        setPrinting(false);
        return;
      }
      if (typeof gj.used === 'number') setPrintsUsed({ used: gj.used, remaining: gj.remaining ?? 0 });

      // 2. Build the sheet — answers ALWAYS included (printed inline per question).
      const url = `/api/kiosk/worksheet?level=${encodeURIComponent(level)}&topic=${encodeURIComponent(
        selectedTopic
      )}&count=${count}&tier=${tier}&answers=1${withCard ? '&card=1' : ''}`;
      const r = await fetch(url, { headers: contentHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not build worksheet');
      if (!j.questions?.length) {
        showToast('No questions available for this topic yet.');
        setPrinting(false);
        return;
      }
      if (withCard && !j.card) showToast('No revision notes for this topic yet — printing practice only.');
      setWorksheet(j as Worksheet);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not build worksheet');
      setPrinting(false);
    }
  }

  const dateStr = new Date().toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });

  const firstName = (student?.name || '').split(/\s+/)[0] || '';

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* ── Screen chrome (hidden when printing) ── */}
      <div className="no-print kiosk-root">
        {auth === 'checking' && <div className="centered muted">Loading…</div>}

        {auth === 'setup' && (
          <div className="centered">
            <form className="setup-card" onSubmit={submitSetup}>
              <div className="setup-badge">AdrianMath</div>
              <h1>Set up this iPad</h1>
              <p className="muted">
                Enter the admin password once to authorise this device. Students then sign in by
                scanning the kiosk QR with WhatsApp.
              </p>
              <PasswordInput
                inputMode="text"
                autoComplete="current-password"
                placeholder="Admin password"
                value={password}
                onChange={setPassword}
                aria-label="Admin password"
              />
              {setupErr && <div className="err">{setupErr}</div>}
              <button type="submit" className="btn-primary" disabled={setupBusy || !password}>
                {setupBusy ? 'Checking…' : 'Authorise device'}
              </button>
            </form>
          </div>
        )}

        {auth === 'ready' && openState && !openState.open && (
          <div className="picker" style={{ textAlign: 'center', paddingTop: 60 }}>
            <div className="brand">AdrianMath Tuition</div>
            <div style={{ fontSize: 64, margin: '24px 0' }}>🌙</div>
            <h1 style={{ color: '#1c3a5e', fontSize: 30, margin: '0 0 10px' }}>Centre closed</h1>
            <p style={{ color: '#66788d', fontSize: 18 }}>
              {openState.nextOpen ? <>Come back <strong>{openState.nextOpen}</strong>.</> : 'Please come back during opening hours.'}
            </p>
          </div>
        )}

        {/* ── PAIRING SCREEN: scan with WhatsApp to start ── */}
        {auth === 'ready' && openState && openState.open && !unlocked && (
          <div className="centered">
            <div className="pair-card">
              <div className="brand">AdrianMath Tuition</div>
              <h1 className="pair-title">Scan to start</h1>
              <p className="pair-sub">
                Open your phone camera, scan the code, then tap <strong>Send</strong> in WhatsApp.
              </p>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="WhatsApp pairing QR code" className="pair-qr" />
              ) : pairing && !pairing.waUrl ? (
                <div className="pair-fallback">
                  <p>WhatsApp <strong>KIOSK-{pairing.code}</strong><br />to the AdrianMath number to sign in.</p>
                  <p className="muted" style={{ fontSize: 13 }}>(QR unavailable — KIOSK_WA_NUMBER not configured)</p>
                </div>
              ) : (
                <div className="pair-qr pair-qr-loading">Generating…</div>
              )}
              {pairing && <div className="pair-code">Code: KIOSK-{pairing.code}</div>}
              {pairErr && <div className="err" style={{ marginTop: 10 }}>{pairErr}</div>}
              <p className="pair-hint muted">Waiting for your WhatsApp message…</p>
            </div>
          </div>
        )}

        {/* ── MAIN UI (student paired, or admin) ── */}
        {auth === 'ready' && openState && openState.open && unlocked && (
          <div className="picker">
            {openState.adminBypass && (
              <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', color: '#7a5b00', borderRadius: 10, padding: '8px 12px', margin: '0 0 12px', fontSize: 13, textAlign: 'center' }}>
                ⚠ Kiosk is closed to students — you're viewing it as admin.
              </div>
            )}

            {student && (
              <div className="greet-bar">
                <div className="greet-who">
                  👋 Hi <strong>{firstName}</strong>
                  <span className="greet-level">{student.level}</span>
                  {printsUsed && (
                    <span className="greet-prints">{printsUsed.used}/4 prints today</span>
                  )}
                </div>
                <button className="greet-done" onClick={endStudentSession}>Done ✓</button>
              </div>
            )}

            <header className="picker-head">
              <div className="brand">AdrianMath Tuition</div>
              <div className="brand-sub">{mode === 'notes' ? 'Open and print revision notes' : 'Print a practice worksheet'}</div>
            </header>

            {/* Mode toggle — only when the student has both surfaces */}
            {(isAdmin || (visibleLevels.length > 0 && visibleNoteLevels.length > 0)) && (
              <div className="segmented" role="tablist" aria-label="Mode" style={{ marginBottom: 14 }}>
                <button role="tab" aria-selected={mode === 'practice'}
                  className={`seg ${mode === 'practice' ? 'seg-on' : ''}`}
                  onClick={() => { setMode('practice'); setSelectedTopic(null); }}>
                  ✏️ Practice
                </button>
                <button role="tab" aria-selected={mode === 'notes'}
                  className={`seg ${mode === 'notes' ? 'seg-on' : ''}`}
                  onClick={() => setMode('notes')}>
                  📄 Notes
                </button>
              </div>
            )}

            {/* ── NOTES MODE ── */}
            {mode === 'notes' && (
              <>
                {visibleNoteLevels.length > 1 && (
                  <div className="segmented" role="tablist" aria-label="Notes level">
                    {visibleNoteLevels.map((l) => (
                      <button key={l.key} role="tab" aria-selected={noteLevel === l.key}
                        className={`seg ${noteLevel === l.key ? 'seg-on' : ''}`}
                        onClick={() => setNoteLevel(l.key)}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
                <section className="topics-wrap">
                  {notesBusy && <div className="muted pad">Loading notes…</div>}
                  {!notesBusy && notes && notes.length === 0 && (
                    <div className="muted pad">No notes for this level yet.</div>
                  )}
                  <div className="topic-grid">
                    {(notes ?? []).map((n) => (
                      <button key={n.id} className="topic-tile" onClick={() => window.open(n.pdfUrl, '_blank')}>
                        <span className="topic-name">{n.title}</span>
                        <span className="topic-count">Tap to open · print</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* ── PRACTICE MODE ── */}
            {mode === 'practice' && (<>
            {/* Level segmented control — hidden when the student has exactly one level */}
            {visibleLevels.length > 1 && (
              <div className="segmented" role="tablist" aria-label="Level">
                {visibleLevels.map((l) => (
                  <button
                    key={l.key}
                    role="tab"
                    aria-selected={level === l.key}
                    className={`seg ${level === l.key ? 'seg-on' : ''}`}
                    onClick={() => setLevel(l.key)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}

            {/* Topic grid */}
            {!selectedTopic && (
              <section className="topics-wrap">
                {topicsBusy && <div className="muted pad">Loading topics…</div>}
                {topicsErr && <div className="err pad">{topicsErr}</div>}
                {!topicsBusy && !topicsErr && topics.length === 0 && (
                  <div className="muted pad">No topics available for this level yet.</div>
                )}
                <div className="topic-grid">
                  {topics.map((t) => (
                    <button key={t.topic} className="topic-tile" onClick={() => setSelectedTopic(t.topic)}>
                      <span className="topic-name">{t.topic}</span>
                      <span className="topic-count">{t.count}+ questions</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Options panel */}
            {selectedTopic && (
              <section className="options">
                <button className="back" onClick={() => setSelectedTopic(null)}>
                  ← Back to topics
                </button>
                <div className="opt-topic">{selectedTopic}</div>

                <div className="opt-block">
                  <div className="opt-label">Worksheet type</div>
                  <div className="tier-row">
                    <button
                      className={`tier-btn ${!withCard ? 'tier-on' : ''}`}
                      onClick={() => setWithCard(false)}
                    >
                      ✏️ Practice only
                    </button>
                    <button
                      className={`tier-btn ${withCard ? 'tier-on' : ''}`}
                      onClick={() => setWithCard(true)}
                    >
                      📘 Notes + practice
                    </button>
                  </div>
                </div>

                <div className="opt-block">
                  <div className="opt-label">Difficulty</div>
                  <div className="tier-row">
                    {TIER_CHOICES.map((t) => (
                      <button
                        key={t.key}
                        className={`tier-btn ${tier === t.key ? 'tier-on' : ''}`}
                        onClick={() => setTier(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="opt-block">
                  <div className="opt-label">How many questions?</div>
                  <div className="count-row">
                    {COUNTS.map((c) => (
                      <button
                        key={c}
                        className={`count-btn ${count === c ? 'count-on' : ''}`}
                        onClick={() => setCount(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="btn-primary big"
                  onClick={print}
                  disabled={printing || (printsUsed?.remaining === 0 && !isAdmin)}
                >
                  {printsUsed?.remaining === 0 && !isAdmin
                    ? 'Daily limit reached'
                    : printing ? 'Preparing…' : 'Print worksheet'}
                </button>
                {student && printsUsed && printsUsed.remaining > 0 && (
                  <div className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
                    {printsUsed.remaining} print{printsUsed.remaining === 1 ? '' : 's'} left today · answers included
                  </div>
                )}
              </section>
            )}
            </>)}
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      {/* ── Printable worksheet (hidden on screen, shown on print) ── */}
      {worksheet && (
        <div className="worksheet">
          <div className="ws-header">
            {/* STYLE.md branded header: brand line + orange rule, grey level token +
                navy TYPE, topic as the big centred title. */}
            <div className="ws-brand">ADRIAN&apos;S MATH TUITION</div>
            <div className="ws-line2">
              <span className="ws-lvl">{WS_LEVEL_LABEL[worksheet.level] ?? worksheet.level}</span>
              <span className="ws-type">{worksheet.card ? 'REVISION WORKSHEET' : 'PRACTICE WORKSHEET'}</span>
            </div>
            <div className="ws-topic">{worksheet.topic}</div>
            <div className="ws-namebar">
              <span>Name: {student ? student.name : '______________________________'}</span>
              <span className="ws-datemeta">{worksheet.tier && worksheet.tier !== 'mixed' ? `${worksheet.tier} · ` : ''}{dateStr}</span>
              <span>Class: ______________</span>
            </div>
          </div>

          {worksheet.card && (
            // Type A: compact revision notes — a section, not a page; questions flow after it.
            <section className="ws-card">
              <div className="ws-card-title">Notes — {worksheet.card.title.replace(/ — Quick Revision$/, '')}</div>
              <div className="ws-card-body">
                <ReactMarkdown remarkPlugins={REMARK_CARD} rehypePlugins={REHYPE}>
                  {worksheet.card.contentMd}
                </ReactMarkdown>
              </div>
              {worksheet.card.status === 'draft' && (
                <div className="ws-card-draft">DRAFT — pending review</div>
              )}
            </section>
          )}

          <ol className="ws-questions">
            {worksheet.questions.map((q, qi) => (
              <li key={q.id} className="ws-q">
                {/* Explicit number (not a CSS ::marker): survives page breaks and
                    figure-first questions — the marker was printing at the answer
                    line on tall questions (Adrian 2026-07-17). */}
                <span className="ws-qnum">{qi + 1}.</span>
                <div className="ws-q-body">
                  {q.figureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.figureUrl} alt="Question figure" className="ws-figure" />
                  )}
                  {(q.imageUrls ?? []).map((u) => (
                    // Watermark-clean original crop (served when no engine figure exists)
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="Question diagram" className="ws-figure" />
                  ))}
                  <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
                    {q.markdown}
                  </ReactMarkdown>
                  {/* Total marks shown right-aligned only when parts don't carry their own. */}
                  {q.marks != null && !q.markdown.includes('ws-mk') && (
                    <span className="ws-mk">[{q.marks}]</span>
                  )}
                </div>
                {/* Stem-only questions get marks-proportional working space; parts
                    already carry their own ws-sp spacers inside the markdown. */}
                {!q.markdown.includes('ws-sp') && (
                  <div className="ws-answer-space" style={{ height: `${wsSpaceMm(q.marks)}mm` }} aria-hidden />
                )}
                {q.answer && (
                  // House style (STYLE.md): one [Ans: …] line closing the question,
                  // AFTER the working space — right-aligned, orange, maths included.
                  <div className="ws-ans-line">
                    <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
                      {`[Ans: ${q.answer}]`}
                    </ReactMarkdown>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="ws-footer">
            <span className="ws-foot-brand">Adrian&apos;s Math Tuition</span>
          </div>
        </div>
      )}
    </>
  );
}

// Screen keeps showing the picker; only .worksheet prints.
const PRINT_CSS = `
:root { --navy:${NAVY}; --cream:${CREAM}; --gold:${GOLD}; }

@media screen {
  .worksheet { display: none; }
  .kiosk-root {
    min-height: 100dvh;
    background: var(--cream);
    color: var(--navy);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .centered { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
  .muted { color: #5b6b7d; }
  .pad { padding: 24px; }
  .err { color: #b91c1c; font-weight: 600; }

  /* Setup card */
  .setup-card {
    width: min(460px, 92vw);
    background: #fff;
    border: 1px solid #e6ddc4;
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 12px 40px rgba(28,58,94,0.12);
    display: flex; flex-direction: column; gap: 16px;
  }
  .setup-badge {
    align-self: flex-start;
    background: var(--navy); color: #fff;
    font-weight: 700; letter-spacing: .02em;
    padding: 6px 14px; border-radius: 999px; font-size: 14px;
  }
  .setup-card h1 { font-size: 28px; font-weight: 800; margin: 0; }
  .setup-card input {
    font-size: 20px; padding: 16px 18px; border-radius: 14px;
    border: 2px solid #d9e0e8; outline: none; width: 100%;
  }
  .setup-card input:focus { border-color: var(--gold); }

  /* Pairing screen */
  .pair-card {
    width: min(520px, 94vw);
    background: #fff; border: 1px solid #e6ddc4; border-radius: 24px;
    padding: 36px 32px; text-align: center;
    box-shadow: 0 12px 40px rgba(28,58,94,0.12);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .pair-title { font-size: 34px; font-weight: 800; margin: 6px 0 0; }
  .pair-sub { font-size: 18px; color: #5b6b7d; margin: 0; }
  .pair-qr {
    width: min(320px, 70vw); height: auto; margin: 10px 0 2px;
    border: 1px solid #e6ddc4; border-radius: 16px; padding: 10px; background: #fff;
  }
  .pair-qr-loading { display: grid; place-items: center; min-height: 260px; color: #5b6b7d; }
  .pair-fallback { font-size: 18px; }
  .pair-code { font-size: 15px; color: #5b6b7d; letter-spacing: .04em; }
  .pair-hint { font-size: 14px; }

  /* Student greeting bar */
  .greet-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: #fff; border: 1px solid #e6ddc4; border-radius: 14px;
    padding: 12px 16px; margin-bottom: 16px;
  }
  .greet-who { font-size: 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .greet-level {
    background: var(--navy); color: #fff; font-size: 13px; font-weight: 700;
    border-radius: 999px; padding: 3px 10px;
  }
  .greet-prints {
    background: #fdf1dc; color: #7a5b00; font-size: 13px; font-weight: 700;
    border-radius: 999px; padding: 3px 10px;
  }
  .greet-done {
    border: 2px solid var(--navy); background: transparent; color: var(--navy);
    font-size: 15px; font-weight: 800; border-radius: 999px; padding: 8px 18px; cursor: pointer;
  }

  /* Picker */
  .picker { max-width: 1100px; margin: 0 auto; padding: 28px 20px 64px; }
  .picker-head { text-align: center; margin-bottom: 24px; }
  .brand { font-size: 30px; font-weight: 800; }
  .brand-sub { font-size: 18px; color: #5b6b7d; margin-top: 4px; }

  .segmented {
    display: flex; gap: 8px; background: #fff; border: 1px solid #e6ddc4;
    border-radius: 999px; padding: 6px; max-width: 620px; margin: 0 auto 28px;
  }
  .seg {
    flex: 1; border: none; background: transparent; cursor: pointer;
    font-size: 20px; font-weight: 700; color: var(--navy);
    padding: 16px 12px; border-radius: 999px; min-height: 60px;
    transition: background .15s, color .15s;
  }
  .seg-on { background: var(--navy); color: #fff; }

  .topic-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .topic-tile {
    text-align: left; cursor: pointer;
    background: #fff; border: 1px solid #e6ddc4; border-radius: 16px;
    padding: 20px; min-height: 104px;
    display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
    transition: transform .08s, box-shadow .15s, border-color .15s;
  }
  .topic-tile:active { transform: scale(.98); }
  .topic-tile:hover { border-color: var(--gold); box-shadow: 0 6px 18px rgba(28,58,94,0.10); }
  .topic-name { font-size: 19px; font-weight: 700; line-height: 1.25; }
  .topic-count { font-size: 14px; color: var(--gold); font-weight: 700; }

  /* Options */
  .options {
    max-width: 620px; margin: 0 auto;
    background: #fff; border: 1px solid #e6ddc4; border-radius: 20px;
    padding: 24px; display: flex; flex-direction: column; gap: 22px;
  }
  .back {
    align-self: flex-start; background: transparent; border: none; cursor: pointer;
    font-size: 17px; font-weight: 700; color: var(--navy); padding: 6px 0;
  }
  .opt-topic { font-size: 24px; font-weight: 800; }
  .opt-label { font-size: 17px; font-weight: 700; margin-bottom: 10px; }
  .count-row { display: flex; gap: 10px; }
  .count-btn {
    flex: 1; min-height: 64px; border-radius: 14px; cursor: pointer;
    border: 2px solid #d9e0e8; background: #fff; color: var(--navy);
    font-size: 22px; font-weight: 800;
  }
  .count-on { border-color: var(--navy); background: var(--navy); color: #fff; }

  .tier-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .tier-btn {
    flex: 1 1 0; min-width: 96px; min-height: 64px; border-radius: 14px; cursor: pointer;
    border: 2px solid #d9e0e8; background: #fff; color: var(--navy);
    font-size: 18px; font-weight: 800;
  }
  .tier-on { border-color: var(--navy); background: var(--navy); color: #fff; }

  .btn-primary {
    border: none; cursor: pointer; background: var(--gold); color: var(--navy);
    font-size: 20px; font-weight: 800; padding: 18px; border-radius: 14px;
    min-height: 60px;
  }
  .btn-primary:disabled { opacity: .55; cursor: default; }
  .btn-primary.big { font-size: 22px; min-height: 72px; }

  .toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: var(--navy); color: #fff; padding: 14px 22px; border-radius: 12px;
    font-size: 17px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.25);
    max-width: 90vw; text-align: center;
  }
}

/* House style (STYLE.md): [Ans: …] closes each question — right-aligned, orange,
   not bold, ENTIRE line orange including the rendered maths. Lives outside
   @media print so the rule is testable; .worksheet is display:none on screen. */
/* Compact notes section (Adrian 2026-07-16: a section, not a page) */
.ws-card { border: 1pt solid ${NAVY}; border-radius: 4px; padding: 6pt 9pt 5pt; margin: 5pt 0 9pt; }
.ws-card-title { font-size: 10pt; font-weight: 700; color: ${NAVY}; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 3pt; }
.ws-card-body { font-size: 9pt; line-height: 1.35; }
.ws-card-body h2 { font-size: 9.5pt; margin: 5pt 0 2pt; border-bottom: 0.75pt solid #bbb; padding-bottom: 1pt; }
.ws-card-body h3 { font-size: 9pt; margin: 4pt 0 2pt; }
.ws-card-body ul, .ws-card-body ol { margin: 2pt 0 3pt 0; padding-left: 13pt; }
.ws-card-body li { margin-bottom: 1.5pt; }
.ws-card-body p { margin: 2pt 0; }
.ws-card-body blockquote { border: 0.9pt solid #111; border-radius: 3px; padding: 3pt 7pt; margin: 3pt 0; }
.ws-card-body blockquote p { margin: 1.5pt 0; }
.ws-card-body table { border-collapse: collapse; margin: 3pt 0; }
.ws-card-body th, .ws-card-body td { border: 0.75pt solid #999; padding: 2pt 6pt; font-size: 8.5pt; }
.ws-card-draft { margin-top: 4pt; text-align: right; color: #b00; font-size: 7.5pt; letter-spacing: .15em; font-weight: 700; }
.ws-ans-line { text-align: right; color: ${ANSWER_ORANGE}; font-weight: 400; margin: 0 0 4pt; }
.ws-ans-line p { display: inline; margin: 0; }
.ws-ans-line .katex { color: ${ANSWER_ORANGE}; }

/* ── Print (house style: Times New Roman, body 9.5pt, marks right-aligned,
      working space apportioned to marks, no ruled lines) ── */
@media print {
  .no-print { display: none !important; }
  .worksheet { display: block; }
  @page { size: A4; margin: 15mm 22mm 13mm; }
  html, body { background: #fff; }

  .worksheet {
    color: #111; font-family: "Times New Roman", Georgia, serif; font-size: 9.5pt; line-height: 1.5;
  }
  /* KaTeX defaults to 1.21em — maths printed ~11.5pt against 9.5pt prose and the
     whole sheet read oversized. Pin maths to the body size. */
  .worksheet .katex { font-size: 1em; }

  /* Branded header (STYLE.md): navy caps brand + orange rule, grey level token,
     navy bold TYPE, big centred topic title. */
  .ws-header { margin-bottom: 8pt; }
  .ws-brand { text-align: center; color: ${NAVY}; font-weight: 700; font-size: 11.5pt; letter-spacing: .3em; border-bottom: 1.1pt solid ${ANSWER_ORANGE}; padding-bottom: 2.5pt; }
  .ws-line2 { text-align: center; margin-top: 3pt; }
  .ws-lvl { color: #6E6E6E; font-size: 8pt; letter-spacing: .2em; }
  .ws-type { color: ${NAVY}; font-weight: 700; font-size: 9.5pt; letter-spacing: .26em; margin-left: 9pt; }
  .ws-topic { text-align: center; font-size: 13.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin: 7pt 0 3pt; }
  .ws-namebar { display: flex; justify-content: space-between; gap: 10pt; font-size: 9pt; margin-top: 4pt; }
  .ws-datemeta { color: #6E6E6E; text-transform: capitalize; }

  /* Explicit numbering (::marker misplaced itself on tall/figure-first questions). */
  .ws-questions { list-style: none; padding-left: 18pt; margin: 0; }
  .ws-q { margin-bottom: 5pt; break-inside: avoid; position: relative; }
  .ws-qnum { position: absolute; left: -18pt; top: 0; font-weight: 700; }
  .ws-q-body { display: block; }
  .ws-q-body p { display: block; margin: 0 0 1.5pt; }
  /* Figures print generously — grids especially must be big enough to plot on. */
  .ws-figure { display: block; max-width: 100%; max-height: 300pt; margin: 5pt 0; }
  .ws-q-body img { display: block; max-width: 100%; max-height: 300pt; margin: 5pt 0; }

  /* Marks right-aligned at the margin, exam style. */
  .ws-mk { float: right; font-weight: 400; }
  /* Working space: blank, no lines; heights set inline (∝ marks). */
  .ws-sp, .ws-answer-space { display: block; }

  .ws-footer {
    margin-top: 10pt; padding-top: 4pt; border-top: 0.75pt solid #999;
    display: flex; justify-content: space-between; font-size: 8pt;
  }
  .ws-footer .ws-foot-brand { color: ${NAVY}; font-weight: 700; letter-spacing: .12em; }
  .ws-footer .ws-foot-url { color: #6E6E6E; }
}
`;
