'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceiptPreviewPage() {
  const params = useSearchParams();

  const invoiceId        = params.get('invoiceId') || '';
  const paymentAmount    = params.get('paymentAmount') || '0';
  const paymentDate      = params.get('paymentDate') || '';
  const isFullPayment    = params.get('isFullPayment') === 'true';
  const isOverpayment    = params.get('isOverpayment') === 'true';
  const remainingBalance = params.get('remainingBalance') || '0';
  const totalPaid        = params.get('totalPaid') || paymentAmount;
  const paymentMethod    = params.get('paymentMethod') || 'PayNow';

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  useEffect(() => {
    const pw = getCookie('admin_pw');
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
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    await verifyAndLogin(password);
  }

  // ── Preview load ──────────────────────────────────────────────────────────────
  const [subject, setSubject]   = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [studentName, setStudentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [month, setMonth] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authed || !invoiceId) return;
    loadPreview();
  }, [authed, invoiceId]);

  async function loadPreview() {
    setLoading(true);
    setLoadError('');
    try {
      const qs = new URLSearchParams({
        invoiceId, paymentAmount, paymentDate,
        isFullPayment: String(isFullPayment),
        isOverpayment: String(isOverpayment),
        remainingBalance, paymentMethod,
      });
      const res = await fetch(`/api/send-receipt?${qs}`, {
        headers: { Authorization: `Bearer ${savedPw.current}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSubject(data.subject || '');
      setHtmlBody(data.html || '');
      setEditedHtml(data.html || '');
      setStudentName(data.studentName || '');
      setParentEmail(data.parentEmail || '');
      setMonth(data.month || '');
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────────
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [sendError, setSendError] = useState('');

  async function handleSend() {
    if (!invoiceId) return;
    setSendState('sending');
    setSendError('');
    try {
      const res = await fetch('/api/send-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedPw.current}`,
        },
        body: JSON.stringify({
          invoiceId,
          paymentAmount: parseFloat(paymentAmount),
          paymentDate,
          paymentMethod,
          isFullPayment,
          isOverpayment,
          remainingBalance: parseFloat(remainingBalance),
          totalPaid: parseFloat(totalPaid),
          // Pass customHtml only if the user edited it
          ...(editedHtml !== htmlBody ? { customHtml: editedHtml } : {}),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSendState('done');
    } catch (err: any) {
      setSendState('error');
      setSendError(err.message);
    }
  }

  // ── Login screen ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{loginCSS}</style>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-icon">📧</div>
            <h1>Receipt Preview</h1>
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
                {authLoading ? 'Checking…' : 'View Receipt'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  const receiptType = isOverpayment ? 'Overpayment Receipt'
    : isFullPayment ? 'Full Payment Receipt'
    : 'Partial Payment Receipt';
  const wasEdited = editedHtml !== htmlBody;

  return (
    <>
      <style>{pageCSS}</style>

      <div className="rp-header">
        <div className="rp-title">
          <a href="/admin" className="back-link">← Admin</a>
          <h1>Receipt Preview</h1>
          {studentName && <span className="rp-meta">{studentName} · {month}</span>}
        </div>
        <span className="rp-badge">{receiptType}</span>
      </div>

      {!invoiceId && (
        <div className="error-banner">Missing invoiceId in URL.</div>
      )}

      {loadError && (
        <div className="error-banner">
          Failed to load preview: {loadError}
          <button onClick={loadPreview}>Retry</button>
        </div>
      )}

      {loading && <div className="loading-msg">Loading preview…</div>}

      {!loading && !loadError && htmlBody && (
        <div className="rp-body">
          {/* Meta bar */}
          <div className="meta-bar">
            <div className="meta-row">
              <span className="meta-label">To</span>
              <span className="meta-value">{parentEmail || '—'}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Subject</span>
              <span className="meta-value">{subject}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Amount</span>
              <span className="meta-value">${parseFloat(paymentAmount).toFixed(2)} via {paymentMethod}</span>
            </div>
          </div>

          {/* Two-panel: preview + editor */}
          <div className="panels">
            <div className="panel">
              <div className="panel-head">
                Preview
                {wasEdited && <span className="edited-tag">Edited</span>}
              </div>
              <iframe
                className="preview-frame"
                srcDoc={editedHtml}
                sandbox=""
                title="Email preview"
              />
            </div>
            <div className="panel">
              <div className="panel-head">Edit HTML</div>
              <textarea
                className="html-editor"
                value={editedHtml}
                onChange={e => setEditedHtml(e.target.value)}
                spellCheck={false}
              />
              {wasEdited && (
                <button className="reset-btn" onClick={() => setEditedHtml(htmlBody)}>
                  ↩ Reset to default
                </button>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="action-bar">
            {sendState === 'done' ? (
              <div className="success-msg">✅ Receipt sent to {parentEmail}</div>
            ) : (
              <>
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={sendState === 'sending'}
                >
                  {sendState === 'sending' ? 'Sending…' : wasEdited ? '📧 Send Edited Receipt' : '📧 Send Default Receipt'}
                </button>
                <a href="/admin" className="cancel-link">Cancel</a>
              </>
            )}
            {sendState === 'error' && (
              <div className="error-inline">❌ {sendError}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const loginCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); padding: 24px; }
.login-card { background: white; border-radius: 20px; padding: 40px 32px;
  width: 100%; max-width: 340px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; }
.login-icon { font-size: 40px; margin-bottom: 12px; }
.login-card h1 { font-size: 24px; color: #0f172a; margin-bottom: 4px; font-weight: 700; }
.login-card p { font-size: 14px; color: #64748b; margin-bottom: 28px; }
.pw-input { width: 100%; padding: 12px 14px; border: 1.5px solid #e2e8f0; border-radius: 10px;
  font-size: 16px; margin-bottom: 10px; font-family: inherit; text-align: center;
  letter-spacing: 0.08em; outline: none; }
.pw-input:focus { border-color: #1a365d; box-shadow: 0 0 0 3px rgba(26,54,93,0.15); }
.pw-error { font-size: 13px; color: #dc2626; margin-bottom: 10px; }
.pw-btn { width: 100%; padding: 12px; background: #1a365d; color: white;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background 0.15s; }
.pw-btn:hover:not(:disabled) { background: #243058; }
.pw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const pageCSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f1f5f9; color: #1e293b; min-height: 100vh; }

.rp-header {
  background: #1a365d; color: white;
  padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 100;
}
.rp-title { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.back-link { font-size: 14px; color: rgba(255,255,255,0.65); text-decoration: none; }
.back-link:hover { color: white; }
.rp-title h1 { font-size: 20px; font-weight: 700; }
.rp-meta { font-size: 13px; color: rgba(255,255,255,0.7); }
.rp-badge { font-size: 12px; font-weight: 700; padding: 4px 12px;
  background: #f59e0b; color: #1a1a1a; border-radius: 20px; white-space: nowrap; }

.rp-body { max-width: 1200px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; }

.meta-bar { background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.meta-row { display: flex; align-items: baseline; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
.meta-row:last-child { border-bottom: none; }
.meta-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: #94a3b8; width: 72px; flex-shrink: 0; }
.meta-value { font-size: 14px; color: #1e293b; word-break: break-all; }

.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 720px) { .panels { grid-template-columns: 1fr; } }

.panel { background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
  display: flex; flex-direction: column; }
.panel-head { padding: 10px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #94a3b8; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  display: flex; align-items: center; gap: 8px; }
.edited-tag { font-size: 11px; font-weight: 700; padding: 2px 8px;
  background: #fef3c7; color: #92400e; border-radius: 12px; }
.preview-frame { width: 100%; min-height: 400px; flex: 1; border: none; background: white; }
.html-editor { width: 100%; min-height: 400px; flex: 1; border: none; resize: vertical;
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; line-height: 1.6;
  padding: 12px; color: #1e293b; background: #fafafa; outline: none; }
.html-editor:focus { background: white; }
.reset-btn { margin: 8px; padding: 6px 14px; border: 1px solid #e2e8f0;
  background: white; border-radius: 6px; font-size: 13px; cursor: pointer;
  color: #475569; font-family: inherit; }
.reset-btn:hover { background: #f8fafc; }

.action-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; }
.send-btn { padding: 11px 24px; background: #1a365d; color: white;
  border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background 0.15s; }
.send-btn:hover:not(:disabled) { background: #243058; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-link { font-size: 14px; color: #64748b; text-decoration: none; }
.cancel-link:hover { color: #1e293b; }
.success-msg { font-size: 15px; color: #15803d; font-weight: 600; }
.error-inline { font-size: 13px; color: #b91c1c; }

.loading-msg { text-align: center; color: #94a3b8; padding: 48px; font-size: 15px; }
.error-banner { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 12px 16px; border-radius: 10px; margin: 16px;
  display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
.error-banner button { background: #ef4444; color: white; border: none;
  padding: 5px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; }
`;
