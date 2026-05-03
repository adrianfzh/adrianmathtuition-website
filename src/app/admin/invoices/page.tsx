'use client';

import { useEffect } from 'react';

const CSS = `
html { font-size: 18px; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 18px;
  background: #f1f5f9;
  color: #1e293b;
  min-height: 100vh;
}
#login-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  text-align: center;
}
.login-card h1 { font-size: 22px; color: #0f172a; margin-bottom: 6px; }
.login-card p { font-size: 14px; color: #64748b; margin-bottom: 28px; }
#pw-input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 15px;
  margin-bottom: 12px;
  font-family: inherit;
  text-align: center;
  letter-spacing: 0.1em;
}
#pw-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.2); }
#pw-error { font-size: 13px; color: #dc2626; margin-bottom: 12px; display: none; }
#pw-btn {
  width: 100%;
  padding: 11px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
#pw-btn:hover:not(:disabled) { background: #5568d3; }
#pw-btn:disabled { opacity: 0.6; cursor: not-allowed; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-6px); }
  80%       { transform: translateX(6px); }
}
.shake { animation: shake 0.4s ease; }
.header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.header-left h1 { font-size: 36px; font-weight: 700; color: #0f172a; }
.header-left p { font-size: 17px; color: #64748b; margin-top: 2px; }
.header-right { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
#approval-counter { font-size: 16px; font-weight: 600; color: #475569; }
#approval-counter strong { color: #0f172a; }
#summary { font-size: 17px; color: #475569; }
#summary strong { color: #0f172a; }
#month-filter {
  font-size: 15px;
  font-weight: 500;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  outline: none;
}
#month-filter:hover { background: #f1f5f9; }
.btn-refresh {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-refresh:hover { background: #f1f5f9; }
.btn-generate {
  background: #1e40af;
  border: 1px solid #1e40af;
  color: white;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.btn-generate:hover:not(:disabled) { background: #1d3fa3; }
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger {
  background: #fff;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  font-family: inherit;
}
.btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #f87171; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger-solid {
  background: #dc2626;
  border: 1px solid #dc2626;
  color: white;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.btn-danger-solid:hover:not(:disabled) { background: #b91c1c; }
.btn-danger-solid:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.btn-del {
  background: #fff;
  border: 1px solid #fecaca;
  color: #b91c1c;
}
.btn.btn-del:hover:not(:disabled) { background: #fef2f2; border-color: #f87171; }
.result-banner {
  padding: 14px 18px;
  border-radius: 10px;
  margin-bottom: 20px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  line-height: 1.5;
}
.result-banner.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
.result-banner.warning { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
.result-banner.error   { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
.result-banner.info    { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
.btn-dismiss {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: inherit;
  opacity: 0.5;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
}
.btn-dismiss:hover { opacity: 1; }
.btn-gen-pdf { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
.btn-gen-pdf:hover:not(:disabled) { background: #e0f2fe; }
.btn-gen-pdf.success { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.btn-gen-pdf.error   { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
.gen-error-msg { font-size: 12px; color: #b91c1c; margin-top: 6px; width: 100%; }
.payment-alias { margin: 8px 0 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.alias-label { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
.alias-value { font-size: 17px; font-weight: 700; color: #0f172a; }
.alias-edit-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 7px; cursor: pointer; color: #475569; font-size: 14px; font-weight: 500; padding: 5px 12px; line-height: 1.4; transition: background 0.12s; }
.alias-edit-btn:hover { background: #e2e8f0; color: #0f172a; }
.alias-input-row { display: none; align-items: center; gap: 8px; margin: 8px 0 14px; flex-wrap: wrap; }
.alias-input-row.open { display: flex; }
.alias-input { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; font-family: inherit; color: #0f172a; width: 260px; }
.alias-input:focus { outline: none; border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(148,163,184,0.15); }
.btn-alias-save { background: #1e40af; color: white; border: none; border-radius: 8px; padding: 8px 18px; font-size: 15px; cursor: pointer; font-family: inherit; font-weight: 600; }
.btn-alias-save:hover { background: #1d3fa3; }
.btn-alias-cancel { background: none; border: 1px solid #e2e8f0; color: #64748b; border-radius: 8px; padding: 8px 14px; font-size: 15px; cursor: pointer; font-family: inherit; }
.content { max-width: 1000px; margin: 32px auto; padding: 0 20px; }
.error-banner {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  font-size: 16px;
  padding: 14px 18px;
  border-radius: 10px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.btn-retry {
  background: #ef4444;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.empty-state { text-align: center; padding: 80px 24px; color: #64748b; }
.empty-state .emoji { font-size: 64px; margin-bottom: 16px; }
.empty-state h2 { font-size: 26px; color: #334155; margin-bottom: 8px; }
.empty-state p { font-size: 18px; line-height: 1.6; }
.invoice-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.invoice-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.invoice-card.approved { opacity: 0.7; }
.card-body { padding: 36px; }
.card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.student-name { font-size: 26px; font-weight: 700; color: #0f172a; }
.invoice-month { font-size: 20px; color: #64748b; flex: 1; }
.badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
.badge-draft    { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.badge-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.badge-sent     { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.sent-at { font-size: 15px; color: #94a3b8; margin-top: 4px; }
.payment-status { font-size: 16px; font-weight: 600; margin-top: 4px; }
.payment-status.paid    { color: #16a34a; }
.payment-status.partial { color: #d97706; }
.payment-status.unpaid  { color: #94a3b8; }
.amounts { margin-bottom: 12px; }
.amount-line { font-size: 20px; color: #475569; margin-bottom: 4px; }
.amount-adjustment { font-size: 14px; color: #64748b; }
.final-amount { font-size: 30px; font-weight: 700; color: #0f172a; margin-top: 6px; }
.auto-notes {
  background: #f8fafc;
  border-left: 3px solid #cbd5e1;
  border-radius: 0 6px 6px 0;
  padding: 10px 14px;
  font-size: 17px;
  color: #475569;
  font-style: italic;
  white-space: pre-wrap;
  margin-bottom: 16px;
  line-height: 1.6;
}
.card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, opacity 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-preview  { background: #f8fafc; border-color: #e2e8f0; color: #475569; }
.btn-preview:hover:not(:disabled) { background: #f1f5f9; }
.btn-amend    { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
.btn-amend:hover:not(:disabled) { background: #fef3c7; }
.btn-approve  { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.btn-approve:hover:not(:disabled) { background: #dcfce7; }
.btn-send     { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.btn-send:hover:not(:disabled) { background: #dbeafe; }
.btn-save     { background: #1e40af; color: white; border-color: #1e40af; }
.btn-save:hover:not(:disabled) { background: #1d3fa3; }
.btn-cancel   { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
.btn-cancel:hover { background: #f1f5f9; }
.btn-unapprove { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
.btn-unapprove:hover:not(:disabled) { background: #f1f5f9; }
.btn-record-payment { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.btn-record-payment:hover { background: #dcfce7; }
.btn-receipt { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.btn-receipt:hover:not(:disabled) { background: #ffedd5; }
.receipt-form { display: none; padding: 12px 16px; background: #fff7ed; border-top: 1px solid #fed7aa; }
.receipt-form.open { display: block; }
.btn-full-paid { background: #f0fdf4; border-color: #86efac; color: #15803d; font-weight: 600; }
.btn-full-paid:hover { background: #dcfce7; }
.btn-preview-email { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }
.btn-preview-email:hover:not(:disabled) { background: #f3e8ff; }
.referral-badge { display: inline-block; font-size: 15px; margin-left: 6px; cursor: default; }
.email-preview-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 460px;
  max-width: 100vw;
  background: white;
  border-left: 1px solid #e2e8f0;
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  z-index: 200;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.25s ease;
}
.email-preview-panel.open { transform: translateX(0); }
.email-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.email-preview-header h2 { font-size: 18px; font-weight: 700; color: #0f172a; }
.btn-close-preview {
  background: none; border: none; font-size: 22px; cursor: pointer;
  color: #94a3b8; padding: 4px 8px; border-radius: 6px; line-height: 1;
}
.btn-close-preview:hover { background: #f1f5f9; color: #0f172a; }
.email-preview-subject {
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 14px;
  color: #475569;
  flex-shrink: 0;
}
.email-preview-subject strong { color: #0f172a; font-size: 15px; }
.email-preview-status {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  color: #7e22ce;
  background: #fdf4ff;
  border-bottom: 1px solid #e9d5ff;
  flex-shrink: 0;
}
.email-preview-status.default { color: #475569; background: #f8fafc; border-color: #e2e8f0; }
.email-preview-textarea {
  flex: 1;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.6;
  color: #334155;
  resize: none;
  outline: none;
}
.email-preview-textarea:focus { border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(148,163,184,0.15); }
.email-preview-actions {
  display: flex;
  gap: 8px;
  padding: 12px 20px 20px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .email-preview-panel { width: 100vw; }
}
.btn-partial { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
.btn-partial:hover { background: #fef3c7; }
.record-payment-form { display: none; padding: 12px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
.record-payment-form.open { display: block; }
.line-items-section { margin-bottom: 14px; }
.line-items-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.line-items-header label { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.btn-add-item { font-size: 13px; color: #1e40af; background: none; border: 1px solid #bfdbfe; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-family: inherit; }
.btn-add-item:hover { background: #eff6ff; }
.line-item-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.line-item-row .li-desc { flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: white; }
.line-item-row .li-amount { width: 110px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: white; }
.line-item-row .li-slot { width: 130px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: white; }
.line-item-row .li-lessons { width: 80px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: white; }
.line-item-row .li-desc:focus, .line-item-row .li-amount:focus, .line-item-row .li-slot:focus, .line-item-row .li-lessons:focus {
  outline: none; border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(148,163,184,0.15);
}
.main-item-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.main-item-row input { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: white; }
.main-item-row .li-amount[readonly] { background: #f8fafc; color: #64748b; }
.btn-remove-item { background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 4px 6px; border-radius: 4px; line-height: 1; }
.btn-remove-item:hover { color: #ef4444; background: #fef2f2; }
.no-items { font-size: 13px; color: #94a3b8; font-style: italic; padding: 4px 0; }
.inline-confirm { font-size: 16px; color: #15803d; font-weight: 500; padding: 8px 0; }
.amend-form { border-top: 1px solid #f1f5f9; padding: 24px 30px; background: #fafbfc; display: none; }
.amend-form.open { display: block; }
.amend-form h3 { font-size: 18px; font-weight: 600; color: #334155; margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.form-group input, .form-group textarea { width: 100%; padding: 10px 13px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 16px; color: #0f172a; background: white; font-family: inherit; }
.form-group input:focus, .form-group textarea:focus { outline: none; border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(148,163,184,0.15); }
.form-group input[readonly] { background: #f8fafc; color: #64748b; }
.form-group.full-width { grid-column: 1 / -1; }
.live-calc { font-size: 16px; color: #334155; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-weight: 500; }
.form-actions { display: flex; gap: 8px; }
.search-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #f1f5f9;
  padding: 12px 0 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}
.search-input-wrap { position: relative; }
#search-input {
  width: 100%;
  padding: 13px 44px 13px 44px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 16px;
  font-family: inherit;
  color: #0f172a;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
#search-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.18); }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 18px; pointer-events: none; }
.search-clear {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: #f1f5f9; border: none; width: 30px; height: 30px;
  border-radius: 50%; cursor: pointer; color: #64748b; font-size: 16px;
  display: none; align-items: center; justify-content: center; line-height: 1;
}
.search-clear:hover { background: #e2e8f0; color: #0f172a; }
.search-clear.visible { display: flex; }
.search-count { font-size: 13px; color: #64748b; margin-top: 8px; padding: 0 4px; }
@media (max-width: 600px) {
  html { font-size: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .card-top { flex-direction: column; align-items: flex-start; gap: 6px; }
  .header { padding: 14px 14px; gap: 10px; }
  .header-left h1 { font-size: 22px; }
  .header-left p { font-size: 13px; }
  .header-right { width: 100%; gap: 8px; }
  .header-right .btn-generate,
  .header-right .btn-danger,
  .header-right .btn-danger-solid,
  .header-right .btn-refresh { font-size: 13px; padding: 8px 12px; }
  #month-filter { flex: 1 1 auto; font-size: 14px; padding: 8px 10px; }
  #approval-counter, #summary { font-size: 13px; width: 100%; }
  .content { margin: 12px auto; padding: 0 12px; }
  .card-body { padding: 18px 16px; }
  .student-name { font-size: 20px; }
  .invoice-month { font-size: 16px; }
  .badge { font-size: 13px; padding: 4px 10px; }
  .amount-line { font-size: 16px; }
  .final-amount { font-size: 24px; }
  .auto-notes { font-size: 14px; padding: 8px 12px; }
  .card-actions { gap: 6px; }
  .card-actions .btn { flex: 1 1 auto; font-size: 13px; padding: 10px 12px; min-height: 42px; }
  .payment-alias { gap: 6px; }
  .alias-label { font-size: 11px; }
  .alias-value { font-size: 15px; }
  .alias-input { width: 100%; }
  .amend-form { padding: 16px 14px; }
  .line-item-row, .main-item-row { flex-wrap: wrap; }
  .line-item-row .li-desc, .main-item-row .li-desc { flex: 1 1 100%; }
  .line-item-row .li-slot, .main-item-row .li-slot,
  .line-item-row .li-lessons, .main-item-row .li-lessons,
  .line-item-row .li-amount, .main-item-row .li-amount { width: auto; flex: 1 1 0; min-width: 0; }
  .record-payment-form { padding: 12px; }
  .search-bar { padding: 10px 0 12px; }
  #search-input { font-size: 16px; padding: 12px 40px 12px 40px; }
}
`;

