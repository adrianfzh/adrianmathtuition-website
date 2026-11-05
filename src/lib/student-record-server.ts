// Real lookups for student-record.ts: Airtable Students + portal_accounts.
import { airtableRequest } from '@/lib/airtable';
import { createServiceClient } from '@/lib/supabase-server';
import type { Lookups, AirtableStudent, Account } from '@/lib/student-record';

const FIELDS = ['Student Name', 'Level', 'Subjects', 'Status', 'Student Telegram ID', 'Parent Telegram ID'].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
const digits = (s: string) => s.replace(/[^0-9-]/g, '');
async function find(formula: string): Promise<AirtableStudent | null> {
  const d = await airtableRequest('Students', `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1&${FIELDS}`);
  const r = d?.records?.[0];
  return r ? { id: r.id, fields: r.fields || {} } : null;
}
const COLS = 'id, airtable_student_id, telegram_chat_id, display_name, level, subjects';
export function realLookups(): Lookups {
  const sb = createServiceClient();
  const one = async (col: string, v: string | number): Promise<Account | null> =>
    ((await sb.from('portal_accounts').select(COLS).eq(col, v).maybeSingle()).data as Account | null) ?? null;
  return {
    airtableByStudentChat: c => find(`{Student Telegram ID}='${digits(c)}'`),
    airtableByParentChat: c => find(`{Parent Telegram ID}='${digits(c)}'`),
    airtableById: async id => {
      if (!/^rec[A-Za-z0-9]+$/.test(id)) return null;
      try { const r = await airtableRequest('Students', `/${id}`); return r?.id ? { id: r.id, fields: r.fields || {} } : null; } catch { return null; }
    },
    accountByChat: c => (/^\d+$/.test(c) ? one('telegram_chat_id', Number(c)) : Promise.resolve(null)),
    accountById: id => (/^[0-9a-f-]{36}$/i.test(id) ? one('id', id) : Promise.resolve(null)),
    accountByAirtable: id => one('airtable_student_id', id),
  };
}
