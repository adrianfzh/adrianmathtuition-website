import { describe, it, expect } from 'vitest';
import { parseSheetBody, dataUrlBytes, sheetTitle, photoTopics, sheetSentMessage, MAX_SHEET_PHOTOS } from './practice-sheet';

const jpg = 'data:image/jpeg;base64,' + Buffer.from('hello').toString('base64');

describe('parseSheetBody', () => {
  it('takes strings or {imageBase64} objects, up to five', () => {
    const r = parseSheetBody({ photos: [jpg, { imageBase64: jpg }], level: 'AM' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.photos).toHaveLength(2); expect(r.value.level).toBe('AM'); expect(r.value.workedExample).toBe(false); }
    expect(parseSheetBody({ photos: Array(MAX_SHEET_PHOTOS + 1).fill(jpg) })).toMatchObject({ ok: false, status: 400 });
    expect(parseSheetBody({ photos: [] })).toMatchObject({ ok: false, status: 400 });
    expect(parseSheetBody({})).toMatchObject({ ok: false, status: 400 });
  });
  it('a worked example only with a single photo', () => {
    const one = parseSheetBody({ photos: [jpg], workedExample: true });
    expect(one.ok && one.value.workedExample).toBe(true);
    const two = parseSheetBody({ photos: [jpg, jpg], workedExample: true });
    expect(two.ok && two.value.workedExample).toBe(false);
  });
  it('refuses a non-image', () => {
    const r = parseSheetBody({ photos: [jpg, 'data:text/plain;base64,aGk='] });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.error).toMatch(/Photo 2/);
  });
});

describe('the rest', () => {
  it('dataUrlBytes decodes and names the type', () => {
    const d = dataUrlBytes(jpg);
    expect(d?.ext).toBe('jpg'); expect(d?.contentType).toBe('image/jpeg'); expect(d?.bytes.toString()).toBe('hello');
    expect(dataUrlBytes('nope')).toBeNull();
  });
  it('sheetTitle', () => { expect(sheetTitle('2026-09-24')).toBe('Practice sheet · 24 Sep'); });
  it('photoTopics dedupes', () => {
    expect(photoTopics([{ subgroup: { topic: 'Trigonometry', name: 'a' } }, { subgroup: null }, { subgroup: { topic: 'Trigonometry', name: 'b' } }, { subgroup: { topic: 'Vectors', name: 'c' } }])).toBe('Trigonometry · Vectors');
    expect(photoTopics([{ subgroup: null }])).toBeNull();
  });
  it('sheetSentMessage', () => {
    expect(sheetSentMessage({ waits: false, dayWord: 'today', photos: 3, workedExample: false })).toMatch(/Writing your sheet now — 6 questions/);
    expect(sheetSentMessage({ waits: true, dayWord: 'Thursday', photos: 1, workedExample: true })).toMatch(/Queued for Thursday — your sheet \(2 questions and a worked example\)/);
  });
});
