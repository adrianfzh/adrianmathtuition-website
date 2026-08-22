// Pure pre-pass that runs on every markdown+KaTeX string before remark-math
// sees it (server- and client-safe; no DOM, no React).
//
// WHY: the question bank (and some notes) write dollar amounts LaTeX-style —
// `$\$18\,000$`, `\text{\$3.20}` inside `$$\begin{array}…$$`. That is valid
// LaTeX, but remark-math's inline scanner is modelled on code spans: it does
// NOT honour `\$` as an escape, so the `$` in `\$` closes the span early and
// every later `$` flips text in and out of math mode. On the portal that
// showed as "\18,000 .MrLimmadeadownpaymentof 40% on…" (Adrian, 2026-08-23,
// ~1,900 bank questions carry `\$`). The fix is to walk the string with LaTeX
// delimiter semantics (`\$` never opens/closes) and, INSIDE math, swap `\$`
// for the `\usd{}` macro that `katexOptions` defines as `\$` — KaTeX then
// renders the same glyph, and micromark never sees a stray `$`. Outside math
// `\$` is left alone: it is a CommonMark escape and renders as a literal "$".
//
// The same walk also rewrites the handful of text-mode LaTeX commands that
// appear OUTSIDE math (`\textbf{…}` → `**…**`, `\textit{…}` → `*…*`) so they
// stop leaking as raw backslash commands in the prose. Inside math they are
// valid KaTeX and are left untouched.

export const DOLLAR_MACRO = '\\usd';

const TEXT_CMDS: Record<string, [string, string]> = {
  textbf: ['**', '**'],
  textit: ['*', '*'],
  emph: ['*', '*'],
  underline: ['<u>', '</u>'],
};

/** Index just past the `}` that closes the group opening at `open` (src[open] === '{'), or -1. */
function closeBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

export function prepareMath(src: string): string {
  if (!src || !src.includes('\\')) return src;
  let out = '';
  let i = 0;
  let math: 0 | 1 | 2 = 0;           // 0 = prose, 1 = $…$, 2 = $$…$$
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '$') { out += math ? `${DOLLAR_MACRO}{}` : '\\$'; i += 2; continue; }
      if (!math) {
        const m = /^\\([a-zA-Z]+)\{/.exec(src.slice(i, i + 16));
        const wrap = m && TEXT_CMDS[m[1]];
        if (m && wrap) {
          const openAt = i + m[0].length - 1;
          const end = closeBrace(src, openAt);
          if (end > 0) {
            out += wrap[0] + prepareMath(src.slice(openAt + 1, end - 1)) + wrap[1];
            i = end;
            continue;
          }
        }
      }
      out += c + (n ?? '');           // any other escape pair (incl. `\\`) passes through verbatim
      i += 2;
      continue;
    }
    if (c === '$') {
      const dbl = src[i + 1] === '$';
      if (math === 0) { math = dbl ? 2 : 1; out += dbl ? '$$' : '$'; i += dbl ? 2 : 1; continue; }
      if (math === 2) { if (dbl) { math = 0; out += '$$'; i += 2; } else { out += '$'; i += 1; } continue; }
      math = 0; out += '$'; i += 1;   // closes $…$
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
