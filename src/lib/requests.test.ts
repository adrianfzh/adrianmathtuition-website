import { describe, it, expect } from 'vitest';
import {
  DAILY_REQUEST_CAP,
  DETAIL_MAX,
  DETAIL_MIN,
  countRequestsToday,
  escapeTelegramHtml,
  kindLabel,
  normalizeKind,
  requestTelegramText,
  validResultUrl,
  validateDetail,
} from './requests';
import type { RequestCountingClient } from './requests';

describe('normalizeKind', () => {
  it('passes the three known kinds through', () => {
    expect(normalizeKind('worksheet')).toBe('worksheet');
    expect(normalizeKind('notes')).toBe('notes');
    expect(normalizeKind('other')).toBe('other');
  });
  it('collapses anything else to other — a weird client cannot invent categories', () => {
    expect(normalizeKind('WORKSHEET')).toBe('other');
    expect(normalizeKind('prelim')).toBe('other');
    expect(normalizeKind(42)).toBe('other');
    expect(normalizeKind(undefined)).toBe('other');
    expect(normalizeKind(null)).toBe('other');
  });
});

describe('kindLabel', () => {
  it('labels each kind with its emoji', () => {
    expect(kindLabel('worksheet')).toBe('📄 Worksheet');
    expect(kindLabel('notes')).toBe('📚 Notes');
    expect(kindLabel('other')).toBe('❓ Other');
  });
  it('unknown kinds label as Other (defensive against future DB rows)', () => {
    expect(kindLabel('prelim')).toBe('❓ Other');
  });
});

describe('validateDetail', () => {
  it('rejects non-strings', () => {
    expect(validateDetail(undefined).ok).toBe(false);
    expect(validateDetail(123).ok).toBe(false);
    expect(validateDetail(null).ok).toBe(false);
  });
  it(`rejects fewer than ${DETAIL_MIN} characters after trimming`, () => {
    expect(validateDetail('vectors').ok).toBe(false);
    expect(validateDetail('  vectors  ').ok).toBe(false); // 7 chars trimmed
    expect(validateDetail('         ').ok).toBe(false); // whitespace only
  });
  it('accepts exactly the boundary lengths', () => {
    expect(validateDetail('a'.repeat(DETAIL_MIN))).toEqual({ ok: true, detail: 'a'.repeat(DETAIL_MIN) });
    expect(validateDetail('a'.repeat(DETAIL_MAX)).ok).toBe(true);
  });
  it(`rejects more than ${DETAIL_MAX} characters`, () => {
    expect(validateDetail('a'.repeat(DETAIL_MAX + 1)).ok).toBe(false);
  });
  it('returns the trimmed detail', () => {
    const r = validateDetail('  a worksheet on vectors, exam difficulty  ');
    expect(r).toEqual({ ok: true, detail: 'a worksheet on vectors, exam difficulty' });
  });
  it('padding spaces do not rescue an over-long detail (trim happens first)', () => {
    expect(validateDetail(`  ${'a'.repeat(DETAIL_MAX)}  `).ok).toBe(true);
  });
});

describe('requestTelegramText', () => {
  it('names the student, the kind, the ask, and the review link', () => {
    const text = requestTelegramText('Wei Jie', 'worksheet', 'A worksheet on vectors, exam difficulty');
    expect(text).toContain('<b>Wei Jie</b>');
    expect(text).toContain('📄 Worksheet');
    expect(text).toContain('A worksheet on vectors, exam difficulty');
    expect(text).toContain('https://www.adrianmathtuition.com/admin/requests');
  });
  it('truncates the detail preview to 200 characters', () => {
    const text = requestTelegramText('Wei Jie', 'notes', 'x'.repeat(500));
    expect(text).toContain(`${'x'.repeat(200)}…`);
    expect(text).not.toContain('x'.repeat(201));
  });
  it('escapes student-typed HTML so parse_mode:HTML can never 400 the send', () => {
    const text = requestTelegramText('Tan & Sons', 'other', 'need notes on a<b & b>c inequalities');
    expect(text).toContain('<b>Tan &amp; Sons</b>');
    expect(text).toContain('a&lt;b &amp; b&gt;c');
    expect(text).not.toContain('a<b');
  });
  it('an empty name falls back to "A student"', () => {
    expect(requestTelegramText('  ', 'other', 'ten chars ok')).toContain('<b>A student</b>');
  });
});

describe('escapeTelegramHtml', () => {
  it('escapes ampersands first so entities are not double-escaped', () => {
    expect(escapeTelegramHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });
});

describe('countRequestsToday', () => {
  type Row = { airtable_student_id: string; created_at: string };

  function client(rows: Row[]): RequestCountingClient {
    return {
      from(table: string) {
        expect(table).toBe('portal_requests');
        const preds: ((r: Row) => boolean)[] = [];
        const query = {
          gte(column: string, value: string) {
            expect(column).toBe('created_at');
            preds.push(r => r.created_at >= value);
            return query;
          },
          eq(column: string, value: string) {
            expect(column).toBe('airtable_student_id');
            preds.push(r => r.airtable_student_id === value);
            return query;
          },
          then<T>(resolve: (v: { count: number; error: null }) => T) {
            return Promise.resolve({ count: rows.filter(r => preds.every(p => p(r))).length, error: null }).then(resolve);
          },
        };
        return { select: () => query };
      },
    } as unknown as RequestCountingClient;
  }

  // 2026-08-20T16:00Z = 21 Aug 00:00 SGT — "now" below is 21 Aug 10:00 SGT.
  const now = new Date('2026-08-21T02:00:00Z');

  it('counts only this student, only since SGT midnight', async () => {
    const n = await countRequestsToday(client([
      { airtable_student_id: 'recA', created_at: '2026-08-20T17:00:00.000Z' }, // today SGT
      { airtable_student_id: 'recA', created_at: '2026-08-21T01:00:00.000Z' }, // today SGT
      { airtable_student_id: 'recA', created_at: '2026-08-20T15:59:00.000Z' }, // yesterday SGT
      { airtable_student_id: 'recB', created_at: '2026-08-21T01:00:00.000Z' }, // someone else
    ]), 'recA', now);
    expect(n).toBe(2);
  });

  it('zero rows → zero', async () => {
    expect(await countRequestsToday(client([]), 'recA', now)).toBe(0);
  });

  it('the cap itself is two per day', () => {
    expect(DAILY_REQUEST_CAP).toBe(2);
  });
});

describe('validResultUrl', () => {
  it('accepts plain https and http URLs', () => {
    expect(validResultUrl('https://example.com/w.pdf')).toBe('https://example.com/w.pdf');
    expect(validResultUrl('  https://example.com/w.pdf  ')).toBe('https://example.com/w.pdf');
    expect(validResultUrl('http://example.com/w.pdf')).toBe('http://example.com/w.pdf');
  });
  it('rejects javascript:, data:, empty, junk, and non-strings', () => {
    expect(validResultUrl('javascript:alert(1)')).toBeNull();
    expect(validResultUrl('data:text/html,<h1>hi</h1>')).toBeNull();
    expect(validResultUrl('')).toBeNull();
    expect(validResultUrl('   ')).toBeNull();
    expect(validResultUrl('not a url')).toBeNull();
    expect(validResultUrl(undefined)).toBeNull();
    expect(validResultUrl(9)).toBeNull();
  });
  it('rejects absurdly long URLs', () => {
    expect(validResultUrl(`https://example.com/${'a'.repeat(2048)}`)).toBeNull();
  });
});
