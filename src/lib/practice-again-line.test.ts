import { describe, it, expect } from 'vitest';
import { sheetLine, sheetJobLine, bundleCaption } from './practice-again-line';

describe('sheetLine — the sheet inside its paper card', () => {
  it('a marked sheet is done, green, with its score, no buttons', () => {
    expect(sheetLine({ status: 'marked', score: 17, out_of: 18 })).toEqual({ tone: 'done', text: 'Practice Again done · 17/18', actions: false });
  });
  it('a marked sheet with no score still says done', () => {
    expect(sheetLine({ status: 'marked', score: null, out_of: null }).text).toBe('Practice Again done');
  });
  it('a handed-in sheet is waiting, amber', () => {
    expect(sheetLine({ status: 'submitted' })).toEqual({ tone: 'waiting', text: 'Practice Again handed in · being marked', actions: false });
  });
  it('an assigned sheet is the student\'s move — rose, with buttons, and never the word compulsory', () => {
    const l = sheetLine({ status: 'assigned' });
    expect(l).toEqual({ tone: 'todo', text: 'Practice Again · not done yet', actions: true });
    expect(l.text.toLowerCase()).not.toContain('compulsory');
  });
});

describe('sheetJobLine — no sheet yet', () => {
  it('says nothing with no job, or after a failed / no-sheet job', () => {
    expect(sheetJobLine(null)).toBeNull();
    expect(sheetJobLine({ status: 'failed', noSheet: false })).toBeNull();
    expect(sheetJobLine({ status: 'done', noSheet: true })).toBeNull();
  });
  it('being written while queued or claimed; with Adrian once done', () => {
    expect(sheetJobLine({ status: 'queued', noSheet: false })?.text).toBe('Practice Again is being written');
    expect(sheetJobLine({ status: 'claimed', noSheet: false })?.tone).toBe('quiet');
    expect(sheetJobLine({ status: 'done', noSheet: false })?.text).toBe('Practice Again written · Adrian is checking it');
  });
});

describe('bundleCaption', () => {
  it('names the count and says why the papers sit together', () => {
    expect(bundleCaption(2)).toEqual({ title: 'One Practice Again sheet · made from these 2 papers', sub: 'It teaches what you lost marks on in both papers, so you do it once.' });
    expect(bundleCaption(3).sub).toContain('all 3 papers');
  });
});
