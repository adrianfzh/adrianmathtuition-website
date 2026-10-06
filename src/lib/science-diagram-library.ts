// Server half of the science picture library (6 Oct 2026, Adrian: "marking … solutions …
// use them"): read the approved pictures once per request and pick one for a question.
// Pure matching lives in ./science-diagram-match (tested, twin of the bot's).
import { getSupabaseAdmin } from '@/lib/supabase';
import { pickDiagram, asksForDiagram, type LibraryDiagram } from '@/lib/science-diagram-match';

/** 'physics' | 'chemistry' | 'biology' from any science subject key ('combined-physics', 'Physics'…). */
export function librarySubject(subject: string | null | undefined): string | null {
  const s = String(subject || '').toLowerCase();
  return ['physics', 'chemistry', 'biology'].find(k => s.includes(k)) ?? null;
}

/** The approved, published pictures of one science. [] on any failure — a picture is a bonus. */
export async function approvedDiagrams(subject: string | null | undefined): Promise<LibraryDiagram[]> {
  const lib = librarySubject(subject);
  if (!lib) return [];
  try {
    const { data } = await getSupabaseAdmin().from('science_diagrams').select('id, name, subject, keywords, image_url')
      .eq('subject', lib).eq('is_published', true).eq('student_ok', true);
    return (data || []) as LibraryDiagram[];
  } catch { return []; }
}

/** The picture for a question that asks for a diagram (draw / label / complete), else null. */
export function diagramForQuestion(rows: LibraryDiagram[], text: string | null | undefined): { url: string; name: string } | null {
  if (!rows.length || !asksForDiagram(text)) return null;
  const d = pickDiagram(rows, String(text || ''));
  return d ? { url: d.image_url, name: d.name } : null;
}
