// The marker's question text is plain ("u(n+1) = 2u(n) - 5", "H² = 225 - 15a"), written
// for other readers that parse it as plain text. In the ✏️ Annotate side panel it should
// read as maths (Adrian, 2 Nov 2026: "questions math expression not in latex").
//
// plainMathToTex turns ONE maths-looking run into TeX; splitPlainMath finds those runs in
// a sentence and leaves the words alone. Conservative on purpose: a run is typeset only
// when it has an operator or a subscript in it, and any word of two or more letters
// (other than sin, cos, ln …) ends the run, so prose never comes out squashed in italics.

const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'cosec', 'csc', 'cot', 'ln', 'lg', 'log', 'exp', 'sqrt']);
// A part label — "(a)", "(ii)", "(A)" — is prose, never maths.
const LABEL = /^\([a-z]{1,4}\)$|^\([ivx]{1,4}\)$/i;

function isMathToken(t: string): boolean {
  if (!t || LABEL.test(t)) return false;
  if (!/^[A-Za-z0-9²³⁴_^()+\-−–=×÷*/.<>≤≥≠√θπαβ'|]+$/.test(t)) return false;
  const words = t.match(/[A-Za-z]{2,}/g) || [];
  return words.every((w) => FUNCS.has(w.toLowerCase()));
}

function hasMath(run: string): boolean {
  return /[=+\-−–×÷*/^²³⁴√<>≤≥≠]/.test(run) || /(^|[^A-Za-z])[A-Za-z]\d/.test(run);
}

/** One maths run → TeX. */
export function plainMathToTex(s: string): string {
  let t = s;
  // u(n+1), v(n), T(r-1): the sequence's term → a subscript.
  t = t.replace(/(^|[^A-Za-z])([uvwTSabtx])\(([nrk](?:\s*[+\-−]\s*\d+)?)\)/g, (_, p, l, i) => `${p}${l}_{${i.replace(/\s+/g, '').replace('−', '-')}}`);
  // u1, v4, x2 → u_{1} (a single letter straight before digits, not part of a word).
  t = t.replace(/(^|[^A-Za-z])([A-Za-z])(\d+)(?![\d.])/g, (_, p, l, d) => `${p}${l}_{${d}}`);
  t = t.replace(/²/g, '^{2}').replace(/³/g, '^{3}').replace(/⁴/g, '^{4}');
  t = t.replace(/\^\(([^()]+)\)/g, '^{$1}').replace(/\^(-?[A-Za-z0-9]+)/g, '^{$1}');
  t = t.replace(/√\(([^()]+)\)/g, '\\sqrt{$1}').replace(/√([A-Za-z0-9]+)/g, '\\sqrt{$1}');
  t = t.replace(/sqrt\(([^()]+)\)/g, '\\sqrt{$1}');
  t = t.replace(/[−–]/g, '-').replace(/×|\*/g, '\\times ').replace(/÷/g, '\\div ');
  t = t.replace(/≤/g, '\\le ').replace(/≥/g, '\\ge ').replace(/≠/g, '\\ne ');
  t = t.replace(/θ/g, '\\theta ').replace(/π/g, '\\pi ').replace(/α/g, '\\alpha ').replace(/β/g, '\\beta ');
  t = t.replace(/\b(sin|cos|tan|sec|cosec|cot|ln|lg|log|exp)\b/g, '\\$1 ');
  return t;
}

export type PlainPiece = { text: string; math: boolean };

/** A sentence → pieces, each either plain words or a maths run to typeset. */
export function splitPlainMath(s: string): PlainPiece[] {
  const out: PlainPiece[] = [];
  const push = (text: string, math: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !last.math && !math) last.text += text; else out.push({ text, math });
  };
  // Words with the spaces after them; a trailing , . ; : ends a maths run ("= p," "= 101.").
  const words = (String(s || '').match(/\S+\s*/g) || []).map((raw) => {
    const word = raw.trimEnd(), space = raw.slice(word.length);
    const m = word.match(/^(.*?)([,;:.]*)$/)!;
    return { core: m[1], tail: m[2], space, raw, math: isMathToken(m[1]) };
  });
  const lead = String(s || '').match(/^\s*/)![0];
  push(lead, false);
  for (let i = 0; i < words.length; ) {
    if (!words[i].math) { push(words[i].raw, false); i++; continue; }
    let j = i; let text = words[i].core;
    while (!words[j].tail && j + 1 < words.length && words[j + 1].math) { text += words[j].space + words[j + 1].core; j++; }
    if (hasMath(text)) push(text, true); else push(text, false);
    push(words[j].tail + words[j].space, false);
    i = j + 1;
  }
  return out;
}

/** Plain question text → the same text with each maths run wrapped in $…$, for a page
 *  that typesets $…$ itself (the worked-solutions page). */
export function plainMathToDollar(s: string): string {
  return splitPlainMath(s).map((p) => (p.math ? `$${plainMathToTex(p.text)}$` : p.text.replace(/\$/g, '\\$'))).join('');
}
