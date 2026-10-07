import { describe, it, expect } from 'vitest';
import { isPageNavigation, safeFilePath, openDoorUrl } from './file-door';

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe('isPageNavigation — a person opening the link, not an image or a fetch', () => {
  it('a browser tab', () => {
    expect(isPageNavigation(h({ 'sec-fetch-dest': 'document', accept: 'text/html' }))).toBe(true);
    expect(isPageNavigation(h({ 'sec-fetch-mode': 'navigate' }))).toBe(true);
    expect(isPageNavigation(h({ accept: 'text/html,application/xhtml+xml' }))).toBe(true);
  });
  it('an <img>, a PDF viewer inside a page, a script', () => {
    expect(isPageNavigation(h({ 'sec-fetch-dest': 'image', accept: 'image/avif,*/*' }))).toBe(false);
    expect(isPageNavigation(h({ 'sec-fetch-dest': 'iframe', accept: 'text/html' }))).toBe(false);
    expect(isPageNavigation(h({ 'sec-fetch-mode': 'cors', accept: '*/*' }))).toBe(false);
    expect(isPageNavigation(h({ accept: '*/*' }))).toBe(false);
    expect(isPageNavigation(h({}))).toBe(false);
  });
});

describe('safeFilePath — only our own file door', () => {
  it('keeps a file path', () => {
    expect(safeFilePath('/api/files/runs/364009ed-f0f0-4871-a758-5c99aa6132bc/marked.pdf')).toBe('/api/files/runs/364009ed-f0f0-4871-a758-5c99aa6132bc/marked.pdf');
    expect(safeFilePath('/api/files/uploads/a%20b.pdf')).toBe('/api/files/uploads/a%20b.pdf');
  });
  it('refuses anything else', () => {
    for (const bad of ['https://evil.example/x', '//evil.example/api/files/x', '/api/files/../admin', '/admin/desk', '/api/files/', '', null, '/api/files/a\\b', '/api/files/a?next=//x'])
      expect(safeFilePath(bad as string | null)).toBeNull();
  });
  it('openDoorUrl round-trips', () => {
    const u = new URL(openDoorUrl('/api/files/runs/x/y.pdf'), 'https://www.adrianmathtuition.com');
    expect(u.pathname).toBe('/admin/open');
    expect(safeFilePath(u.searchParams.get('file'))).toBe('/api/files/runs/x/y.pdf');
  });
});
