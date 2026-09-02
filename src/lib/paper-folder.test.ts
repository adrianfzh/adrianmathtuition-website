import { describe, it, expect } from 'vitest';
import {
  paperFolder, markedAiPath, paperNameSegment, folderSegment, studentSegment,
  markedAdrianPattern, isMarkedCopy, isSheetPdf, pickAmendedCopy, amendedCopyIsNewer,
  isAlreadyAttached, dropboxWebUrl,
} from './paper-folder';

// Sophie's real run: created 2026-09-01T07:20:19Z = 15:20 SGT, same day.
const SOPHIE = {
  student_id: 'recSophie', student_name: 'Sophie Tan',
  paper_name: 'EM 2025 p1 sophie', created_at: '2026-09-01T07:20:19.840248+00:00',
};

describe('paperFolder', () => {
  it('files a tagged run under the student, dated by the run (SGT)', () => {
    expect(paperFolder(SOPHIE)).toBe('/Students/Sophie Tan/2026-09-01 EM 2025 p1 sophie');
    expect(markedAiPath(SOPHIE)).toBe('/Students/Sophie Tan/2026-09-01 EM 2025 p1 sophie/Marked (AI).pdf');
  });

  it('agrees with the folder the sheet worker already filed into', () => {
    // sheet_jobs.result on 2 Sep 2026: /Students/Sophie Tan/2026-08-31 sophie am tys 2021 p1/…
    // for a run created 2026-08-30T16:41:29Z — that is 31 Aug in Singapore, 30 Aug in UTC.
    expect(paperFolder({ ...SOPHIE, paper_name: 'sophie am tys 2021 p1', created_at: '2026-08-30T16:41:29.82319+00:00' }))
      .toBe('/Students/Sophie Tan/2026-08-31 sophie am tys 2021 p1');
  });

  it('stamps the Singapore day, not the UTC one', () => {
    // 1 Jan 17:00Z = 2 Jan 01:00 SGT.
    expect(paperFolder({ ...SOPHIE, created_at: Date.UTC(2026, 0, 1, 17, 0, 0) }))
      .toBe('/Students/Sophie Tan/2026-01-02 EM 2025 p1 sophie');
  });

  it('accepts a raw Postgres timestamp as well as ISO', () => {
    expect(paperFolder({ ...SOPHIE, created_at: '2026-09-01 16:57:42.913842+00' }))
      .toBe('/Students/Sophie Tan/2026-09-02 EM 2025 p1 sophie');
  });

  it('files an untagged run under _Untagged', () => {
    expect(paperFolder({ student_id: null, student_name: null, paper_name: 'isabelle EM SJC PRELIM P1 2024', created_at: SOPHIE.created_at }))
      .toBe('/Students/_Untagged/2026-09-01 isabelle EM SJC PRELIM P1 2024');
    // A student_name with no student_id is not a tag — Adrian types names into
    // paper names all the time; the id is what makes a run tagged.
    expect(studentSegment({ student_id: null, student_name: 'Sophie Tan' })).toBe('_Untagged');
    expect(studentSegment({ student_id: 'rec1', student_name: '   ' })).toBe('_Untagged');
  });

  it('sanitises ":" in the paper name to "-" (Kevin\'s "2025:2026" runs)', () => {
    expect(paperNameSegment('kevin 2025:2026 working')).toBe('kevin 2025-2026 working');
  });

  it('strips a trailing .pdf from a run named after its upload', () => {
    expect(paperNameSegment('(Zane) WA3 S2 Math Revision Worksheet.pdf')).toBe('(Zane) WA3 S2 Math Revision Worksheet');
    expect(paperNameSegment('paper.PDF')).toBe('paper');
    expect(paperNameSegment('scan.jpeg')).toBe('scan');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(paperNameSegment('  eva   em \t prelim  ')).toBe('eva em prelim');
    expect(folderSegment('  Sun   Wanqing ', 'x')).toBe('Sun Wanqing');
  });

  it('replaces every character Dropbox rejects and never escapes the folder', () => {
    expect(paperNameSegment('Term 2/3 review: P1 *draft* <v2>?"|\\')).toBe('Term 2-3 review- P1 -draft- -v2-----');
    expect(folderSegment('../../Secret', 'x')).toBe('..-..-Secret');
    expect(paperFolder({ student_id: 'r', student_name: '../Evil', paper_name: 'p', created_at: SOPHIE.created_at }))
      .toBe('/Students/..-Evil/2026-09-01 p');
  });

  it('drops trailing spaces and dots — Dropbox refuses names ending in either', () => {
    expect(paperNameSegment('paper name... ')).toBe('paper name');
    expect(folderSegment('Tan Ah Kow.', 'x')).toBe('Tan Ah Kow');
  });

  it('falls back rather than producing an empty segment', () => {
    expect(paperNameSegment('')).toBe('untitled paper');
    expect(paperNameSegment(null)).toBe('untitled paper');
    expect(paperNameSegment('.pdf')).toBe('untitled paper');
  });

  it('caps a runaway paper name at 80 chars without a trailing space', () => {
    const seg = paperNameSegment('x'.repeat(79) + ' tail');
    expect(seg.length).toBeLessThanOrEqual(80);
    expect(seg.endsWith(' ')).toBe(false);
  });
});

