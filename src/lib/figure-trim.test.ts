import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { needsTrim, tightPad, trimWhite } from './figure-trim';

/** A white canvas with one black box at (x, y). */
async function canvas(w: number, h: number, box: { x: number; y: number; w: number; h: number }) {
  const ink = await sharp({ create: { width: box.w, height: box.h, channels: 3, background: '#000000' } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .composite([{ input: ink, left: box.x, top: box.y }]).png().toBuffer();
}

describe('tightPad', () => {
  it('is 2% of the longer side, 8 to 20 px', () => {
    expect(tightPad(100, 50)).toBe(8);
    expect(tightPad(600, 400)).toBe(12);
    expect(tightPad(3000, 200)).toBe(20);
  });
});

describe('needsTrim', () => {
  it('leaves a figure already inside the rule alone', () => {
    expect(needsTrim({ top: 12, right: 12, bottom: 12, left: 12 }, { width: 600, height: 400 })).toBe(false);
    expect(needsTrim({ top: 0, right: 3, bottom: 0, left: 0 }, { width: 600, height: 400 })).toBe(false);
  });
  it('trims when any side carries too much white', () => {
    expect(needsTrim({ top: 12, right: 12, bottom: 80, left: 12 }, { width: 600, height: 400 })).toBe(true);
  });
});

describe('trimWhite', () => {
  it('cuts a wide white margin down to the pad', async () => {
    const png = await canvas(1000, 800, { x: 300, y: 250, w: 400, h: 200 });
    const { bytes, trimmed } = await trimWhite(png);
    expect(trimmed).toBe(true);
    const m = await sharp(bytes).metadata();
    expect(m.width).toBe(400 + 2 * 8);
    expect(m.height).toBe(200 + 2 * 8);
  });
  it('keeps the bytes of a tight figure', async () => {
    const png = await canvas(420, 220, { x: 10, y: 10, w: 400, h: 200 });
    const out = await trimWhite(png);
    expect(out.trimmed).toBe(false);
    expect(out.bytes).toBe(png);
  });
  it('never breaks on a blank image or junk bytes', async () => {
    const blank = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect((await trimWhite(blank)).trimmed).toBe(false);
    expect((await trimWhite(Buffer.from('nope'))).trimmed).toBe(false);
  });
});
