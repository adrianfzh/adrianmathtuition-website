import { describe, it, expect } from 'vitest';
import { decodeExamNotes, encodeExamNotes } from './exam-notes-markers';

const URL = 'https://x.public.blob.vercel-storage.com/exam-photos/abc.jpg';

describe('exam notes markers', () => {
  it('plain notes pass through', () => {
    expect(decodeExamNotes('Integration up to 10.1.6 only')).toEqual({ approx: false, notes: 'Integration up to 10.1.6 only', photoUrl: null });
    expect(decodeExamNotes('')).toEqual({ approx: false, notes: '', photoUrl: null });
  });
  it('leading ~| = approximate date (existing marker)', () => {
    expect(decodeExamNotes('~|wk of 12 Aug')).toEqual({ approx: true, notes: 'wk of 12 Aug', photoUrl: null });
    expect(decodeExamNotes('~|')).toEqual({ approx: true, notes: '', photoUrl: null });
  });
  it('trailing 📷 line = photo url, stripped from the notes', () => {
    expect(decodeExamNotes(`no calculator\n📷 ${URL}`)).toEqual({ approx: false, notes: 'no calculator', photoUrl: URL });
    expect(decodeExamNotes(`📷 ${URL}`)).toEqual({ approx: false, notes: '', photoUrl: URL });
    expect(decodeExamNotes(`~|\n📷 ${URL}`)).toEqual({ approx: true, notes: '', photoUrl: URL });
  });
  it('a 📷 line that is not a url is left alone', () => {
    expect(decodeExamNotes('📷 bring camera')).toEqual({ approx: false, notes: '📷 bring camera', photoUrl: null });
  });
  it('encode ↔ decode round-trips every combination', () => {
    for (const approx of [false, true]) for (const notes of ['', 'two\nlines']) for (const photoUrl of [null, URL]) {
      expect(decodeExamNotes(encodeExamNotes({ notes, approx, photoUrl }))).toEqual({ approx, notes, photoUrl });
    }
  });
  it('encode drops a non-url photo value and trailing newlines', () => {
    expect(encodeExamNotes({ notes: 'x\n\n', photoUrl: 'data:image/jpeg;base64,abc' })).toBe('x');
  });
  it('set-exams compatible: bare approx flag with no notes stays "~|"', () => {
    expect(encodeExamNotes({ notes: '', approx: true })).toBe('~|');
  });
});
