import { describe, it, expect } from 'vitest';
import { displayPaperName } from './paper-display-name';

describe('displayPaperName', () => {
  it('reads the internal name the way a student would say it', () => {
    expect(displayPaperName('tze hin em tys 2022 p2', 'Tin Tze Hin')).toBe('E Math · GCE 2022 · Paper 2');
    expect(displayPaperName('kassandra am tys 2021 p1', 'Kassandra Lim')).toBe('A Math · GCE 2021 · Paper 1');
    expect(displayPaperName('Emath O2022', 'Alessi Tay')).toBe('E Math · GCE 2022');
    expect(displayPaperName('kassandra am practice set 3 p1', 'Kassandra Lim')).toBe('A Math · Practice Set 3 · Paper 1');
    expect(displayPaperName('chloe am prelim st theresa p1', 'Chloe Zhang')).toBe('A Math · St Theresa Prelim · Paper 1');
    expect(displayPaperName('rainie em prelim sjc 2025 p1', 'Rainie Cheng')).toBe('E Math · Sjc Prelim 2025 · Paper 1');
  });
  it('falls back to a tidied raw name, and never throws', () => {
    expect(displayPaperName('Handed in 22 Aug', 'Adrian Fong')).toBe('Handed In 22 Aug');
    expect(displayPaperName('', 'x')).toBe('Marked paper');
    expect(displayPaperName(null)).toBe('Marked paper');
  });
});
