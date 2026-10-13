// The plain words under a marked editing line: what went wrong, then the fix. Shared by the passage
// (editing-form.tsx) and the crash course's Try 3 (grammar-sheet.tsx).
import type { EditingResult } from '@/lib/english-practice';

export function verdict(r: EditingResult): { head: string; fix: string | null } {
  const fix = r.wrongWord ? `${r.wrongWord} → ${r.correct}` : null;
  if (r.ok) return { head: r.wrongWord ? '✓ Right' : '✓ Right, no mistake', fix };
  if (!r.wrongWord) return { head: '✗ This line has no mistake', fix: null };
  if (r.yours === '✓') return { head: '✗ This line has a mistake', fix };
  if (r.circledOk === false) return { head: `✗ The wrong word is "${r.wrongWord}", not "${r.circled}"`, fix };
  if (r.circledOk === true) return { head: '✗ Right word found, wrong correction', fix };
  return { head: `✗ ${r.yours}`, fix };
}
