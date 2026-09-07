import { describe, it, expect } from 'vitest';
import {
  autoTagLine, coverAlreadyTried, decideByCover, decideByName, eligibleForAutoTag, firstPageUrls, nameCandidates, typedName,
  type AutoTagRun,
} from './auto-tag';
import type { RosterStudent } from './scan-inbox';

const roster: RosterStudent[] = [
  { id: 'recDenise', name: 'Denise Tan' },
  { id: 'recLucasNgo', name: 'Lucas Ngo Yu Zhe' },
  { id: 'recLucasTan', name: 'Lucas Tan Wei Jie' },
  { id: 'recLucasLim', name: 'Lucas Lim' },
  { id: 'recGavinWoon', name: 'Gavin Woon' },
  { id: 'recGavinNg', name: 'Gavin Ng' },
  { id: 'recEva', name: 'Eva Isabelle Wong' },
  { id: 'recIsabelle', name: 'Isabelle Toh' },
  { id: 'recKass', name: 'Kassandra Lim' },
];

const NOW = new Date('2026-09-07T14:00:00Z');
const run = (over: Partial<AutoTagRun> = {}): AutoTagRun => ({
  id: 'r1', paper_name: 'denise am tys 2021 p2', student_id: null, released_at: null, archived_at: null,
  created_at: '2026-09-07T13:00:00Z', ...over,
});

describe('typedName — the name phrase in front of the subject code', () => {
  it('reads one- and two-word names', () => {
    expect(typedName('denise am tys 2021 p2')).toBe('denise');
    expect(typedName('gavin woon am tys 2024 p1')).toBe('gavin woon');
    expect(typedName('megan jc2 practice set 1 p1')).toBe('megan');
    expect(typedName('Tze Hin EM TYS 2022 P2')).toBe('tze hin');
  });
  it('nothing to go on', () => {
    expect(typedName('Practice Again — AM TYS 2022 P1')).toBeNull();
    expect(typedName('worksheet (3 photos)')).toBeNull();
    expect(typedName('')).toBeNull();
    expect(typedName(null)).toBeNull();
  });
});

describe('decideByName — step 1, the title', () => {
  it('a first name unique on the roster tags outright', () => {
    const d = decideByName('denise am tys 2021 p2', roster);
    expect(d).toMatchObject({ kind: 'tag', by: 'name', student: { id: 'recDenise' } });
  });
  it('two words settle a shared first name', () => {
    expect(decideByName('gavin woon am tys 2024 p1', roster)).toMatchObject({ kind: 'tag', student: { id: 'recGavinWoon' } });
    expect(decideByName('lucas ngo am wa3 2026 p1', roster)).toMatchObject({ kind: 'tag', student: { id: 'recLucasNgo' } });
  });
  it('a shared first name alone → the cover decides among those students only', () => {
    const d = decideByName('lucas am tys 2021 p1', roster);
    expect(d.kind).toBe('cover');
    if (d.kind !== 'cover') return;
    expect(d.reason).toBe('ambiguous');
    expect(d.candidates.map(c => c.id).sort()).toEqual(['recLucasLim', 'recLucasNgo', 'recLucasTan']);
  });
  it('"isabelle" is not Isabelle Toh while Eva Isabelle Wong is also on the roster', () => {
    const d = decideByName('isabelle em tys 2023 p2', roster);
    expect(d.kind).toBe('cover');
    if (d.kind === 'cover') expect(d.candidates.map(c => c.id).sort()).toEqual(['recEva', 'recIsabelle']);
  });
  it('a name nobody has (a nickname, a typo) → the cover decides from the whole roster', () => {
    const d = decideByName('kass am prelim 2025 p1', roster);
    expect(d).toMatchObject({ kind: 'cover', reason: 'unknown' });
    if (d.kind === 'cover') expect(d.candidates).toHaveLength(roster.length);
  });
  it('no name in the title → skip, no cover read', () => {
    expect(decideByName('Practice Again — AM TYS 2022 P1', roster)).toEqual({ kind: 'skip', reason: 'no-name' });
  });
});

