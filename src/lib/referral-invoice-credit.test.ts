import { describe, it, expect } from 'vitest';
import {
  REFERRAL_INVOICE_CREDIT_SGD,
  referralCreditNote,
  deferredTargetMonthLabel,
  carrierMonthLabels,
  pickCarrierInvoice,
  buildDeferredAdjustmentFields,
  creditReceiptMessage,
  creditManualFallbackMessage,
  applyReferralInvoiceCredit,
  type CarrierCandidate,
} from './referral-invoice-credit';

// 2 Sep 2026, 10:00 SGT (02:00 UTC) — well before the 14th generation run.
const NOW = new Date('2026-09-02T02:00:00.000Z');

describe('the credit itself (sign + amount)', () => {
  it('is minus ten dollars — negative = credit, per the Deferred Amount sign convention', () => {
    expect(REFERRAL_INVOICE_CREDIT_SGD).toBe(-10);
  });
  it('lands in the 4-field record shape docs/INVOICES.md prescribes', () => {
    expect(buildDeferredAdjustmentFields('Referral reward — Kieran joined the portal', 'October 2026')).toEqual({
      'Deferred Amount': -10,
      'Deferred Note': 'Referral reward — Kieran joined the portal',
      'Deferred To Month': 'October 2026',
      'Deferred Applied': false, // written explicitly so an applied-history carrier re-arms
    });
  });
});

describe('referralCreditNote (the line-item description parents see)', () => {
  it("uses the friend's FIRST name only", () => {
    expect(referralCreditNote('Kieran Lai')).toBe('Referral reward — Kieran joined the portal');
  });
  it('survives messy whitespace', () => {
    expect(referralCreditNote('  Wei   Jie  ')).toBe('Referral reward — Wei joined the portal');
  });
  it('never renders blank — a nameless payer becomes "a friend"', () => {
    expect(referralCreditNote('')).toBe('Referral reward — a friend joined the portal');
    expect(referralCreditNote(null)).toBe('Referral reward — a friend joined the portal');
    expect(referralCreditNote('   ')).toBe('Referral reward — a friend joined the portal');
  });
});

describe('deferredTargetMonthLabel (which invoice is "the next one")', () => {
  it('before the 14th → next month (this month\'s run will generate it)', () => {
    expect(deferredTargetMonthLabel(NOW)).toBe('October 2026');
  });
  it('13th 23:59 SGT still targets next month', () => {
    expect(deferredTargetMonthLabel(new Date('2026-09-13T15:59:00.000Z'))).toBe('October 2026');
  });
  it("14th 00:30 SGT (still the 13th in UTC — the boundary is SGT's) → month after next", () => {
    expect(deferredTargetMonthLabel(new Date('2026-09-13T16:30:00.000Z'))).toBe('November 2026');
  });
  it('late in the month → month after next (this month\'s run already passed)', () => {
    expect(deferredTargetMonthLabel(new Date('2026-09-20T02:00:00.000Z'))).toBe('November 2026');
  });
  it('rolls the year over', () => {
    expect(deferredTargetMonthLabel(new Date('2026-12-01T02:00:00.000Z'))).toBe('January 2027');
    expect(deferredTargetMonthLabel(new Date('2026-12-20T02:00:00.000Z'))).toBe('February 2027');
  });
});

describe('carrierMonthLabels (where a "current" invoice can live)', () => {
  it('spans two months back through one ahead', () => {
    expect(carrierMonthLabels(NOW)).toEqual([
      'July 2026',
      'August 2026',
      'September 2026',
      'October 2026',
    ]);
  });
  it('rolls the year over both ways', () => {
    expect(carrierMonthLabels(new Date('2027-01-05T02:00:00.000Z'))).toEqual([
      'November 2026',
      'December 2026',
      'January 2027',
      'February 2027',
    ]);
  });
});

