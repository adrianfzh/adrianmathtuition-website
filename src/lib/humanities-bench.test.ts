import { describe, it, expect } from 'vitest';
import { seededVerdict, consistencyVerdict, padAnswer, stripEvidence, addSupported, variantHolds, truthFreeVerdict } from './humanities-bench';

describe('seededVerdict', () => {
  it('passes at 90 % with none two levels off', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ truth: 3, level: i === 0 ? 2 : 3 }));
    const v = seededVerdict(rows);
    expect(v.right).toBe(9); expect(v.pass).toBe(true);
  });
  it('one answer two levels off fails the set', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ truth: 3, level: i === 0 ? 1 : 3 }));
    expect(seededVerdict(rows).pass).toBe(false);
  });
  it('an unread answer fails the set', () => {
    expect(seededVerdict([{ truth: 2, level: 2 }, { truth: 2, level: null }]).pass).toBe(false);
  });
});

describe('consistencyVerdict', () => {
  it('counts the same level twice', () => {
    const v = consistencyVerdict([{ first: 2, second: 2 }, { first: 3, second: 2 }]);
    expect(v.same).toBe(1); expect(v.pass).toBe(false);
  });
});

describe('the truth-free variants', () => {
  it('padding keeps the answer inside', () => {
    expect(padAnswer(' A is biased. ')).toContain(' A is biased. ');
  });
  it('stripEvidence drops the quoting sentences, not an apostrophe', () => {
    expect(stripEvidence("The council doesn't act. It says 'we are trying'. So it is slow.")).toBe("The council doesn't act. So it is slow.");
    expect(stripEvidence('No quotes here. None at all.')).toBeNull();
    expect(stripEvidence("It says 'we are trying'.")).toBeNull();
  });
  it('addSupported joins the two', () => {
    expect(addSupported('Weak.', 'Top.')).toBe('Weak. Top.');
  });
  it('each kind has its own promise', () => {
    expect(variantHolds({ kind: 'padding', base: 3, variant: 3 })).toBe(true);
    expect(variantHolds({ kind: 'padding', base: 3, variant: 4 })).toBe(false);
    expect(variantHolds({ kind: 'evidence_removed', base: 3, variant: 2 })).toBe(true);
    expect(variantHolds({ kind: 'evidence_removed', base: 3, variant: 4 })).toBe(false);
    expect(variantHolds({ kind: 'supported_added', base: 1, variant: 4 })).toBe(true);
    expect(variantHolds({ kind: 'supported_added', base: 2, variant: 1 })).toBe(false);
    expect(variantHolds({ kind: 'padding', base: null, variant: 3 })).toBeNull();
  });
  it('one broken promise fails the check', () => {
    const v = truthFreeVerdict([{ kind: 'padding', base: 2, variant: 2 }, { kind: 'padding', base: 2, variant: 3 }]);
    expect(v.pass).toBe(false); expect(v.byKind.padding).toEqual({ n: 2, held: 1 });
  });
});
