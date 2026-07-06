'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

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

  useEffect(() => {
    // Preferred: signed httpOnly session (lib/admin-session.ts). The helper
    // bootstrap-upgrades a legacy raw-password cookie to a session and expires
    // the plaintext cookie (it held the actual admin password — see the
    // 2026-07-06 security audit).
    ensureAdminSession().then(ok => { if (ok) setAuthed(true); });
  }, []);

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
              <input
                type="password"
                className="hub-pw-input"
                placeholder="Admin password"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError(''); }}
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
  return (
    <>
      <style>{hubCSS}</style>
      <div className="hub-wrap">

        {/* Header */}
        <div className="hub-header">
          <div className="hub-header-inner">
            <span className="hub-title">Admin</span>
          </div>
        </div>

        <div className="hub-body">

          {/* Launcher grid */}
          <div className="launcher-grid">
            {LAUNCHERS.map(({ emoji, title, sub, href, icon }) => (
              <a key={href} href={href} className="launcher-card">
                <div className="launcher-emoji">{icon ?? emoji}</div>
                <div className="launcher-title">{title}</div>
                <div className="launcher-sub">{sub}</div>
              </a>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const LAUNCHERS: { emoji: string; title: string; sub: string; href: string; icon?: ReactNode }[] = [
  { emoji: '📅', title: 'Schedule',  sub: 'Weekly lessons · drag to reschedule', href: '/admin/schedule'  },
  { emoji: '🤖', title: 'Bot',           sub: 'Metrics · analytics · API usage',     href: '/admin/bot'          },
  { emoji: '💰', title: 'Invoices',  sub: 'Generate · send · track payments',     href: '/admin/invoices'  },
  { emoji: '📨', title: 'Email Log',     sub: 'All sent invoices & receipts',               href: '/admin/emails'       },
  { emoji: '🖨️', title: 'Notes',     sub: 'Print revision notes · AirPrint',      href: '/admin/notes'     },
  { emoji: '✍️', title: 'Mark a paper',   sub: 'Question PDF + working photos → marks', href: '/admin/mark-paper'  },
  { emoji: '👤', title: 'Students', sub: 'Profiles · attendance · slots', href: '/admin/students' },
  { emoji: '📋', title: 'Revision Sign-ups', sub: 'June 2026 sprint · track responses', href: '/admin/revision-signups' },
  { emoji: '🏖️', title: 'June Revision', sub: 'Published schedules · JC2 · Sec 4', href: '/admin/june-revision' },
  { emoji: '📊', title: 'At a glance',     sub: 'Status · todos · invoices · students', href: '/admin/status' },
  { emoji: '✅', title: 'To-Do',           sub: 'Build-test-fix loop task list',        href: '/admin/todo' },
  { emoji: '📏', title: 'Grading Rubrics', sub: 'The standard Solo marks against',       href: '/admin/rubrics' },
  { emoji: '📐', title: 'Math Tools',      sub: 'Interactive visualisers · graphs · drills', href: '/tools' },
  { emoji: '🧮', title: 'TI-84',           sub: 'TI-84 CE · graphing calculator',      href: '/calculator', icon: CalcIcon },
  { emoji: '🧮', title: 'Casio fx-97SG X',  sub: 'ClassWiz · scientific calculator',     href: '/calculator/casio', icon: CasioIcon },
  { emoji: '🎓', title: 'Teaching decks',  sub: 'Multi-topic teaching decks · PDF',    href: '/admin/lessons'       },
  { emoji: '📚', title: 'Flashcard decks', sub: 'Browse swipe decks · level → topic', href: '/admin/cards-preview' },
  { emoji: '📣', title: 'Marketing Calendar', sub: 'Post ideas vs SG exam calendar', href: '/admin/calendar-marketing-post' },
  { emoji: '🩺', title: 'Bank Health', sub: 'QB coverage · gaps · flagged questions', href: '/admin/bank-health' },
];

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