describe('pickCarrierInvoice (one deferral per record — never clobber a pending one)', () => {
  const clean = (id: string, month: string): CarrierCandidate => ({ id, month });
  it('skips a record whose deferral is still pending', () => {
    expect(
      pickCarrierInvoice([{ id: 'busy', month: 'September 2026', deferredAmount: -280, deferredApplied: false }]),
    ).toBeNull();
  });
  it('prefers a record with no deferral history over one whose deferral already applied', () => {
    const applied: CarrierCandidate = {
      id: 'old',
      month: 'September 2026',
      deferredAmount: -50,
      deferredApplied: true,
    };
    expect(pickCarrierInvoice([applied, clean('fresh', 'August 2026')])?.id).toBe('fresh');
  });
  it('an applied-history record is still usable when nothing clean exists', () => {
    const applied: CarrierCandidate = {
      id: 'old',
      month: 'September 2026',
      deferredAmount: -50,
      deferredApplied: true,
    };
    expect(pickCarrierInvoice([applied])?.id).toBe('old');
  });
  it('Voided invoices are a last resort', () => {
    expect(
      pickCarrierInvoice([
        { id: 'void', month: 'September 2026', status: 'Voided' },
        clean('live', 'August 2026'),
      ])?.id,
    ).toBe('live');
    expect(pickCarrierInvoice([{ id: 'void', month: 'September 2026', status: 'Voided' }])?.id).toBe('void');
  });
  it('newest month first, id as the deterministic tiebreak (racers converge on ONE record)', () => {
    expect(
      pickCarrierInvoice([clean('a', 'August 2026'), clean('b', 'September 2026')])?.id,
    ).toBe('b');
    expect(
      pickCarrierInvoice([clean('rec2', 'September 2026'), clean('rec1', 'September 2026')])?.id,
    ).toBe('rec1');
  });
  it('no candidates → null (caller falls back to the manual Telegram)', () => {
    expect(pickCarrierInvoice([])).toBeNull();
  });
});

describe('the two Telegrams', () => {
  it('success is a RECEIPT — the exact demoted wording', () => {
    const msg = creditReceiptMessage({
      payerName: 'Kieran Lai',
      inviterName: 'Sophie Tan',
      targetMonth: 'October 2026',
    });
    expect(msg.startsWith("🎁 Referral: Kieran Lai paid — S$10 credit auto-applied to Sophie Tan's next invoice.")).toBe(true);
    expect(msg).toContain('October 2026');
  });
  it('failure is the ORIGINAL manual-action ask', () => {
    const msg = creditManualFallbackMessage({
      payerName: 'Kieran Lai',
      inviterName: 'Sophie Tan',
      reason: 'claim insert failed: connection refused',
    });
    expect(msg).toContain('apply the −S$10');
    expect(msg).toContain('manually');
    expect(msg).toContain('claim insert failed: connection refused');
  });
});

// ── Service: in-memory referral_invoice_credits + Airtable fakes ─────────────

type CreditRow = Record<string, unknown> & { payment_reference: string };

function fakeCreditsDb(opts: { failInsert?: string; failDelete?: boolean } = {}) {
  const rows: CreditRow[] = [];
  const client = {
    from() {
      return {
        insert: async (row: CreditRow) => {
          if (opts.failInsert) return { error: { message: opts.failInsert } };
          if (rows.some((r) => r.payment_reference === row.payment_reference)) {
            return {
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            };
          }
          rows.push(row);
          return { error: null };
        },
        delete: () => ({
          eq: async (_col: string, val: string) => {
            if (opts.failDelete) throw new Error('delete failed');
            const i = rows.findIndex((r) => r.payment_reference === val);
            if (i >= 0) rows.splice(i, 1);
            return { error: null };
          },
        }),
      };
    },
  } as unknown as Parameters<typeof applyReferralInvoiceCredit>[0];
  return { client, rows };
}

function fakeAirtable(opts: { records?: unknown[]; failPatch?: string } = {}) {
  const patches: { path: string; fields: Record<string, unknown> }[] = [];
  const deps = {
    requestAll: async () => ({ records: opts.records ?? [] }),
    request: async (_table: string, path: string, init?: RequestInit) => {
      if (opts.failPatch) throw new Error(opts.failPatch);
      patches.push({ path, fields: JSON.parse(String(init?.body)).fields });
      return {};
    },
  };
  return { deps, patches };
}

const INVOICE_RECORDS = [
  { id: 'recInvSep', fields: { Student: ['recInviter'], Month: 'September 2026', Status: 'Sent' } },
  { id: 'recInvAug', fields: { Student: ['recInviter'], Month: 'August 2026', Status: 'Paid' } },
  { id: 'recOther', fields: { Student: ['recSomeoneElse'], Month: 'September 2026', Status: 'Sent' } },
];

const ARGS = {
  inviterAccountId: 'acc-inviter',
  inviterStudentRecId: 'recInviter',
  payerAccountId: 'acc-payer',
  payerDisplayName: 'Kieran Lai',
  paymentReference: 'cs_live_abc123',
  now: NOW,
};

