import { describe, it, expect } from 'vitest';
import { STATUS_BY_EVENT, statusPatchBody } from './email-status';
import { SCHEMA } from './airtable-schema';

describe('Resend event → EmailLog status', () => {
  it('maps every event Resend can send us', () => {
    expect(Object.keys(STATUS_BY_EVENT).sort()).toEqual([
      'email.bounced',
      'email.complained',
      'email.delivered',
      'email.delivery_delayed',
      'email.sent',
    ]);
  });

  // The regression. Statuses the webhook writes are NOT all options on the
  // Airtable singleSelect, so the write only lands with typecast — without it
  // Airtable 422s and the webhook's .catch() eats it in silence.
  it('writes with typecast, because the field does not list every status', () => {
    const opts: string[] =
      (SCHEMA as any).EmailLog?.fields?.Status?.options ?? [];
    const unlisted = Object.values(STATUS_BY_EVENT).filter((s) => !opts.includes(s));
    if (unlisted.length > 0) {
      expect(statusPatchBody(unlisted[0]).typecast).toBe(true);
    }
    expect(statusPatchBody('delivered')).toEqual({
      fields: { Status: 'delivered' },
      typecast: true,
    });
  });

  it('never sends a status the map did not produce', () => {
    const allowed = new Set(Object.values(STATUS_BY_EVENT));
    for (const s of Object.values(STATUS_BY_EVENT)) {
      expect(allowed.has(statusPatchBody(s).fields.Status)).toBe(true);
    }
  });
});
