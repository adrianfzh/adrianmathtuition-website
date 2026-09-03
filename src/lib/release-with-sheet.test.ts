import { describe, it, expect } from 'vitest';
import { choosePdf, stem, sheetFolder, ambiguityMessage, noSheetNote } from './release-with-sheet';
import { readNoSheet } from './sheet-jobs';

// The paper's folder (lib/paper-folder.ts) — the sheet shares it with the marked copies.
const F = '/Students/Khoo Ke Er Klaire/2026-08-30 klaire am tys 2021 p1';
const DOCX = `${F}/Practice Again.docx`;
const PDF = `${F}/Practice Again.pdf`;
const f = (name: string, modified?: string) => ({ path: `${F}/${name}`, name, modified });

// What the folder actually holds once a paper has been marked, amended and sheeted.
const MARKED = [f('Marked (AI).pdf', '2026-08-30T14:00'), f('Marked (Adrian).pdf', '2026-09-02T10:00')];

describe('choosePdf', () => {
  it('takes the recorded PDF when it is still there', () => {
    const c = choosePdf(PDF, DOCX, [f('Practice Again.pdf')]);
    expect(c).toEqual({ kind: 'recorded', path: PDF });
  });

  it('finds the re-export by the DOCX name — the actual workflow', () => {
    // Adrian edits the .docx and hits Save as PDF: same base name, new extension.
    // The worker may never have filed a PDF at all, so `recorded` is null.
    const c = choosePdf(null, DOCX, [f('Practice Again.pdf')]);
    expect(c.kind).toBe('recorded');
  });

  it('survives the naming being inconsistent between runs', () => {
    // Older workers produced dated / "Wave" names; the match is on the DOCX's
    // own stem, whatever it happens to be, so a legacy recorded path still resolves.
    const dated = `${F}/2026-08-31 Practice Again — kiara am tys 2022 p1.docx`;
    const c = choosePdf(null, dated, [f('2026-08-31 Practice Again — kiara am tys 2022 p1.pdf')]);
    expect(c.kind).toBe('recorded');
    const wave = `${F}/Practice Again (Wave 1) — klaire am tys 2021 p1.docx`;
    expect(choosePdf(null, wave, [f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf')]).kind).toBe('recorded');
  });

  // ── the shared folder (2 Sep 2026) ────────────────────────────────────────
  it('never mistakes Marked (AI) / Marked (Adrian) for the sheet', () => {
    // Nothing recorded, no DOCX twin: the only sheet-named PDF wins and the
    // marked copies are invisible to the chooser.
    const c = choosePdf(null, null, [...MARKED, f('Practice Again.pdf')]);
    expect(c).toEqual({ kind: 'only', path: PDF });
    // With the DOCX recorded, it is the twin — still the sheet, never a marked copy.
    expect(choosePdf(null, DOCX, [...MARKED, f('Practice Again.pdf')])).toEqual({ kind: 'recorded', path: PDF });
  });

  it('says none when only the marked copies are there — the sheet is not exported yet', () => {
    expect(choosePdf(null, DOCX, MARKED).kind).toBe('none');
    expect(choosePdf(null, DOCX, [...MARKED, f('Practice Again.docx')]).kind).toBe('none');
  });

  it('a recorded path that points at a marked copy is refused, not honoured', () => {
    // Defensive: a mis-recorded sheet_jobs.result must not release the marked paper as the sheet.
    const c = choosePdf(`${F}/Marked (Adrian).pdf`, null, [...MARKED]);
    expect(c.kind).toBe('none');
  });

  it('ambiguity is between sheet-named PDFs only, newest first', () => {
    const c = choosePdf(null, null, [
      ...MARKED,
      f('Practice Again.pdf', '2026-09-01T10:00'),
      f('Practice Again (1).pdf', '2026-09-02T12:00'),
    ]);
    expect(c.kind).toBe('ambiguous');
    if (c.kind === 'ambiguous') {
      expect(c.candidates.map(x => x.name)).toEqual(['Practice Again (1).pdf', 'Practice Again.pdf']);
    }
  });

  it('a stray differently-named PDF is no longer "the only PDF"', () => {
    // Before the shared folder any lone PDF was taken; now only the fixed sheet
    // name qualifies for the fallback — a random export gets "export first".
    const c = choosePdf(null, DOCX, [f('Sophie revision.pdf')]);
    expect(c.kind).toBe('none');
    expect(choosePdf(null, DOCX, [f('Practice Again 2.pdf')])).toEqual({ kind: 'only', path: `${F}/Practice Again 2.pdf` });
  });

  it('ASKS when several sheet PDFs sit there and none is the twin — never guesses', () => {
    const c = choosePdf(null, DOCX, [
      f('Practice Again (old).pdf', '2026-08-20T10:00'),
      f('Practice Again (1).pdf', '2026-08-31T22:00'),
    ]);
    expect(c.kind).toBe('ambiguous');
    if (c.kind === 'ambiguous') {
      expect(c.candidates).toHaveLength(2);
      expect(c.candidates[0].name).toBe('Practice Again (1).pdf');   // newest first
    }
  });

  it('the recorded path still wins even in a crowded folder', () => {
    const c = choosePdf(PDF, DOCX, [
      ...MARKED,
      f('old export.pdf'),
      f('Practice Again.pdf'),
      f('scratch.pdf'),
    ]);
    expect(c).toEqual({ kind: 'recorded', path: PDF });
  });

  it('two PDFs sharing the sheet name is still ambiguous, not a coin toss', () => {
    const c = choosePdf(null, DOCX, [
      f('Practice Again.pdf'),
      f('Practice Again.PDF'),
    ]);
    expect(c.kind).toBe('ambiguous');
  });

  it('says none when the folder holds no PDF at all', () => {
    expect(choosePdf(null, DOCX, [f('sheet.docx')]).kind).toBe('none');
    expect(choosePdf(null, DOCX, []).kind).toBe('none');
  });

  it('ignores non-PDFs entirely', () => {
    const c = choosePdf(null, DOCX, [f('a.docx'), f('b.png'), f('Practice Again.pdf')]);
    expect(c).toEqual({ kind: 'recorded', path: PDF });
  });

  it('matches case-insensitively — Dropbox lowercases some paths', () => {
    const c = choosePdf(PDF.toLowerCase(), DOCX, [f('Practice Again.pdf')]);
    expect(c.kind).toBe('recorded');
  });
});

describe('stem / sheetFolder', () => {
  it('strips the folder and the extension', () => {
    expect(stem(DOCX)).toBe('practice again');
    expect(stem('a/b/C.PDF')).toBe('c');
    expect(stem('')).toBe('');
  });

  it('finds the folder from either recorded path', () => {
    expect(sheetFolder(PDF, null)).toBe(F);
    expect(sheetFolder(null, DOCX)).toBe(F);
    expect(sheetFolder(null, null)).toBeNull();
    expect(sheetFolder('noslash', null)).toBeNull();
  });
});

// The release path's noSheet branch turns on this pair: the stored flag decides
// whether a PDF is looked for at all, and the note is what the response says
// instead of "No PDF in the sheet's folder yet" (3 Sep 2026).
describe('the no-sheet release branch', () => {
  it('a done job that says "nothing to teach" is not a missing PDF', () => {
    const job = { noSheet: true, reason: '87/90 — three careless slips she already gets right' };
    expect(readNoSheet(job).noSheet).toBe(true);
    expect(noSheetNote(readNoSheet(job).reason))
      .toBe('No self-study sheet for this paper — 87/90 — three careless slips she already gets right. Released the marked paper on its own.');
  });
  it('an ordinary sheet job takes the PDF-choosing path, untouched', () => {
    expect(readNoSheet({ docx_path: DOCX, pdf_path: PDF }).noSheet).toBe(false);
    expect(choosePdf(PDF, DOCX, [f('Practice Again.pdf')]).kind).toBe('recorded');
  });
  it('the note survives an empty reason without a dangling dash', () => {
    expect(noSheetNote('')).toBe('No self-study sheet for this paper. Released the marked paper on its own.');
  });
});

describe('ambiguityMessage', () => {
  it('tells him to export first when there is no PDF', () => {
    expect(ambiguityMessage({ kind: 'none' })).toMatch(/export/i);
  });
  it('says how many to choose between', () => {
    const m = ambiguityMessage({ kind: 'ambiguous', candidates: [
      { path: 'a', name: 'a.pdf' }, { path: 'b', name: 'b.pdf' }, { path: 'c', name: 'c.pdf' }] })!;
    expect(m).toContain('3 PDFs');
  });
  it('is silent when a PDF was chosen', () => {
    expect(ambiguityMessage({ kind: 'recorded', path: 'x' })).toBeNull();
    expect(ambiguityMessage({ kind: 'only', path: 'x' })).toBeNull();
  });
});
