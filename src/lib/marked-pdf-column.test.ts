import { describe, it, expect } from 'vitest';
import { markedPdfColumn } from './marked-pdf-column';

describe('markedPdfColumn', () => {
  it('keeps the three copies of a marked paper apart', () => {
    expect(markedPdfColumn('full')).toBe('pdf_url');
    expect(markedPdfColumn('photos')).toBe('photos_pdf_url');
    expect(markedPdfColumn('annotated')).toBe('annotated_pdf_url');
  });

  it('never lets the images copy land on the full marked script', () => {
    // The regression this file exists to prevent: 🖼 overwriting 📄.
    expect(markedPdfColumn('photos')).not.toBe('pdf_url');
    expect(markedPdfColumn('annotated')).not.toBe('pdf_url');
  });

  it('treats anything unrecognised as the full script, like the bot does', () => {
    for (const k of ['', 'image', 'pdf', 'FULL', null, undefined]) {
      expect(markedPdfColumn(k)).toBe('pdf_url');
    }
  });
});
