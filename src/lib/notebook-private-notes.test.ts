import { describe, expect, it } from 'vitest';
import { MAX_PRIVATE_NOTE, parsePrivateNoteBody, parsePrivateNoteUpdate, privateNoteTitle } from './notebook-private-notes';

describe('parsePrivateNoteBody', () => {
  it('normalises line endings, strips trailing spaces and trims', () => {
    const r = parsePrivateNoteBody('  Remember:\r\n  R-formula first   \r\n\n\n');
    expect(r).toEqual({ ok: true, value: 'Remember:\n  R-formula first' });
  });
  it('refuses an empty note and a non-string', () => {
    expect(parsePrivateNoteBody('   \n ')).toMatchObject({ ok: false });
    expect(parsePrivateNoteBody(42)).toMatchObject({ ok: false });
  });
  it('caps the length', () => {
    const r = parsePrivateNoteBody('x'.repeat(MAX_PRIVATE_NOTE + 50));
    expect(r.ok && r.value.length).toBe(MAX_PRIVATE_NOTE);
  });
});

describe('parsePrivateNoteUpdate', () => {
  it('wants a uuid id and a real body', () => {
    expect(parsePrivateNoteUpdate({ id: 'nope', body: 'hi' })).toMatchObject({ ok: false });
    expect(parsePrivateNoteUpdate({ id: '6f0d3d2e-0b2a-4c3e-9d1f-1a2b3c4d5e6f', body: ' ' })).toMatchObject({ ok: false });
    expect(parsePrivateNoteUpdate({ id: '6f0d3d2e-0b2a-4c3e-9d1f-1a2b3c4d5e6f', body: 'hi' })).toEqual({ ok: true, value: { id: '6f0d3d2e-0b2a-4c3e-9d1f-1a2b3c4d5e6f', body: 'hi' } });
  });
});

describe('privateNoteTitle', () => {
  it('is the first non-empty line', () => {
    expect(privateNoteTitle('\n\n  Sine rule when two angles given \nmore')).toBe('Sine rule when two angles given');
  });
  it('cuts a long first line at a word with an ellipsis', () => {
    const t = privateNoteTitle('The thing to remember about differentiating a product of two functions is the product rule not the chain rule');
    expect(t.endsWith('…')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(65);
    expect(t).not.toMatch(/\s…$/);
  });
  it('falls back to "Note" for an empty body', () => {
    expect(privateNoteTitle('')).toBe('Note');
  });
});
