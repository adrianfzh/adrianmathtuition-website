import { describe, it, expect } from 'vitest';
import { isOurBlobUrl } from './blob-url';

// The guard that keeps mark-paper-send / mark-paper-download from being an
// authenticated open proxy: only our Blob store passes.
describe('isOurBlobUrl', () => {
  it('accepts our Blob store over https', () => {
    expect(isOurBlobUrl('https://c7hgmz1ji3tevske.public.blob.vercel-storage.com/mark-paper/x.pdf')).toBe(true);
  });
  it('rejects other hosts, lookalikes, and plain http', () => {
    expect(isOurBlobUrl('https://evil.com/x.pdf')).toBe(false);
    expect(isOurBlobUrl('https://evil.com/?u=public.blob.vercel-storage.com')).toBe(false);
    // Suffix must match on a dot boundary of the real domain, not a crafted registrable one.
    expect(isOurBlobUrl('https://fakepublic.blob.vercel-storage.com.evil.com/x.pdf')).toBe(false);
    expect(isOurBlobUrl('http://c7hgmz1ji3tevske.public.blob.vercel-storage.com/x.pdf')).toBe(false);
  });
  it('rejects garbage', () => {
    expect(isOurBlobUrl('')).toBe(false);
    expect(isOurBlobUrl('not a url')).toBe(false);
  });
});
