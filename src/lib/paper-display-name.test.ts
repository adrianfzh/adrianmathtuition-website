import { describe, it, expect } from 'vitest';
import { displayPaperName, practiceAgainHandinName } from './paper-display-name';

describe('displayPaperName', () => {
  it('reads the internal name the way a student would say it', () => {
    expect(displayPaperName('tze hin em tys 2022 p2', 'Tin Tze Hin')).toBe('E Math · GCE 2022 · Paper 2');
    expect(displayPaperName('kassandra am tys 2021 p1', 'Kassandra Lim')).toBe('A Math · GCE 2021 · Paper 1');
    expect(displayPaperName('Emath O2022', 'Alessi Tay')).toBe('E Math · GCE 2022');
    expect(displayPaperName('kassandra am practice set 3 p1', 'Kassandra Lim')).toBe('A Math · Practice Set 3 · Paper 1');
    expect(displayPaperName('chloe am prelim st theresa p1', 'Chloe Zhang')).toBe('A Math · St Theresa Prelim · Paper 1');
    expect(displayPaperName('rainie em prelim sjc 2025 p1', 'Rainie Cheng')).toBe('E Math · SJC Prelim 2025 · Paper 1');
  });
  it('keeps school codes upper-case and school words title-case', () => {
    expect(displayPaperName('rainie am prelim sjc 2024 p1', 'Rainie Cheng')).toBe('A Math · SJC Prelim 2024 · Paper 1');
    expect(displayPaperName('eva em prelim nygh 2025 p2', 'Eva Isabelle Wong')).toBe('E Math · NYGH Prelim 2025 · Paper 2');
    expect(displayPaperName('h2 promo hci 2025 p1', 'Megan Goh')).toBe('H2 Math · HCI Promo 2025 · Paper 1');
    expect(displayPaperName('em mye nan hua 2025 p1', 'X')).toBe('E Math · Nan Hua Mid-Year 2025 · Paper 1');
    expect(displayPaperName('am prelim hwa chong 2024 p2', 'X')).toBe('A Math · Hwa Chong Prelim 2024 · Paper 2');
  });
  it('a handed-in Practice Again sheet is not named as the paper itself', () => {
    expect(displayPaperName('Practice Again — AM TYS 2022 P1', 'Rainie Cheng')).toBe('Practice Again · A Math · GCE 2022 · Paper 1');
    expect(displayPaperName('Practice Again — A Math 2021 P1 sophie', 'Sophie Tan')).toBe('Practice Again · A Math · 2021 · Paper 1');
  });
  it('falls back to a tidied raw name, and never throws', () => {
    expect(displayPaperName('Handed in 22 Aug', 'Adrian Fong')).toBe('Handed In 22 Aug');
    expect(displayPaperName('', 'x')).toBe('Marked paper');
    expect(displayPaperName(null)).toBe('Marked paper');
  });
});

describe('practiceAgainHandinName (8 Sep 2026)', () => {
  it('gives every Practice Again hand-in the same shape, from the source paper when known', () => {
    expect(practiceAgainHandinName('Practice Again — from your A Math 2021 Paper 1', 'alessi am tys 2021 p1', 'Alessi Tay')).toBe('Practice Again — A Math · GCE 2021 · Paper 1');
    expect(practiceAgainHandinName('Practice Again — AM TYS 2022 P1', null, 'Rainie Cheng')).toBe('Practice Again — A Math · GCE 2022 · Paper 1');
    expect(practiceAgainHandinName('Practice Again — from your A Math 2021 Paper 1', null, 'Alessi Tay')).toBe('Practice Again — A Math · 2021 · Paper 1');
  });
  it('leaves an ordinary paper name alone', () => {
    expect(practiceAgainHandinName('Emath O2022', null, 'Alessi Tay')).toBe('Emath O2022');
    expect(practiceAgainHandinName('', null)).toBe('');
  });
});
