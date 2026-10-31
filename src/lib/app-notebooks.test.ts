import { describe, expect, it } from 'vitest';
import { writtenPages, filesToRemove, filesToSend, isNotebookPath, missingFiles, notebookFileKey, parseCommit, parseFolders, parseManifest, type Manifest } from './app-notebooks';
import { ownerOf } from './student-files-url';
import { ERASE_BY_IDENTITY, ERASE_FILE_PREFIXES } from './erasure';

const NB = '6F1A3C2E-9B7D-4E21-8A55-0C3D2B1E4F60';
const PG = 'A1B2C3D4-E5F6-4789-8ABC-DEF012345678';
const h = (c: string) => c.repeat(64);

describe('notebook backup', () => {
  it('accepts only the three kinds of notebook file', () => {
    expect(isNotebookPath('notebook.json')).toBe(true);
    expect(isNotebookPath(`pages/${PG}.drawing`)).toBe(true);
    expect(isNotebookPath(`documents/${PG}.pdf`)).toBe(true);
    expect(isNotebookPath('../notebook.json')).toBe(false);
    expect(isNotebookPath(`pages/${PG}.exe`)).toBe(false);
    expect(isNotebookPath('pages/x.drawing')).toBe(false);
  });

  it('keys sit under the student, readable only by them', () => {
    const key = notebookFileKey('acct:abc', NB, `pages/${PG}.drawing`);
    expect(key).toBe(`notebooks/acct:abc/${NB}/pages/${PG}.drawing`);
    expect(ownerOf(key)).toEqual({ kind: 'student', identity: 'acct:abc' });
  });

  it('parses a manifest and refuses bad ones', () => {
    const ok = parseManifest({ files: [{ path: 'notebook.json', size: 10, sha256: h('a') }, { path: `pages/${PG}.drawing`, size: 5, sha256: h('b') }] });
    expect(ok.ok).toBe(true);
    expect(parseManifest({ files: [{ path: `pages/${PG}.drawing`, size: 5, sha256: h('b') }] }).ok).toBe(false); // no notebook.json
    expect(parseManifest({ files: [{ path: 'notebook.json', size: 10, sha256: 'xyz' }] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: 'notebook.json', size: 1, sha256: h('a') }, { path: 'notebook.json', size: 1, sha256: h('a') }] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: 'notebook.json', size: 999 * 1024 * 1024, sha256: h('a') }] }).ok).toBe(false);
  });

  it('sends only what changed, removes what is gone', () => {
    const stored: Manifest = { 'notebook.json': { size: 10, sha256: h('a') }, [`pages/${PG}.drawing`]: { size: 5, sha256: h('b') } };
    const incoming: Manifest = { 'notebook.json': { size: 11, sha256: h('c') } };
    expect(filesToSend(stored, incoming)).toEqual(['notebook.json']);
    expect(filesToRemove(stored, incoming)).toEqual([`pages/${PG}.drawing`]);
    expect(filesToSend(null, stored)).toEqual(['notebook.json', `pages/${PG}.drawing`]);
    expect(filesToSend(stored, stored)).toEqual([]);
  });

  it('commit refuses until every file arrived at its size', () => {
    const m: Manifest = { 'notebook.json': { size: 10, sha256: h('a') }, [`pages/${PG}.drawing`]: { size: 5, sha256: h('b') } };
    expect(missingFiles(m, new Map([['notebook.json', 10]]))).toEqual([`pages/${PG}.drawing`]);
    expect(missingFiles(m, new Map([['notebook.json', 9], [`pages/${PG}.drawing`, 5]]))).toEqual(['notebook.json']);
    expect(missingFiles(m, new Map([['notebook.json', 10], [`pages/${PG}.drawing`, 5]]))).toEqual([]);
  });

  it('reads the change time as the app stores it (seconds)', () => {
    const r = parseCommit({ title: ' Algebra ', updatedAt: Date.UTC(2026, 9, 31) / 1000 });
    expect(r).toEqual({ ok: true, title: 'Algebra', updatedAt: '2026-10-31T00:00:00.000Z' });
    expect(parseCommit({ title: 'x', updatedAt: Date.UTC(2026, 9, 31) }).ok).toBe(false); // milliseconds by mistake
  });

  it('parses subjects', () => {
    expect(parseFolders({ folders: [{ id: NB.toLowerCase(), name: ' A Math ', createdAt: 1 }] }))
      .toEqual({ ok: true, folders: [{ id: NB, name: 'A Math', createdAt: 1 }] });
    expect(parseFolders({ folders: [{ id: 'nope', name: 'x', createdAt: 1 }] }).ok).toBe(false);
  });

  it('Delete my account erases the backup', () => {
    expect(ERASE_FILE_PREFIXES).toContain('notebooks');
    expect(ERASE_BY_IDENTITY.map(t => t.table)).toEqual(expect.arrayContaining(['app_notebooks', 'app_notebook_folders']));
  });

  it('lists written pages in notebook order, keeping the notebook page numbers', () => {
    const P2 = 'B1B2C3D4-E5F6-4789-8ABC-DEF012345678';
    const json = { pages: [{ id: PG.toLowerCase() }, { id: NB }, { id: P2, check: { verdict: 'partial', summary: '2 of 3 right' } }] };
    const m: Manifest = { [`previews/${PG}.jpg`]: { size: 1, sha256: h('a') }, [`previews/${P2}.jpg`]: { size: 1, sha256: h('b') } };
    expect(writtenPages(json, m)).toEqual([
      { n: 1, pageId: PG, picture: `previews/${PG}.jpg`, verdict: null, summary: null },
      { n: 3, pageId: P2, picture: `previews/${P2}.jpg`, verdict: 'partial', summary: '2 of 3 right' },
    ]);
    expect(isNotebookPath(`previews/${PG}.jpg`)).toBe(true);
    expect(writtenPages(null, m)).toEqual([]);
  });
});
