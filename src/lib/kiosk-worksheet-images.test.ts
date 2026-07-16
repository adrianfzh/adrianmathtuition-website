import { describe, it, expect, beforeAll } from 'vitest';
import { cropUrls, flattenParts, imgSrc } from './kiosk-worksheet-images';

const BASE = 'https://nempslbewxtlikfzachi.supabase.co';
const PUB = `${BASE}/storage/v1/object/public/question_images/`;

beforeAll(() => {
  process.env.SUPABASE_URL = BASE;
});

describe('imgSrc', () => {
  it('prefixes bare filenames', () => {
    expect(imgSrc('abc123.png')).toBe(`${PUB}abc123.png`);
  });
  it('strips a leading question_images/ before prefixing', () => {
    expect(imgSrc('question_images/abc123.png')).toBe(`${PUB}abc123.png`);
  });
  it('passes full URLs through untouched', () => {
    expect(imgSrc(`${PUB}abc123.png`)).toBe(`${PUB}abc123.png`);
  });
});

describe('cropUrls', () => {
  it('handles bare-string arrays (St Patrick / Tanjong Katong shape)', () => {
    expect(cropUrls('["a77ed670.png"]')).toEqual([`${PUB}a77ed670.png`]);
  });
  it('handles prefixed-string arrays (Catholic High shape)', () => {
    expect(cropUrls('["question_images/9446eed8.png"]')).toEqual([`${PUB}9446eed8.png`]);
  });
  it('handles {url,pos} object arrays (2025 EM batch / SCGS shape) — was [object Object]', () => {
    expect(cropUrls('[{"url":"question_images/b8df66ff.png","pos":"after"}]'))
      .toEqual([`${PUB}b8df66ff.png`]);
  });
  it('handles mixed arrays and drops junk entries', () => {
    expect(cropUrls('["ok-file.png", {"pos":"after"}, {"url":"xy1234.png"}, 42, null, ""]'))
      .toEqual([`${PUB}ok-file.png`, `${PUB}xy1234.png`]);
  });
  it('returns [] for null, malformed JSON, and non-arrays', () => {
    expect(cropUrls(null)).toEqual([]);
    expect(cropUrls('not json')).toEqual([]);
    expect(cropUrls('{"url":"a.png"}')).toEqual([]);
  });
});

describe('flattenParts', () => {
  it('emits part-level image_url_after inline as a markdown image (Mayflower Q10 shape)', () => {
    const { text } = flattenParts('', [
      { label: 'a', text: 'Solve the equation.', marks: 3, answer: 'x = 90' },
      {
        label: 'b',
        text: 'The diagram above shows the graph.',
        subparts: [
          { label: 'i', text: 'Write down a, b, c.', marks: 3, answer: 'a=4', image_url_after: `${PUB}deab1ac1.png` },
          { label: 'ii', text: 'Find an equation.', marks: 1, answer: 'm=k+pi' },
        ],
      },
    ]);
    expect(text).toContain(`![diagram](${PUB}deab1ac1.png)`);
    // image sits after its subpart's text, before the next subpart
    const img = text.indexOf('![diagram]');
    expect(img).toBeGreaterThan(text.indexOf('Write down a, b, c.'));
    expect(img).toBeLessThan(text.indexOf('Find an equation.'));
  });
  it('resolves bucket-relative part images (SCGS Q11 shape)', () => {
    const { text } = flattenParts('', [
      { label: 'b', text: 'Find the shaded area.', image_url_after: 'question_images/700ebe14.png' },
    ]);
    expect(text).toContain(`![diagram](${PUB}700ebe14.png)`);
  });
  it('emits image_url before the part text', () => {
    const { text } = flattenParts('', [
      { label: 'a', text: 'Question text.', image_url: 'fig1234.png' },
    ]);
    expect(text.indexOf('![diagram]')).toBeLessThan(text.indexOf('**(a)**'));
  });
  it('keeps stem, labels, marks, and combined answers intact', () => {
    const { text, answer } = flattenParts('Stem here.', [
      { label: 'a', text: 'First.', marks: 2, answer: '1' },
      { label: 'b', text: 'Second.', answer: '2' },
    ]);
    expect(text).toBe('Stem here.\n\n**(a)** First.  [2]\n\n**(b)** Second.');
    expect(answer).toBe('(a) 1;  (b) 2');
  });
  it('returns the stem untouched when parts are null/empty', () => {
    expect(flattenParts('Just a stem.', null)).toEqual({ text: 'Just a stem.', answer: '' });
    expect(flattenParts('Just a stem.', [])).toEqual({ text: 'Just a stem.', answer: '' });
  });
});
