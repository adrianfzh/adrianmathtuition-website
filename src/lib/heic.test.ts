import { describe, expect, it } from 'vitest';
import { fitWithin, heicJpegName, isHeicFile } from './heic';

describe('isHeicFile', () => {
  it('knows HEIC by type', () => {
    expect(isHeicFile({ name: 'x', type: 'image/heic' })).toBe(true);
    expect(isHeicFile({ name: 'x', type: 'image/HEIF' })).toBe(true);
  });
  it('knows HEIC by name when Chrome reports no type', () => {
    expect(isHeicFile({ name: 'IMG_1234.HEIC', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'a.heif', type: null })).toBe(true);
  });
  it('leaves other photos alone', () => {
    expect(isHeicFile({ name: 'IMG_1234.jpg', type: 'image/jpeg' })).toBe(false);
    expect(isHeicFile({ name: 'scan.png', type: 'image/png' })).toBe(false);
    expect(isHeicFile({})).toBe(false);
  });
});

describe('heicJpegName', () => {
  it('swaps the extension', () => {
    expect(heicJpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
    expect(heicJpegName('page.heif')).toBe('page.jpg');
    expect(heicJpegName('shared')).toBe('shared.jpg');
    expect(heicJpegName('')).toBe('photo.jpg');
  });
});

describe('fitWithin', () => {
  it('caps the longer side and never enlarges', () => {
    expect(fitWithin(4284, 5712, 3500)).toEqual({ w: 2625, h: 3500 });
    expect(fitWithin(1200, 900, 3500)).toEqual({ w: 1200, h: 900 });
  });
});
