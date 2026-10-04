// Render a paper from an ordered list of bank question refs — the body of
// /api/portal/print-paper/pdf, moved here on 5 Oct 2026 so the Next lesson
// card can print a Set paper for a student from Adrian's side
// (/api/admin/student-materials/pdf) through the SAME renderer: exam cover,
// marks-scaled working space, the answer key on the last page, never worked
// solutions (kiosk invariant D7).
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderPrelimPDF, type PrelimQuestion } from '@/lib/render-prelim';
import {
  answerMarkdown, blueprintKeyFor, figureWidthMm, mockCover, mockCoverInstructions, questionMarkdown,
  sectionHeadings, storageUrl, type PaperShape, type PrintQuestionRef, type QbPrintRow,
} from '@/lib/print-paper';
import type { PaperDef } from '@/lib/prelim-builder';
import { setNumberFromTitle } from '@/lib/print-sets';

/** The stored blueprint entry — the H2 P2 render reads its section_boundary for Section A/B. */
function blueprintPaperFor(level: string, paper: string, shape: PaperShape): PaperDef | null {
  try {
    const file = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8'),
    ) as { papers: Record<string, PaperDef> };
    return file.papers[blueprintKeyFor(level, paper, shape)] ?? null;
  } catch {
    return null; // a missing/unreadable blueprint only costs the headings
  }
}

export interface RefPaper {
  preset: string;          // 'mock' | 'set' | 'topics' | 'weakspots'
  level: string;
  paper: string | null;    // 'P1' | 'P2' for an exam-shaped paper
  title: string;
  refs: PrintQuestionRef[];
  printedFor: string | null;
  printedOn: string;       // "5 Oct 2026"
  shape: PaperShape;
}

/** The PDF, or an error string (no questions / a bank read failed). */
export async function renderRefPaperPdf(sb: SupabaseClient, p: RefPaper): Promise<{ pdf: Buffer } | { error: string; status: number }> {
  if (!p.refs.length) return { error: 'empty paper', status: 404 };
  const { data: qRows, error } = await sb
    .from('questions')
    .select('id, question_text, total_marks, parts, answer, has_image, image_url, figure_url, print_width_mm:gen_meta->figure->>print_width_mm')
    .in('id', p.refs.map((r) => r.id));
  if (error) return { error: error.message, status: 500 };
  const byId = new Map((qRows as QbPrintRow[]).map((q) => [q.id, q]));

  const questions: PrelimQuestion[] = [];
  for (const ref of p.refs) {
    const q = byId.get(ref.id);
    if (!q) continue; // a question deleted since generation — skip, keep order
    questions.push({
      pos: ref.pos,
      marks: q.total_marks,
      text: questionMarkdown(q),
      // A redrawn/authored figure (figure_url — a public Storage URL, the
      // Set papers' figures live there) wins over the scanned crop.
      imageUrl: q.figure_url || (q.has_image ? storageUrl(q.image_url) : null),
      // A Set paper's graph-paper grid prints at its true size (1 cm squares).
      imageWidthMm: q.figure_url ? figureWidthMm(q.print_width_mm) : null,
      answer: answerMarkdown(q),
    });
  }
  if (!questions.length) return { error: 'no questions left on this paper', status: 404 };

  const isMock = (p.preset === 'mock' || p.preset === 'set') && (p.paper === 'P1' || p.paper === 'P2');
  const setNo = p.preset === 'set' ? setNumberFromTitle(p.title) : null;
  const pdf = await renderPrelimPDF({
    title: p.title.toUpperCase(),
    subtitle: `Printed for ${p.printedFor || 'you'} · ${p.printedOn} · AdrianMath`,
    questions,
    workingSpace: true,
    ...(isMock
      ? {
          cover: mockCover(p.level, p.paper as string, {
            printedFor: p.printedFor,
            printedOn: p.printedOn,
            shape: p.shape,
            ...(setNo ? { examLabel: `MOCK EXAMINATION · SET ${setNo}` } : {}),
          }),
          instructions: mockCoverInstructions(p.level),
          // H2 P2 carries section_boundary → Section A/B headings; [] elsewhere.
          sections: sectionHeadings(blueprintPaperFor(p.level, p.paper as string, p.shape)),
        }
      : {}),
  });
  return { pdf };
}

export function paperFilename(title: string): string {
  return `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'paper'}.pdf`;
}
