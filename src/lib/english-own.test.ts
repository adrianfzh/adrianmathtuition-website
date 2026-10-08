import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isEditing, ownEditingSet, ownPassage, ownProblems, ownSeeds, ownUnits, ownUuid, wholeWordCount, type OwnEditing, type OwnReading, type OwnSet } from './english-own';
import { OWN_EDITING, OWN_READING, OWN_SETS, ownByUuid } from './english-own-data';
import { checkEditing, parseUnitKey, publicUnit, ruleShort } from './english-practice';

const DIR = path.resolve(__dirname, '../../data/english/sets');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
const fromFiles: OwnSet[] = files.map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

describe('our own English sets', () => {
  it('the built file is the folder, set for set (run scripts/english-own/build.ts after an edit)', () => {
    expect(OWN_SETS).toEqual(fromFiles);
  });
  it('every set is fit: shape, marks, seeds', () => {
    for (const s of OWN_SETS) expect({ id: s.id, problems: ownProblems(s) }).toEqual({ id: s.id, problems: [] });
  });
  it('ids are unique and each maps to one stable uuid the route accepts', () => {
    expect(new Set(OWN_SETS.map(s => s.id)).size).toBe(OWN_SETS.length);
    expect(ownUuid('ed01')).toBe(ownUuid('ed01'));
    for (const s of OWN_SETS) {
      expect(ownByUuid(ownUuid(s.id))?.id).toBe(s.id);
      if (!isEditing(s)) for (const u of ownUnits(s)) expect(parseUnitKey(u.key)).toEqual({ itemId: ownUuid(s.id), label: u.number });
    }
  });
  it('no seeded answer and no scheme is in what the page is given', () => {
    for (const s of OWN_READING) for (const u of ownUnits(s)) {
      const pub = JSON.stringify(publicUnit(u));
      expect(pub).not.toContain('"scheme"');
      expect(pub).not.toContain('"seeds"');
    }
  });
});

describe('an editing passage', () => {
  it('the right words score 10, the wrong words as printed score the two ticks only', () => {
    for (const s of OWN_EDITING) {
      const set = ownEditingSet(s);
      const mid = s.lines.slice(1, 11);
      const right = Object.fromEntries(mid.map((l, i) => [String(i + 1), l.wrong ? l.right : '✓']));
      expect(checkEditing(set, right)).toMatchObject({ right: 10, total: 10 });
      const wrong = Object.fromEntries(mid.map((l, i) => [String(i + 1), l.wrong ?? 'the']));
      expect(checkEditing(set, wrong).right).toBe(0);
      const ticks = Object.fromEntries(mid.map((_, i) => [String(i + 1), '✓']));
      expect(checkEditing(set, ticks).right).toBe(2);
    }
  });
  it('a second accepted word is taken', () => {
    const s = OWN_EDITING.find(x => x.lines.some(l => l.accept?.length)) as OwnEditing;
    const i = s.lines.findIndex(l => l.accept?.length);
    expect(checkEditing(ownEditingSet(s), { [String(i)]: s.lines[i].accept![0] }).results[i - 1].ok).toBe(true);
  });
  it('the checks catch a wrong word that is not in its line, and a ninth error', () => {
    const s: OwnEditing = JSON.parse(JSON.stringify(OWN_EDITING[0]));
    s.lines[1].wrong = 'zebra';
    expect(ownProblems(s).join(' ')).toMatch(/must stand exactly once/);
    const t: OwnEditing = JSON.parse(JSON.stringify(OWN_EDITING[0]));
    const free = t.lines.findIndex((l, i) => i >= 1 && i <= 10 && !l.wrong);
    t.lines[free] = { ...t.lines[free], wrong: t.lines[free].text.split(' ')[0], right: 'x', note: 'made up for the test' };
    expect(ownProblems(t).join(' ')).toMatch(/exactly 8/);
  });
  it('counts a word only where it stands by itself', () => {
    expect(wholeWordCount('an apple and an ant', 'an')).toBe(2);
    expect(wholeWordCount('they add and added', 'add')).toBe(1);
  });
});

