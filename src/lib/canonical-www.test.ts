// The site has ONE canonical host: https://www.adrianmathtuition.com (Adrian,
// 5 Oct 2026: "switch to www everywhere"). The apex only redirects to it, so a
// canonical, sitemap, robots or JSON-LD URL on the apex points crawlers at a
// redirect. This pins every declared URL to www.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

const WWW = 'https://www.adrianmathtuition.com';
const APEX = /https?:\/\/adrianmathtuition\.com/;
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|js|html|txt|json)$/.test(name) && !/\.min\.m?js$/.test(name) && !/ \d+(\.[^/]+)?$/.test(name)) out.push(p);
  }
  return out;
}

describe('one canonical host: www', () => {
  it('robots points at the www sitemap', () => {
    expect(robots().sitemap).toBe(`${WWW}/sitemap.xml`);
  });

  it('every sitemap URL is on www', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.length).toBeGreaterThan(10);
    for (const u of urls) expect(u.startsWith(`${WWW}`)).toBe(true);
  });

  it('the root layout sets metadataBase (and so every canonical) to www', () => {
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');
    expect(layout).toContain(`const SITE_URL = "${WWW}"`);
    expect(layout).toContain('metadataBase: new URL(SITE_URL)');
  });

  it('no page, script or public file links to the apex', () => {
    const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public'))];
    const hits = files.filter((f) => APEX.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual([]);
  });
});
