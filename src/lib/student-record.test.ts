import { describe, it, expect } from 'vitest';
import { resolveStudent, parseChatKey, type Lookups, type AirtableStudent, type Account } from './student-record';

const rec = (id: string, f: Record<string, unknown>): AirtableStudent => ({ id, fields: { 'Student Name': 'Amy', Level: 'Sec 4', Subjects: ['E Math'], Status: 'Active', ...f } });
function lk(recs: AirtableStudent[], accts: Account[]): Lookups {
  return {
    airtableByStudentChat: async c => recs.find(r => String(r.fields['Student Telegram ID'] ?? '') === c) ?? null,
    airtableByParentChat: async c => recs.find(r => String(r.fields['Parent Telegram ID'] ?? '') === c) ?? null,
    airtableById: async id => recs.find(r => r.id === id) ?? null,
    accountByChat: async c => accts.find(a => String(a.telegram_chat_id) === c) ?? null,
    accountById: async id => accts.find(a => a.id === id) ?? null,
    accountByAirtable: async id => accts.find(a => a.airtable_student_id === id) ?? null,
  };
}
describe('parseChatKey', () => {
  it('reads tg- keys and ignores anonymous web keys', () => {
    expect(parseChatKey('tg-123')).toEqual({ chatId: '123' });
    expect(parseChatKey('web-ab12')).toEqual({});
    expect(parseChatKey('portal')).toEqual({});
  });
});
describe('resolveStudent', () => {
  it('Telegram chat and app account resolve to the same Airtable id', async () => {
    const l = lk([rec('recA', { 'Student Telegram ID': '111' })], [{ id: '1'.repeat(8) + '-1111-1111-1111-' + '1'.repeat(12), airtable_student_id: 'recA', telegram_chat_id: 111 }]);
    const a = await resolveStudent({ chatId: 111 }, l);
    const b = await resolveStudent({ accountId: '11111111-1111-1111-1111-111111111111' }, l);
    expect(a.airtableId).toBe('recA'); expect(b.airtableId).toBe('recA');
    expect(a.role).toBe('student'); expect(a.issues).toEqual([]);
  });
  it('a chat Airtable does not know is still found through the app account link', async () => {
    const l = lk([rec('recA', {})], [{ id: 'x', airtable_student_id: 'recA', telegram_chat_id: 222 }]);
    const r = await resolveStudent({ chatKey: 'tg-222' }, l);
    expect(r.airtableId).toBe('recA'); expect(r.role).toBe('student');
  });
  it('different Telegram ids on the two sides are reported', async () => {
    const l = lk([rec('recA', { 'Student Telegram ID': '111' })], [{ id: 'x', airtable_student_id: 'recA', telegram_chat_id: 999 }]);
    expect((await resolveStudent({ airtableId: 'recA' }, l)).issues).toContain('Airtable and app account hold different Telegram ids');
  });
  it('a parent chat is a parent, an unknown chat a stranger', async () => {
    const l = lk([rec('recA', { 'Parent Telegram ID': '333' })], []);
    expect((await resolveStudent({ chatId: '333' }, l)).role).toBe('parent');
    const s = await resolveStudent({ chatId: '444' }, l);
    expect(s.role).toBe('stranger'); expect(s.airtableId).toBeNull();
  });
});
