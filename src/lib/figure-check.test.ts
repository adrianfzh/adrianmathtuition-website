import { describe, expect, it } from 'vitest';
import { REASON_CHIPS, batchKey, isSentBack, readSendBack, reasonComment, sendBackNote, sentBackObject, sgtDayLabel, sizedImageUrl } from './figure-check';

describe('sendBackNote', () => {
  it('keeps the lane prefix, puts the ask first, keeps what was there', () => {
    expect(sendBackNote('Adrian: repair · figfit 3 Sep · cosmetic · stamp', 'question', 'redo', 'the arrow points the wrong way', '30 Sep'))
      .toBe('Adrian: repair · redo 30 Sep: the arrow points the wrong way · figfit 3 Sep · cosmetic · stamp');
    expect(sendBackNote('solimg 3 Sep · watermark', 'solution', 'redraw', '', '30 Sep'))
      .toBe('Adrian: redraw · redraw from scratch 30 Sep · solimg 3 Sep · watermark');
  });
  it('handles an empty note and a bare prefix', () => {
    expect(sendBackNote(null, 'solution', 'redo', ' labels  too small ', '1 Oct')).toBe('Adrian: redraw · redo 1 Oct: labels too small');
    expect(sendBackNote('Adrian: redraw', 'solution', 'redraw', null, '1 Oct')).toBe('Adrian: redraw · redraw from scratch 1 Oct');
  });
  it('a second ask goes in front of the first', () => {
    const one = sendBackNote('x', 'question', 'redo', 'first', '30 Sep');
    const two = sendBackNote(one, 'question', 'redo', 'second', '1 Oct');
    expect(two).toBe('Adrian: repair · redo 1 Oct: second · redo 30 Sep: first · x');
    expect(readSendBack(two)).toEqual({ ask: 'redo', date: '1 Oct', comment: 'second' });
  });
});

describe('isSentBack / readSendBack', () => {
  it('reads only the newest ask', () => {
    expect(isSentBack('Adrian: redraw · redraw from scratch 30 Sep · solimg')).toBe(true);
    expect(readSendBack('Adrian: redraw · redraw from scratch 30 Sep · solimg')).toEqual({ ask: 'redraw', date: '30 Sep', comment: '' });
    expect(isSentBack('Adrian: repair · figfit 3 Sep · cosmetic')).toBe(false);
    expect(isSentBack('Adrian: redraw · solimg')).toBe(false);
    expect(isSentBack(null)).toBe(false);
  });
});

describe('small helpers', () => {
  it('names the day in Singapore time', () => {
    expect(sgtDayLabel(new Date('2026-09-30T17:00:00Z'))).toBe('1 Oct');
  });
  it('keeps a sent-back candidate outside candidates/', () => {
    expect(sentBackObject('school/media/image3.png', '2026-09-30')).toBe('sent-back/2026-09-30/school/media/image3.png');
  });
  it('orders by batch then index, unbatched last', () => {
    expect(batchKey('#B5-12 · redrawn')).toEqual([5, 12]);
    expect(batchKey(null)[0]).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('reason chips', () => {
  it('joins chips and words into one comment', () => {
    expect(reasonComment(['crop', 'blurry'], '  the  axis is cut ')).toBe('crop; blurry; the axis is cut');
    expect(reasonComment([], '')).toBe('');
    expect(REASON_CHIPS).toContain('caption inside');
  });
});

describe('sizedImageUrl', () => {
  it('points a public Storage URL at the image transform, keeping the cache-buster', () => {
    expect(sizedImageUrl('https://x.supabase.co/storage/v1/object/public/question_images/candidates/a.png?v=2026', 480))
      .toBe('https://x.supabase.co/storage/v1/render/image/public/question_images/candidates/a.png?width=480&resize=contain&v=2026');
    expect(sizedImageUrl('https://x.supabase.co/storage/v1/object/public/question_images/a.png', 1200))
      .toBe('https://x.supabase.co/storage/v1/render/image/public/question_images/a.png?width=1200&resize=contain');
  });
  it('leaves any other URL alone', () => {
    expect(sizedImageUrl('/api/files/x.png', 480)).toBe('/api/files/x.png');
  });
});
