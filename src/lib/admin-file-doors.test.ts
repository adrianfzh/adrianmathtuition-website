import { describe, expect, it } from 'vitest';
import { isFileDoor, isShareableType, shareFileName } from './admin-file-doors';

const O = 'https://www.adrianmathtuition.com';

describe('admin file doors', () => {
  // 29 Oct 2026, Adrian: "when i go into images on phone, there are no options for me to go back or to download/save"
  it('the Images link (same-site, new tab) is a file door', () => {
    const href = '/api/admin/mark-paper-download/abel.pdf?url=x&name=abel%20h2&disposition=inline';
    expect(isFileDoor(href, O, { newTab: true, download: false })).toBe(true);
    expect(shareFileName(href, O, 'application/pdf')).toBe('abel h2.pdf');
  });
  it('drops the date from a name that is sent on', () => {
    const href = '/api/admin/mark-paper-download/x.pdf?name=' + encodeURIComponent('Abel Tan Zhi Yi — abel h2 math tys 2021 paper 1 — 28 Oct 2026.pdf');
    expect(shareFileName(href, O, 'application/pdf')).toBe('Abel Tan Zhi Yi — abel h2 math tys 2021 paper 1.pdf');
    expect(shareFileName('/api/x?name=' + encodeURIComponent('Nicole — full — 3 Sept 2026.pdf'), O, 'application/pdf')).toBe('Nicole — full.pdf');
  });
  it('plain page links and other sites are left alone', () => {
    expect(isFileDoor('/admin/students', O, { newTab: true, download: false })).toBe(false);
    expect(isFileDoor('/api/admin/x', O, { newTab: false, download: false })).toBe(false);
    expect(isFileDoor('https://www.dropbox.com/s/a.pdf', O, { newTab: true, download: false })).toBe(false);
  });
  it('names a Word file .docx and never shares a page', () => {
    expect(shareFileName('/api/admin/sheet-open?name=Sheet.pdf', O, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('Sheet.docx');
    expect(isShareableType('text/html; charset=utf-8')).toBe(false);
    expect(isShareableType('application/pdf')).toBe(true);
  });
});