describe('a reading set', () => {
  it('the checks catch marks that do not add up, a missing zero seed and an own-words question with no lifted seed', () => {
    const s: OwnReading = JSON.parse(JSON.stringify(OWN_READING.find(x => x.kind === 'narrative')));
    s.questions[0].marks = 3;
    expect(ownProblems(s).join(' ')).toMatch(/a narrative set carries 20/);
    const t: OwnReading = JSON.parse(JSON.stringify(OWN_READING.find(x => x.kind === 'narrative')));
    t.questions[0].seeds = t.questions[0].seeds.filter(x => x.mark > 0);
    expect(ownProblems(t).join(' ')).toMatch(/one seed at 0/);
    const u: OwnReading = JSON.parse(JSON.stringify(OWN_READING.find(x => x.kind === 'narrative')));
    const q = u.questions.find(x => /own words/i.test(x.text))!;
    q.seeds = q.seeds.filter(x => x.flaw !== 'lifted');
    expect(ownProblems(u).join(' ')).toMatch(/lifted answer seeded at 0/);
  });
  it('a choice is marked by rule on its own options; a "which word" answer too', () => {
    for (const s of OWN_READING) for (const u of ownUnits(s)) {
      if (u.kind === 'choice') {
        const right = u.options!.find(o => o.text === u.scheme.answer)!;
        expect(ruleShort(u, right.label)).toBe(true);
        expect(ruleShort(u, u.options!.find(o => o !== right)!.label)).toBe(false);
      }
      if (u.sectionKind === 'vocabulary') expect(ruleShort(u, u.scheme.answer!)).toBe(true);
    }
  });
  it('the checker reads numbered paragraphs, or the visual text in words', () => {
    expect(ownPassage(OWN_READING.find(x => x.kind === 'narrative')!)).toMatch(/^\[Paragraph 1\] /);
    expect(ownPassage(OWN_READING.find(x => x.kind === 'visual')!)).toMatch(/\[Picture: /);
  });
  it('every seed sits beside its unit', () => {
    for (const s of OWN_READING) for (const x of ownSeeds(s)) expect(x.unit?.itemId).toBe(ownUuid(s.id));
  });
});

describe('editing by difficulty (8 Oct 2026)', () => {
  it('every error of every editing passage is tagged with its kind', async () => {
    const { OWN_EDITING } = await import('./english-own-data');
    const { EDIT_KIND_WEIGHT } = await import('./english-own');
    for (const s of OWN_EDITING) for (const l of s.lines) if (l.wrong) expect(l.kind && l.kind in EDIT_KIND_WEIGHT, `${s.id}: ${l.wrong}`).toBe(true);
  });
  it('the level comes from the tags: 6 easier, 15 standard, 6 harder — and the levels are far apart', async () => {
    const { OWN_EDITING } = await import('./english-own-data');
    const { editingLevel, editingScore } = await import('./english-own');
    const count = (n: number) => OWN_EDITING.filter(s => editingLevel(s) === n).length;
    expect([count(1), count(2), count(3)]).toEqual([6, 15, 6]);
    const scores = (n: number) => OWN_EDITING.filter(s => editingLevel(s) === n).map(editingScore);
    expect(Math.max(...scores(1))).toBeLessThanOrEqual(10);
    expect(Math.min(...scores(2))).toBeGreaterThanOrEqual(13);
    expect(Math.min(...scores(3))).toBeGreaterThanOrEqual(22);
    for (const s of OWN_EDITING) { expect(editingScore(s)).toBeGreaterThanOrEqual(8); expect(editingScore(s)).toBeLessThanOrEqual(24); }
  });
  it('the next passage is one not done yet, in order', async () => {
    const { nextEditing } = await import('./english-own');
    expect(nextEditing(['a', 'b', 'c'], {})).toBe('a');
    expect(nextEditing(['a', 'b', 'c'], { a: '2026-10-08T01:00:00Z' })).toBe('b');
    expect(nextEditing(['a', 'b', 'c'], { a: '2026-10-08T01:00:00Z' }, 'b')).toBe('c');
  });
  it('a passage comes back only when the others are used up — the one done longest ago first', async () => {
    const { nextEditing } = await import('./english-own');
    const done = { a: '2026-10-08T03:00:00Z', b: '2026-10-08T01:00:00Z', c: '2026-10-08T02:00:00Z' };
    expect(nextEditing(['a', 'b', 'c'], done)).toBe('b');
    expect(nextEditing(['a', 'b', 'c'], done, 'b')).toBe('c');     // never the one just finished
    expect(nextEditing(['a'], { a: '2026-10-08T03:00:00Z' }, 'a')).toBe('a');
    expect(nextEditing([], {})).toBeNull();
  });
});