describe('decideByCover — step 2, the first page', () => {
  const lucases = roster.filter(r => r.name.startsWith('Lucas'));
  it('the full name on the cover picks one of the candidates', () => {
    const d = decideByCover({ is_exam_script: true, student_name: 'Lucas Ngo Yu Zhe', given_name: 'Lucas' }, lucases);
    expect(d).toMatchObject({ kind: 'tag', by: 'cover', student: { id: 'recLucasNgo' }, readName: 'Lucas Ngo Yu Zhe' });
  });
  it('a surname alone is enough inside the candidate set', () => {
    const d = decideByCover({ is_exam_script: true, student_name: 'Ngo Yu Zhe' }, lucases);
    expect(d).toMatchObject({ kind: 'tag', student: { id: 'recLucasNgo' } });
  });
  it('the cover can never contradict the title: a name outside the candidates tags nobody', () => {
    const d = decideByCover({ is_exam_script: true, student_name: 'Gavin Woon' }, lucases);
    expect(d).toMatchObject({ kind: 'skip', reason: 'cover-no-match', readName: 'Gavin Woon' });
  });
  it('a bare "Lucas" on the cover is still three Lucases', () => {
    const d = decideByCover({ is_exam_script: true, student_name: 'Lucas', given_name: 'Lucas' }, lucases);
    expect(d).toMatchObject({ kind: 'skip', reason: 'cover-ambiguous' });
  });
  it('no name read → unreadable', () => {
    expect(decideByCover({ is_exam_script: true, student_name: null, given_name: null }, lucases)).toMatchObject({ kind: 'skip', reason: 'cover-unreadable' });
    expect(decideByCover(null, lucases)).toMatchObject({ kind: 'skip', reason: 'cover-unreadable' });
  });
  it('a nickname in the title, the real name on the cover → tagged from the whole roster', () => {
    const d = decideByCover({ is_exam_script: true, student_name: 'Kassandra Lim' }, roster);
    expect(d).toMatchObject({ kind: 'tag', student: { id: 'recKass' } });
  });
});

describe('eligibleForAutoTag — which runs the sweep may touch', () => {
  it('an untagged, unreleased, recent web upload', () => {
    expect(eligibleForAutoTag(run(), NOW)).toBe(true);
  });
  it('never a tagged, released, archived or old run', () => {
    expect(eligibleForAutoTag(run({ student_id: 'recX' }), NOW)).toBe(false);
    expect(eligibleForAutoTag(run({ released_at: '2026-09-07T13:30:00Z' }), NOW)).toBe(false);
    expect(eligibleForAutoTag(run({ archived_at: '2026-09-07T13:30:00Z' }), NOW)).toBe(false);
    expect(eligibleForAutoTag(run({ created_at: '2026-08-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('hand-ins arrive tagged and are never ours', () => {
    expect(eligibleForAutoTag(run({ portal_submission: true }), NOW)).toBe(false);
    expect(eligibleForAutoTag(run({ telegram_handin: { chat_id: 1 } }), NOW)).toBe(false);
  });
});

describe('nameCandidates / firstPageUrls / coverAlreadyTried', () => {
  it('all tokens inside a roster name, else the first token', () => {
    expect(nameCandidates('gavin woon', roster).map(r => r.id)).toEqual(['recGavinWoon']);
    expect(nameCandidates('gavin', roster).map(r => r.id).sort()).toEqual(['recGavinNg', 'recGavinWoon']);
    expect(nameCandidates('gavin lim', roster).map(r => r.id).sort()).toEqual(['recGavinNg', 'recGavinWoon']);
    expect(nameCandidates('', roster)).toEqual([]);
  });
  it('the first two photos in order, whatever order they were stored', () => {
    const r = run({ source: { photos: [{ photo_index: 2, original_url: 'c' }, { photo_index: 0, original_url: 'a' }, { photo_index: 1, original_url: 'b' }] } });
    expect(firstPageUrls(r)).toEqual(['a', 'b']);
    expect(firstPageUrls(run({ source: null }))).toEqual([]);
  });
  it('one cover read per run, ever', () => {
    expect(coverAlreadyTried(run())).toBe(false);
    expect(coverAlreadyTried(run({ auto_tag: { at: 'x', cover_tried: true } }))).toBe(true);
  });
});

describe('autoTagLine', () => {
  it('tagged from the name / from the cover', () => {
    expect(autoTagLine({ paperName: 'denise am tys 2021 p2', student: roster[0], by: 'name' }))
      .toBe('🏷 Tagged denise am tys 2021 p2 → Denise Tan (from the name)');
    expect(autoTagLine({ paperName: 'lucas am tys 2021 p1', student: roster[1], by: 'cover', readName: 'Lucas Ngo Yu Zhe' }))
      .toBe('🏷 Tagged lucas am tys 2021 p1 → Lucas Ngo Yu Zhe (cover reads "Lucas Ngo Yu Zhe")');
  });
  it('left for the desk, saying why', () => {
    expect(autoTagLine({ paperName: 'lucas am tys 2021 p1', student: null, reason: 'cover-ambiguous', readName: 'Lucas', candidates: 3 }))
      .toBe('🏷 Couldn\'t tag lucas am tys 2021 p1 — cover reads "Lucas" — still 3 possible · tag the student on the desk');
    expect(autoTagLine({ paperName: 'x am tys 2021 p1', student: null, reason: 'cover-unreadable' }))
      .toBe('🏷 Couldn\'t tag x am tys 2021 p1 — no name on the first page · tag the student on the desk');
  });
});
