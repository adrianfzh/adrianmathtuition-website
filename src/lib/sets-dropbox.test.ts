// lib/sets-dropbox.ts (9 Oct 2026) — the School Papers folder follows the bank. Pins:
//   1. the file names are the ones already in the folder (JC files as H2);
//   2. an unchanged paper is not printed again; an edited one is, and only that one;
//   3. H2 gets its solutions file, cut from the pages after the paper;
//   4. a failed print leaves the manifest alone, so the next run tries again;
//   5. the time budget leaves the rest for the next run.
import { describe, it, expect } from 'vitest';
import { groupSetRows, paperKey, setFileBase, setFileTitle, syncMessage, syncSets, type SetSyncRow, type SetsManifest, type SetsSyncDeps } from './sets-dropbox';

const row = (level: string, set: number, paper: string, q: number, text = 'x'): SetSyncRow => ({
  id: `${level}-${set}-${paper}-${q}`, level, year: 2026, exam_type: `Set ${set}`, paper, question_number: String(q), total_marks: 5,
  question_text: text, parts: [], answer: '1', solution: 's', image_url: null, figure_url: null, has_image: false, gen_meta: null,
});
const bank = () => [row('EM', 1, '1', 1), row('AM', 1, '2', 1), row('AM', 1, '1', 1), row('AM', 1, '1', 2), row('JC', 1, '1', 1)];

function rig(rows: SetSyncRow[], manifest: SetsManifest | null = null, over: Partial<SetsSyncDeps> = {}) {
  const saved: string[] = [], prints: string[] = [];
  let stored = manifest;
  const deps: SetsSyncDeps = {
    loadRows: async () => rows,
    readManifest: async () => stored,
    writeManifest: async (m) => { stored = m; },
    print: async (p, o) => { prints.push(`${p.level}${p.set}P${p.paper}${o.solutions ? '+sol' : ''}`); return Buffer.from(o.solutions ? 'PPSS' : 'PP'); },
    pageCount: async (b) => b.length,
    pagesAfter: async (b, n) => b.subarray(n),
    save: async (n) => { saved.push(n); },
    now: () => new Date('2026-10-09T00:00:00Z'),
    ...over,
  };
  return { deps, saved, prints, manifest: () => stored };
}

describe('sets-dropbox', () => {
  it('names files as the folder does', () => {
    expect(setFileBase('AM', 1, '1')).toBe('AdrianMath-AM-Set1-Paper1');
    expect(setFileBase('JC', 1, '2')).toBe('AdrianMath-H2-Set1-Paper2');
    expect(setFileTitle('AM', 1, '1')).toBe('AdrianMath · A Math · Set 1 · Paper 1');
  });

  it('groups rows into papers, AM then EM then the rest', () => {
    expect(groupSetRows(bank()).map((p) => setFileBase(p.level, p.set, p.paper))).toEqual([
      'AdrianMath-AM-Set1-Paper1', 'AdrianMath-AM-Set1-Paper2', 'AdrianMath-EM-Set1-Paper1', 'AdrianMath-H2-Set1-Paper1',
    ]);
  });

  it('first run writes every paper, H2 with its solutions; a second run writes nothing', async () => {
    const r = rig(bank());
    const one = await syncSets(r.deps);
    expect(one.written).toEqual(['AdrianMath-AM-Set1-Paper1.pdf', 'AdrianMath-AM-Set1-Paper2.pdf', 'AdrianMath-EM-Set1-Paper1.pdf', 'AdrianMath-H2-Set1-Paper1.pdf', 'AdrianMath-H2-Set1-Paper1-solutions.pdf']);
    const two = await syncSets(r.deps);
    expect(two.written).toEqual([]);
    expect(two.unchanged).toBe(4);
    expect(syncMessage(two)).toBe('');
  });

  it('an edited question re-prints its paper only', async () => {
    const rows = bank();
    const r = rig(rows);
    await syncSets(r.deps);
    rows[3] = { ...rows[3], question_text: 'changed' };
    const again = await syncSets(r.deps);
    expect(again.written).toEqual(['AdrianMath-AM-Set1-Paper1.pdf']);
  });

  it('a solution edit matters for H2 only', () => {
    const [am] = groupSetRows([row('AM', 1, '1', 1)]), [jc] = groupSetRows([row('JC', 1, '1', 1)]);
    const edit = (p: typeof am) => ({ ...p, rows: p.rows.map((x) => ({ ...x, solution: 'new' })) });
    expect(paperKey(edit(am))).toBe(paperKey(am));
    expect(paperKey(edit(jc))).not.toBe(paperKey(jc));
  });

  it('a failed print is reported and tried again next run', async () => {
    let fail = true;
    const r = rig([row('AM', 1, '1', 1)], null, { print: async () => { if (fail) throw new Error('render failed'); return Buffer.from('PP'); } });
    const one = await syncSets(r.deps);
    expect(one.failed).toEqual([{ name: 'AdrianMath-AM-Set1-Paper1', error: 'render failed' }]);
    expect(r.manifest()).toBeNull();
    expect(syncMessage(one)).toMatch(/Could not print/);
    fail = false;
    expect((await syncSets(r.deps)).written).toEqual(['AdrianMath-AM-Set1-Paper1.pdf']);
  });

  it('stops starting papers once the budget is spent', async () => {
    let t = 0;
    const r = rig(bank(), null, { now: () => new Date(t), budgetMs: 10 });
    r.deps.print = async () => { t += 20; return Buffer.from('PP'); };
    const one = await syncSets(r.deps);
    expect(one.written).toEqual(['AdrianMath-AM-Set1-Paper1.pdf']);
    expect(one.left.length).toBe(3);
  });
});
