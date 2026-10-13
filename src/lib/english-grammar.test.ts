import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EDIT_KIND_WEIGHT, ownUuid, type EditKind } from './english-own';
import { OWN_EDITING } from './english-own-data';
import { GRAMMAR, GRAMMAR_PATHS, checkDrill, drillPool, fixedLine, findDrillLine, kindRecord, nextInPath, pickDrill, publicDrillLine, standingOf } from './english-grammar';
import { lineWords, norm } from './english-practice';

const KINDS = Object.keys(EDIT_KIND_WEIGHT) as EditKind[];
const DIR = path.resolve(__dirname, '../../data/english/grammar');

describe('the 16 lessons', () => {
  it('every kind has a lesson file, and no file is left over', () => {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
    expect(files).toEqual([...KINDS].sort());
    for (const k of KINDS) expect(GRAMMAR[k].kind).toBe(k);
  });
  it('each lesson is short and complete: a name, 1–3 rule lines, a ✗ and a ✓, a way to spot it, more to know', () => {
    for (const k of KINDS) {
      const l = GRAMMAR[k];
      expect(l.name.length, k).toBeGreaterThan(2);
      expect(l.rule.length, k).toBeGreaterThanOrEqual(1);
      expect(l.rule.length, k).toBeLessThanOrEqual(3);
      for (const r of [...l.rule, l.spot, ...l.deeper]) expect(r.length, `${k}: ${r}`).toBeLessThanOrEqual(110);
      expect(l.deeper.length, k).toBeGreaterThanOrEqual(2);
      // the ✗ example holds its wrong word, the ✓ its fix, and the two differ in that one word only
      const w = lineWords(l.wrong.text).map(x => x.word), r = lineWords(l.right.text).map(x => x.word);
      expect(w, k).toContain(l.wrong.word);
      expect(r, k).toContain(l.right.word);
      expect(w.length, k).toBe(r.length);
      expect(w.filter((x, i) => x !== r[i]), k).toEqual([l.wrong.word]);
    }
  });
  it('no lesson uses the grammar words a Sec 3 student may not know', () => {
    const banned = /\b(subject|object|case|noun|adjective|participle|infinitive|gerund|preposition|determiner|clause|auxiliary|modal)\b/i;
    for (const k of KINDS) {
      const l = GRAMMAR[k];
      for (const s of [l.name, l.tag, ...l.rule, l.spot, ...l.deeper]) expect(banned.test(s), `${k}: ${s}`).toBe(false);
    }
  });
  it('a lesson\'s extra lines hold their wrong word', () => {
    for (const k of KINDS) for (const x of GRAMMAR[k].extra) expect(lineWords(x.text).map(w => norm(w.word)), x.text).toContain(norm(x.wrong));
  });
});

describe('the map paths', () => {
  it('every kind is in exactly one path, easier before harder', () => {
    const all = GRAMMAR_PATHS.flatMap(p => p.kinds);
    expect([...all].sort()).toEqual([...KINDS].sort());
    for (const p of GRAMMAR_PATHS) for (let i = 1; i < p.kinds.length; i++)
      expect(EDIT_KIND_WEIGHT[p.kinds[i]], `${p.name}`).toBeGreaterThanOrEqual(EDIT_KIND_WEIGHT[p.kinds[i - 1]]);
  });
  it('next on the path', () => {
    expect(nextInPath('past')).toBe('participle');
    expect(nextInPath('tense')).toBeNull();
  });
});

describe('Try 3', () => {
  it('every kind has at least three lines to try', () => {
    for (const k of KINDS) expect(drillPool(OWN_EDITING, k).length, k).toBeGreaterThanOrEqual(3);
  });
  it('picks three, not the ones just seen, not from the passage being done', () => {
    const pool = drillPool(OWN_EDITING, 'number');
    const first = pickDrill(pool, { rand: () => 0.5 });
    expect(first).toHaveLength(3);
    const again = pickDrill(pool, { skip: first.map(l => l.ref), notSet: 'ed01', rand: () => 0.5 });
    for (const l of again) { expect(first.map(f => f.ref)).not.toContain(l.ref); expect(l.ref.startsWith('ed01.')).toBe(false); }
  });
  it('a thin pool still gives what it has', () => {
    const pool = drillPool(OWN_EDITING, 'article_the');
    expect(pickDrill(pool, { skip: pool.map(l => l.ref) })).toHaveLength(3);
  });
  it('the grey lines around a Try line are shown put right', () => {
    const l = findDrillLine(OWN_EDITING, 'ed01.8')!;              // "add" → "added"; the line before has "help she sort"
    expect(l.before).toContain('help her sort');
    expect(l.after).toContain('meeting place that brings');
    for (const k of KINDS) for (const d of drillPool(OWN_EDITING, k)) {
      const set = OWN_EDITING.find(s => d.ref.startsWith(`${s.id}.`));
      if (!set) continue;
      const i = Number(d.ref.split('.')[1]);
      for (const n of [set.lines[i - 1], set.lines[i + 1]]) if (n?.wrong) expect(fixedLine(n), d.ref).not.toBe(n.text);
    }
  });
  it('the page never sees the answer before it is given', () => {
    const l = drillPool(OWN_EDITING, 'number')[0];
    expect(Object.keys(publicDrillLine(l)).sort()).toEqual(['after', 'before', 'ref', 'text']);
  });
  it('finds a line by its ref and marks it like a passage line: circle, then correct', () => {
    const l = findDrillLine(OWN_EDITING, 'ed01.2')!;
    expect(l.wrong).toBe('book');
    expect(checkDrill(l, { circled: 'book', word: 'books' }).ok).toBe(true);
    expect(checkDrill(l, { circled: 'hundred', word: 'books' }).ok).toBe(false);
    expect(checkDrill(l, '✓').ok).toBe(false);
    expect(checkDrill(l, { circled: 'book', word: 'books' }).kind).toBe('number');
    const x = findDrillLine(OWN_EDITING, 'x.quantity.0')!;
    expect(checkDrill(x, { circled: 'much', word: 'many' }).ok).toBe(true);
    expect(findDrillLine(OWN_EDITING, 'ed01.1')?.kind).toBe('tense');
    expect(findDrillLine(OWN_EDITING, 'ed01.0')).toBeNull();     // a clean line is not a Try line
    expect(findDrillLine(OWN_EDITING, 'zz.3')).toBeNull();
  });
});

describe('the student\'s record per kind', () => {
  it('standing: grey none · red under half · green 80% over 3+ · amber between', () => {
    expect(standingOf(0, 0)).toBe('untried');
    expect(standingOf(1, 3)).toBe('weak');
    expect(standingOf(2, 3)).toBe('shaky');
    expect(standingOf(2, 2)).toBe('shaky');
    expect(standingOf(4, 5)).toBe('strong');
  });
  it('counts each handed-in line under its kind; clean lines and unknown passages are left out', () => {
    const ed01 = OWN_EDITING.find(s => s.id === 'ed01')!;
    const rec = kindRecord(OWN_EDITING, [
      { item_id: ownUuid('ed01'), result: { lines: [{ label: '1', ok: false }, { label: '2', ok: true }, { label: '4', ok: true }] } },
      { item_id: '00000000-0000-0000-0000-000000000000', result: { lines: [{ label: '2', ok: true }] } },
    ]);
    expect(ed01.lines[4].wrong).toBeUndefined();
    expect(rec.tense).toMatchObject({ right: 0, tries: 1, standing: 'weak' });
    expect(rec.number).toMatchObject({ right: 1, tries: 1, standing: 'shaky' });
    expect(rec.connector.standing).toBe('untried');
  });
});
