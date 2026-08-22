// Exam Notes (Airtable `Exams`) carries two in-field markers so no extra
// Airtable fields are needed (same pattern as the paper-in-Subject encoding):
//   • a LEADING "~|"   — the exam date is approximate ("week only")
//   • a TRAILING line "📷 <url>" — the photo Adrian ran "📷 From photo" topic
//     extraction on, kept on Vercel Blob so he can re-check the original
//     (2026-08-22). It is always the last line so free-text notes stay intact.
// The schedule route decodes; set-exams encodes. The PW/AA "PWAA:<type>"
// marker lives on No-Exam marker records only and is handled separately.

export const APPROX_MARKER = '~|';
export const PHOTO_MARKER = '📷 ';

export interface ExamNoteParts {
  approx: boolean;
  notes: string;
  photoUrl: string | null;
}

export function decodeExamNotes(raw: string): ExamNoteParts {
  let s = raw || '';
  const approx = s.startsWith(APPROX_MARKER);
  if (approx) s = s.slice(APPROX_MARKER.length);
  let photoUrl: string | null = null;
  const lines = s.split('\n');
  const last = lines[lines.length - 1] ?? '';
  if (lines.length && last.startsWith(PHOTO_MARKER)) {
    const url = last.slice(PHOTO_MARKER.length).trim();
    if (/^https?:\/\//.test(url)) { photoUrl = url; lines.pop(); }
  }
  // Trim only the newline that separated the marker line from the notes.
  const notes = lines.join('\n').replace(/\n+$/, '');
  return { approx, notes, photoUrl };
}

export function encodeExamNotes(parts: { notes?: string | null; approx?: boolean; photoUrl?: string | null }): string {
  const notes = (parts.notes ?? '').replace(/\n+$/, '');
  const url = (parts.photoUrl ?? '').trim();
  let out = (parts.approx ? APPROX_MARKER : '') + notes;
  if (/^https?:\/\//.test(url)) out += (notes || parts.approx ? '\n' : '') + PHOTO_MARKER + url;
  return out;
}
