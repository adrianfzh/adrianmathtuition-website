'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  label: string;
  type: string;
  [key: string]: any;
}

interface ActionPlan {
  summary: string;
  actions: ActionItem[];
  followUp?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actionPlan?: ActionPlan;
  actionState?: 'pending' | 'executing' | 'done' | 'cancelled';
  actionResults?: { id: string; label: string; ok: boolean; error?: string }[];
}

interface AdminAIChatProps {
  apiRoute: string;
  title: string;
  accentColor?: string;
  placeholder?: string;
  fabBottom?: number;
  fabTop?: number;
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  action: ActionItem,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${password}`,
  };

  try {
    let res: Response;
    switch (action.type) {
      case 'patch_invoice':
        res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ recordId: action.recordId, fields: action.fields }),
        });
        break;
      case 'regenerate_pdfs':
        res = await fetch('/api/generate-pdf-batch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ recordIds: action.recordIds, force: true }),
        });
        break;
      case 'send_emails':
        res = await fetch('/api/send-invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify({ recordIds: action.recordIds }),
        });
        break;
      case 'mark_paid':
        res = await fetch('/api/admin-invoices', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            recordId: action.recordId,
            fields: { 'Amount Paid': action.amount, 'Is Paid': action.isPaid },
          }),
        });
        break;
      case 'mark_attendance':
        res = await fetch('/api/admin-schedule/attendance', {
          method: 'POST',
          headers,
          body: JSON.stringify({ lessonId: action.lessonId, status: action.status }),
        });
        break;
      case 'add_lesson':
        res = await fetch('/api/admin-schedule/add', {
          method: 'POST',
          headers,
          body: JSON.stringify(action.payload),
        });
        break;
      case 'delete_lesson':
        res = await fetch('/api/admin-schedule/delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ lessonId: action.lessonId }),
        });
        break;
      default:
        return { ok: false, error: `Unknown action type: ${action.type}` };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Network error' };
  }
}

// ─── Cookie helper ────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAIChat({
  apiRoute,
  title,
  accentColor = '#1e3a5f',
  placeholder = 'Ask me anything…',
  fabBottom = 24,
  fabTop,
}: AdminAIChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // ─── Send message ──────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const password = getCookie('admin_pw');

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    // Build conversation history for API (exclude current empty assistant msg)
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(apiRoute, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'Request failed');
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Error: ${errText}`,
          };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';
      let actionPlan: ActionPlan | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const event = JSON.parse(payload);
            if (event.type === 'text') {
              accText += event.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: accText,
                };
                return updated;
              });
            } else if (event.type === 'action_plan') {
              actionPlan = event.plan;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: accText,
                  actionPlan,
                  actionState: 'pending',
                };
                return updated;
              });
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Connection error. Please try again.',
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, apiRoute]);

  // ─── Action handlers ───────────────────────────────────────────────────────

  const handleConfirm = useCallback(
    async (msgIndex: number) => {
      const msg = messages[msgIndex];
      if (!msg?.actionPlan) return;

      const password = getCookie('admin_pw');

      // Set executing state
      setMessages(prev => {
        const updated = [...prev];
        updated[msgIndex] = { ...updated[msgIndex], actionState: 'executing' };
        return updated;
      });

      const results: { id: string; label: string; ok: boolean; error?: string }[] = [];

      for (const action of msg.actionPlan.actions) {
        const result = await executeAction(action, password);
        results.push({ id: action.id, label: action.label, ...result });
      }

      const allOk = results.every(r => r.ok);
      const resultText = results
        .map(r => `${r.ok ? '✅' : '❌'} ${r.label}${r.error ? ` — ${r.error}` : ''}`)
        .join('\n');

      const summaryMsg: Message = {
        role: 'assistant',
        content: `${allOk ? 'All actions completed.' : 'Some actions failed.'}\n\n${resultText}${
          msg.actionPlan.followUp ? `\n\n${msg.actionPlan.followUp}` : ''
        }`,
      };

      setMessages(prev => {
        const updated = [...prev];
        updated[msgIndex] = {
          ...updated[msgIndex],
          actionState: 'done',
          actionResults: results,
        };
        return [...updated, summaryMsg];
      });
    },
    [messages]
  );

  const handleCancel = useCallback(
    (msgIndex: number) => {
      setMessages(prev => {
        const updated = [...prev];
        updated[msgIndex] = { ...updated[msgIndex], actionState: 'cancelled' };
        return updated;
      });
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Cancelled.' },
      ]);
    },
    []
  );

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ─── Styles ────────────────────────────────────────────────────────────────

  const s = {
    fab: {
      position: 'fixed' as const,
      ...(fabTop !== undefined ? { top: fabTop } : { bottom: fabBottom }),
      right: 16,
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 18px',
      background: accentColor,
      color: 'white',
      border: 'none',
      borderRadius: 28,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 600,
      fontFamily: 'inherit',
      transition: 'transform 0.15s, box-shadow 0.15s',
      whiteSpace: 'nowrap' as const,
    },
    panel: {
      position: 'fixed' as const,
      ...(fabTop !== undefined
        ? { top: fabTop + 52 }
        : { bottom: fabBottom + 56 }),
      right: 16,
      zIndex: 9001,
      width: 400,
      maxWidth: 'calc(100vw - 32px)',
      height: 580,
      maxHeight: 'calc(100vh - 100px)',
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      animation: 'aiChatSlideUp 0.2s ease',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      background: accentColor,
      color: 'white',
      flexShrink: 0,
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    closeBtn: {
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      color: 'white',
      width: 28,
      height: 28,
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'inherit',
    },
    messages: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 10,
    },
    userBubble: {
      alignSelf: 'flex-end',
      background: accentColor,
      color: 'white',
      padding: '9px 13px',
      borderRadius: '14px 14px 3px 14px',
      fontSize: 13,
      maxWidth: '82%',
      lineHeight: 1.45,
      whiteSpace: 'pre-wrap' as const,
    },
    assistantBubble: {
      alignSelf: 'flex-start',
      background: '#f8fafc',
      color: '#1e293b',
      padding: '9px 13px',
      borderRadius: '14px 14px 14px 3px',
      fontSize: 13,
      maxWidth: '92%',
      lineHeight: 1.55,
      border: '1px solid #e2e8f0',
      whiteSpace: 'pre-wrap' as const,
    },
    actionCard: {
      background: '#f1f5f9',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '12px 13px',
      marginTop: 8,
      fontSize: 13,
    },
    actionSummary: {
      fontWeight: 600,
      color: '#1e293b',
      marginBottom: 8,
    },
    actionList: {
      listStyle: 'none',
      padding: 0,
      margin: '0 0 10px 0',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
    },
    actionListItem: {
      color: '#475569',
      fontSize: 12,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 6,
    },
    actionBtns: {
      display: 'flex',
      gap: 8,
      marginTop: 10,
    },
    confirmBtn: {
      padding: '7px 16px',
      background: accentColor,
      color: 'white',
      border: 'none',
      borderRadius: 7,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    cancelBtn: {
      padding: '7px 14px',
      background: 'white',
      color: '#475569',
      border: '1px solid #e2e8f0',
      borderRadius: 7,
      fontSize: 13,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    executingText: {
      color: '#64748b',
      fontSize: 12,
      fontStyle: 'italic' as const,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    inputBar: {
      borderTop: '1px solid #e2e8f0',
      padding: '10px 12px',
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end',
      flexShrink: 0,
      background: 'white',
    },
    textarea: {
      flex: 1,
      resize: 'none' as const,
      border: '1.5px solid #e2e8f0',
      borderRadius: 10,
      padding: '8px 11px',
      fontSize: 13,
      fontFamily: 'inherit',
      lineHeight: 1.4,
      outline: 'none',
      maxHeight: 100,
      minHeight: 36,
    },
    sendBtn: {
      padding: '8px 14px',
      background: accentColor,
      color: 'white',
      border: 'none',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      flexShrink: 0,
      height: 36,
    },
    sendBtnDisabled: {
      opacity: 0.45,
      cursor: 'not-allowed' as const,
    },
    cursor: {
      display: 'inline-block',
      width: 2,
      height: '1em',
      background: accentColor,
      marginLeft: 2,
      verticalAlign: 'text-bottom',
      animation: 'aiChatBlink 0.8s step-end infinite',
    },
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      color: '#94a3b8',
      fontSize: 13,
      textAlign: 'center' as const,
      padding: '0 24px',
      gap: 8,
    },
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes aiChatSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiChatBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes aiChatSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* FAB */}
      {!open && (
        <button
          style={s.fab}
          onClick={() => setOpen(true)}
          title={title}
        >
          <span style={{ fontSize: 16 }}>✨</span>
          {title}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerTitle}>
              <span>✨</span>
              {title}
            </div>
            <button
              style={s.closeBtn}
              onClick={() => {
                setOpen(false);
                abortRef.current?.abort();
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div style={s.messages}>
            {messages.length === 0 && (
              <div style={s.emptyState}>
                <div style={{ fontSize: 28 }}>✨</div>
                <div>Ask me anything about {title.toLowerCase().replace(' assistant', '')}.</div>
                <div style={{ fontSize: 12 }}>{placeholder}</div>
              </div>
            )}

            {messages.map((msg, i) => (
              <React.Fragment key={i}>
                <div style={msg.role === 'user' ? s.userBubble : s.assistantBubble}>
                  {msg.content}
                  {/* Blinking cursor for streaming last assistant message */}
                  {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span style={s.cursor} />
                  )}
                </div>

                {/* Action plan card */}
                {msg.actionPlan && msg.actionState !== 'cancelled' && msg.actionState !== 'done' && (
                  <div style={s.actionCard}>
                    <div style={s.actionSummary}>📋 {msg.actionPlan.summary}</div>
                    <ul style={s.actionList}>
                      {msg.actionPlan.actions.map(action => (
                        <li key={action.id} style={s.actionListItem}>
                          <span style={{ color: accentColor, fontWeight: 700 }}>→</span>
                          {action.label}
                        </li>
                      ))}
                    </ul>

                    {msg.actionState === 'pending' && (
                      <div style={s.actionBtns}>
                        <button
                          style={s.confirmBtn}
                          onClick={() => handleConfirm(i)}
                        >
                          Confirm
                        </button>
                        <button
                          style={s.cancelBtn}
                          onClick={() => handleCancel(i)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {msg.actionState === 'executing' && (
                      <div style={s.executingText}>
                        <span style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          border: '2px solid #e2e8f0',
                          borderTopColor: accentColor,
                          borderRadius: '50%',
                          animation: 'aiChatSpin 0.7s linear infinite',
                        }} />
                        Executing…
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={s.inputBar}>
            <textarea
              ref={inputRef}
              style={s.textarea}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? 'Thinking…' : placeholder}
              disabled={streaming}
              rows={1}
            />
            <button
              style={{
                ...s.sendBtn,
                ...(streaming || !input.trim() ? s.sendBtnDisabled : {}),
              }}
              onClick={send}
              disabled={streaming || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
