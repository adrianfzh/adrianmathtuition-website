import { describe, expect, it } from 'vitest';
import { findMaterial, recipientsFor, sendCallback, studentNote, worksheetLevel, type StoredMaterial } from './stuck-send';

const m: StoredMaterial = {
  slug: 'trigonometry-sec4-am', groupKey: 'Sec 4|AM', groupLabel: 'Sec 4 A Math', level: 'Sec 4', subject: 'AM',
  area: 'Trigonometry', topics: ['Trigonometry (Identities)'], stuckStudents: ['recA', 'recB'], groupStudents: ['recA', 'recB', 'recC'],
  subgroupIds: [], ok: true, pdfUrl: 'https://x/y.pdf', title: 't', count: 10,
};

describe('stuck-send', () => {
  it('levels', () => {
    expect(worksheetLevel('AM', 'Sec 3')).toBe('AM');
    expect(worksheetLevel('EM', 'Sec 2')).toBe('S2');
    expect(worksheetLevel('EM', 'Sec 4')).toBe('EM');
    expect(worksheetLevel('H2', 'JC1')).toBe('JC2');
  });
  it('finds by slug or index, never a sheet that failed', () => {
    expect(findMaterial([m], 'Trigonometry-sec4-am')?.index).toBe(0);
    expect(findMaterial([m], 0)?.material.slug).toBe('trigonometry-sec4-am');
    expect(findMaterial([{ ...m, ok: false }], 0)).toBeNull();
    expect(findMaterial([m], 'nope')).toBeNull();
  });
  it('never sends the same sheet to a student twice', () => {
    expect(recipientsFor(m, 'stuck')).toEqual({ to: ['recA', 'recB'], already: [] });
    const sent = { ...m, sent: [{ at: 'x', target: 'stuck' as const, studentIds: ['recA', 'recB'], by: 'admin' }] };
    expect(recipientsFor(sent, 'all')).toEqual({ to: ['recC'], already: ['recA', 'recB'] });
    expect(recipientsFor(sent, 'stuck').to).toEqual([]);
  });
  it('fits Telegram\'s 64-byte callback', () => {
    expect(sendCallback('123e4567-e89b-12d3-a456-426614174000', 2, 'all')).toBe('st:a:123e4567-e89b-12d3-a456-426614174000:2');
    expect(sendCallback('123e4567-e89b-12d3-a456-426614174000', 2, 'all').length).toBeLessThanOrEqual(64);
  });
  it('a plain note', () => expect(studentNote(m)).toBe('A short practice sheet on trigonometry. Do it on paper and hand it in when you are done.'));
});
