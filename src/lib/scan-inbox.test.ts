import { describe, it, expect } from 'vitest';
import { buildScanPaperName, parseScanFilename, matchStudent, isSettled, scanLine, isPdf } from './scan-inbox';

describe('buildScanPaperName — the convention every run is named by', () => {
  it('a GCE past-year paper', () => {
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Rainie Cheng', subject: 'A Math', exam: 'TYS', year: 2022, paper: 1 }))
      .toBe('rainie am tys 2022 p1');
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Tin Tze Hin', given_name: 'Tze Hin', subject: 'E Math', exam: 'GCE O Level', year: 2022, paper: 2 }))
      .toBe('tze hin em tys 2022 p2');
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Tin Tze Hin', subject: 'E Math', exam: 'GCE O Level', year: 2022, paper: 2 }))
      .toBe('tin em tys 2022 p2');   // no given name read → first word, Adrian renames on the desk
  });
  it('a school prelim carries the school code', () => {
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Eva Isabelle Wong', subject: 'E Math', exam: 'Preliminary Examination', school: 'SJC', year: 2025, paper: 1 }))
      .toBe('eva em prelim sjc 2025 p1');
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Chloe Zhang', subject: 'A Math', exam: 'prelim', school: "St Theresa's Convent", year: 2024, paper: 1 }))
      .toBe('chloe am prelim stc 2024 p1');
  });
  it('practice sets, class tests, and the roster first name winning over the cover', () => {
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'K. Lim', subject: 'A Math', exam: 'Practice Set 3', year: null, paper: 1 }, 'Kassandra'))
      .toBe('kassandra am practice set 3 p1');
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Zane', subject: 'E Math', exam: 'WA3', school: 'Yishun Sec', year: 2026, paper: null }))
      .toBe('zane em wa3 yishun sec 2026');
  });
  it('too thin to name → null', () => {
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Rainie', subject: null, exam: 'tys', year: 2022 })).toBeNull();
    expect(buildScanPaperName({ is_exam_script: true, student_name: 'Rainie', subject: 'A Math', exam: null, year: null })).toBeNull();
    expect(buildScanPaperName({ is_exam_script: true, student_name: null, subject: 'A Math', exam: 'tys', year: 2022 })).toBeNull();
  });
});

describe('parseScanFilename — a scan Adrian named himself', () => {
  it('takes a convention name at its word', () => {
    expect(parseScanFilename('joey am tys 2021 p2.pdf')).toEqual({ paperName: 'joey am tys 2021 p2', firstName: 'joey', name: 'joey' });
    expect(parseScanFilename('isabelle TYS 2025 EM P1.pdf')).toBeNull();   // subject not second → let the cover decide
    expect(parseScanFilename('tze hin em tys 2022 p2.pdf')).toEqual({ paperName: 'tze hin em tys 2022 p2', firstName: 'tze', name: 'tze hin' });
    expect(parseScanFilename('megan jc2 practice set 1 p1.pdf')).toEqual({ paperName: 'megan jc2 practice set 1 p1', firstName: 'megan', name: 'megan' });
  });
  it("the scanner's own names are not names", () => {
    expect(parseScanFilename('06092026.pdf')).toBeNull();
    expect(parseScanFilename('Scan 2026-09-06.pdf')).toBeNull();
    expect(parseScanFilename('chloe am.pdf')).toBeNull();
  });
});

describe('matchStudent', () => {
  const roster = [
    { id: 'r1', name: 'Rainie Cheng' }, { id: 'r2', name: 'Tan Sijia' }, { id: 'r3', name: 'Chloe Gng' },
    { id: 'r4', name: 'Chloe Zhang' }, { id: 'r5', name: 'Eva Isabelle Wong' }, { id: 'r6', name: 'Isabelle Toh Si Xian' },
  ];
  it('whole name, then tokens inside one name, then a unique first name', () => {
    expect(matchStudent('rainie cheng', roster)?.id).toBe('r1');
    expect(matchStudent('Sijia', roster)?.id).toBe('r2');
    expect(matchStudent('Eva Wong', roster)?.id).toBe('r5');
    expect(matchStudent('Rainie', roster)?.id).toBe('r1');
  });
  it('two plausible students → null, and so does junk', () => {
    expect(matchStudent('Chloe', roster)).toBeNull();
    expect(matchStudent('Isabelle', roster)).toBeNull();   // Eva Isabelle and Isabelle Toh
    expect(matchStudent('', roster)).toBeNull();
    expect(matchStudent('Nobody Here', roster)).toBeNull();
  });
});

describe('isSettled / isPdf / scanLine', () => {
  const now = new Date('2026-09-07T06:00:00Z');
  it('waits for the scanner to finish writing', () => {
    expect(isSettled({ name: 'a.pdf', path: '/scans/a.pdf', modified: '2026-09-07T05:59:30Z' }, now)).toBe(false);
    expect(isSettled({ name: 'a.pdf', path: '/scans/a.pdf', modified: '2026-09-07T05:57:00Z' }, now)).toBe(true);
    expect(isSettled({ name: 'a.pdf', path: '/scans/a.pdf', modified: null }, now)).toBe(false);
    expect(isPdf('x.PDF')).toBe(true); expect(isPdf('x.jpg')).toBe(false);
  });
  it('the Telegram line says whose, how many pages, and whether it queued', () => {
    expect(scanLine({ paperName: 'rainie am tys 2022 p1', fileName: '06092026.pdf', student: { id: 'r', name: 'Rainie Cheng' }, readName: 'Rainie Cheng', pages: 12, queued: true, etaMinutes: 40 }))
      .toBe('📠 Scan: rainie am tys 2022 p1 — Rainie Cheng · 12 pages · queued for marking (~40 min)');
    expect(scanLine({ paperName: null, fileName: '06092026.pdf', student: null, readName: 'Rainne', pages: 1, queued: true }))
      .toBe('📠 Scan: 06092026 — couldn\'t tell whose — cover reads "Rainne" · 1 page · queued for marking · tag the student on the desk');
  });
});
