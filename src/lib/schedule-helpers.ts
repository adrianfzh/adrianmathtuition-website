import { NextRequest } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegramTo } from '@/lib/telegram';

export function verifyAdminAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export function formatDateSlotLabel(
  dateStr: string,
  slotFields: { Day?: string; Time?: string }
): string {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const day = d.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'Asia/Singapore' });
  const date = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  return `${day}, ${date} ${slotFields.Time ?? ''}`.trim();
}

export async function countLessonsInSlot(slotId: string, date: string): Promise<number> {
  const formula = encodeURIComponent(
    `AND(FIND('${slotId}',ARRAYJOIN({Slot}))>0,{Date}='${date}',{Status}!='Cancelled',{Status}!='Absent')`
  );
  const data = await airtableRequestAll('Lessons', `?filterByFormula=${formula}&fields[]=Status`);
  return data.records.length;
}

export async function notifyLessonChange(
  studentId: string,
  message: string
): Promise<{ student: boolean; parent: boolean }> {
  const result = { student: false, parent: false };
  try {
    const rec = await airtableRequest(
      'Students',
      `/${studentId}?fields[]=Student+Telegram+ID&fields[]=Parent+Telegram+ID`
    );
    const studentTgId = rec.fields['Student Telegram ID'];
    const parentTgId = rec.fields['Parent Telegram ID'];
    if (studentTgId) {
      await sendTelegramTo(studentTgId, message);
      result.student = true;
    }
    if (parentTgId) {
      await sendTelegramTo(parentTgId, message);
      result.parent = true;
    }
  } catch (err) {
    console.error('[schedule-helpers] notifyLessonChange error:', err);
  }
  return result;
}
