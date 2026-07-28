import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// /admin/mark-paper rasterises a scanned working PDF in the browser, and pdf.js
// REFUSES to run when the worker's version differs from the API's ("The API version
// does not match the Worker version"). The worker is a copy in public/ rather than a
// bundled import, so `npm update pdfjs-dist` would leave the copy behind and break
// PDF working uploads at runtime with nothing failing at build time. Pin the pair.
//
// When this fails, the fix is one line:
//   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
describe('public/pdf.worker.min.mjs', () => {
  const root = join(__dirname, '..', '..');
  const installed = JSON.parse(
    readFileSync(join(root, 'node_modules', 'pdfjs-dist', 'package.json'), 'utf8')
  ).version as string;

  it('matches the installed pdfjs-dist version', () => {
    const worker = readFileSync(join(root, 'public', 'pdf.worker.min.mjs'), 'utf8');
    expect(worker).toContain(installed);
  });
});
