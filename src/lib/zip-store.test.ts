import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { ZipStoreWriter, crc32, uniqueZipName } from './zip-store';

const enc = (s: string) => new TextEncoder().encode(s);

describe('zip-store', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive jszip reads back, names and bytes intact', async () => {
    const w = new ZipStoreWriter();
    const big = new Uint8Array(70_000).map((_, i) => i % 251);
    const chunks = [
      w.entry('Kassandra — A Math GCE 2022 Paper 1 — 3 Sep 2026.pdf', enc('first paper')),
      w.entry('second.pdf', big),
      w.entry('empty.pdf', new Uint8Array(0)),
      w.finish(),
    ];
    const zip = await JSZip.loadAsync(Buffer.concat(chunks.map(c => Buffer.from(c))), { checkCRC32: true });
    expect(Object.keys(zip.files)).toEqual(['Kassandra — A Math GCE 2022 Paper 1 — 3 Sep 2026.pdf', 'second.pdf', 'empty.pdf']);
    expect(await zip.file('Kassandra — A Math GCE 2022 Paper 1 — 3 Sep 2026.pdf')!.async('string')).toBe('first paper');
    expect(Buffer.from(await zip.file('second.pdf')!.async('uint8array')).equals(Buffer.from(big))).toBe(true);
  });

  it('an archive with no entries is still a valid zip', async () => {
    const zip = await JSZip.loadAsync(Buffer.from(new ZipStoreWriter().finish()));
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('uniqueZipName keeps two papers of the same name apart and strips path characters', () => {
    const used = new Set<string>();
    expect(uniqueZipName('a/b: paper.pdf', used)).toBe('a-b- paper.pdf');
    expect(uniqueZipName('Paper.pdf', used)).toBe('Paper.pdf');
    expect(uniqueZipName('paper.pdf', used)).toBe('paper (2).pdf');
    expect(uniqueZipName('Paper.pdf', used)).toBe('Paper (3).pdf');
    expect(uniqueZipName('', used)).toBe('file');
  });
});