export default function AdminPage() {
  useEffect(() => {
    // Cookie helpers — persistent login across PWA sessions
    function getCookie(name: string): string {
      const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : '';
    }
    function setCookie(name: string, value: string, days: number) {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
    }
    function deleteCookie(name: string) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
    }

    let adminPassword = getCookie('admin_pw') || sessionStorage.getItem('adminPassword') || '';
    let invoices: any[] = [];
    let totalVisible = false;
    let selectedMonth = '';
    let searchQuery = '';
    let currentPreviewId = '';

    function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
      return { Authorization: `Bearer ${adminPassword}`, ...extra };
    }

    function escHtml(str: unknown): string {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function escAttr(str: unknown): string {
      return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }

    async function verifyAndLogin(pw: string): Promise<boolean> {
      try {
        const res = await fetch('/api/admin-invoices?auth=check', {
          headers: { Authorization: `Bearer ${pw}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function init() {
      const overlay = document.getElementById('login-overlay');
      // If we have a saved password (cookie or sessionStorage), verify silently
      if (adminPassword) {
        const ok = await verifyAndLogin(adminPassword);
        if (ok) {
          // Refresh the 30-day cookie so it rolls forward while active
          setCookie('admin_pw', adminPassword, 30);
          sessionStorage.setItem('adminAuthed', '1');
          sessionStorage.setItem('adminPassword', adminPassword);
          if (overlay) overlay.style.display = 'none';
          loadInvoices();
          return;
        }
        // Saved password is invalid — clear it
        adminPassword = '';
        deleteCookie('admin_pw');
        sessionStorage.removeItem('adminAuthed');
        sessionStorage.removeItem('adminPassword');
      }
      if (overlay) overlay.style.display = 'flex';
      const input = document.getElementById('pw-input') as HTMLInputElement;
      if (input) input.focus();
    }

    async function submitPassword() {
      const input = document.getElementById('pw-input') as HTMLInputElement;
      const errorEl = document.getElementById('pw-error') as HTMLElement;
      const btn = document.getElementById('pw-btn') as HTMLButtonElement;
      const pw = input.value;

      btn.disabled = true;
      btn.textContent = 'Checking\u2026';
      errorEl.style.display = 'none';

      try {
        const ok = await verifyAndLogin(pw);
        if (ok) {
          adminPassword = pw;
          setCookie('admin_pw', pw, 30);
          sessionStorage.setItem('adminAuthed', '1');
          sessionStorage.setItem('adminPassword', pw);
          const overlay = document.getElementById('login-overlay');
          if (overlay) overlay.style.display = 'none';
          loadInvoices();
        } else {
          input.classList.remove('shake');
          void input.offsetWidth;
          input.classList.add('shake');
          errorEl.textContent = 'Incorrect password';
          errorEl.style.display = 'block';
          input.value = '';
          input.focus();
        }
      } catch {
        errorEl.textContent = 'Connection error. Try again.';
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit';
      }
    }

    function logout() {
      if (!confirm('Log out of the admin dashboard?')) return;
      adminPassword = '';
      deleteCookie('admin_pw');
      sessionStorage.removeItem('adminAuthed');
      sessionStorage.removeItem('adminPassword');
      location.reload();
    }

    async function loadInvoices() {
      const errorBanner = document.getElementById('error-banner') as HTMLElement;
      const container = document.getElementById('invoices-container') as HTMLElement;
      errorBanner.style.display = 'none';
      container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:48px 0;font-size:14px;">Loading...</p>';

      try {
        const res = await fetch('/api/admin-invoices', { headers: authHeaders() });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        invoices = await res.json();
        populateMonthFilter();
        renderAll();
        updateBulkButtonLabels();
      } catch (err: any) {
        const errorMsg = document.getElementById('error-msg') as HTMLElement;
        errorMsg.textContent = err.message;
        errorBanner.style.display = 'flex';
        container.innerHTML = '';
      }
    }

    function populateMonthFilter() {
      const monthOrder = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];
      const months = [...new Set(invoices.map((i: any) => i.month).filter(Boolean))] as string[];
      months.sort((a, b) => {
        const [aM, aY] = [monthOrder.indexOf(a.split(' ')[0]), parseInt(a.split(' ')[1])];
        const [bM, bY] = [monthOrder.indexOf(b.split(' ')[0]), parseInt(b.split(' ')[1])];
        return bY !== aY ? bY - aY : bM - aM;
      });

      const sel = document.getElementById('month-filter') as HTMLSelectElement;
      const prev = sel.value;
      sel.innerHTML = '<option value="">All Months</option>' +
        months.map(m => `<option value="${escAttr(m)}">${escHtml(m)}</option>`).join('');

      if (prev && months.includes(prev)) {
        sel.value = prev;
        selectedMonth = prev;
      } else {
        sel.value = months[0] || '';
        selectedMonth = months[0] || '';
      }
    }

    function onMonthFilter(val: string) {
      selectedMonth = val;
      renderAll();
      updateBulkButtonLabels();
    }

    function filteredInvoices() {
      let out = selectedMonth ? invoices.filter((i: any) => i.month === selectedMonth) : invoices;
      if (searchQuery) {
        const q = searchQuery;
        out = out.filter((i: any) => {
          const name = String(i.studentName || '').toLowerCase();
          const alias = String(i.paymentAlias || '').toLowerCase();
          return name.includes(q) || alias.includes(q);
        });
      }
      return out;
    }

    function onSearchChange(val: string) {
      searchQuery = val.toLowerCase().trim();
      const clearBtn = document.getElementById('search-clear');
      if (clearBtn) clearBtn.classList.toggle('visible', searchQuery.length > 0);
      renderAll();
    }

    function clearSearch() {
      const input = document.getElementById('search-input') as HTMLInputElement;
      if (input) input.value = '';
      onSearchChange('');
      input?.focus();
    }

    function renderAll() {
      updateSummary();
      const container = document.getElementById('invoices-container') as HTMLElement;
      const visible = filteredInvoices();

      if (visible.length === 0) {
        if (searchQuery) {
          container.innerHTML = `
            <div class="empty-state">
              <div class="emoji">\uD83D\uDD0D</div>
              <h2>No matches</h2>
              <p>No invoices match "<strong>${escHtml(searchQuery)}</strong>"${selectedMonth ? ` in ${escHtml(selectedMonth)}` : ''}.</p>
            </div>`;
        } else {
          container.innerHTML = `
            <div class="empty-state">
              <div class="emoji">\uD83D\uDCED</div>
              <h2>No invoices found</h2>
              <p>No draft or approved invoices at the moment.<br>The cron runs on the 14th at 9am SGT to generate them.</p>
            </div>`;
        }
        return;
      }

      const sorted = [...visible].sort((a: any, b: any) => {
        if (a.status === b.status) return a.studentName.localeCompare(b.studentName);
        return a.status === 'Draft' ? -1 : 1;
      });

      container.innerHTML = sorted.map((inv: any) => renderCard(inv)).join('');
    }

    function toggleTotal() {
      totalVisible = !totalVisible;
      updateSummary();
    }

    function updateSummary() {
      const vis = filteredInvoices();
      const drafts = vis.filter((i: any) => i.status === 'Draft');
      const approved = vis.filter((i: any) => i.status === 'Approved');
      const sent = vis.filter((i: any) => i.status === 'Sent');
      const total = drafts.reduce((s: number, i: any) => s + (i.finalAmount || 0), 0);

      const paid = sent.filter((i: any) => i.isPaid);
      const partiallyPaid = sent.filter((i: any) => !i.isPaid && i.amountPaid > 0);

      const counterEl = document.getElementById('approval-counter');
      if (counterEl) {
        if (vis.length > 0) {
          const paymentHtml = sent.length > 0
            ? ` \u00B7 \u2705 <strong>${paid.length}</strong> paid \u00B7 \u26A0\uFE0F <strong>${partiallyPaid.length}</strong> partial \u00B7 \u23F3 <strong>${sent.length - paid.length - partiallyPaid.length}</strong> unpaid`
            : '';
          counterEl.innerHTML = `\u2705 <strong>${approved.length}</strong> approved \u00B7 \uD83D\uDCE4 <strong>${sent.length}</strong> sent / ${vis.length} total${paymentHtml}`;
        } else {
          counterEl.innerHTML = '';
        }
      }

      const el = document.getElementById('summary');
      if (!el) return;
      if (drafts.length === 0) {
        el.innerHTML = 'No draft invoices';
      } else {
        const amountHtml = totalVisible
          ? `<strong>$${total.toFixed(2)}</strong>`
          : `<strong style="letter-spacing:0.1em;">\u2022\u2022\u2022\u2022\u2022\u2022</strong>`;
        const eyeIcon = totalVisible ? '\uD83D\uDC41' : '\uD83D\uDE48';
        el.innerHTML = `<strong>${drafts.length}</strong> draft invoice${drafts.length !== 1 ? 's' : ''} \u00B7 Total: ${amountHtml} <button onclick="toggleTotal()" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 2px;vertical-align:middle;" title="Show/hide total">${eyeIcon}</button>`;
      }
    }

    function formatSentAt(iso: string): string {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function renderCard(inv: any): string {
      const isDraft = inv.status === 'Draft';
      const isApproved = inv.status === 'Approved';
      const isSent = inv.status === 'Sent';

      const badgeClass = isDraft ? 'badge-draft' : isApproved ? 'badge-approved' : 'badge-sent';
      const badgeLabel = isDraft ? 'Draft' : isApproved ? 'Approved' : 'Sent';
      const hasReferralReward = Array.isArray(inv.lineItemsExtra) &&
        inv.lineItemsExtra.some((item: any) => typeof item.description === 'string' && item.description.includes('Referral reward'));
      const referralBadgeHtml = hasReferralReward ? '<span class="referral-badge" title="Referral reward applied">\uD83C\uDF81</span>' : '';

      const sentAtHtml = isSent && inv.sentAt
        ? `<div class="sent-at">Sent on ${formatSentAt(inv.sentAt)}</div>`
        : '';

      const outstanding = inv.finalAmount - (inv.amountPaid || 0);
      let paymentBadge = '';
      if (isSent) {
        if (inv.isPaid && (!inv.amountPaid || outstanding <= 0)) {
          paymentBadge = '<span class="payment-status paid">\u2705 Paid</span>';
        } else if (inv.amountPaid > 0 && outstanding > 0) {
          paymentBadge = `<span class="payment-status partial">\u26A0\uFE0F Partial: ${inv.amountPaid.toFixed(2)} paid, ${outstanding.toFixed(2)} outstanding</span>`;
        } else if (!inv.isPaid && !inv.amountPaid) {
          paymentBadge = '<span class="payment-status unpaid">\u23F3 Unpaid</span>';
        }
      }

      const baseLine = `${inv.lessonsCount} lesson${inv.lessonsCount !== 1 ? 's' : ''} \u00D7 $${inv.ratePerLesson.toFixed(2)} = $${inv.baseAmount.toFixed(2)}`;

      let adjLine = '';
      if (inv.adjustmentAmount !== null && inv.adjustmentAmount !== 0) {
        const sign = inv.adjustmentAmount > 0 ? '+' : '\u2212';
        const absAmt = Math.abs(inv.adjustmentAmount).toFixed(2);
        const reason = inv.adjustmentNotes ? ` (${inv.adjustmentNotes})` : '';
        adjLine = `<div class="amount-adjustment">${sign} $${absAmt}${escHtml(reason)}</div>`;
      }

      const notesHtml = inv.autoNotes
        ? `<div class="auto-notes">${inv.autoNotes}</div>`
        : '';

      let actionsHtml: string;
      if (isDraft) {
        actionsHtml = `
          <div class="card-actions" id="actions-${inv.id}">
            <button class="btn btn-preview" onclick="previewPdf('${inv.id}')">\uD83D\uDC41 Preview PDF</button>
            <button class="btn btn-preview-email" onclick="previewEmail('${inv.id}')">\uD83D\uDCE7 Preview Email</button>
            <button class="btn btn-gen-pdf" id="gen-btn-${inv.id}" onclick="regenerateInvoice('${inv.id}')">\u267B\uFE0F Regenerate Invoice</button>
            <button class="btn btn-amend" onclick="toggleAmend('${inv.id}')">\u270F\uFE0F Amend</button>
            <button class="btn btn-approve" onclick="approveInvoice('${inv.id}')">\u2705 Approve</button>
            <button class="btn btn-send" onclick="sendInvoice('${inv.id}')">\uD83D\uDCE4 Send</button>
            <button class="btn btn-del" onclick="deleteInvoice('${inv.id}')">\uD83D\uDDD1\uFE0F Delete Invoice</button>
          </div>`;
      } else if (isApproved) {
        actionsHtml = `
          <div class="card-actions" id="actions-${inv.id}">
            <button class="btn btn-preview" onclick="previewPdf('${inv.id}')">\uD83D\uDC41 Preview PDF</button>
            <button class="btn btn-preview-email" onclick="previewEmail('${inv.id}')">\uD83D\uDCE7 Preview Email</button>
            <button class="btn btn-gen-pdf" id="gen-btn-${inv.id}" onclick="regenerateInvoice('${inv.id}')">\u267B\uFE0F Regenerate Invoice</button>
            <button class="btn btn-amend" onclick="toggleAmend('${inv.id}')">\u270F\uFE0F Amend</button>
            <button class="btn btn-send" onclick="sendInvoice('${inv.id}')">\uD83D\uDCE4 Send</button>
            <button class="btn btn-unapprove" onclick="unapproveInvoice('${inv.id}')">\u21A9\uFE0F Unapprove</button>
            <button class="btn btn-del" onclick="deleteInvoice('${inv.id}')">\uD83D\uDDD1\uFE0F Delete Invoice</button>
          </div>`;
      } else {
        actionsHtml = `
          <div class="card-actions" id="actions-${inv.id}">
            <button class="btn btn-preview" onclick="previewPdf('${inv.id}')">\uD83D\uDC41 Preview PDF</button>
            <button class="btn btn-preview-email" onclick="previewEmail('${inv.id}')">\uD83D\uDCE7 Preview Email</button>
            <button class="btn btn-gen-pdf" id="gen-btn-${inv.id}" onclick="regenerateInvoice('${inv.id}')">\u267B\uFE0F Regenerate Invoice</button>
            <button class="btn btn-amend" onclick="toggleAmend('${inv.id}')">\u270F\uFE0F Amend</button>
            <button class="btn btn-send" onclick="sendInvoice('${inv.id}')">\uD83D\uDCE4 Send</button>
            <button class="btn btn-record-payment" onclick="toggleRecordPayment('${inv.id}')">\uD83D\uDCB0 Record Payment</button>
            <button class="btn btn-receipt" onclick="toggleReceiptForm('${inv.id}', ${inv.finalAmount}, ${inv.amountPaid || 0})">\uD83D\uDCE7 Send Receipt</button>
            <button class="btn btn-del" onclick="deleteInvoice('${inv.id}')">\uD83D\uDDD1\uFE0F Delete Invoice</button>
          </div>
          <div class="receipt-form" id="receipt-form-${inv.id}">
            <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:10px;">\uD83D\uDCE7 Send Payment Receipt</div>
            <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;align-items:flex-end;">
              <div>
                <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px;">Amount paid</div>
                <input type="number" id="receipt-amount-${inv.id}" step="0.01" min="0"
                  value="${(inv.amountPaid || inv.finalAmount).toFixed(2)}"
                  placeholder="0.00"
                  style="width:130px;font-size:15px;padding:9px 10px;border:1.5px solid #fed7aa;border-radius:7px;">
              </div>
              <div>
                <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px;">Payment date</div>
                <input type="date" id="receipt-date-${inv.id}"
                  value="${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })}"
                  style="font-size:15px;padding:9px 10px;border:1.5px solid #fed7aa;border-radius:7px;">
              </div>
              <div>
                <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px;">Method</div>
                <select id="receipt-method-${inv.id}" style="font-size:15px;padding:9px 10px;border:1.5px solid #fed7aa;border-radius:7px;background:white;">
                  <option value="PayNow">PayNow</option>
                  <option value="PayLah">PayLah</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-save" onclick="openReceiptPreview('${inv.id}', ${inv.finalAmount})">Preview &amp; Send \u2192</button>
              <button class="btn btn-cancel" onclick="toggleReceiptForm('${inv.id}', 0, 0)">Cancel</button>
            </div>
          </div>
          <div class="record-payment-form" id="payment-form-${inv.id}">
            <div style="font-size:13px;color:#64748b;margin-bottom:12px;">
              Invoice total: <strong>$${inv.finalAmount.toFixed(2)}</strong>
              ${inv.amountPaid > 0 ? ` &middot; Previously recorded: <strong>$${inv.amountPaid.toFixed(2)}</strong>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
              <button class="btn btn-full-paid" onclick="markFullPaid('${inv.id}')">\u2705 Full Payment ($${inv.finalAmount.toFixed(2)})</button>
              <button class="btn btn-partial" onclick="showPartialInput('${inv.id}')">\uD83D\uDCB0 Partial Payment</button>
              <button class="btn btn-cancel" onclick="toggleRecordPayment('${inv.id}')">Cancel</button>
            </div>
            <div id="partial-input-${inv.id}" style="display:none;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
                <label style="font-size:14px;font-weight:500;color:#475569;">Amount received:</label>
                <input type="number" id="pay-amount-${inv.id}" step="0.01" min="0" placeholder="0.00" style="width:140px;font-size:16px;padding:10px;" oninput="updatePaymentPreview('${inv.id}')">
              </div>
              <div id="payment-preview-${inv.id}" style="font-size:13px;color:#64748b;margin-bottom:10px;"></div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-save" onclick="savePartialPayment('${inv.id}')">\uD83D\uDCBE Save</button>
              </div>
            </div>
          </div>`;
      }

      const amendForm = renderAmendForm(inv);
      const cardClass = isDraft ? '' : isApproved ? ' approved' : ' sent';

      const aliasDisplayHtml = inv.paymentAlias
        ? `<span class="alias-label">Pays as:</span><span class="alias-value">${escHtml(inv.paymentAlias)}</span><button class="alias-edit-btn" onclick="editAlias('${inv.id}')">✏️ Edit</button>`
        : `<span class="alias-label">Pays as:</span><button class="alias-edit-btn" onclick="editAlias('${inv.id}')" style="color:#1e40af;border-color:#bfdbfe;background:#eff6ff;">+ Set payee name</button>`;

      return `
        <div class="invoice-card${cardClass}" id="card-${inv.id}">
          <div class="card-body">
            <div class="card-top">
              <span class="student-name">${escHtml(inv.studentName)}${referralBadgeHtml}</span>
              <span class="invoice-month">${escHtml(inv.month)}</span>
              <span class="badge ${badgeClass}">${badgeLabel}</span>
              ${sentAtHtml}
            </div>
            <div class="payment-alias" id="alias-display-${inv.id}">${aliasDisplayHtml}</div>
            <div class="alias-input-row" id="alias-edit-${inv.id}">
              <input type="text" class="alias-input" id="alias-input-${inv.id}" value="${escAttr(inv.paymentAlias || '')}" placeholder="e.g. TAN WEI MING" onkeydown="if(event.key==='Enter')saveAlias('${inv.id}','${inv.studentId}');if(event.key==='Escape')cancelAlias('${inv.id}')">
              <button class="btn-alias-save" onclick="saveAlias('${inv.id}','${inv.studentId}')">✓</button>
              <button class="btn-alias-cancel" onclick="cancelAlias('${inv.id}')">✕</button>
            </div>
            <div class="amounts">
              <div class="amount-line">${baseLine}</div>
              ${adjLine}
              <div class="final-amount">$${inv.finalAmount.toFixed(2)}</div>
              ${paymentBadge}
            </div>
            ${notesHtml}
            ${actionsHtml}
          </div>
          ${amendForm}
        </div>`;
    }

    function renderLineItemRowsHtml(items: any[], id: string): string {
      if (!items || !items.length) return '<p class="no-items">No extra line items</p>';
      return items.map(item => `
        <div class="line-item-row">
          <input type="text" class="li-desc" placeholder="Description" style="flex:2" value="${escAttr(item.description || '')}">
          <input type="text" class="li-slot" placeholder="e.g. Saturday" value="${escAttr(item.slot || '')}">
          <input type="number" class="li-lessons" placeholder="e.g. 4" min="0" value="${item.lessons != null && item.lessons !== '' ? item.lessons : ''}">
          <input type="number" class="li-amount" placeholder="0.00" step="0.01" value="${item.amount != null ? item.amount : ''}" oninput="updateCalc('${id}')">
          <button class="btn-remove-item" onclick="removeLineItem(this, '${id}')">\u2715</button>
        </div>
      `).join('');
    }

    function renderMainLineItemsHtml(lineItems: any[], rate: number, id: string): string {
      if (!lineItems || !lineItems.length) return '<p class="no-items">No main line items</p>';
      const grouped: Record<string, { day: string; description: string; count: number }> = {};
      lineItems.forEach(item => {
        const day = item.day || 'Unknown';
        if (!grouped[day]) grouped[day] = { day, description: item.description || '', count: 0 };
        grouped[day].count++;
      });
      return Object.values(grouped).map(group => {
        const amount = (group.count * rate).toFixed(2);
        return `
          <div class="main-item-row">
            <input type="text" class="li-desc" placeholder="Description" style="flex:2" value="${escAttr(group.description)}">
            <input type="text" class="li-slot" placeholder="Slot" value="${escAttr(group.day)}">
            <input type="number" class="li-lessons" placeholder="Lessons" min="0" value="${group.count}" oninput="updateCalc('${id}')">
            <input type="number" class="li-amount" value="${amount}" readonly>
          </div>`;
      }).join('');
    }

    function renderAmendForm(inv: any): string {
      const mainItemsHtml = renderMainLineItemsHtml(inv.lineItems || [], inv.ratePerLesson, inv.id);
      const lineItemsHtml = renderLineItemRowsHtml(inv.lineItemsExtra || [], inv.id);
      const initialExtraTotal = (inv.lineItemsExtra || []).reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0);
      return `
        <div class="amend-form" id="amend-${inv.id}">
          <h3>\u270F\uFE0F Amend Invoice</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>Rate Per Lesson</label>
              <input type="text" value="$${inv.ratePerLesson.toFixed(2)}" readonly>
            </div>
            <div class="form-group">
              <label>Adjustment Amount</label>
              <input type="number" id="a-adjustment-${inv.id}" value="${inv.adjustmentAmount || ''}" placeholder="0" step="0.01" oninput="updateCalc('${inv.id}')">
            </div>
            <div class="form-group">
              <label>Adjustment Notes</label>
              <input type="text" id="a-adjnotes-${inv.id}" value="${escAttr(inv.adjustmentNotes || '')}" placeholder="e.g. Additional lesson, discount">
            </div>
            <div class="form-group">
              <label>Due Date</label>
              <input type="date" id="a-duedate-${inv.id}" value="${escAttr(inv.dueDate || '')}">
            </div>
            <div class="form-group full-width">
              <label>Auto Notes</label>
              <textarea id="a-notes-${inv.id}" rows="3" style="white-space:pre-wrap;">${escHtml(inv.autoNotes || '')}</textarea>
            </div>
          </div>
          <div class="line-items-section">
            <div class="line-items-header"><label>Main Line Items</label></div>
            <div id="main-items-${inv.id}">${mainItemsHtml}</div>
          </div>
          <div class="line-items-section">
            <div class="line-items-header">
              <label>Extra Line Items</label>
              <button class="btn-add-item" onclick="addLineItem('${inv.id}')">+ Add Line Item</button>
            </div>
            <div id="line-items-${inv.id}">${lineItemsHtml}</div>
          </div>
          <div class="live-calc" id="calc-${inv.id}">${calcDisplay(inv.baseAmount || 0, inv.adjustmentAmount || 0, initialExtraTotal, inv.lessonsCount || 0, inv.ratePerLesson || 0)}</div>
          <div class="form-actions">
            <button class="btn btn-save" onclick="saveAmend('${inv.id}', ${inv.ratePerLesson})">\uD83D\uDCBE Save Changes</button>
            <button class="btn btn-cancel" onclick="toggleAmend('${inv.id}')">Cancel</button>
          </div>
        </div>`;
    }

    function calcDisplay(baseAmount: number, adj: number, extraTotal: number, lessonsCount: number, rate: number): string {
      const final = (baseAmount || 0) + (adj || 0) + (extraTotal || 0);
      let str = lessonsCount != null && rate != null
        ? `(${lessonsCount} \u00D7 $${rate.toFixed(2)})`
        : `$${(baseAmount || 0).toFixed(2)}`;
      if (adj !== 0) str += ` + $${adj.toFixed(2)} adj`;
      if (extraTotal !== 0) str += ` + $${extraTotal.toFixed(2)} extras`;
      str += ` = <strong>$${final.toFixed(2)}</strong>`;
      return str;
    }

    function updateCalc(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      const rate = inv.ratePerLesson;
      const adjInput = document.getElementById(`a-adjustment-${id}`) as HTMLInputElement;
      const adj = parseFloat(adjInput?.value) || 0;

      let mainBase = 0;
      let totalLessons = 0;
      document.querySelectorAll(`#main-items-${id} .main-item-row`).forEach(row => {
        const lessons = parseInt((row.querySelector('.li-lessons') as HTMLInputElement)?.value) || 0;
        const rowAmount = lessons * rate;
        mainBase += rowAmount;
        totalLessons += lessons;
        const amtInput = row.querySelector('.li-amount') as HTMLInputElement;
        if (amtInput) amtInput.value = rowAmount.toFixed(2);
      });

      let extraTotal = 0;
      document.querySelectorAll(`#amend-${id} .line-item-row`).forEach(row => {
        extraTotal += parseFloat((row.querySelector('.li-amount') as HTMLInputElement)?.value) || 0;
      });

      const el = document.getElementById(`calc-${id}`);
      if (el) el.innerHTML = calcDisplay(mainBase, adj, extraTotal, totalLessons, rate);
    }

    function addLineItem(id: string) {
      const container = document.getElementById(`line-items-${id}`) as HTMLElement;
      const noItems = container.querySelector('.no-items');
      if (noItems) noItems.remove();
      const row = document.createElement('div');
      row.className = 'line-item-row';
      row.innerHTML = `
        <input type="text" class="li-desc" placeholder="Description" style="flex:2">
        <input type="text" class="li-slot" placeholder="e.g. Saturday">
        <input type="number" class="li-lessons" placeholder="e.g. 4" min="0">
        <input type="number" class="li-amount" placeholder="0.00" step="0.01" oninput="updateCalc('${id}')">
        <button class="btn-remove-item" onclick="removeLineItem(this, '${id}')">\u2715</button>
      `;
      container.appendChild(row);
      (row.querySelector('.li-desc') as HTMLInputElement).focus();
      updateCalc(id);
    }

    function removeLineItem(btn: HTMLElement, id: string) {
      btn.closest('.line-item-row')?.remove();
      const container = document.getElementById(`line-items-${id}`) as HTMLElement;
      if (!container.querySelector('.line-item-row')) {
        container.innerHTML = '<p class="no-items">No extra line items</p>';
      }
      updateCalc(id);
    }

    function toggleAmend(id: string) {
      const form = document.getElementById(`amend-${id}`);
      if (form) form.classList.toggle('open');
    }

    function toggleRecordPayment(id: string) {
      const form = document.getElementById(`payment-form-${id}`);
      if (form) form.classList.toggle('open');
    }

    function toggleReceiptForm(id: string, finalAmount: number, amountPaid: number) {
      const form = document.getElementById(`receipt-form-${id}`);
      if (!form) return;
      const isOpen = form.classList.contains('open');
      if (isOpen) { form.classList.remove('open'); return; }
      // Pre-fill amount with amountPaid if recorded, else finalAmount
      const amountInput = document.getElementById(`receipt-amount-${id}`) as HTMLInputElement;
      if (amountInput) amountInput.value = (amountPaid > 0 ? amountPaid : finalAmount).toFixed(2);
      form.classList.add('open');
    }

    function openReceiptPreview(id: string, finalAmount: number) {
      const amount = parseFloat((document.getElementById(`receipt-amount-${id}`) as HTMLInputElement)?.value) || 0;
      const date = (document.getElementById(`receipt-date-${id}`) as HTMLInputElement)?.value || '';
      const method = (document.getElementById(`receipt-method-${id}`) as HTMLSelectElement)?.value || 'PayNow';
      if (amount <= 0) { alert('Please enter the payment amount.'); return; }
      const isOverpayment = amount > finalAmount;
      const isFullPayment = amount >= finalAmount;
      const remainingBalance = Math.max(0, finalAmount - amount);
      const qs = new URLSearchParams({
        invoiceId: id,
        paymentAmount: amount.toFixed(2),
        paymentDate: date,
        isFullPayment: String(isFullPayment),
        isOverpayment: String(isOverpayment),
        remainingBalance: remainingBalance.toFixed(2),
        totalPaid: amount.toFixed(2),
        paymentMethod: method,
      });
      window.open(`/admin/receipt?${qs}`, '_blank');
    }

    async function previewPdf(id: string) {
      const btn = document.querySelector(`#actions-${id} .btn-preview`) as HTMLButtonElement;

      // IMPORTANT: Open the new tab IMMEDIATELY while we're still in the user interaction context.
      // iOS Safari blocks window.open() if called after an await. We open with 'about:blank' first,
      // then navigate to the blob URL once the PDF is ready.
      const newTab = window.open('', '_blank');

      if (btn) { btn.disabled = true; btn.textContent = '\u23F3 Loading\u2026'; }
      try {
        const res = await fetch(`/api/preview-invoice?id=${encodeURIComponent(id)}`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (newTab) {
          newTab.location.href = url;
        } else {
          // Popup was blocked — fall back to same-tab navigation
          window.location.href = url;
        }
      } catch (err: any) {
        if (newTab) newTab.close();
        alert('Failed to load PDF: ' + err.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDC41 Preview PDF'; }
      }
    }

    function buildDefaultEmailText(inv: any): string {
      const paymentRef = `${(inv.studentName || '').toUpperCase()} \u2013 ${(inv.month || '').toUpperCase()}`;
      const amount = `$${(inv.finalAmount as number).toFixed(2)}`;
      const isAmended = !!inv.sentAt;
      const isFirstInvoice = !isAmended && typeof inv.autoNotes === 'string' && inv.autoNotes.toLowerCase().includes('first invoice');
      if (isAmended) {
        return `Dear Parent/Student,\n\nPlease find attached the amended invoice for ${inv.studentName} for ${inv.month} \u2014 ${amount}, due by ${inv.dueDate}.\n\nThis replaces the previously sent invoice. Please disregard the earlier email.\n\nTo pay, PayNow to 91397985 with reference ${paymentRef}.\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nAdrian`;
      }
      const welcomeLine = isFirstInvoice
        ? `Welcome to Adrian's Math Tuition! I'm glad to have ${inv.studentName} on board.\n\n`
        : '';
      return `Dear Parent/Student,\n\n${welcomeLine}Please find attached the invoice for ${inv.studentName} for ${inv.month} \u2014 ${amount}, due by ${inv.dueDate}.\n\nTo pay, PayNow to 91397985 with reference ${paymentRef}.\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nAdrian`;
    }

    function buildEmailSubject(inv: any): string {
      const isAmended = !!inv.sentAt;
      return isAmended
        ? `AMENDED Invoice for ${inv.month} \u2013 ${inv.studentName}`
        : `Invoice for ${inv.month} \u2013 ${inv.studentName}`;
    }

    function updateEmailPreviewStatus(hasCustom: boolean) {
      const statusEl = document.getElementById('email-preview-status') as HTMLElement;
      if (!statusEl) return;
      if (hasCustom) {
        statusEl.textContent = '\u270F\uFE0F Custom message saved';
        statusEl.className = 'email-preview-status';
      } else {
        statusEl.textContent = '\uD83D\uDCCB Default template';
        statusEl.className = 'email-preview-status default';
      }
    }

    function previewEmail(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      currentPreviewId = id;
      const subject = buildEmailSubject(inv);
      const defaultText = buildDefaultEmailText(inv);
      const panel = document.getElementById('email-preview-panel') as HTMLElement;
      const subjectEl = document.getElementById('email-preview-subject') as HTMLElement;
      const textarea = document.getElementById('email-preview-textarea') as HTMLTextAreaElement;
      if (!panel || !subjectEl || !textarea) return;
      subjectEl.innerHTML = `<strong>To:</strong> ${escHtml(inv.parentEmail || '(no email)')}<br><strong>Subject:</strong> ${escHtml(subject)}`;
      const hasCustom = !!(inv.customEmailMessage && inv.customEmailMessage.trim());
      textarea.value = hasCustom ? inv.customEmailMessage : defaultText;
      updateEmailPreviewStatus(hasCustom);
      panel.classList.add('open');
      textarea.focus();
    }

    function closeEmailPreview() {
      const panel = document.getElementById('email-preview-panel');
      if (panel) panel.classList.remove('open');
      currentPreviewId = '';
    }

    async function saveCustomMessage() {
      if (!currentPreviewId) return;
      const textarea = document.getElementById('email-preview-textarea') as HTMLTextAreaElement;
      const saveBtn = document.getElementById('btn-save-email') as HTMLButtonElement;
      const message = textarea?.value ?? '';
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: currentPreviewId, fields: { 'Custom Email Message': message } }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error: ${res.status}`); }
        const inv = invoices.find((i: any) => i.id === currentPreviewId);
        if (inv) inv.customEmailMessage = message;
        updateEmailPreviewStatus(!!(message.trim()));
        if (saveBtn) saveBtn.textContent = '\u2705 Saved';
        setTimeout(() => { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '\uD83D\uDCBE Save Custom Message'; } }, 1500);
      } catch (err: any) {
        alert('Failed to save: ' + err.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '\uD83D\uDCBE Save Custom Message'; }
      }
    }

    async function resetCustomMessage() {
      if (!currentPreviewId) return;
      const inv = invoices.find((i: any) => i.id === currentPreviewId);
      if (!inv) return;
      const resetBtn = document.getElementById('btn-reset-email') as HTMLButtonElement;
      if (resetBtn) { resetBtn.disabled = true; resetBtn.textContent = 'Resetting\u2026'; }
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: currentPreviewId, fields: { 'Custom Email Message': '' } }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error: ${res.status}`); }
        inv.customEmailMessage = '';
        const textarea = document.getElementById('email-preview-textarea') as HTMLTextAreaElement;
        if (textarea) textarea.value = buildDefaultEmailText(inv);
        updateEmailPreviewStatus(false);
      } catch (err: any) {
        alert('Failed to reset: ' + err.message);
      } finally {
        if (resetBtn) { resetBtn.disabled = false; resetBtn.textContent = '\u21A9\uFE0F Reset to Default'; }
      }
    }

    async function approveInvoice(id: string) {
      const actionsEl = document.getElementById(`actions-${id}`);
      if (!actionsEl) return;
      actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = true);
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, fields: { Status: 'Approved' } }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const inv = invoices.find((i: any) => i.id === id);
        if (inv) inv.status = 'Approved';
        actionsEl.innerHTML = '<span class="inline-confirm">\u2705 Approved</span>';
        updateSummary();
        setTimeout(() => {
          const card = document.getElementById(`card-${id}`);
          if (card && inv) card.outerHTML = renderCard(inv);
        }, 1200);
      } catch (err: any) {
        actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = false);
        alert('Failed to approve: ' + err.message);
      }
    }

    async function unapproveInvoice(id: string) {
      const actionsEl = document.getElementById(`actions-${id}`);
      if (!actionsEl) return;
      actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = true);
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, fields: { Status: 'Draft' } }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const inv = invoices.find((i: any) => i.id === id);
        if (inv) inv.status = 'Draft';
        actionsEl.innerHTML = '<span class="inline-confirm">\u21A9\uFE0F Moved to Draft</span>';
        updateSummary();
        setTimeout(() => {
          const card = document.getElementById(`card-${id}`);
          if (card && inv) card.outerHTML = renderCard(inv);
        }, 1200);
      } catch (err: any) {
        actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = false);
        alert('Failed to unapprove: ' + err.message);
      }
    }

    async function saveAmend(id: string, ratePerLesson: number) {
      const autoNotes = (document.getElementById(`a-notes-${id}`) as HTMLTextAreaElement).value;
      const adjustmentAmount = parseFloat((document.getElementById(`a-adjustment-${id}`) as HTMLInputElement)?.value) || 0;
      const adjustmentNotes = (document.getElementById(`a-adjnotes-${id}`) as HTMLInputElement)?.value || '';
      const dueDateValue = (document.getElementById(`a-duedate-${id}`) as HTMLInputElement)?.value || '';

      const mainLineItems: any[] = [];
      const reconstructedLineItems: any[] = [];
      document.querySelectorAll(`#main-items-${id} .main-item-row`).forEach(row => {
        const desc = (row.querySelector('.li-desc') as HTMLInputElement)?.value || '';
        const slot = (row.querySelector('.li-slot') as HTMLInputElement)?.value || '';
        const lessons = parseInt((row.querySelector('.li-lessons') as HTMLInputElement)?.value) || 0;
        mainLineItems.push({ description: desc, slot, lessons });
        for (let i = 0; i < lessons; i++) {
          reconstructedLineItems.push({ day: slot, description: desc });
        }
      });

      const currentLineItems: any[] = [];
      document.querySelectorAll(`#amend-${id} .line-item-row`).forEach(row => {
        const desc = (row.querySelector('.li-desc') as HTMLInputElement)?.value || '';
        const amt = parseFloat((row.querySelector('.li-amount') as HTMLInputElement)?.value) || 0;
        if (desc || amt) currentLineItems.push({
          description: desc,
          amount: amt,
          slot: (row.querySelector('.li-slot') as HTMLInputElement)?.value || '',
          lessons: (row.querySelector('.li-lessons') as HTMLInputElement)?.value || '',
        });
      });

      const baseAmount = mainLineItems.reduce((sum, item) => sum + item.lessons * ratePerLesson, 0);
      const lessonsCount = mainLineItems.reduce((sum, item) => sum + item.lessons, 0);
      const extraLineItemsTotal = currentLineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      const finalAmount = baseAmount + adjustmentAmount + extraLineItemsTotal;

      const fields: Record<string, any> = {
        'Lessons Count': lessonsCount,
        'Auto Notes': autoNotes,
        'Final Amount': finalAmount,
        'Line Items': JSON.stringify(reconstructedLineItems),
        'Line Items Extra': JSON.stringify(currentLineItems),
        'Adjustment Amount': adjustmentAmount,
        'Adjustment Notes': adjustmentNotes,
      };
      if (dueDateValue) fields['Due Date'] = dueDateValue;

      const saveBtn = document.querySelector(`#amend-${id} .btn-save`) as HTMLButtonElement;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, fields }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const inv = invoices.find((i: any) => i.id === id);
        if (inv) {
          inv.lessonsCount = lessonsCount;
          inv.baseAmount = baseAmount;
          inv.finalAmount = finalAmount;
          inv.autoNotes = autoNotes;
          inv.lineItems = reconstructedLineItems;
          inv.lineItemsExtra = currentLineItems;
          inv.adjustmentAmount = adjustmentAmount;
          inv.adjustmentNotes = adjustmentNotes;
          if (dueDateValue) inv.dueDate = dueDateValue;
        }

        try {
          await fetch('/api/admin-invoices', {
            method: 'PATCH',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ recordId: id, fields: { 'PDF URL': '' } }),
          });
        } catch { /* non-fatal */ }

        if (saveBtn) saveBtn.textContent = 'Regenerating PDF\u2026';
        try {
          await fetch('/api/generate-pdf-batch', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ recordId: id, force: true }),
          });
        } catch { /* non-fatal */ }

        try {
          const freshRes = await fetch('/api/admin-invoices', { headers: authHeaders() });
          if (freshRes.ok) {
            const freshList = await freshRes.json();
            const freshInv = freshList.find((i: any) => i.id === id);
            if (freshInv && inv) inv.pdfUrl = freshInv.pdfUrl;
          }
        } catch { /* non-fatal */ }

        const card = document.getElementById(`card-${id}`);
        if (card && inv) card.outerHTML = renderCard(inv);
        updateSummary();

        const inv2 = invoices.find((i: any) => i.id === id);
        if (inv2 && inv2.status === 'Sent') {
          alert('\u26A0\uFE0F Invoice already sent. Generate a new PDF and resend to update the parent.');
        }
      } catch (err: any) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '\uD83D\uDCBE Save Changes'; }
        alert('Failed to save: ' + err.message);
      }
    }

    async function markFullPaid(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, fields: { 'Amount Paid': inv.finalAmount, 'Is Paid': true } }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        inv.amountPaid = inv.finalAmount;
        inv.isPaid = true;
        const card = document.getElementById(`card-${id}`);
        if (card) card.outerHTML = renderCard(inv);
        updateSummary();
      } catch (err: any) {
        alert('Failed to save payment: ' + err.message);
      }
    }

    function showPartialInput(id: string) {
      const el = document.getElementById(`partial-input-${id}`);
      if (el) el.style.display = 'block';
      (document.getElementById(`pay-amount-${id}`) as HTMLInputElement)?.focus();
    }

    function updatePaymentPreview(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      const amount = parseFloat((document.getElementById(`pay-amount-${id}`) as HTMLInputElement)?.value) || 0;
      const preview = document.getElementById(`payment-preview-${id}`);
      if (!preview) return;
      if (amount <= 0) {
        preview.innerHTML = '';
      } else if (amount >= inv.finalAmount) {
        preview.innerHTML = '\u2705 <span style="color:#15803d;">Full payment \u2014 will mark as Paid</span>';
      } else {
        const outstanding = (inv.finalAmount - amount).toFixed(2);
        preview.innerHTML = `\u26A0\uFE0F <span style="color:#b45309;">Partial \u2014 $${outstanding} will remain outstanding</span>`;
      }
    }

    async function savePartialPayment(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      const amount = parseFloat((document.getElementById(`pay-amount-${id}`) as HTMLInputElement)?.value) || 0;
      if (amount <= 0) { alert('Please enter an amount.'); return; }
      const isPaid = amount >= inv.finalAmount;
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, fields: { 'Amount Paid': amount, 'Is Paid': isPaid } }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        inv.amountPaid = amount;
        inv.isPaid = isPaid;
        const card = document.getElementById(`card-${id}`);
        if (card) card.outerHTML = renderCard(inv);
        updateSummary();
      } catch (err: any) {
        alert('Failed to save payment: ' + err.message);
      }
    }

    async function sendInvoice(id: string) {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return;
      const actionsEl = document.getElementById(`actions-${id}`);
      if (!actionsEl) return;

      let confirmMsg: string;
      if (inv.status === 'Sent' && inv.sentAt) {
        confirmMsg = `This invoice was already sent on ${formatSentAt(inv.sentAt)}. Send again to ${inv.parentEmail}?`;
      } else if (inv.status === 'Draft') {
        confirmMsg = `This invoice is still a Draft. Send anyway to ${inv.parentEmail}?`;
      } else {
        confirmMsg = `Send invoice to ${inv.parentEmail}?`;
      }
      if (!confirm(confirmMsg)) return;

      actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = true);
      const sendBtn = actionsEl.querySelector('.btn-send') as HTMLButtonElement;
      if (sendBtn) sendBtn.textContent = '\u23F3 Sending\u2026';

      try {
        const res = await fetch('/api/send-invoices', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        if (data.failed > 0 && data.sent === 0) throw new Error(data.errors?.[0]?.error || 'Send failed');

        inv.status = 'Sent';
        inv.sentAt = new Date().toISOString();
        updateSummary();
        actionsEl.innerHTML = '<span class="inline-confirm">\u2705 Sent</span>';
        setTimeout(() => {
          const card = document.getElementById(`card-${id}`);
          if (card && inv) card.outerHTML = renderCard(inv);
        }, 1500);
      } catch (err: any) {
        actionsEl.querySelectorAll('button').forEach((b: any) => b.disabled = false);
        if (sendBtn) sendBtn.textContent = '\uD83D\uDCE4 Send';
        const errEl = document.createElement('div');
        errEl.className = 'gen-error-msg';
        errEl.textContent = err.message;
        actionsEl.appendChild(errEl);
        setTimeout(() => errEl.remove(), 5000);
      }
    }

    async function approveAllDrafts() {
      const month = selectedMonth;
      const scopeSuffix = month ? ` for ${month}` : ' across ALL months';
      const drafts = filteredInvoices().filter((i: any) => i.status === 'Draft');
      if (!drafts.length) {
        alert(`No draft invoices to approve${scopeSuffix}.`);
        return;
      }
      if (!confirm(`Approve ${drafts.length} draft${drafts.length !== 1 ? 's' : ''}${scopeSuffix}?\n\nApproved invoices are still sendable with "Send All Approved".`)) return;

      const btn = document.getElementById('btn-approve-all') as HTMLButtonElement;
      const origText = btn?.textContent || '\u2705 Approve All Drafts';
      if (btn) btn.disabled = true;

      const errors: { id: string; error: string }[] = [];
      let done = 0;
      const concurrency = 5;
      const queue = [...drafts];

      async function worker() {
        while (queue.length) {
          const inv = queue.shift();
          if (!inv) break;
          try {
            const res = await fetch('/api/admin-invoices', {
              method: 'PATCH',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ recordId: inv.id, fields: { Status: 'Approved' } }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } catch (err: any) {
            errors.push({ id: inv.id, error: err.message });
          } finally {
            done++;
            if (btn) btn.textContent = `Approving ${done}/${drafts.length}\u2026`;
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: concurrency }, worker));
        const ok = drafts.length - errors.length;
        showDeleteBanner(
          `\u2705 Approved ${ok} draft${ok !== 1 ? 's' : ''}${scopeSuffix}.${errors.length ? ` (${errors.length} failed)` : ''}`,
          errors.length ? 'partial' : 'success'
        );
        await loadInvoices();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
      }
    }

    async function unapproveAllApproved() {
      const month = selectedMonth;
      const scopeSuffix = month ? ` for ${month}` : ' across ALL months';
      const approved = filteredInvoices().filter((i: any) => i.status === 'Approved');
      if (!approved.length) {
        alert(`No approved invoices to unapprove${scopeSuffix}.`);
        return;
      }
      if (!confirm(`Move ${approved.length} approved invoice${approved.length !== 1 ? 's' : ''} back to Draft${scopeSuffix}?`)) return;

      const btn = document.getElementById('btn-unapprove-all') as HTMLButtonElement;
      const origText = btn?.textContent || '↩️ Unapprove All';
      if (btn) btn.disabled = true;

      const errors: { id: string; error: string }[] = [];
      let done = 0;
      const concurrency = 5;
      const queue = [...approved];

      async function worker() {
        while (queue.length) {
          const inv = queue.shift();
          if (!inv) break;
          try {
            const res = await fetch('/api/admin-invoices', {
              method: 'PATCH',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ recordId: inv.id, fields: { Status: 'Draft' } }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } catch (err: any) {
            errors.push({ id: inv.id, error: err.message });
          } finally {
            done++;
            if (btn) btn.textContent = `Unapproving ${done}/${approved.length}\u2026`;
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: concurrency }, worker));
        const ok = approved.length - errors.length;
        showDeleteBanner(
          `↩️ Moved ${ok} invoice${ok !== 1 ? 's' : ''} back to Draft${scopeSuffix}.${errors.length ? ` (${errors.length} failed)` : ''}`,
          errors.length ? 'partial' : 'success'
        );
        await loadInvoices();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
      }
    }

    async function sendAllApproved() {
      const { scopeSuffix } = bulkTargetDescription();
      const approvedInvoices = filteredInvoices().filter((i: any) => i.status === 'Approved');
      if (approvedInvoices.length === 0) { alert(`No approved invoices to send${scopeSuffix}.`); return; }
      if (!confirm(`Send ${approvedInvoices.length} approved invoice${approvedInvoices.length !== 1 ? 's' : ''}${scopeSuffix}? This will email their parents immediately.`)) return;

      const btn = document.getElementById('btn-send-all') as HTMLButtonElement;
      btn.disabled = true;
      const resultBanner = document.getElementById('result-banner') as HTMLElement;
      resultBanner.style.display = 'none';

      const ids = approvedInvoices.map((i: any) => i.id);
      const batchSize = 3;
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));

      let totalSent = 0;
      let totalFailed = 0;
      const allErrors: any[] = [];

      try {
        for (let b = 0; b < batches.length; b++) {
          btn.textContent = `\uD83D\uDCE4 Sending batch ${b + 1}/${batches.length}\u2026`;
          const res = await fetch('/api/send-invoices', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ recordIds: batches[b] }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Server error: ${res.status}`);
          }
          const data = await res.json();
          totalSent += data.sent || 0;
          totalFailed += data.failed || 0;
          if (data.errors) allErrors.push(...data.errors);
        }

        if (totalSent > 0 && totalFailed === 0) {
          resultBanner.className = 'result-banner success';
          resultBanner.innerHTML = `<span>\u2705 ${totalSent} invoice${totalSent !== 1 ? 's' : ''} sent successfully.</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
        } else if (totalSent > 0 && totalFailed > 0) {
          resultBanner.className = 'result-banner warning';
          resultBanner.innerHTML = `<span>\u2705 ${totalSent} sent \u00B7 \u26A0\uFE0F ${totalFailed} failed</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
        } else {
          resultBanner.className = 'result-banner error';
          const errMsg = allErrors[0]?.error || 'All sends failed';
          resultBanner.innerHTML = `<span>\u274C ${escHtml(errMsg)}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
        }
        resultBanner.style.display = 'flex';
        await loadInvoices();
      } catch (err: any) {
        resultBanner.className = 'result-banner error';
        resultBanner.style.display = 'flex';
        resultBanner.innerHTML = `<span>\u274C ${escHtml(err.message)}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
      } finally {
        btn.disabled = false;
        btn.textContent = '\uD83D\uDCE4 Send All Approved';
      }
    }

    function updateBulkButtonLabels() {
      const month = selectedMonth;
      const suffix = month ? ` (${month})` : '';
      const map: Record<string, string> = {
        'btn-generate-invoices': `\uD83D\uDCC4 Generate Missing Invoices${suffix}`,
        'btn-regenerate-all':    `\u267B\uFE0F Regenerate All Invoices${suffix}`,
        'btn-download-all':      `\u2B07\uFE0F Download All PDFs${suffix}`,
        'btn-approve-all':       `\u2705 Approve All Drafts${suffix}`,
        'btn-unapprove-all':     `\u21A9\uFE0F Unapprove All${suffix}`,
        'btn-send-all':          `\uD83D\uDCE4 Send All Approved${suffix}`,
      };
      for (const [id, label] of Object.entries(map)) {
        const el = document.getElementById(id) as HTMLButtonElement | null;
        if (el && !el.disabled) el.textContent = label;
      }
    }

    function showResultBanner(data: { generated: number; skipped: number; errors: any[] }) {
      const banner = document.getElementById('result-banner') as HTMLElement;
      const { generated, skipped, errors } = data;
      let type: string, msg: string;

      if (generated === 0 && errors.length === 0) {
        type = 'info';
        msg = '\u2139\uFE0F All PDFs already exist \u2014 nothing to generate.';
      } else if (generated > 0 && errors.length === 0) {
        type = 'success';
        msg = `\u2705 ${generated} PDF${generated !== 1 ? 's' : ''} generated successfully.`;
        if (skipped > 0) msg += ` (${skipped} already existed, skipped)`;
      } else if (generated > 0 && errors.length > 0) {
        type = 'warning';
        const names = errors.map(e => escHtml(e.studentName || e.id)).join(', ');
        msg = `\u2705 ${generated} generated \u00B7 \u26A0\uFE0F ${errors.length} failed: ${names}`;
      } else {
        type = 'error';
        const names = errors.map(e => escHtml(e.studentName || e.id)).join(', ');
        msg = `\u274C All ${errors.length} failed: ${names}`;
      }

      banner.className = `result-banner ${type}`;
      banner.style.display = 'flex';
      banner.innerHTML = `<span>${msg}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
    }

    async function runBulkGenerate(btnId: string, label: string, body: object) {
      const btn = document.getElementById(btnId) as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '\u23F3 Generating\u2026 (1\u20132 min)';
      const resultBanner = document.getElementById('result-banner') as HTMLElement;
      resultBanner.style.display = 'none';
      try {
        const res = await fetch('/api/generate-pdf-batch', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        showResultBanner(data);
        await loadInvoices();
      } catch (err: any) {
        resultBanner.className = 'result-banner error';
        resultBanner.style.display = 'flex';
        resultBanner.innerHTML = `<span>\u274C ${escHtml(err.message)}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    }

    async function generateInvoices() {
      const monthDesc = selectedMonth ? `for ${selectedMonth}` : 'for the default next month';
      if (!confirm(`Generate missing invoices ${monthDesc}?\nStudents who already have an invoice for this month will be skipped.`)) return;
      const btn = document.getElementById('btn-generate-invoices') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '\uD83D\uDCC4 Generating\u2026';
      const resultBanner = document.getElementById('result-banner') as HTMLElement;
      resultBanner.style.display = 'none';

      try {
        const res = await fetch('/api/generate-invoices', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ month: selectedMonth || '' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        resultBanner.className = 'result-banner success';
        resultBanner.style.display = 'flex';
        resultBanner.innerHTML = `<span>\u2705 ${data.generated} invoice${data.generated !== 1 ? 's' : ''} generated, ${data.skipped} skipped.</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
        await loadInvoices();
      } catch (err: any) {
        resultBanner.className = 'result-banner error';
        resultBanner.style.display = 'flex';
        resultBanner.innerHTML = `<span>\u274C ${escHtml(err.message)}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
      } finally {
        btn.disabled = false;
        btn.textContent = '\uD83D\uDCC4 Generate Missing Invoices';
      }
    }

    async function regenerateAllPDFs() {
      const { month, scopeSuffix } = bulkTargetDescription();
      const invoicesToRegen = filteredInvoices();
      if (!invoicesToRegen.length) { alert(`No invoices to regenerate${scopeSuffix}.`); return; }
      if (!confirm(`Regenerate all PDFs${scopeSuffix}? This will update PDFs to reflect current invoice data.`)) return;

      const btn = document.getElementById('btn-regenerate-all') as HTMLButtonElement;
      const origLabel = btn?.textContent || '\uD83D\uDD04 Regenerate All PDFs';
      if (btn) btn.disabled = true;
      const resultBanner = document.getElementById('result-banner') as HTMLElement;
      resultBanner.style.display = 'none';

      let done = 0;
      let failed = 0;
      const total = invoicesToRegen.length;

      for (const inv of invoicesToRegen) {
        if (btn) btn.textContent = `Regenerating ${done + 1}/${total}\u2026`;
        try {
          const res = await fetch('/api/generate-pdf-batch', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ recordId: inv.id, force: true }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          done++;
        } catch {
          failed++;
          done++;
        }
      }

      if (btn) { btn.disabled = false; btn.textContent = origLabel; }
      const okCount = total - failed;
      showDeleteBanner(
        `\u2705 ${okCount} PDF${okCount !== 1 ? 's' : ''} regenerated${scopeSuffix}.${failed ? ` (\u26A0\uFE0F ${failed} failed)` : ''}`,
        failed ? 'partial' : 'success'
      );
      await loadInvoices();
    }

    async function downloadBlob(url: string, filename: string) {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }

    async function downloadAllPDFs() {
      const btn = document.getElementById('btn-download-all') as HTMLButtonElement;
      const visible = filteredInvoices();
      const withPdf = visible.filter((inv: any) => inv.pdfUrl);
      const missing = visible.length - withPdf.length;

      if (withPdf.length === 0) {
        btn.textContent = '\u26A0\uFE0F No PDFs to download \u2014 generate them first';
        setTimeout(() => { btn.textContent = '\u2B07\uFE0F Download All PDFs'; }, 4000);
        return;
      }

      btn.disabled = true;
      let downloaded = 0;
      for (const inv of withPdf) {
        btn.textContent = `\u2B07\uFE0F Downloading ${downloaded + 1}/${withPdf.length}\u2026`;
        await downloadBlob(inv.pdfUrl, `AdrianMathTuition-Invoice-${inv.studentName}-${inv.month}.pdf`);
        downloaded++;
        await new Promise(r => setTimeout(r, 500));
      }

      let doneMsg = `\u2705 Downloaded ${downloaded} PDF${downloaded !== 1 ? 's' : ''}`;
      if (missing > 0) doneMsg += ` \u2014 \u26A0\uFE0F ${missing} invoice${missing !== 1 ? 's' : ''} had no PDF`;
      btn.textContent = doneMsg;
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '\u2B07\uFE0F Download All PDFs'; }, 6000);
    }

    async function regenerateInvoice(id: string) {
      const btn = document.getElementById(`gen-btn-${id}`) as HTMLButtonElement;
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = '\u267B\uFE0F Regenerating\u2026';
      btn.classList.remove('success', 'error');

      const existingErr = document.getElementById(`gen-err-${id}`);
      if (existingErr) existingErr.remove();

      try {
        const res = await fetch('/api/regenerate-invoice', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || `Server error: ${res.status}`);
        }

        btn.textContent = '\u2705 Done';
        btn.classList.add('success');
        btn.disabled = false;

        setTimeout(() => loadInvoices(), 1500);
      } catch (err: any) {
        btn.textContent = '\u274C Failed';
        btn.classList.add('error');
        btn.disabled = false;

        const actionsEl = document.getElementById(`actions-${id}`);
        if (actionsEl) {
          const errEl = document.createElement('div');
          errEl.id = `gen-err-${id}`;
          errEl.className = 'gen-error-msg';
          errEl.textContent = err.message;
          actionsEl.appendChild(errEl);
          setTimeout(() => errEl.remove(), 5000);
        }
      }
    }

    function editAlias(id: string) {
      const display = document.getElementById(`alias-display-${id}`);
      const edit = document.getElementById(`alias-edit-${id}`);
      if (display) display.style.display = 'none';
      if (edit) { edit.classList.add('open'); (document.getElementById(`alias-input-${id}`) as HTMLInputElement)?.focus(); }
    }

    function cancelAlias(id: string) {
      const display = document.getElementById(`alias-display-${id}`);
      const edit = document.getElementById(`alias-edit-${id}`);
      if (display) display.style.display = 'flex';
      if (edit) edit.classList.remove('open');
    }

    async function saveAlias(id: string, studentId: string) {
      const input = document.getElementById(`alias-input-${id}`) as HTMLInputElement;
      const alias = input?.value.trim() ?? '';
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ studentId, paymentAlias: alias }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        // Update all invoices for this student and re-render their cards
        invoices.forEach((inv: any) => {
          if (inv.studentId === studentId) {
            inv.paymentAlias = alias;
            const card = document.getElementById(`card-${inv.id}`);
            if (card) card.outerHTML = renderCard(inv);
          }
        });
      } catch (err: any) {
        alert('Failed to save alias: ' + err.message);
      }
    }

    // ---------- Delete handlers ----------
    function studentLabel(id: string): string {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) return id;
      return `${inv.studentName || 'Unknown'} (${inv.month || 'no month'})`;
    }

    async function deleteInvoice(id: string) {
      const label = studentLabel(id);
      if (!confirm(`\u26A0\uFE0F Delete this invoice and its PDF?\n\n${label}\n\nThis permanently removes the Airtable record and the PDF file. This cannot be undone.`)) return;
      try {
        const res = await fetch('/api/admin-invoices', {
          method: 'DELETE',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ recordId: id, scope: 'invoice' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
        const card = document.getElementById(`card-${id}`);
        if (card) card.remove();
        invoices = invoices.filter((i: any) => i.id !== id);
        showDeleteBanner(`\u2705 Deleted invoice for ${escHtml(label)} (PDFs removed: ${data.deletedPdfs || 0}).`, 'success');
      } catch (err: any) {
        alert('Failed to delete invoice: ' + err.message);
      }
    }

    function bulkTargetDescription(): { month: string; scopeSuffix: string } {
      const month = selectedMonth;
      return {
        month,
        scopeSuffix: month ? ` for ${month}` : ' across ALL months',
      };
    }

    function showDeleteBanner(html: string, _kind: 'success' | 'partial' | 'error' = 'success') {
      const banner = document.getElementById('result-banner');
      if (!banner) return;
      banner.style.display = 'block';
      banner.className = 'result-banner';
      banner.innerHTML = `<span>${html}</span><button class="btn-dismiss" onclick="this.parentElement.style.display='none'">\u2715</button>`;
    }

    // Expose to window for inline onclick handlers
    const w = window as any;
    w.submitPassword = submitPassword;
    w.logout = logout;
    w.loadInvoices = loadInvoices;
    w.onMonthFilter = onMonthFilter;
    w.onSearchChange = onSearchChange;
    w.clearSearch = clearSearch;
    w.toggleTotal = toggleTotal;
    w.previewPdf = previewPdf;
    w.approveInvoice = approveInvoice;
    w.unapproveInvoice = unapproveInvoice;
    w.saveAmend = saveAmend;
    w.toggleAmend = toggleAmend;
    w.addLineItem = addLineItem;
    w.removeLineItem = removeLineItem;
    w.updateCalc = updateCalc;
    w.generateInvoices = generateInvoices;
    w.regenerateAllPDFs = regenerateAllPDFs;
    w.downloadAllPDFs = downloadAllPDFs;
    w.regenerateInvoice = regenerateInvoice;
    w.sendInvoice = sendInvoice;
    w.updateBulkButtonLabels = updateBulkButtonLabels;
    w.approveAllDrafts = approveAllDrafts;
    w.unapproveAllApproved = unapproveAllApproved;
    w.sendAllApproved = sendAllApproved;
    w.toggleRecordPayment = toggleRecordPayment;
    w.markFullPaid = markFullPaid;
    w.showPartialInput = showPartialInput;
    w.updatePaymentPreview = updatePaymentPreview;
    w.savePartialPayment = savePartialPayment;
    w.editAlias = editAlias;
    w.cancelAlias = cancelAlias;
    w.saveAlias = saveAlias;
    w.deleteInvoice = deleteInvoice;

    w.previewEmail = previewEmail;
    w.closeEmailPreview = closeEmailPreview;
    w.saveCustomMessage = saveCustomMessage;
    w.resetCustomMessage = resetCustomMessage;

    init();

    return () => {
      ['submitPassword','logout','loadInvoices','onMonthFilter','onSearchChange','clearSearch','toggleTotal','previewPdf',
        'approveInvoice','unapproveInvoice','saveAmend','toggleAmend','addLineItem',
        'removeLineItem','updateCalc','generateInvoices',
        'regenerateAllPDFs','downloadAllPDFs','regenerateInvoice','sendInvoice',
        'sendAllApproved','toggleRecordPayment',
        'markFullPaid','showPartialInput','updatePaymentPreview','savePartialPayment',
        'editAlias','cancelAlias','saveAlias',
        'updateBulkButtonLabels','approveAllDrafts','unapproveAllApproved',
        'deleteInvoice','previewEmail','closeEmailPreview','saveCustomMessage','resetCustomMessage',
      ].forEach(fn => delete (window as any)[fn]);
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div id="login-overlay">
        <form
          className="login-card"
          onSubmit={(e) => { e.preventDefault(); (window as any).submitPassword(); }}
          action="#"
          method="post"
        >
          <h1>📋 Invoice Review</h1>
          <p>Enter the admin password to continue</p>
          {/* Hidden username field helps iOS Keychain associate the saved password */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            defaultValue="admin"
            style={{ display: 'none' }}
            readOnly
          />
          <input
            type="password"
            id="pw-input"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div id="pw-error"></div>
          <button id="pw-btn" type="submit">Submit</button>
        </form>
      </div>

      <div className="header">
        <div className="header-left">
          <h1>📋 Invoice Review</h1>
          <p>Review and approve draft invoices before sending</p>
        </div>
        <div className="header-right">
          <select id="month-filter" onChange={(e) => (window as any).onMonthFilter(e.target.value)}></select>
          <span id="approval-counter"></span>
          <span id="summary"></span>
          <button className="btn-generate" id="btn-generate-invoices" onClick={() => (window as any).generateInvoices()}>📄 Generate Missing Invoices</button>
          <button className="btn-generate" id="btn-regenerate-all" onClick={() => (window as any).regenerateAllPDFs()}>♻️ Regenerate All Invoices</button>
          <button className="btn-generate" id="btn-download-all" onClick={() => (window as any).downloadAllPDFs()}>⬇️ Download All PDFs</button>
          <button className="btn-generate" id="btn-approve-all" onClick={() => (window as any).approveAllDrafts()}>✅ Approve All Drafts</button>
          <button className="btn-generate" id="btn-unapprove-all" onClick={() => (window as any).unapproveAllApproved()}>↩️ Unapprove All</button>
          <button className="btn-generate" id="btn-send-all" onClick={() => (window as any).sendAllApproved()}>📤 Send All Approved</button>
          <button className="btn-refresh" onClick={() => (window as any).loadInvoices()}>🔄 Refresh</button>
          <button className="btn-refresh" onClick={() => (window as any).logout()}>🚪 Log out</button>
        </div>
      </div>

      <div className="content">
        <div className="search-bar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="search"
              id="search-input"
              placeholder="Search student name..."
              autoComplete="off"
              onChange={(e) => (window as any).onSearchChange(e.target.value)}
              onInput={(e) => (window as any).onSearchChange((e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              id="search-clear"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => (window as any).clearSearch()}
            >✕</button>
          </div>
        </div>
        <div id="error-banner" className="error-banner" style={{ display: 'none' }}>
          <span id="error-msg"></span>
          <button className="btn-retry" onClick={() => (window as any).loadInvoices()}>Retry</button>
        </div>
        <div id="result-banner" style={{ display: 'none' }}></div>
        <div id="invoices-container"></div>
      </div>

      {/* Email preview side panel */}
      <div id="email-preview-panel" className="email-preview-panel">
        <div className="email-preview-header">
          <h2>📧 Email Preview</h2>
          <button className="btn-close-preview" onClick={() => (window as any).closeEmailPreview()}>✕</button>
        </div>
        <div className="email-preview-subject" id="email-preview-subject"></div>
        <div className="email-preview-status default" id="email-preview-status">📋 Default template</div>
        <textarea
          className="email-preview-textarea"
          id="email-preview-textarea"
          placeholder="Email body..."
          rows={16}
        />
        <div className="email-preview-actions">
          <button id="btn-save-email" className="btn btn-save" onClick={() => (window as any).saveCustomMessage()}>💾 Save Custom Message</button>
          <button id="btn-reset-email" className="btn btn-cancel" onClick={() => (window as any).resetCustomMessage()}>↩️ Reset to Default</button>
        </div>
      </div>
    </>
  );
}
