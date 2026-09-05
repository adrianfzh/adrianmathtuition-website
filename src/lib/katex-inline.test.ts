import { describe, it, expect } from 'vitest';
import { katexInlineHead, katexAutoRenderScript } from './katex-inline';

describe('katexInlineHead', () => {
  const head = katexInlineHead();

  // katex.min.js legitimately embeds a couple of XML namespace URIs
  // (http://www.w3.org/1998/Math/MathML, http://www.w3.org/2000/svg) used as
  // string constants for createElementNS() when it builds MathML/SVG output —
  // those never cause a network request. What "self-contained" actually rules
  // out is a <link>/<script> that fetches from somewhere, so that's what this
  // checks rather than a blanket substring scan that the library itself fails.
  it('never points a <link> or <script> at a remote host', () => {
    expect(head).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(head).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(head).not.toContain('cdn.jsdelivr.net');
  });

  it('inlines every font as a base64 data URI', () => {
    expect(head).toContain('data:font/woff2;base64,');
  });

  it('does not itself call renderMathInElement — only the auto-render script does', () => {
    expect(head).not.toContain('renderMathInElement(document.body');
    expect(katexAutoRenderScript()).toContain('renderMathInElement(document.body');
  });
});

describe('katexAutoRenderScript', () => {
  it('sets window.__katexDone', () => {
    expect(katexAutoRenderScript()).toContain('__katexDone');
  });
});
