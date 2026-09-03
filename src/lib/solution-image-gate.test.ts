import { describe, it, expect } from 'vitest';
import { gateFromFlagRows, openGate, closedGate, SOLUTION_IMAGES_REQUIRE_CLEAN, solutionImagesJudgedFor } from './solution-image-gate';
import { solutionMarkdown, type BankQuestion } from './bank-question-markdown';
import { solutionImageAllowed } from './bank-question-markdown';

// The pure half of the solution-image gate: rows → gate, and the two outage
// postures. The DB read (solutionImageGateFor) is a thin wrapper over these
// and is deliberately not exercised here (no network in unit tests).

const BUCKET = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/';

describe('solution-image gate — builders', () => {
  it('the allow-list switch is dormant (deny-list mode) until Adrian flips it', () => {
    expect(SOLUTION_IMAGES_REQUIRE_CLEAN).toBe(false);
  });

  it('deny-list: open kind=solution rows block, matched however either side spelt the path', () => {
    const g = gateFromFlagRows([
      { path: 'question_images/sol_a.png', status: 'open' },
      { path: 'sol_b.png', status: 'fixed' },
    ], false);
    expect(g.requireClean).toBeUndefined();
    expect(solutionImageAllowed(`${BUCKET}sol_a.png`, g)).toBe(false);
    expect(solutionImageAllowed('sol_a.png', g)).toBe(false);
    expect(solutionImageAllowed('/sol_a.png', g)).toBe(false);
    expect(solutionImageAllowed('sol_b.png', g)).toBe(true);           // fixed = released
    expect(solutionImageAllowed('sol_unflagged.png', g)).toBe(true);   // never looked at = renders (deny-list)
  });

  it('allow-list: only fixed rows render; unclassified and open both disappear', () => {
    const g = gateFromFlagRows([
      { path: 'sol_a.png', status: 'open' },
      { path: `${BUCKET}sol_b.png`, status: 'fixed' },
    ], true);
    expect(g.requireClean).toBe(true);
    expect(solutionImageAllowed('sol_a.png', g)).toBe(false);
    expect(solutionImageAllowed('sol_b.png', g)).toBe(true);
    expect(solutionImageAllowed('question_images/sol_b.png', g)).toBe(true);
    expect(solutionImageAllowed('sol_unclassified.png', g)).toBe(false);
  });

  it('ignores malformed rows and unknown statuses', () => {
    const g = gateFromFlagRows([
      { path: '', status: 'open' },
      { path: 123 as unknown as string, status: 'open' },
      null as unknown as { path: string; status: string },
      { path: 'sol_weird.png', status: 'claimed' },
    ], true);
    expect(g.blocked.size).toBe(0);
    expect(g.clean?.size).toBe(0);
  });

  it('no rows: deny-list renders everything, allow-list renders nothing', () => {
    expect(solutionImageAllowed('anything.png', gateFromFlagRows([], false))).toBe(true);
    expect(solutionImageAllowed('anything.png', gateFromFlagRows([], true))).toBe(false);
  });

  it('outage postures: the deny-list stays open, the allow-list closes', () => {
    expect(solutionImageAllowed('anything.png', openGate())).toBe(true);
    expect(solutionImageAllowed('anything.png', closedGate())).toBe(false);
  });
});

describe('held rows', () => {
  it("a 'held' solution row blocks in the render gate exactly like 'open'", () => {
    const g = gateFromFlagRows([{ path: 'solutions/a.png', status: 'held' }, { path: 'solutions/b.png', status: 'fixed' }], false);
    expect(g.blocked.has('solutions/a.png')).toBe(true);
    expect(g.blocked.has('solutions/b.png')).toBe(false);
  });
});

describe('unjudged levels — served on the allow-list whatever the switch says (3 Sep 2026; JC judged the same evening)', () => {
  const q = (id: string, img: string) => ({ id, solution_images: [img] } as unknown as BankQuestion);

  it('exactly the judged levels count — Sec and, since the JC pass, JC1/JC2/JC2_H1; science and unknown levels do not', () => {
    for (const l of ['AM', 'EM', 'S1', 'S2', 'EM_NA', 'AM_NA', 'S3_EM', 'S3_AM', 'S3_EM_NT', 'JC1', 'JC2', 'JC2_H1', 'am']) expect(solutionImagesJudgedFor(l)).toBe(true);
    for (const l of ['H2', 'H1', 'PHY', 'CHEM', '', null, undefined]) expect(solutionImagesJudgedFor(l)).toBe(false);
  });

  it('an unjudged question renders only fixed paths; a judged one keeps deny-list behaviour', () => {
    const g = gateFromFlagRows([
      { path: 'sol_fixed.png', status: 'fixed' },
      { path: 'sol_held.png', status: 'held' },
    ], false, ['jc-q']);
    expect(g.unjudged?.has('jc-q')).toBe(true);
    expect(solutionMarkdown(q('jc-q', 'sol_never_looked_at.png'), g)).not.toContain('<img');   // unexamined → hidden
    expect(solutionMarkdown(q('jc-q', 'sol_fixed.png'), g)).toContain('sol_fixed.png');           // passed → renders
    expect(solutionMarkdown(q('jc-q', 'sol_held.png'), g)).not.toContain('<img');
    expect(solutionMarkdown(q('sec-q', 'sol_never_looked_at.png'), g)).toContain('sol_never_looked_at.png'); // judged level, deny-list
    expect(solutionMarkdown(q('sec-q', 'sol_held.png'), g)).not.toContain('<img');
  });

  it('no unjudged ids → the gate is exactly what it was before', () => {
    const g = gateFromFlagRows([{ path: 'a.png', status: 'held' }], false);
    expect(g.unjudged).toBeUndefined();
    expect(g.requireClean).toBeUndefined();
  });
});

describe('solutionImageAllowed with a question id — consumers that filter images themselves', () => {
  it('withholds an unexamined image of an unjudged question, lets a fixed one through, ignores judged questions', () => {
    const g = gateFromFlagRows([{ path: 'sol_fixed.png', status: 'fixed' }], false, ['jc-q']);
    expect(solutionImageAllowed('sol_never.png', g, 'jc-q')).toBe(false);
    expect(solutionImageAllowed('sol_fixed.png', g, 'jc-q')).toBe(true);
    expect(solutionImageAllowed('sol_never.png', g, 'sec-q')).toBe(true);
    expect(solutionImageAllowed('sol_never.png', g)).toBe(true);   // no id = the caller could not say; deny-list only
  });
});
