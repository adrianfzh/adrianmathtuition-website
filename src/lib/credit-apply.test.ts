import { describe, it, expect } from 'vitest';
import { computeCreditApplication, type CreditPayment } from './credit-apply';

// Minimal factory — only the fields computeCreditApplication reads. Defaults are a
// high-confidence, fully-unallocated credit so tests opt into the interesting bits.
function pay(p: Partial<CreditPayment> & { id: string }): CreditPayment {
  return {
    id: p.id,
    amount: p.amount ?? 0,
    allocated: p.allocated ?? 0,
    date: p.date ?? '2026-01-01',
    confidence: p.confidence ?? 'high',
    payerName: p.payerName ?? 'PAYER',
  };
}

describe('computeCreditApplication', () => {
  it('applies nothing when there is no credit', () => {
    const r = computeCreditApplication([], 280);
    expect(r.applied).toBe(0);
    expect(r.allocations).toEqual([]);
  });

  it('applies nothing when the invoice owes nothing', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 300 })], 0);
    expect(r.applied).toBe(0);
    expect(r.allocations).toEqual([]);
  });

  it('fully covers an invoice smaller than the credit and leaves the rest intact', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 300 })], 280);
    expect(r.applied).toBe(280);
    expect(r.allocations).toEqual([{ paymentId: 'p1', amount: 280, payerName: 'PAYER', date: '2026-01-01' }]);
  });

  it('partially covers an invoice larger than the credit', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 100 })], 280);
    expect(r.applied).toBe(100);
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].amount).toBe(100);
  });

  it('spends the OLDEST credit first across multiple payments', () => {
    const r = computeCreditApplication([
      pay({ id: 'new', amount: 200, date: '2026-06-10' }),
      pay({ id: 'old', amount: 200, date: '2026-05-01' }),
    ], 280);
    expect(r.applied).toBe(280);
    // old (200) fully, then 80 from new.
    expect(r.allocations).toEqual([
      { paymentId: 'old', amount: 200, payerName: 'PAYER', date: '2026-05-01' },
      { paymentId: 'new', amount: 80, payerName: 'PAYER', date: '2026-06-10' },
    ]);
  });

  it('respects already-allocated amount (Amount − Allocated)', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 300, allocated: 250 })], 280);
    expect(r.applied).toBe(50);                     // only 50 pending
    expect(r.allocations[0].amount).toBe(50);
  });

  it('NEVER auto-applies a fuzzy (non-high) credit — returns it in skipped', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 300, confidence: 'medium' })], 280);
    expect(r.applied).toBe(0);
    expect(r.allocations).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ paymentId: 'p1', pending: 300 });
  });

  it('applies a high credit but skips a fuzzy one in the same student', () => {
    const r = computeCreditApplication([
      pay({ id: 'good', amount: 100, confidence: 'high', date: '2026-05-01' }),
      pay({ id: 'fuzzy', amount: 500, confidence: '', date: '2026-04-01' }),
    ], 280);
    expect(r.applied).toBe(100);                    // only the high one, despite fuzzy being older & bigger
    expect(r.allocations.map(a => a.paymentId)).toEqual(['good']);
    expect(r.skipped.map(s => s.paymentId)).toEqual(['fuzzy']);
  });

  it('ignores fully-allocated payments', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 300, allocated: 300 })], 280);
    expect(r.applied).toBe(0);
    expect(r.skipped).toEqual([]);                  // nothing pending → not "skipped", just empty
  });

  it('handles cents without float drift', () => {
    const r = computeCreditApplication([pay({ id: 'p1', amount: 100.1 }), pay({ id: 'p2', amount: 100.1, date: '2026-02-01' })], 150.15);
    expect(r.applied).toBe(150.15);
    expect(r.allocations[0].amount).toBe(100.1);
    expect(r.allocations[1].amount).toBe(50.05);
  });

  it('null/missing numeric fields do not throw', () => {
    const r = computeCreditApplication([{ id: 'p1', amount: null as any, allocated: null as any, date: '2026-01-01', confidence: 'high', payerName: '' }], 100);
    expect(r.applied).toBe(0);
  });
});
