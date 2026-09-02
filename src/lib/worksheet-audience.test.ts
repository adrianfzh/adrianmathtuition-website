import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ORDINARY_AUDIENCE,
  accountLookupVia,
  airtableLookup,
  normaliseStudentId,
  resolveIsIp,
  resolveWorksheetAudience,
  worksheetAudienceFor,
  type AccountLookup,
  type AirtableLookup,
  type AudienceLookups,
  type AudienceRequest,
} from './worksheet-audience';

// The resolution rule behind the kiosk's and the bot's printed sheets
// (docs/KIOSK.md §7b). Every path that is not a positive verdict must land on
// the ORDINARY student — never admin — and lookups that are not needed must
// not run.

const REC = 'recAbc123Def456Gh'; // rec + 14 alphanumerics, the Airtable shape
const IP_FIELDS = { 'Subject Level': 'IP', 'Student Name': 'x' };
const G3_FIELDS = { 'Subject Level': 'G3', 'Student Name': 'y' };

/** Fake lookups that count their calls and can throw. */
function fakeLookups(account: AccountLookup | Error, airtable: AirtableLookup | Error) {
  const calls = { account: 0, airtable: 0 };
  const lookups: AudienceLookups = {
    account: async () => {
      calls.account++;
      if (account instanceof Error) throw account;
      return account;
    },
    airtable: async () => {
      calls.airtable++;
      if (airtable instanceof Error) throw airtable;
      return airtable;
    },
  };
  return { lookups, calls };
}

describe('normaliseStudentId', () => {
  it('accepts a canonical Airtable rec id, trimmed', () => {
    expect(normaliseStudentId(REC)).toBe(REC);
    expect(normaliseStudentId(`  ${REC}\n`)).toBe(REC);
  });

  it('rejects everything that is not one (no lookup will run on it)', () => {
    expect(normaliseStudentId(undefined)).toBeNull();
    expect(normaliseStudentId(null)).toBeNull();
    expect(normaliseStudentId('')).toBeNull();
    expect(normaliseStudentId(42)).toBeNull();
    expect(normaliseStudentId({ id: REC })).toBeNull();
    expect(normaliseStudentId('rec')).toBeNull();
    expect(normaliseStudentId('recTooShort')).toBeNull();
    expect(normaliseStudentId(`${REC}x`)).toBeNull();
    expect(normaliseStudentId('acct:0b6f0c2e-1111-2222-3333-444444444444')).toBeNull(); // stranger marker
    expect(normaliseStudentId("rec'; drop table--")).toBeNull();
  });
});

