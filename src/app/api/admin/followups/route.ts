import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// Parent follow-ups — promises made on WhatsApp ("will test him before WA3 and
// update mum") tracked in the Airtable `Follow-ups` table so they stop living in
// chat scrollback. A daily Telegram digest (/api/followups-digest) nags until Done.
//
// GET  ?studentId=recXXX (optional) &all=1 (include done)  → { followups: [...] }
// POST { note, due?, studentId? }        → create
// PATCH { id, done? , due?, note? }      → tick done / snooze / edit

const TABLE = 'Follow-ups';

function mapRec(r: any) {
  return {
    id: r.id,
    note: r.fields['Note'] || '',
    due: r.fields['Due'] || null,
    done: r.fields['Done'] === true,
    studentId: r.fields['Student']?.[0] || null,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const studentId = sp.get('studentId');
  const includeDone = sp.get('all') === '1';
  try {
    const formula = includeDone ? '' : `?filterByFormula=${encodeURIComponent('NOT({Done})')}`;
    const data = await airtableRequestAll(TABLE, `${formula}${formula ? '&' : '?'}fields[]=Note&fields[]=Student&fields[]=Due&fields[]=Done`);
    let rows = (data.records || []).map(mapRec);
    if (studentId) rows = rows.filter((r: any) => r.studentId === studentId);
    // Due first (earliest), then no-due
    rows.sort((a: any, b: any) => (a.due || '9999').localeCompare(b.due || '9999'));
    return NextResponse.json({ followups: rows });
  } catch (e) {
    // Table missing → graceful empty
    if (e instanceof Error && /NOT_FOUND|TABLE_NOT_FOUND|404/i.test(e.message)) return NextResponse.json({ followups: [], tableMissing: true });
    console.error('[followups] GET failed:', e);
    return NextResponse.json({ error: 'Failed to load follow-ups' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { note, due, studentId } = await req.json().catch(() => ({}));
  if (!note || !String(note).trim()) return NextResponse.json({ error: 'note required' }, { status: 400 });
  try {
    const fields: Record<string, any> = { Note: String(note).trim(), Done: false };
    if (due) fields['Due'] = due;
    if (studentId) fields['Student'] = [studentId];
    const rec = await airtableRequest(TABLE, '', { method: 'POST', body: JSON.stringify({ fields }) });
    return NextResponse.json({ ok: true, followup: mapRec(rec) });
  } catch (e) {
    console.error('[followups] POST failed:', e);
    return NextResponse.json({ error: 'Failed to create — is the Follow-ups table set up?' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, done, due, note } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const fields: Record<string, any> = {};
    if (done !== undefined) fields['Done'] = !!done;
    if (due !== undefined) fields['Due'] = due || null;
    if (note !== undefined) fields['Note'] = note;
    const rec = await airtableRequest(TABLE, `/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    return NextResponse.json({ ok: true, followup: mapRec(rec) });
  } catch (e) {
    console.error('[followups] PATCH failed:', e);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
