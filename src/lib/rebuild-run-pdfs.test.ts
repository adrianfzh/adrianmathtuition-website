import { describe, it, expect, vi } from 'vitest';
import { rebuildBodyFromRun, rebuildModes, buildBothPdfs, type RunRow, type RebuildBody } from './rebuild-run-pdfs';
import { markedPdfColumn } from './marked-pdf-column';

const RUN: RunRow = {
  id: 'f0d82c18-0000-4000-8000-000000000000',
  student_name: 'Sophie Tan',
  paper_name: 'sophie am tys 2021 p1',
  released_at: null,
  result_json: {
    results: [
      { question_number: '1', marking_output: { lines: [], marks: { awarded: 2, max: 4 } }, photo_index: 0, extra: 'dropped' },
      { question_number: '2', marking_output: { lines: [], marks: { awarded: 3, max: 3 } }, photo_index: 1 },
    ],
    annotated_photos: [{ photo_index: 0, url: 'https://blob/a.png', url_with_solutions: 'https://blob/a-sol.png' }, { photo_index: 1, url: 'https://blob/b.png' }],
    totals: { awarded: 5, max: 90, max_source: 'registry' },
    diagnosis: { at: 'x', sheetJobId: 'j', skills: [] },
  },
};

describe('rebuildBodyFromRun', () => {
  it('rebuilds the same body the page and the bot post, from the row alone', () => {
    const r = rebuildBodyFromRun(RUN);
    expect('body' in r).toBe(true);
    const body = (r as { body: RebuildBody }).body;
    expect(body.runId).toBe(RUN.id);
    expect(body.paperName).toBe('sophie am tys 2021 p1');
    expect(body.student).toEqual({ name: 'Sophie Tan', level: '' });
    expect(body.results).toEqual([
      { question_number: '1', marking_output: { lines: [], marks: { awarded: 2, max: 4 } }, photo_index: 0 },
      { question_number: '2', marking_output: { lines: [], marks: { awarded: 3, max: 3 } }, photo_index: 1 },
    ]);
    expect(body.annotated_photos.length).toBe(2);
    expect(body.totals).toEqual({ awarded: 5, max: 90, max_source: 'registry' });
    expect(body.multi).toBe(true);
  });

  it('never rebuilds a released run — the student already has that copy', () => {
    expect(rebuildBodyFromRun({ ...RUN, released_at: '2026-09-02T01:00:00Z' })).toEqual({
      skip: expect.stringMatching(/released/),
    });
  });

  it('skips a run with nothing to draw', () => {
    expect(rebuildBodyFromRun({ ...RUN, result_json: { queue: {} } })).toEqual({ skip: expect.stringMatching(/no marking/) });
    expect(rebuildBodyFromRun({ ...RUN, result_json: null })).toEqual({ skip: expect.stringMatching(/no marking/) });
  });

  it('builds the photos half only when annotated pages exist', () => {
    const withPhotos = (rebuildBodyFromRun(RUN) as { body: RebuildBody }).body;
    expect(rebuildModes(withPhotos)).toEqual(['photos', 'full']);
    const noPhotos = (rebuildBodyFromRun({ ...RUN, result_json: { results: (RUN.result_json as { results: unknown[] }).results } }) as { body: RebuildBody }).body;
    expect(rebuildModes(noPhotos)).toEqual(['full']);
  });
});

describe('buildBothPdfs', () => {
  const body = (rebuildBodyFromRun(RUN) as { body: RebuildBody }).body;
  const ok = (url: string) => ({ ok: true, status: 200, json: async () => ({ url, kind: 'pdf' }) }) as unknown as Response;
  const fail = (error: string) => ({ ok: false, status: 500, json: async () => ({ error }) }) as unknown as Response;

  it('posts both halves to the route with the admin headers and links each to its own column', async () => {
    const calls: { url: string; mode: string; auth: string | undefined }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      calls.push({ url: String(url), mode: b.mode, auth: (init?.headers as Record<string, string>).Authorization });
      return ok(`https://blob/${b.mode}.pdf`);
    }) as unknown as typeof fetch;
    const linked: [string, string][] = [];
    const out = await buildBothPdfs(body, {
      origin: 'https://adrianmath-dev.vercel.app', headers: { Authorization: 'Bearer pw' }, fetchImpl,
      link: async (mode, url) => { linked.push([markedPdfColumn(mode), url]); },
    });
    expect(out).toEqual({ rebuilt: true, photos: 'https://blob/photos.pdf', full: 'https://blob/full.pdf' });
    expect(calls.map(c => c.url)).toEqual(Array(2).fill('https://adrianmath-dev.vercel.app/api/admin/mark-paper-pdf'));
    expect(calls.map(c => c.mode).sort()).toEqual(['full', 'photos']);
    expect(calls.every(c => c.auth === 'Bearer pw')).toBe(true);
    // The images copy must land in photos_pdf_url and the full script in pdf_url —
    // and annotated_pdf_url (Adrian's amended copy) is never written.
    expect(linked.sort()).toEqual([['pdf_url', 'https://blob/full.pdf'], ['photos_pdf_url', 'https://blob/photos.pdf']]);
    expect(linked.find(l => l[0] === 'annotated_pdf_url')).toBeUndefined();
  });

  it('is rebuilt:false with the reason when a half fails, and the other half still links', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      return b.mode === 'full' ? fail('Nothing to render') : ok('https://blob/photos.pdf');
    }) as unknown as typeof fetch;
    const linked: string[] = [];
    const out = await buildBothPdfs(body, {
      origin: 'https://x', headers: {}, fetchImpl, link: async (mode) => { linked.push(mode); },
    });
    expect(out.rebuilt).toBe(false);
    expect(out.photos).toBe('https://blob/photos.pdf');
    expect(out.full).toBeNull();
    expect(out.errors).toEqual(['full: Nothing to render']);
    expect(linked).toEqual(['photos']);
  });

  it('never throws — a network error becomes an outcome', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('fetch failed'); }) as unknown as typeof fetch;
    const out = await buildBothPdfs(body, { origin: 'https://x', headers: {}, fetchImpl, link: async () => {} });
    expect(out.rebuilt).toBe(false);
    expect(out.errors).toEqual(['photos: fetch failed', 'full: fetch failed']);
  });
});
