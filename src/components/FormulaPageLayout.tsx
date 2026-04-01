'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState, ReactNode } from 'react';

declare global {
  interface Window {
    renderMathInElement: (el: HTMLElement, opts: object) => void;
  }
}

/* ── Section card ─────────────────────────────────────────────────────────── */
export function FormulaSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="formula-section-card">
      <div style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 18, color: 'hsl(220,60%,20%)',
        paddingBottom: 10, marginBottom: 14,
        borderBottom: '2px solid hsl(45,90%,55%)',
        lineHeight: 1.3,
      }}>
        {title}
      </div>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 12, marginTop: -6 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

/* ── Formula row ──────────────────────────────────────────────────────────── */
export function FormulaRow({ latex, annotation }: { latex: string; annotation?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        className="formula-row"
        dangerouslySetInnerHTML={{ __html: `$$${latex}$$` }}
      />
      {annotation && <div className="formula-annotation">{annotation}</div>}
    </div>
  );
}

/* ── Note box ─────────────────────────────────────────────────────────────── */
export function FormulaNoteBox({ html }: { html: string }) {
  return (
    <div className="formula-note" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/* ── Special-values table ─────────────────────────────────────────────────── */
export function FormulaTable({
  headers,
  rows,
}: {
  headers: string[];                             // LaTeX strings (no $ wrapper)
  rows: { label: string; cells: string[] }[];    // label + cells: LaTeX strings
}) {
  return (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table className="formula-table">
        <thead>
          <tr>
            <th />
            {headers.map((h, i) => (
              <th key={i} dangerouslySetInnerHTML={{ __html: `$${h}$` }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td dangerouslySetInnerHTML={{ __html: `$${row.label}$` }} />
              {row.cells.map((cell, j) => (
                <td key={j} dangerouslySetInnerHTML={{ __html: `$${cell}$` }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Page layout wrapper ──────────────────────────────────────────────────── */
export default function FormulaPageLayout({
  title,
  subtitle,
  contentId,
  footerNote,
  children,
}: {
  title: string;
  subtitle: string;
  contentId: string;
  footerNote?: string;
  children: ReactNode;
}) {
  const [inIframe, setInIframe] = useState(false);
  const [katexReady, setKatexReady] = useState(false);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
  }, []);

  function renderMath() {
    if (typeof window === 'undefined' || !window.renderMathInElement) return;
    const el = document.getElementById(contentId);
    if (!el) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$',  right: '$',  display: false },
        ],
        throwOnError: false,
      });
    } catch (e) { console.warn('[KaTeX]', e); }
  }

  useEffect(() => {
    if (katexReady) renderMath();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [katexReady]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
        strategy="afterInteractive"
        onLoad={() => setKatexReady(true)}
      />

      <style>{`
        .formula-row { overflow-x: auto; padding: 6px 0; -webkit-overflow-scrolling: touch; }
        .formula-row .katex-display { margin: 0; }
        .formula-section-card { background: white; border: 1px solid hsl(220,15%,90%); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        @media (max-width: 480px) { .formula-section-card { padding: 16px; } }
        .formula-note { background: hsl(45,90%,96%); border-left: 3px solid hsl(45,85%,55%); border-radius: 0 6px 6px 0; padding: 8px 12px; margin-top: 8px; font-style: italic; font-size: 14px; color: hsl(220,20%,40%); }
        .formula-annotation { font-size: 12px; color: hsl(220,10%,56%); font-style: italic; margin-top: 2px; text-align: right; padding-right: 4px; }
        .formula-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        .formula-table th, .formula-table td { border: 1px solid hsl(220,15%,88%); padding: 10px 16px; text-align: center; vertical-align: middle; }
        .formula-table th { background: hsl(220,40%,96%); font-weight: 600; color: hsl(220,40%,20%); }
        .formula-table td:first-child { background: hsl(220,30%,97%); font-weight: 600; border-right: 2px solid hsl(220,15%,84%); min-width: 52px; }
        .formula-table tr:nth-child(even) td:not(:first-child) { background: hsl(220,20%,99%); }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        background: 'hsl(220,25%,97%)',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}>
        {!inIframe && (
          <div style={{ background: 'hsl(220,60%,20%)', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{
              maxWidth: 800, margin: '0 auto', padding: '0 16px',
              height: 56, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Link
                href="/chat"
                style={{
                  color: 'hsl(45,90%,80%)', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 14, fontWeight: 500, flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </Link>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: 'white', lineHeight: 1.2 }}>
                  {title}
                </div>
                <div style={{ fontSize: 11, color: 'hsl(45,90%,70%)', marginTop: 1 }}>{subtitle}</div>
              </div>
              <div style={{ width: 60, flexShrink: 0 }} />
            </div>
          </div>
        )}

        <div
          id={contentId}
          style={{ maxWidth: 800, margin: '0 auto', padding: inIframe ? '16px 16px 48px' : '24px 16px 64px' }}
        >
          {inIframe && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26, color: 'hsl(220,60%,20%)',
                margin: 0, lineHeight: 1.2,
              }}>
                {title}
              </h1>
              <p style={{ fontSize: 13, color: 'hsl(220,10%,56%)', margin: '4px 0 0' }}>{subtitle}</p>
            </div>
          )}

          {children}

          <p style={{ textAlign: 'center', fontSize: 12, color: 'hsl(220,10%,70%)', marginTop: 8 }}>
            {footerNote ?? 'Formulas for the Singapore O-Level Additional Mathematics syllabus'}
          </p>
        </div>
      </div>
    </>
  );
}
