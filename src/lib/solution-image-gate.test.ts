import { describe, it, expect } from 'vitest';
import { gateFromFlagRows, openGate, closedGate, SOLUTION_IMAGES_REQUIRE_CLEAN } from './solution-image-gate';
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
