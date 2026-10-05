import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FORMULA_PAGES, MF_PAGES } from './formula-pages';

describe('formula pages list', () => {
  it('every listed page exists, and every formulas dir is listed', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = join(__dirname, '..', 'app', 'formulas');
    const dirs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    const listed = [...FORMULA_PAGES.map(p => p.slug), ...MF_PAGES];
    for (const s of listed) expect(existsSync(join(dir, s, 'page.tsx')), s).toBe(true);
    for (const d of dirs) expect(listed, d).toContain(d);
  });
});