describe('resolveIsIp — the rule', () => {
  it('rule 2: an active portal account decides, and Airtable is not consulted', async () => {
    const yes = fakeLookups({ kind: 'found', isIp: true }, { kind: 'found', fields: G3_FIELDS });
    await expect(resolveIsIp(REC, yes.lookups)).resolves.toBe(true);
    expect(yes.calls).toEqual({ account: 1, airtable: 0 });

    // The account wins even when Airtable would say IP — kiosk == portal view.
    const no = fakeLookups({ kind: 'found', isIp: false }, { kind: 'found', fields: IP_FIELDS });
    await expect(resolveIsIp(REC, no.lookups)).resolves.toBe(false);
    expect(no.calls).toEqual({ account: 1, airtable: 0 });
  });

  it('rule 2: an account with a NULL flag is an ordinary student', async () => {
    const f = fakeLookups({ kind: 'found', isIp: null }, { kind: 'found', fields: IP_FIELDS });
    await expect(resolveIsIp(REC, f.lookups)).resolves.toBe(false);
    expect(f.calls.airtable).toBe(0);
  });

  it('rule 3: no account → the Airtable Subject Level decides', async () => {
    const ip = fakeLookups({ kind: 'none' }, { kind: 'found', fields: IP_FIELDS });
    await expect(resolveIsIp(REC, ip.lookups)).resolves.toBe(true);
    expect(ip.calls).toEqual({ account: 1, airtable: 1 });

    const g3 = fakeLookups({ kind: 'none' }, { kind: 'found', fields: G3_FIELDS });
    await expect(resolveIsIp(REC, g3.lookups)).resolves.toBe(false);

    // deriveIsIp's own normalisation carries through (lib/portal-ip.ts).
    const loose = fakeLookups({ kind: 'none' }, { kind: 'found', fields: { 'Subject Level': ' ip ' } });
    await expect(resolveIsIp(REC, loose.lookups)).resolves.toBe(true);
  });

  it('rule 3: a broken account lookup falls through to Airtable (it can only widen when the record says IP)', async () => {
    const err = fakeLookups({ kind: 'error' }, { kind: 'found', fields: IP_FIELDS });
    await expect(resolveIsIp(REC, err.lookups)).resolves.toBe(true);
    expect(err.calls).toEqual({ account: 1, airtable: 1 });

    const thrown = fakeLookups(new Error('supabase down'), { kind: 'found', fields: G3_FIELDS });
    await expect(resolveIsIp(REC, thrown.lookups)).resolves.toBe(false);
    expect(thrown.calls).toEqual({ account: 1, airtable: 1 });
  });

  it('rule 4: every no-verdict path is the ordinary student', async () => {
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'none' }, { kind: 'none' }).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'none' }, { kind: 'error' }).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'error' }, { kind: 'error' }).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'none' }, new Error('airtable timeout')).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups(new Error('a'), new Error('b')).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'none' }, { kind: 'found', fields: null }).lookups)).resolves.toBe(false);
    await expect(resolveIsIp(REC, fakeLookups({ kind: 'none' }, { kind: 'found', fields: {} }).lookups)).resolves.toBe(false);
  });

  it('rule 4: a malformed id resolves with NO IO at all', async () => {
    for (const bad of [undefined, null, '', 'nope', 42, `${REC}!`]) {
      const f = fakeLookups({ kind: 'found', isIp: true }, { kind: 'found', fields: IP_FIELDS });
      await expect(resolveIsIp(bad, f.lookups)).resolves.toBe(false);
      expect(f.calls).toEqual({ account: 0, airtable: 0 });
    }
  });
});

describe('resolveWorksheetAudience — rule 1 + the shape the pool wants', () => {
  const ipStudent = () => fakeLookups({ kind: 'found', isIp: true }, { kind: 'found', fields: IP_FIELDS });

  it('an explicit boolean isIp wins outright, with no lookups', async () => {
    const t = ipStudent();
    await expect(resolveWorksheetAudience({ isIp: true }, t.lookups)).resolves.toEqual({ isIp: true, admin: false });
    expect(t.calls).toEqual({ account: 0, airtable: 0 });

    // …even against a studentId that would have resolved the other way.
    const f = ipStudent();
    await expect(resolveWorksheetAudience({ isIp: false, studentId: REC }, f.lookups)).resolves.toEqual({ isIp: false, admin: false });
    expect(f.calls).toEqual({ account: 0, airtable: 0 });
  });

  it('a non-boolean isIp is ignored and the studentId path runs instead', async () => {
    const t = ipStudent();
    await expect(resolveWorksheetAudience({ isIp: 'true', studentId: REC }, t.lookups)).resolves.toEqual({ isIp: true, admin: false });
    expect(t.calls.account).toBe(1);

    const u = ipStudent();
    await expect(resolveWorksheetAudience({ isIp: 1 }, u.lookups)).resolves.toEqual(ORDINARY_AUDIENCE);
    expect(u.calls).toEqual({ account: 0, airtable: 0 });
  });

  it('no student at all — the health-check dry probe, an unpaired admin preview — is the ordinary student', async () => {
    const t = ipStudent();
    await expect(resolveWorksheetAudience({}, t.lookups)).resolves.toEqual(ORDINARY_AUDIENCE);
    await expect(resolveWorksheetAudience({ studentId: undefined }, t.lookups)).resolves.toEqual(ORDINARY_AUDIENCE);
    expect(t.calls).toEqual({ account: 0, airtable: 0 });
  });

  it('nothing in a request can ask for the admin view', async () => {
    const t = ipStudent();
    const body: Record<string, unknown> = { admin: true, p_admin: true, isIp: true, studentId: REC };
    const out = await resolveWorksheetAudience(body as AudienceRequest, t.lookups);
    expect(out.admin).toBe(false);
    expect(ORDINARY_AUDIENCE.admin).toBe(false);
  });
});

