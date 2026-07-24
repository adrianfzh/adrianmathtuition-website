import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { invalidateScheduleStatics } from '@/lib/schedule-static-cache';

export const runtime = 'nodejs';

// Per-student "currently working on" topic tracker with history (Airtable
// "Topic Timeline" table). Advancing to a new topic stamps the previous one's
// Ended date and unticks Current, building a timeline.
//
// PLANNED rows ("next lesson's topic") reuse the same table with NO new
// fields: a row with no Started and Current=false is a plan, not history.
//
// Same-day corrections don't pollute the timeline: advancing away from a
// topic that was set TODAY deletes the mis-pick (no zero-length rows), and
// re-picking a topic that was ended TODAY resurrects its original row.
//
// GET  ?studentId=recXXX           → { rows: [...] } sorted by Started
// POST { studentId, subject, topic }         → advance current topic for (student, subject)
// POST { studentId, subject, topic, action:'plan' }  → set/replace the planned next topic
// POST { studentId, subject, action:'startPlanned' } → promote the planned topic to current
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
      invalidateScheduleStatics();
      return NextResponse.json({ ok: true });
    }
    const fields: Record<string, any> = {};
    if (body.topic !== undefined) fields['Topic'] = body.topic;
    if (body.started !== undefined) fields['Started'] = body.started || null;
    if (body.ended !== undefined) fields['Ended'] = body.ended || null;
    await airtableRequest(TABLE, `/${body.rowId}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    invalidateScheduleStatics();
    return NextResponse.json({ ok: true });
  }

  const { studentId, subject = '', topic, action } = body;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  try {
    const mine = await rowsFor(studentId);
    const forSubject = (r: any) => (r.fields['Subject'] || '') === subject;
    const currentForSubject = mine.find((r: any) => r.fields['Current'] === true && forSubject(r));
    // A plan is a row that never started: no Started date, not Current.
    const plannedForSubject = mine.find((r: any) => !r.fields['Started'] && r.fields['Current'] !== true && forSubject(r));

    // Retire the current topic ahead of a replacement. A topic set TODAY is a
    // mis-pick being corrected (it produced the "24 Jul – 24 Jul" noise rows)
    // → delete it; anything older is real history → stamp Ended.
    const retireCurrent = async () => {
      if (!currentForSubject) return;
      if ((currentForSubject.fields['Started'] || '') === today) {
        await airtableRequest(TABLE, `/${currentForSubject.id}`, { method: 'DELETE' });
      } else {
        await airtableRequest(TABLE, `/${currentForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Ended: today, Current: false } }) });
      }
    };
    const done = () => { invalidateScheduleStatics(); return NextResponse.json({ ok: true }); };

    // ── Clear: end the current topic, create nothing ──
    if (action === 'clear') {
      await retireCurrent();
      return done();
    }

    // ── Plan: set/replace the "next lesson" topic (a row that hasn't started) ──
    if (action === 'plan') {
      if (!topic || !topic.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 });
      if (plannedForSubject) {
        await airtableRequest(TABLE, `/${plannedForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Topic: topic.trim() } }) });
      } else {
        await airtableRequest(TABLE, '', {
          method: 'POST',
          body: JSON.stringify({ fields: { Student: [studentId], Subject: subject, Topic: topic.trim() } }),
        });
      }
      return done();
    }

    // ── Start the planned topic now ──
    if (action === 'startPlanned') {
      if (!plannedForSubject) return NextResponse.json({ error: 'no planned topic' }, { status: 400 });
      await retireCurrent();
      await airtableRequest(TABLE, `/${plannedForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Started: today, Current: true } }) });
      return done();
    }

    // ── Advance to a new current topic ──
    if (!topic || !topic.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 });
    // Same topic already current → nothing to do.
    if (currentForSubject && (currentForSubject.fields['Topic'] || '') === topic.trim()) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    await retireCurrent();
    // Re-picking a topic that was ended TODAY = undoing a mis-pick — resurrect
    // the original row instead of splitting the topic's history in two.
    const endedTodaySame = mine.find((r: any) =>
      r.id !== currentForSubject?.id && forSubject(r) && r.fields['Current'] !== true
      && (r.fields['Ended'] || '') === today && (r.fields['Topic'] || '') === topic.trim());
    if (endedTodaySame) {
      await airtableRequest(TABLE, `/${endedTodaySame.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Ended: null, Current: true } }) });
      return done();
    }
    // Advancing into the topic that was planned for next lesson consumes the
    // plan (no duplicate row).
    if (plannedForSubject && (plannedForSubject.fields['Topic'] || '').trim() === topic.trim()) {
      await airtableRequest(TABLE, `/${plannedForSubject.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Started: today, Current: true } }) });
      return done();
    }
    await airtableRequest(TABLE, '', {
      method: 'POST',
      body: JSON.stringify({ fields: { Student: [studentId], Subject: subject, Topic: topic.trim(), Started: today, Current: true } }),
    });
    return done();
  } catch (e) {
    console.error('[topic-timeline] POST failed:', e);
    return NextResponse.json({ error: 'Failed to update timeline' }, { status: 500 });
  }
}
