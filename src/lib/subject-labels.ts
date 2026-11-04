// One short label per subject, the same words on every tile, and the one-line split
// under each number on /admin ("E Math 6 · A Math 4 · Chem 3"). Pure, no imports — the
// admin page's browser bundle reads it, so nothing here may pull in server-only code
// (4 Nov 2026: importing this from lib/dash-counts.ts dragged next/headers into the page).

/**
 * One short label per subject, the same words on every tile. Takes what each
 * source stores: a run's `paper_subject`, the bot log's Subject, a bank level
 * (EM / AM / JC / S1–S4), an English or science practice kind.
 */
export function subjectLabel(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return 'Other';
  const k = s.toLowerCase();
  if (k === 'em' || k === 'e math' || k === 'emath') return 'E Math';
  if (k === 'am' || k === 'a math' || k === 'amath') return 'A Math';
  if (k === 'jc' || k === 'jc1' || k === 'jc2' || k === 'h2' || k === 'h2 math') return 'H2 Math';
  if (/^s[1-4]$/.test(k)) return `Sec ${k[1]}`;
  if (k.startsWith('math')) return 'Maths';
  if (k.startsWith('chem')) return 'Chem';
  if (k.startsWith('phys')) return 'Phys';
  if (k.startsWith('bio')) return 'Bio';
  if (k.startsWith('eng')) return 'English';
  if (k.startsWith('sci')) return 'Science';
  return s;
}

/** "E Math 6 · A Math 4 · Chem 3 · 2 more" — the four biggest subjects, the rest as one count. Empty when nothing. */
export function subjectLine(bySubject: Record<string, number>, shown = 4): string {
  const parts = Object.entries(bySubject).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!parts.length) return '';
  const head = parts.slice(0, shown).map(([k, n]) => `${k} ${n}`);
  const rest = parts.slice(shown).reduce((a, [, n]) => a + n, 0);
  return [...head, rest ? `${rest} more` : null].filter(Boolean).join(' · ');
}
