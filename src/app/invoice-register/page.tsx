'use client';

import { useEffect, useState } from 'react';

type Result =
  | { ok: true; studentName: string; token: string; expiresAt: string; botUsername: string }
  | { ok: false; expired?: boolean; message: string };

export default function InvoiceRegisterPage() {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const qs = url.searchParams.toString();
    fetch(`/api/invoice-register?${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setResult({ ok: true, ...body });
        } else {
          setResult({
            ok: false,
            expired: body?.expired === true,
            message: body?.error || 'Unable to generate a registration code.',
          });
        }
      })
      .catch(() => {
        setResult({ ok: false, message: 'Network error. Please try again.' });
      });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f3f8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: '#ffffff',
        borderRadius: 16,
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(26,35,64,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#f5c842',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 22, color: '#1a2340',
          }}>A</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a2340' }}>
            Adrian&apos;s Math Tuition
          </div>
        </div>

        {!result && (
          <p style={{ color: '#64748b', fontSize: 14 }}>Generating your registration code…</p>
        )}

        {result?.ok === false && (
          <div>
            <h1 style={{ fontSize: 20, color: '#1a2340', marginBottom: 8 }}>
              {result.expired ? 'This link has expired' : 'Unable to generate code'}
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              {result.expired
                ? 'Registration links are valid for 30 days from invoice issue. Please ask Adrian for a new code.'
                : result.message}
            </p>
          </div>
        )}

        {result?.ok === true && (
          <div>
            <h1 style={{ fontSize: 22, color: '#1a2340', marginBottom: 4, fontFamily: 'Georgia, serif' }}>
              Hi {result.studentName.split(' ')[0]} 👋
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              Here&apos;s your Telegram registration code. It&apos;s valid for 7 days.
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '18px 20px',
              marginBottom: 20,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#64748b', marginBottom: 6,
              }}>Your code</div>
              <div style={{
                fontSize: 28, fontFamily: 'Menlo, Monaco, monospace', fontWeight: 700,
                color: '#1a2340', letterSpacing: '0.08em',
              }}>{result.token}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
                Expires {new Date(result.expiresAt).toLocaleDateString('en-SG', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            </div>

            <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>How to register:</div>
              <ol style={{ paddingLeft: 20, color: '#475569' }}>
                <li>Open Telegram and search for <strong>@{result.botUsername}</strong></li>
                <li>Tap <em>Start</em> (or send <code>/start</code>)</li>
                <li>Send <code>/register {result.token}</code></li>
              </ol>
            </div>

            <a
              href={`https://t.me/${result.botUsername}`}
              style={{
                display: 'inline-block',
                marginTop: 24,
                padding: '10px 18px',
                background: '#1a2340',
                color: '#ffffff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open @{result.botUsername} in Telegram
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