describe('applyReferralInvoiceCredit', () => {
  it('happy path: claims the session id, writes the 4 fields onto the newest free invoice', async () => {
    const db = fakeCreditsDb();
    const at = fakeAirtable({ records: INVOICE_RECORDS });
    const out = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    expect(out).toEqual({
      status: 'applied',
      invoiceRecordId: 'recInvSep',
      targetMonth: 'October 2026',
      note: 'Referral reward — Kieran joined the portal',
    });
    expect(at.patches).toEqual([
      {
        path: '/recInvSep',
        fields: {
          'Deferred Amount': -10,
          'Deferred Note': 'Referral reward — Kieran joined the portal',
          'Deferred To Month': 'October 2026',
          'Deferred Applied': false,
        },
      },
    ]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      payment_reference: 'cs_live_abc123',
      inviter_account_id: 'acc-inviter',
      payer_account_id: 'acc-payer',
      amount_sgd: -10,
      target_month: 'October 2026',
      invoice_record_id: 'recInvSep',
    });
  });

  it('RETRY: the same session id a second time writes NOTHING (no second adjustment, no Telegram noise)', async () => {
    const db = fakeCreditsDb();
    const at = fakeAirtable({ records: INVOICE_RECORDS });
    const first = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    const retry = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    expect(first.status).toBe('applied');
    expect(retry).toEqual({ status: 'duplicate' });
    expect(at.patches).toHaveLength(1); // ONE Airtable write, ever
    expect(db.rows).toHaveLength(1);
  });

  it('another student\'s invoices are never carriers (linked-record match happens in JS)', async () => {
    const db = fakeCreditsDb();
    const at = fakeAirtable({ records: [INVOICE_RECORDS[2]] });
    const out = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    expect(out.status).toBe('failed');
    expect(db.rows).toHaveLength(0);
    expect(at.patches).toHaveLength(0);
  });

  it('no free carrier (all pending deferrals) → failed, nothing claimed, nothing written', async () => {
    const db = fakeCreditsDb();
    const at = fakeAirtable({
      records: [
        {
          id: 'recBusy',
          fields: {
            Student: ['recInviter'],
            Month: 'September 2026',
            'Deferred Amount': -280,
            'Deferred Applied': false,
          },
        },
      ],
    });
    const out = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    expect(out.status).toBe('failed');
    if (out.status === 'failed') expect(out.reason).toContain('no invoice free to carry it');
    expect(db.rows).toHaveLength(0);
    expect(at.patches).toHaveLength(0);
  });

  it('claim insert failure (not a duplicate) → failed with the reason, Airtable untouched', async () => {
    const db = fakeCreditsDb({ failInsert: 'connection refused' });
    const at = fakeAirtable({ records: INVOICE_RECORDS });
    const out = await applyReferralInvoiceCredit(db.client, ARGS, at.deps);
    expect(out).toEqual({ status: 'failed', reason: 'claim insert failed: connection refused' });
    expect(at.patches).toHaveLength(0);
  });

  it('Airtable write failure AFTER the claim → failed AND the claim is released (a retry can still succeed)', async () => {
    const db = fakeCreditsDb();
    const broken = fakeAirtable({ records: INVOICE_RECORDS, failPatch: 'Airtable error [Invoices]: 503' });
    const out = await applyReferralInvoiceCredit(db.client, ARGS, broken.deps);
    expect(out.status).toBe('failed');
    expect(db.rows).toHaveLength(0); // claim released, not wedged

    // …and a later retry (Airtable back up) completes the reward.
    const healthy = fakeAirtable({ records: INVOICE_RECORDS });
    const retry = await applyReferralInvoiceCredit(db.client, ARGS, healthy.deps);
    expect(retry.status).toBe('applied');
    expect(healthy.patches).toHaveLength(1);
  });

  it('blank payment reference → failed early (never dedupe unrelated payments onto one key)', async () => {
    const db = fakeCreditsDb();
    const at = fakeAirtable({ records: INVOICE_RECORDS });
    const out = await applyReferralInvoiceCredit(db.client, { ...ARGS, paymentReference: '  ' }, at.deps);
    expect(out.status).toBe('failed');
    expect(db.rows).toHaveLength(0);
    expect(at.patches).toHaveLength(0);
  });
});
