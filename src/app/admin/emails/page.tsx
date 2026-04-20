'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailLog {
  id: string;
  emailId: string;
  sentAt: string;
  type: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  relatedInvoice: string;
  status: string;
  error: string;
  resendId: string;
}

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSentAt(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

const TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  invoice:             { bg: '#dbeafe', color: '#1d4ed8' },
  amended_invoice:     { bg: '#fef9c3', color: '#92400e' },
  receipt:             { bg: '#dcfce7', color: '#15803d' },
  partial_receipt:     { bg: '#ffedd5', color: '#c2410c' },
  overpayment_receipt: { bg: '#f3e8ff', color: '#7c3aed' },
  correction:          { bg: '#fee2e2', color: '#b91c1c' },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] || { bg: '#f1f5f9', color: '#64748b' };
  const label = type.replace(/_/g, ' ');
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 20, whiteSpace: 'nowrap', textTransform: 'capitalize',
    }}>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status === 'sent'
    ? { bg: '#dcfce7', color: '#15803d' }
    : { bg: '#fee2e2', color: '#b91c1c' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 20, whiteSpace: 'nowrap', textTransform: 'capitalize',
    }}>{status || '—'}</span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [expanded, setExpanded] = useState<string | null>(null);
  const [resendState, setResendState] = useState<Record<string, 'idle' | 'sending' | 'done' | 'error'>>({});
  const [resendError, setResendError] = useState<Record<string, string>>({});

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const pw = getCookie('admin_pw');
    if (pw) {
      savedPw.current = pw;
      verifyAndLogin(pw);
    }
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

  // ── Fetch logs ───────────────────────────────────────────────────────────────

  async function fetchLogs() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-emails', {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed) fetchLogs();
  }, [authed]);

  // ── Resend ───────────────────────────────────────────────────────────────────

  async function handleResend(logId: string) {
    setResendState(s => ({ ...s, [logId]: 'sending' }));
    setResendError(s => ({ ...s, [logId]: '' }));
    try {
      const res = await fetch('/api/admin-emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${savedPw.current}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resend failed');
      setResendState(s => ({ ...s, [logId]: 'done' }));
    } catch (err: any) {
      setResendState(s => ({ ...s, [logId]: 'error' }));
      setResendError(s => ({ ...s, [logId]: err.message }));
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────

  const allTypes = Array.from(new Set(logs.map(l => l.type).filter(Boolean))).sort();
  const allStatuses = Array.from(new Set(logs.map(l => l.status).filter(Boolean))).sort();

  const filtered = logs.filter(l => {
    if (typeFilter && l.type !== typeFilter) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.toEmail.toLowerCase().includes(q) && !l.subject.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Login screen ─────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <>
        <style>{loginCSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-icon">✉️</div>
            <h1>Email Log</h1>
            <p>Adrian's Math Tuition</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                className="pw-input"
                placeholder="Admin password"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError(''); }}
                autoFocus
                disabled={authLoading}
              />
              {authError && <div className="pw-error">{authError}</div>}
              <button type="submit" className="pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'View Email Log'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <style>{pageCSS}</style>

      <div className="el-header">
        <div className="el-title">
          <a href="/admin/invoices" className="back-link">← Admin</a>
          <h1>Email Log</h1>
        </div>
        <button className="refresh-btn" onClick={fetchLogs} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="el-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search recipient or subject…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={fetchLogs}>Retry</button>
        </div>
      )}

      <div className="el-content">
        {loading && <div className="loading-msg">Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div className="loading-msg">No emails found.</div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="table-wrap">
            <table className="el-table">
              <thead>
                <tr>
                  <th>Sent At</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th className="col-subject">Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className={`log-row ${expanded === log.id ? 'expanded' : ''}`}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="col-date">{formatSentAt(log.sentAt)}</td>
                      <td><TypeBadge type={log.type} /></td>
                      <td className="col-email">{log.toEmail}</td>
                      <td className="col-subject">{log.subject}</td>
                      <td><StatusBadge status={log.status} /></td>
                    </tr>
                    {expanded === log.id && (
                      <tr key={`${log.id}-detail`} className="detail-row">
                        <td colSpan={5}>
                          <div className="detail-wrap">
                            {log.error && (
                              <div className="detail-error">
                                <strong>Error:</strong> {log.error}
                              </div>
                            )}
                            {log.resendId && (
                              <div className="detail-meta">Resend ID: {log.resendId}</div>
                            )}
                            {log.relatedInvoice && (
                              <div className="detail-meta">Invoice: {log.relatedInvoice}</div>
                            )}

                            <div className="detail-actions">
                              <button
                                className="resend-btn"
                                onClick={e => { e.stopPropagation(); handleResend(log.id); }}
                                disabled={resendState[log.id] === 'sending' || resendState[log.id] === 'done'}
                              >
                                {resendState[log.id] === 'sending' ? 'Sending…'
                                  : resendState[log.id] === 'done' ? '✅ Resent'
                                  : resendState[log.id] === 'error' ? '❌ Failed — retry'
                                  : '↩ Resend'}
                              </button>
                              {resendState[log.id] === 'error' && resendError[log.id] && (
                                <span className="resend-err">{resendError[log.id]}</span>
                              )}
                            </div>

                            {log.bodyHtml && (
                              <iframe
                                className="body-frame"
                                srcDoc={log.bodyHtml}
                                sandbox=""
                                title="Email body"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="el-footer">
        {filtered.length} email{filtered.length !== 1 ? 's' : ''}
        {(search || typeFilter || statusFilter) && logs.length !== filtered.length
          ? ` (filtered from ${logs.length})` : ''}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const loginCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
.login-wrap {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
  padding: 24px;
}
.login-card {
  background: white; border-radius: 20px; padding: 40px 32px;
  width: 100%; max-width: 340px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
}
.login-icon { font-size: 40px; margin-bottom: 12px; }
.login-card h1 { font-size: 24px; color: #0f172a; margin-bottom: 4px; font-weight: 700; }
.login-card p { font-size: 14px; color: #64748b; margin-bottom: 28px; }
.pw-input {
  width: 100%; padding: 12px 14px;
  border: 1.5px solid #e2e8f0; border-radius: 10px;
  font-size: 16px; margin-bottom: 10px;
  font-family: inherit; text-align: center; letter-spacing: 0.08em; outline: none;
}
.pw-input:focus { border-color: #1a365d; box-shadow: 0 0 0 3px rgba(26,54,93,0.15); }
.pw-error { font-size: 13px; color: #dc2626; margin-bottom: 10px; }
.pw-btn {
  width: 100%; padding: 12px;
  background: #1a365d; color: white;
  border: none; border-radius: 10px;
  font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.pw-btn:hover:not(:disabled) { background: #243058; }
.pw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const pageCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f1f5f9; color: #1e293b; min-height: 100vh;
}

/* Header */
.el-header {
  background: #1a365d; color: white;
  padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 100;
}
.el-title { display: flex; align-items: center; gap: 14px; }
.back-link { font-size: 14px; color: rgba(255,255,255,0.65); text-decoration: none; }
.back-link:hover { color: white; }
.el-title h1 { font-size: 20px; font-weight: 700; }
.refresh-btn {
  background: rgba(255,255,255,0.15); color: white;
  border: none; border-radius: 8px;
  padding: 8px 16px; font-size: 14px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.refresh-btn:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Filters */
.el-filters {
  background: white; border-bottom: 1px solid #e2e8f0;
  padding: 12px 16px;
  display: flex; gap: 10px; flex-wrap: wrap;
  position: sticky; top: 57px; z-index: 90;
}
.filter-search {
  flex: 1; min-width: 200px;
  padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; font-family: inherit; outline: none;
}
.filter-search:focus { border-color: #1a365d; box-shadow: 0 0 0 3px rgba(26,54,93,0.1); }
.filter-select {
  padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; font-family: inherit; background: white; outline: none;
  cursor: pointer;
}
.filter-select:focus { border-color: #1a365d; }

/* Content */
.el-content { padding: 16px; max-width: 1200px; margin: 0 auto; }
.loading-msg { text-align: center; color: #94a3b8; padding: 48px; font-size: 15px; }
.error-banner {
  background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 12px 16px; border-radius: 10px; margin: 0 16px 16px;
  display: flex; align-items: center; justify-content: space-between; font-size: 14px;
}
.error-banner button {
  background: #ef4444; color: white; border: none;
  padding: 5px 12px; border-radius: 6px; font-size: 13px; cursor: pointer;
}

/* Table */
.table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #e2e8f0; background: white; }
.el-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.el-table th {
  text-align: left; padding: 10px 14px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #94a3b8;
  background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}
.el-table td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.log-row { cursor: pointer; transition: background 0.1s; }
.log-row:hover { background: #f8fafc; }
.log-row.expanded { background: #f0f6ff; }
.log-row:last-child td { border-bottom: none; }

/* Column widths */
.col-date { white-space: nowrap; color: #64748b; font-size: 13px; }
.col-email { color: #475569; font-size: 13px; word-break: break-all; }
.col-subject { color: #1e293b; }

/* Detail row */
.detail-row td { padding: 0; background: #f8fbff; border-bottom: 1px solid #e2e8f0; }
.detail-wrap { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.detail-error {
  background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 10px 14px; border-radius: 8px; font-size: 13px;
}
.detail-meta { font-size: 12px; color: #94a3b8; }
.detail-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.resend-btn {
  padding: 8px 18px; border-radius: 8px;
  background: #1a365d; color: white;
  border: none; font-size: 14px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.resend-btn:hover:not(:disabled) { background: #243058; }
.resend-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.resend-err { font-size: 13px; color: #b91c1c; }
.body-frame {
  width: 100%; min-height: 240px; max-height: 480px;
  border: 1px solid #e2e8f0; border-radius: 8px;
  background: white;
}

/* Footer */
.el-footer {
  text-align: center; font-size: 13px; color: #94a3b8;
  padding: 16px; margin-top: 4px;
}

/* Responsive */
@media (max-width: 600px) {
  .col-subject { display: none; }
  .el-filters { gap: 8px; }
  .filter-search { min-width: 0; }
  .el-content { padding: 12px; }
  .el-table th, .el-table td { padding: 10px 10px; }
}
`;
