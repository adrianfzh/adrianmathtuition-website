import { describe, it, expect } from 'vitest';
import { choosePdf, stem, sheetFolder, ambiguityMessage } from './release-with-sheet';

const F = '/Self-Study/Khoo Ke Er Klaire';
const DOCX = `${F}/Practice Again (Wave 1) — klaire am tys 2021 p1.docx`;
const PDF = `${F}/Practice Again (Wave 1) — klaire am tys 2021 p1.pdf`;
const f = (name: string, modified?: string) => ({ path: `${F}/${name}`, name, modified });

describe('choosePdf', () => {
  it('takes the recorded PDF when it is still there', () => {
    const c = choosePdf(PDF, DOCX, [f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf')]);
    expect(c).toEqual({ kind: 'recorded', path: PDF });
  });

  it('finds the re-export by the DOCX name — the actual workflow', () => {
    // Adrian edits the .docx and hits Save as PDF: same base name, new extension.
    // The worker may never have filed a PDF at all, so `recorded` is null.
    const c = choosePdf(null, DOCX, [f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf')]);
    expect(c.kind).toBe('recorded');
  });

  it('survives the naming being inconsistent between runs', () => {
    // The workers have produced both of these shapes; neither is special-cased,
    // because the match is on the DOCX's own stem, whatever it happens to be.
    const dated = `${F}/2026-08-31 Practice Again — kiara am tys 2022 p1.docx`;
    const c = choosePdf(null, dated, [f('2026-08-31 Practice Again — kiara am tys 2022 p1.pdf')]);
    expect(c.kind).toBe('recorded');
  });

  it('takes the only PDF when there is exactly one and nothing matches', () => {
    const c = choosePdf(null, DOCX, [f('Sophie revision.pdf')]);
    expect(c).toEqual({ kind: 'only', path: `${F}/Sophie revision.pdf` });
  });

  it('ASKS when several PDFs sit there and none is the sheet — never guesses', () => {
    const c = choosePdf(null, DOCX, [
      f('old export.pdf', '2026-08-20T10:00'),
      f('another.pdf', '2026-08-31T22:00'),
    ]);
    expect(c.kind).toBe('ambiguous');
    if (c.kind === 'ambiguous') {
      expect(c.candidates).toHaveLength(2);
      expect(c.candidates[0].name).toBe('another.pdf');   // newest first
    }
  });

  it('the recorded path still wins even in a crowded folder', () => {
    const c = choosePdf(PDF, DOCX, [
      f('old export.pdf'),
      f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf'),
      f('scratch.pdf'),
    ]);
    expect(c).toEqual({ kind: 'recorded', path: PDF });
  });

  it('two PDFs sharing the sheet name is still ambiguous, not a coin toss', () => {
    const c = choosePdf(null, DOCX, [
      f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf'),
      f('Practice Again (Wave 1) — klaire am tys 2021 p1.PDF'),
    ]);
    expect(c.kind).toBe('ambiguous');
  });

  it('says none when the folder holds no PDF at all', () => {
    expect(choosePdf(null, DOCX, [f('sheet.docx')]).kind).toBe('none');
    expect(choosePdf(null, DOCX, []).kind).toBe('none');
  });

  it('ignores non-PDFs entirely', () => {
    const c = choosePdf(null, DOCX, [f('a.docx'), f('b.png'), f('c.pdf')]);
    expect(c).toEqual({ kind: 'only', path: `${F}/c.pdf` });
  });

  it('matches case-insensitively — Dropbox lowercases some paths', () => {
    const c = choosePdf(PDF.toLowerCase(), DOCX, [f('Practice Again (Wave 1) — klaire am tys 2021 p1.pdf')]);
    expect(c.kind).toBe('recorded');
  });
});

describe('stem / sheetFolder', () => {
  it('strips the folder and the extension', () => {
    expect(stem(DOCX)).toBe('practice again (wave 1) — klaire am tys 2021 p1');
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