describe('the marked copies', () => {
  it('matches Adrian\'s copy by name, including a double-save "(1)"', () => {
    expect(markedAdrianPattern.test('Marked (Adrian).pdf')).toBe(true);
    expect(markedAdrianPattern.test('Marked (Adrian) (1).pdf')).toBe(true);
    expect(markedAdrianPattern.test('marked (adrian).PDF')).toBe(true);
    expect(markedAdrianPattern.test('Marked (AI).pdf')).toBe(false);
    expect(markedAdrianPattern.test('Practice Again.pdf')).toBe(false);
    expect(markedAdrianPattern.test('Marked (Adrian).docx')).toBe(false);
  });

  it('tells marked copies and the sheet apart', () => {
    expect(isMarkedCopy('Marked (AI).pdf')).toBe(true);
    expect(isMarkedCopy('Marked (Adrian) (1).pdf')).toBe(true);
    expect(isMarkedCopy('Practice Again.pdf')).toBe(false);
    expect(isSheetPdf('Practice Again.pdf')).toBe(true);
    expect(isSheetPdf('Practice Again 2.pdf')).toBe(true);
    expect(isSheetPdf('practice again (1).PDF')).toBe(true);
    expect(isSheetPdf('Practice Again.docx')).toBe(false);
    expect(isSheetPdf('Marked (Adrian).pdf')).toBe(false);
  });

  it('picks the newest amended copy and ignores everything else', () => {
    const pick = pickAmendedCopy([
      { name: 'Marked (AI).pdf', path: '/f/marked (ai).pdf', modified: '2026-09-02T10:00:00Z' },
      { name: 'Marked (Adrian).pdf', path: '/f/marked (adrian).pdf', modified: '2026-09-02T11:00:00Z' },
      { name: 'Marked (Adrian) (1).pdf', path: '/f/marked (adrian) (1).pdf', modified: '2026-09-02T12:30:00Z' },
      { name: 'Practice Again.pdf', path: '/f/practice again.pdf', modified: '2026-09-02T13:00:00Z' },
      { name: 'Marked (Adrian)', path: '/f/marked (adrian)', tag: 'folder', modified: '2026-09-03T00:00:00Z' },
    ]);
    expect(pick?.name).toBe('Marked (Adrian) (1).pdf');
    expect(pickAmendedCopy([{ name: 'Marked (AI).pdf', path: '/f/marked (ai).pdf' }])).toBeNull();
    expect(pickAmendedCopy([])).toBeNull();
  });
});

describe('amendedCopyIsNewer', () => {
  const cand = { path: '/f/marked (adrian).pdf', modified: '2026-09-02T12:00:00Z' };

  it('attaches when nothing is attached yet', () => {
    expect(amendedCopyIsNewer({ annotated_pdf_url: null }, cand)).toBe(true);
  });

  it('does not re-attach the very file already attached', () => {
    const run = { annotated_pdf_url: 'https://x/a.pdf', result_json: { amended_from_dropbox: { path: '/F/Marked (Adrian).pdf', modified: '2026-09-02T12:00:00.000Z' } } };
    expect(amendedCopyIsNewer(run, cand)).toBe(false);
    expect(isAlreadyAttached(run, cand)).toBe(true);
  });

  it('replaces an older Dropbox attachment with a newer save', () => {
    const run = { annotated_pdf_url: 'https://x/a.pdf', result_json: { amended_from_dropbox: { path: '/f/marked (adrian).pdf', modified: '2026-09-02T09:00:00Z' } } };
    expect(amendedCopyIsNewer(run, cand)).toBe(true);
    expect(amendedCopyIsNewer(run, { ...cand, modified: '2026-09-02T08:00:00Z' })).toBe(false);
  });

  it('compares against an in-browser annotation via checked_at', () => {
    // ✏️ Annotate at 11:00 → the 12:00 Dropbox save wins; a 10:00 save does not.
    const run = { annotated_pdf_url: 'https://x/a.pdf', checked_at: '2026-09-02T11:00:00+00:00' };
    expect(amendedCopyIsNewer(run, cand)).toBe(true);
    expect(amendedCopyIsNewer(run, { ...cand, modified: '2026-09-02T10:00:00Z' })).toBe(false);
  });

  it('leaves an attachment of unknown age alone', () => {
    expect(amendedCopyIsNewer({ annotated_pdf_url: 'https://x/a.pdf' }, cand)).toBe(false);
  });
});

describe('dropboxWebUrl', () => {
  it('opens the paper folder inside the app folder', () => {
    expect(dropboxWebUrl('/Students/Sophie Tan/2026-09-01 EM 2025 p1 sophie'))
      .toBe('https://www.dropbox.com/home/Apps/AdrianMathNotes/Students/Sophie%20Tan/2026-09-01%20EM%202025%20p1%20sophie');
  });
});