// ── IO adapters: pin the query shape and the fail-closed mapping ─────────────

function fakeSupa(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'is']) {
    chain[m] = (...args: unknown[]) => {
      calls[m] = args;
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  return { supa: chain as unknown as SupabaseClient, calls };
}

describe('accountLookupVia (portal_accounts)', () => {
  it('reads is_ip of the ACTIVE account on the Airtable id', async () => {
    const { supa, calls } = fakeSupa({ data: { is_ip: true }, error: null });
    await expect(accountLookupVia(supa)(REC)).resolves.toEqual({ kind: 'found', isIp: true });
    expect(calls.from).toEqual(['portal_accounts']);
    expect(calls.select).toEqual(['is_ip']);
    expect(calls.eq).toEqual(['airtable_student_id', REC]);
    expect(calls.is).toEqual(['deactivated_at', null]); // an offboarded account's flag is stale
  });

  it('maps no row → none, a query error → error, a missing flag → null', async () => {
    await expect(accountLookupVia(fakeSupa({ data: null, error: null }).supa)(REC)).resolves.toEqual({ kind: 'none' });
    await expect(accountLookupVia(fakeSupa({ data: null, error: { message: 'boom' } }).supa)(REC)).resolves.toEqual({ kind: 'error' });
    await expect(accountLookupVia(fakeSupa({ data: {}, error: null }).supa)(REC)).resolves.toEqual({ kind: 'found', isIp: null });
  });
});

describe('airtableLookup (Students single-record GET)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the record fields and bounds the round-trip with a timeout signal', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: REC, fields: IP_FIELDS }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(airtableLookup(1000)(REC)).resolves.toEqual({ kind: 'found', fields: IP_FIELDS });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/Students/${REC}$`));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a 404 (record gone), a 5xx and a network failure to error — no verdict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('NOT_FOUND', { status: 404 })));
    await expect(airtableLookup()(REC)).resolves.toEqual({ kind: 'error' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 503 })));
    await expect(airtableLookup()(REC)).resolves.toEqual({ kind: 'error' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    await expect(airtableLookup()(REC)).resolves.toEqual({ kind: 'error' });
  });

  it('a record without fields is a found-but-empty record → ordinary downstream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: REC }), { status: 200 })));
    await expect(airtableLookup()(REC)).resolves.toEqual({ kind: 'found', fields: null });
  });
});

describe('worksheetAudienceFor — the routes’ one call, end to end over fakes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('kiosk shape: { studentId } → the account flag', async () => {
    const { supa } = fakeSupa({ data: { is_ip: true }, error: null });
    await expect(worksheetAudienceFor(supa, { studentId: REC })).resolves.toEqual({ isIp: true, admin: false });
  });

  it('no account → Airtable; Airtable down → ordinary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: REC, fields: IP_FIELDS }), { status: 200 })));
    const { supa } = fakeSupa({ data: null, error: null });
    await expect(worksheetAudienceFor(supa, { studentId: REC })).resolves.toEqual({ isIp: true, admin: false });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    await expect(worksheetAudienceFor(supa, { studentId: REC })).resolves.toEqual(ORDINARY_AUDIENCE);
  });

  it('the health-check dry probe body resolves with no IO', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { supa, calls } = fakeSupa({ data: { is_ip: true }, error: null });
    await expect(worksheetAudienceFor(supa, { dry: true, level: 'S3_AM', topic: 'Binomial Theorem' } as AudienceRequest))
      .resolves.toEqual(ORDINARY_AUDIENCE);
    expect(calls.from).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
