// The shared "student record" reader, step 1 (5 Nov 2026, Adrian: "yes build it" —
// docs/STUDENT-DATA-MAP.md §4). ONE answer to "who is this?" for every door: a
// Telegram chat id, an app account id, an Airtable id, or a web chat key.
// Reads only; moves no data. Pure resolver + injected lookups so it is testable.
// Internal: never return this to a student or a public page.
export type StudentRole = 'student' | 'parent' | 'stranger';
export type StudentSpine = {
  role: StudentRole;
  airtableId: string | null;
  name: string | null;
  level: string | null;
  subjects: string[];
  status: string | null;
  links: { telegramChatId: string | null; accountId: string | null; parentChatIds: string[] };
  // Loose ends the weekly report counts.
  issues: string[];
};
export type StudentQuery = { chatId?: string | number; accountId?: string; airtableId?: string; chatKey?: string };
export type AirtableStudent = { id: string; fields: Record<string, unknown> };
export type Account = { id: string; airtable_student_id: string | null; telegram_chat_id: number | string | null; display_name?: string | null; level?: string | null; subjects?: string[] | null };
export type Lookups = {
  airtableByStudentChat(chatId: string): Promise<AirtableStudent | null>;
  airtableByParentChat(chatId: string): Promise<AirtableStudent | null>;
  airtableById(id: string): Promise<AirtableStudent | null>;
  accountByChat(chatId: string): Promise<Account | null>;
  accountById(id: string): Promise<Account | null>;
  accountByAirtable(id: string): Promise<Account | null>;
};

/** 'tg-123' → '123'; 'acct:<uuid>'; 'rec…'; other web/portal keys carry no person. */
export function parseChatKey(key: string): StudentQuery {
  const k = String(key || '').trim();
  if (/^tg-\d+$/.test(k)) return { chatId: k.slice(3) };
  if (/^acct:[0-9a-f-]{36}$/i.test(k)) return { accountId: k.slice(5) };
  if (/^rec[A-Za-z0-9]{10,}$/.test(k)) return { airtableId: k };
  return {};
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

export async function resolveStudent(q: StudentQuery, lk: Lookups): Promise<StudentSpine> {
  const merged: StudentQuery = { ...(q.chatKey ? parseChatKey(q.chatKey) : {}), ...q };
  const chatId = merged.chatId != null && str(merged.chatId) ? str(merged.chatId) : null;
  const issues: string[] = [];
  let role: StudentRole = 'stranger';
  let rec: AirtableStudent | null = null;
  let acct: Account | null = null;

  if (merged.accountId) acct = await lk.accountById(merged.accountId);
  if (merged.airtableId) rec = await lk.airtableById(merged.airtableId);
  if (!rec && acct?.airtable_student_id) rec = await lk.airtableById(acct.airtable_student_id);
  if (!rec && chatId) {
    rec = await lk.airtableByStudentChat(chatId);
    if (rec) role = 'student';
    else {
      // The app account's Telegram link catches a chat Airtable does not know yet.
      const byChat = await lk.accountByChat(chatId);
      if (byChat?.airtable_student_id) { acct = acct || byChat; rec = await lk.airtableById(byChat.airtable_student_id); if (rec) role = 'student'; }
    }
    if (!rec) {
      const parent = await lk.airtableByParentChat(chatId);
      if (parent) { rec = parent; role = 'parent'; }
    }
  } else if (rec) role = 'student';
  if (rec && !acct) acct = await lk.accountByAirtable(rec.id);

  if (!rec) {
    if (acct) issues.push('account has no Airtable record');
    return { role: acct ? 'student' : 'stranger', airtableId: null, name: acct?.display_name ?? null, level: acct?.level ?? null,
      subjects: acct?.subjects ?? [], status: null, links: { telegramChatId: chatId, accountId: acct?.id ?? null, parentChatIds: [] }, issues };
  }
  const f = rec.fields;
  const atChat = str(f['Student Telegram ID']) || null;
  const acctChat = acct?.telegram_chat_id != null ? str(acct.telegram_chat_id) : null;
  if (atChat && acctChat && atChat !== acctChat) issues.push('Airtable and app account hold different Telegram ids');
  if (!atChat && !acctChat) issues.push('no Telegram link on either side');
  if (!acct) issues.push('no app account');
  const parent = str(f['Parent Telegram ID']);
  return {
    role, airtableId: rec.id, name: str(f['Student Name']) || acct?.display_name || null,
    level: str(f['Level']) || acct?.level || null,
    subjects: list(f['Subjects']).length ? list(f['Subjects']) : acct?.subjects ?? [],
    status: str(f['Status']) || null,
    links: { telegramChatId: atChat || acctChat, accountId: acct?.id ?? null, parentChatIds: parent ? [parent] : [] },
    issues,
  };
}
