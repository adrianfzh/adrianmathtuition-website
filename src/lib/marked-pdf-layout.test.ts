import { describe, expect, it } from 'vitest';
import { shouldStampPaperTotal } from './marked-pdf-layout';

describe('shouldStampPaperTotal', () => {
  it('stamps an exam paper whose total came from the name, Adrian, or recognising the paper', () => {
    for (const s of ['registry', 'override', 'identified', 'bank']) expect(shouldStampPaperTotal(s)).toBe(true);
  });
  it('leaves a counted practice (and the cover case, as before) without the strip', () => {
    for (const s of ['counted', 'brackets', 'cover', null, undefined]) expect(shouldStampPaperTotal(s)).toBe(false);
  });
});
