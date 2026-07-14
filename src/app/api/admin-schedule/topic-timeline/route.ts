import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// Per-student "currently working on" topic tracker with history (Airtable
// "Topic Timeline" table). Advancing to a new topic stamps the previous one's
// Ended date and unticks Current, building a timeline.
//
// GET  ?studentId=recXXX           → { rows: [...] } sorted by Started
// POST { studentId, subject, topic }         → advance current topic for (student, subject)
// POST { studentId, subject, action:'clear' } → end the current topic (no new one)
// POST { rowId, ...fields }                   → edit/delete a single row (corrections)

const TABLE = 'Topic Timeline';

interface Row { id: string; subject: string; topic: string; started: string | null; ended: string | null; current: boolean }

function mapRow(r: any): Row {
  return {
    id: r.id,
    subject: r.fields['Subject'] || '',
    topic: r.fields['Topic'] || '',
    started: r.fields['Started'] || null,
    ended: r.fields['Ended'] || null,
    current: r.fields['Current'] === true,
  };
}

async function rowsFor(studentId: string): Promise<any[]> {
  // Linked-record filter by ID is unreliable — fetch all, match in JS.
  const data = await airtableRequestAll(
    TABLE,
    `?fields[]=Student&fields[]=Subject&fields[]=Topic&fields[]=Started&fields[]=Ended&fields[]=Current`
  );
  return (data.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  try {
    const rows = (await rowsFor(studentId)).map(mapRow)
      .sort((a, b) => (b.started || '').localeCompare(a.started || '')); // newest first
    return NextResponse.json({ rows });
  } catch (e) {
    console.error('[topic-timeline] GET failed:', e);
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { studentId?: string; subject?: string; topic?: string; action?: string; rowId?: string; started?: string; ended?: string };
  const today = localToday();

  // ── Single-row edit / delete (corrections) ──
  if (body.rowId) {
    if (body.action === 'delete') {
      await airtableRequest(TABLE, `/${body.rowId}`, { method: 'DELETE' });
      return NextResponse.json({ ok: true });
    }
    const fields: Record<string, any> = {};
    if (body.topic !== undefined) fields['Topic'] = body.topic;
    if (body.started !== undefined) fields['Started'] = body.started || null;
    if (body.ended !== undefined) fields['Ended'] = body.ended || null;
    await airtableRequest(TABLE, `/${body.rowId}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    return NextResponse.json({ ok: true });
  }

  const { studentId, subject = '', topic, action } = body;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  try {
    const mine = await rowsFor(studentId);
    const currentForSubject = mine.find((r: any) => r.fields['Current'] === true && (r.fields['Subject'] || '') === subject);

    // ── Clear: end the current topic, create nothing ──
    if (action === 'clear') {
      if (currentForSubject) {
        await airtableRequest(TABLE, `/${currentForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Ended: today, Current: false } }) });
      }
      return NextResponse.json({ ok: true });
    }

    if (!topic || !topic.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 });
    // Same topic already current → nothing to do.
    if (currentForSubject && (currentForSubject.fields['Topic'] || '') === topic.trim()) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    // End the previous current topic for this subject.
    if (currentForSubject) {
      await airtableRequest(TABLE, `/${currentForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Ended: today, Current: false } }) });
    }
    // Start the new one.
    await airtableRequest(TABLE, '', {
      method: 'POST',
      body: JSON.stringify({ fields: { Student: [studentId], Subject: subject, Topic: topic.trim(), Started: today, Current: true } }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[topic-timeline] POST failed:', e);
    return NextResponse.json({ error: 'Failed to update timeline' }, { status: 500 });
  }
}
