'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    renderMathInElement: (el: HTMLElement, opts: object) => void;
  }
}

/* ── Formula data ──────────────────────────────────────────────────────────── */
type FormulaItem = {
  latex?: string;
  annotation?: string;
  note?: string;
};

const SECTIONS: {
  title: string;
  subtitle?: string;
  items: FormulaItem[];
}[] = [
  {
    title: 'Pythagorean Identities',
    items: [
      { latex: '\\sin^2\\theta + \\cos^2\\theta = 1 \\implies \\sin^2\\theta = 1 - \\cos^2\\theta' },
      { latex: '1 + \\tan^2\\theta = \\sec^2\\theta' },
      { latex: '1 + \\cot^2\\theta = \\csc^2\\theta' },
      { latex: '\\cos^2\\theta = 1 - \\sin^2\\theta' },
    ],
  },
  {
    title: 'Addition Formulae',
    items: [
      { latex: '\\sin(A \\pm B) = \\sin A \\cos B \\pm \\cos A \\sin B' },
      { latex: '\\cos(A \\pm B) = \\cos A \\cos B \\mp \\sin A \\sin B' },
      { latex: '\\tan(A \\pm B) = \\dfrac{\\tan A \\pm \\tan B}{1 \\mp \\tan A \\tan B}' },
      { note: 'Can be applied to find e.g. $\\sin 3x = \\sin(2x + x)$' },
    ],
  },
  {
    title: 'Double Angle Formulae',
    items: [
      { latex: '\\sin 2A = 2\\sin A \\cos A' },
      { latex: '\\cos 2A = \\cos^2 A - \\sin^2 A' },
      { latex: '\\cos 2A = 2\\cos^2 A - 1 \\implies \\cos^2 A = \\dfrac{1 + \\cos 2A}{2}' },
      { latex: '\\cos 2A = 1 - 2\\sin^2 A \\implies \\sin^2 A = \\dfrac{1 - \\cos 2A}{2}' },
      { latex: '\\tan 2A = \\dfrac{2\\tan A}{1 - \\tan^2 A}' },
    ],
  },
  {
    title: 'Using the Double Angle Formula',
    subtitle: 'The formula applies whenever one angle is exactly double another.',
    items: [
      {
        latex: '\\sin 4\\theta = 2\\sin 2\\theta\\,\\cos 2\\theta',
        annotation: '← 4θ = 2 × (2θ), angle is doubled',
      },
    ],
  },
  {
    title: 'Half-Angle Formulae',
    items: [
      { latex: '\\sin\\theta = 2\\sin\\dfrac{\\theta}{2}\\cos\\dfrac{\\theta}{2}' },
      {
        latex:
          '\\begin{aligned} \\cos A &= \\cos^2\\!\\dfrac{A}{2} - \\sin^2\\!\\dfrac{A}{2} \\\\[6pt] &= 2\\cos^2\\!\\dfrac{A}{2} - 1 \\\\[6pt] &= 1 - 2\\sin^2\\!\\dfrac{A}{2} \\end{aligned}',
      },
      { latex: '\\tan A = \\dfrac{2\\tan\\dfrac{A}{2}}{1 - \\tan^2\\dfrac{A}{2}}' },
    ],
  },
  {
    title: 'R-Formula',
    items: [
      { latex: 'a\\sin\\theta \\pm b\\cos\\theta = R\\sin(\\theta \\pm \\alpha)' },
      { latex: 'a\\cos\\theta \\pm b\\sin\\theta = R\\cos(\\theta \\mp \\alpha)' },
      {
        note: 'where $R = \\sqrt{a^2 + b^2}$ and $\\tan\\alpha = \\dfrac{b}{a}$, with $a,\\,b > 0$',
      },
    ],
  },
];
/* ─────────────────────────────────────────────────────────────────────────── */

export default function TrigoFormulasPage() {
  const [inIframe, setInIframe] = useState(false);
  const [katexReady, setKatexReady] = useState(false);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
  }, []);

  function renderMath() {
    if (typeof window === 'undefined' || !window.renderMathInElement) return;
    const el = document.getElementById('trigo-content');
    if (!el) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
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
      {/* KaTeX CSS */}
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
        .trigo-formula-row { overflow-x: auto; padding: 6px 0; -webkit-overflow-scrolling: touch; }
        .trigo-formula-row .katex-display { margin: 0; }
        .trigo-section-card { background: white; border: 1px solid hsl(220,15%,90%); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        @media (max-width: 480px) { .trigo-section-card { padding: 16px; } }
        .trigo-note { background: hsl(45,90%,96%); border-left: 3px solid hsl(45,85%,55%); border-radius: 0 6px 6px 0; padding: 8px 12px; margin-top: 8px; font-style: italic; font-size: 14px; color: hsl(220,20%,40%); }
        .trigo-annotation { font-size: 12px; color: hsl(220,10%,56%); font-style: italic; margin-top: 2px; text-align: right; padding-right: 4px; }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        background: 'hsl(220,25%,97%)',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}>
        {/* Standalone top bar — hidden when rendered inside the chat overlay iframe */}
        {!inIframe && (
          <div style={{
            background: 'hsl(220,60%,20%)',
            position: 'sticky', top: 0, zIndex: 10,
          }}>
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
                  Trigonometric Formulas
                </div>
                <div style={{ fontSize: 11, color: 'hsl(45,90%,70%)', marginTop: 1 }}>O-Level A Math</div>
              </div>
              <div style={{ width: 60, flexShrink: 0 }} />{/* spacer to balance back button */}
            </div>
          </div>
        )}

        {/* Content */}
        <div
          id="trigo-content"
          style={{ maxWidth: 800, margin: '0 auto', padding: inIframe ? '16px 16px 48px' : '24px 16px 64px' }}
        >
          {/* Page header (shown when standalone header is hidden = in iframe) */}
          {inIframe && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26, color: 'hsl(220,60%,20%)',
                margin: 0, lineHeight: 1.2,
              }}>
                Trigonometric Formulas
              </h1>
              <p style={{ fontSize: 13, color: 'hsl(220,10%,56%)', margin: '4px 0 0' }}>O-Level A Math</p>
            </div>
          )}

          {SECTIONS.map(section => (
            <div key={section.title} className="trigo-section-card">
              {/* Section title */}
              <div style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 18, color: 'hsl(220,60%,20%)',
                paddingBottom: 10, marginBottom: 14,
                borderBottom: '2px solid hsl(45,90%,55%)',
                lineHeight: 1.3,
              }}>
                {section.title}
              </div>
              {section.subtitle && (
                <p style={{ fontSize: 13, color: 'hsl(220,10%,56%)', fontStyle: 'italic', marginBottom: 12, marginTop: -6 }}>
                  {section.subtitle}
                </p>
              )}

              {/* Formula items */}
              {section.items.map((item, i) => {
                if (item.note) {
                  return (
                    <div
                      key={i}
                      className="trigo-note"
                      dangerouslySetInnerHTML={{ __html: item.note }}
                    />
                  );
                }
                if (item.latex) {
                  return (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <div
                        className="trigo-formula-row"
                        dangerouslySetInnerHTML={{ __html: `$$${item.latex}$$` }}
                      />
                      {item.annotation && (
                        <div className="trigo-annotation">{item.annotation}</div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          {/* Footer */}
          <p style={{
            textAlign: 'center', fontSize: 12,
            color: 'hsl(220,10%,70%)', marginTop: 8,
          }}>
            Formulas for the Singapore O-Level Additional Mathematics syllabus
          </p>
        </div>
      </div>
    </>
  );
}
