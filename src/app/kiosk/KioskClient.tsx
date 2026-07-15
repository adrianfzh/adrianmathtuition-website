'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import PasswordInput from '@/components/PasswordInput';

// Reuse the practice page's markdown+LaTeX stack.
const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

// Tutor palette.
const NAVY = '#1c3a5e';
const CREAM = 'hsl(45,100%,96%)';
const GOLD = '#E7A417';

// Fixed level list (ungated kiosk — no student record to scope by). Tokens match
// KIOSK_LEVELS in src/lib/kiosk-session.ts.
const LEVELS: { key: string; label: string }[] = [
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

// Difficulty tiers. 'mixed' (default) sends no tier filter → draws from the whole
// verified pool; the others map onto questions.difficulty (see lib/practice-tiers).
type TierChoice = 'basic' | 'standard' | 'advanced' | 'mixed';
const TIER_CHOICES: { key: TierChoice; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'mixed', label: 'Mixed' },
];

type Topic = { topic: string; count: number };
type WsQuestion = { id: string; markdown: string; marks: number | null; figureUrl?: string | null; answer?: string | null };
type Worksheet = { title: string; level: string; topic: string; questions: WsQuestion[] };

type AuthState = 'checking' | 'setup' | 'ready';

export default function KioskClient() {
  const [auth, setAuth] = useState<AuthState>('checking');

  // Setup card
  const [password, setPassword] = useState('');
  const [setupErr, setSetupErr] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);

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
  const [includeAnswers, setIncludeAnswers] = useState(false);

  // Print
  const [printing, setPrinting] = useState(false);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
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

  // ── Fetch topics whenever level changes (once authorised) ────────────
  const loadTopics = useCallback(async (lvl: string) => {
    setTopicsBusy(true);
    setTopicsErr('');
    try {
      const r = await fetch(`/api/kiosk/topics?level=${encodeURIComponent(lvl)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load topics');
      setTopics(Array.isArray(j.topics) ? j.topics : []);
    } catch (e) {
      setTopics([]);
      setTopicsErr(e instanceof Error ? e.message : 'Could not load topics');
    } finally {
      setTopicsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (auth !== 'ready') return;
    setSelectedTopic(null);
    loadTopics(level);
  }, [auth, level, loadTopics]);

  // ── Fetch notes whenever the notes level changes (in notes mode) ─────
  useEffect(() => {
    if (auth !== 'ready' || mode !== 'notes') return;
    let alive = true;
    setNotesBusy(true);
    fetch(`/api/kiosk/notes?level=${encodeURIComponent(noteLevel)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive) setNotes(Array.isArray(j.notes) ? j.notes : []); })
      .catch(() => { if (alive) setNotes([]); })
      .finally(() => { if (alive) setNotesBusy(false); });
    return () => { alive = false; };
  }, [auth, mode, noteLevel]);

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
      const url = `/api/kiosk/worksheet?level=${encodeURIComponent(level)}&topic=${encodeURIComponent(
        selectedTopic
      )}&count=${count}&tier=${tier}&answers=${includeAnswers ? 1 : 0}`;
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not build worksheet');
      if (!j.questions?.length) {
        showToast('No questions available for this topic yet.');
        setPrinting(false);
        return;
      }
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
                Enter the admin password once to authorise this device. Students can then print
                worksheets without signing in.
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

        {auth === 'ready' && (
          <div className="picker">
            <header className="picker-head">
              <div className="brand">AdrianMath Tuition</div>
              <div className="brand-sub">{mode === 'notes' ? 'Open and print revision notes' : 'Print a practice worksheet'}</div>
            </header>

            {/* Mode toggle */}
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

            {/* ── NOTES MODE ── */}
            {mode === 'notes' && (
              <>
                <div className="segmented" role="tablist" aria-label="Notes level">
                  {NOTE_LEVELS.map((l) => (
                    <button key={l.key} role="tab" aria-selected={noteLevel === l.key}
                      className={`seg ${noteLevel === l.key ? 'seg-on' : ''}`}
                      onClick={() => setNoteLevel(l.key)}>
                      {l.label}
                    </button>
                  ))}
                </div>
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

            {/* ── PRACTICE MODE (unchanged) ── */}
            {mode === 'practice' && (<>
            {/* Level segmented control */}
            <div className="segmented" role="tablist" aria-label="Level">
              {LEVELS.map((l) => (
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

                <label className="toggle-row">
                  <span className="opt-label">Include answer key</span>
                  <input
                    type="checkbox"
                    checked={includeAnswers}
                    onChange={(e) => setIncludeAnswers(e.target.checked)}
                  />
                  <span className={`switch ${includeAnswers ? 'switch-on' : ''}`} aria-hidden />
                </label>

                <button className="btn-primary big" onClick={print} disabled={printing}>
                  {printing ? 'Preparing…' : 'Print worksheet'}
                </button>
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
            <div className="ws-title">AdrianMath Tuition</div>
            <div className="ws-meta">
              <span>{worksheet.title}</span>
              <span>{dateStr}</span>
            </div>
            <div className="ws-namebar">
              <span>Name: ______________________________</span>
              <span>Class: ______________</span>
            </div>
          </div>

          <ol className="ws-questions">
            {worksheet.questions.map((q) => (
              <li key={q.id} className="ws-q">
                <div className="ws-q-body">
                  {q.figureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.figureUrl} alt="Question figure" className="ws-figure" />
                  )}
                  <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
                    {q.markdown}
                  </ReactMarkdown>
                  {q.marks != null && <span className="ws-marks">[{q.marks}]</span>}
                </div>
                <div className="ws-answer-space" aria-hidden />
              </li>
            ))}
          </ol>

          <div className="ws-footer">AdrianMath Tuition · adrianmathtuition.com</div>

          {includeAnswers && worksheet.questions.some((q) => q.answer) && (
            <div className="ws-answers">
              <h2>Answers</h2>
              <ol className="ws-answers-list">
                {worksheet.questions.map((q, i) => (
                  <li key={q.id}>
                    <span className="ws-ans-n">{i + 1}.</span>
                    <span className="ws-ans-body">
                      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
                        {q.answer || '—'}
                      </ReactMarkdown>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="ws-footer">AdrianMath Tuition · adrianmathtuition.com</div>
            </div>
          )}
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

  .toggle-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    cursor: pointer; padding: 6px 0;
  }
  .toggle-row .opt-label { margin: 0; }
  .toggle-row input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch {
    width: 62px; height: 36px; border-radius: 999px; background: #cbd5e1;
    position: relative; transition: background .15s; flex: none;
  }
  .switch::after {
    content: ""; position: absolute; top: 3px; left: 3px;
    width: 30px; height: 30px; border-radius: 50%; background: #fff;
    transition: transform .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3);
  }
  .switch-on { background: var(--gold); }
  .switch-on::after { transform: translateX(26px); }

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

/* ── Print ── */
@media print {
  .no-print { display: none !important; }
  .worksheet { display: block; }
  @page { size: A4; margin: 16mm 14mm; }
  html, body { background: #fff; }

  .worksheet {
    color: #111; font-family: "Times New Roman", Georgia, serif; font-size: 12pt;
  }
  .ws-header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  .ws-title { font-size: 18pt; font-weight: 800; letter-spacing: .01em; }
  .ws-meta { display: flex; justify-content: space-between; font-size: 11pt; margin-top: 4px; }
  .ws-namebar { display: flex; justify-content: space-between; font-size: 11pt; margin-top: 10px; }

  .ws-questions { list-style: decimal; padding-left: 26pt; margin: 0; }
  .ws-q { margin-bottom: 6pt; break-inside: avoid; }
  .ws-q-body { display: block; }
  .ws-q-body p { display: inline; margin: 0; }
  .ws-figure { display: block; max-width: 78%; max-height: 240pt; margin: 6pt 0; }
  .ws-marks { font-weight: 700; margin-left: 6px; }
  .ws-answer-space {
    height: 74pt; margin: 6pt 0 4pt;
    background-image: repeating-linear-gradient(#fff 0 26pt, #bbb 26pt 26.6pt);
  }

  .ws-footer {
    margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #999;
    text-align: center; font-size: 9pt; color: #555;
  }

  .ws-answers { break-before: page; page-break-before: always; }
  .ws-answers h2 { font-size: 15pt; border-bottom: 2px solid #111; padding-bottom: 4pt; }
  .ws-answers-list { list-style: none; padding: 0; margin: 10pt 0 0; }
  .ws-answers-list li { display: flex; gap: 8px; margin-bottom: 6pt; break-inside: avoid; }
  .ws-ans-n { font-weight: 700; }
  .ws-ans-body p { display: inline; margin: 0; }
}
`;
