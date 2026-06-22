'use client';

import { useState, useEffect, useRef } from 'react';

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

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ── Hub page ───────────────────────────────────────────────────────────────────

export default function AdminHub() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');


  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    if (pw) { savedPw.current = pw; verifyAndLogin(pw); }
  }, []);

  async function verifyAndLogin(pw: string) {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin-invoices?auth=check', {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (res.ok) {
        savedPw.current = pw;
        setCookie('admin_pw', pw, 30);
        setAuthed(true);
      } else {
        setAuthError('Incorrect password');
      }
    } catch {
      setAuthError('Connection error');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    await verifyAndLogin(password);
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
            {LAUNCHERS.map(({ emoji, title, sub, href }) => (
              <a key={href} href={href} className="launcher-card">
                <div className="launcher-emoji">{emoji}</div>
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

const LAUNCHERS = [
  { emoji: '👤', title: 'Students', sub: 'Profiles · attendance · slots', href: '/admin/students' },
  { emoji: '📋', title: 'Revision Sign-ups', sub: 'June 2026 sprint · track responses', href: '/admin/revision-signups' },
  { emoji: '📅', title: 'Schedule',  sub: 'Weekly lessons · drag to reschedule', href: '/admin/schedule'  },
  { emoji: '✏️', title: 'Progress',  sub: 'Student history · mastery timeline',   href: '/admin/progress'  },
  { emoji: '💰', title: 'Invoices',  sub: 'Generate · send · track payments',     href: '/admin/invoices'  },
  { emoji: '🖨️', title: 'Notes',     sub: 'Print revision notes · AirPrint',      href: '/admin/notes'     },
  { emoji: '📋', title: 'Attendance',   sub: 'Search student · lesson history',           href: '/admin/attendance'   },
  { emoji: '📊', title: 'API Usage',     sub: 'Cost · token usage · question log',          href: '/admin/analytics'    },
  { emoji: '📈', title: 'Bot Metrics',   sub: 'Volume · friction · version comparison',      href: '/admin/metrics'      },
  { emoji: '📨', title: 'Email Log',     sub: 'All sent invoices & receipts',               href: '/admin/emails'       },
  { emoji: '🤖', title: 'Bot Analytics', sub: 'Questions · suggestions · Opus chat', href: '/admin/bot-analytics' },
  { emoji: '📚', title: 'Cards Preview', sub: 'Browse swipe decks · level → topic',  href: '/admin/cards-preview' },
  { emoji: '🎓', title: 'Lessons',       sub: 'Multi-topic teaching decks · PDF',    href: '/admin/lessons'       },
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
