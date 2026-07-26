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
// MULTIPLE topics may be current at once, and multiple may be planned
// (Adrian 2026-07-25): 'add' starts another current topic alongside the
// existing ones; each chip retires individually via 'end'.
//
// GET  ?studentId=recXXX           → { rows: [...] } sorted by Started
// POST { studentId, subject, topic }         → REPLACE current topic(s) (legacy advance; assistant/voice path)
// POST { studentId, subject, topic, action:'add' }   → add another current topic (keeps existing)
// POST { studentId, subject, action:'end', rowId }   → end ONE current topic (delete if started today)
// POST { studentId, subject, topic, action:'plan' }  → add a planned next-lesson topic
// POST { studentId, subject, action:'startPlanned', rowId? } → start a planned topic (keeps other currents)
// POST { studentId, action:'autoStartPlanned' } → promote ALL planned rows (any subject);
//        called when the sheet opens on a TODAY lesson — planned topics
//        automatically become the day's work (Adrian 2026-07-26)
// POST { studentId, subject, action:'clear' } → end ALL current topics for the subject
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
  // ('end' and 'startPlanned' also carry rowId but are handled below with
  // student context.)
  if (body.rowId && (!body.action || body.action === 'delete')) {
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
    // MULTIPLE topics may be current / planned at once.
    const currentsForSubject = mine.filter((r: any) => r.fields['Current'] === true && forSubject(r));
    // A plan is a row that never started: no Started date, not Current.
    const plannedsForSubject = mine.filter((r: any) => !r.fields['Started'] && r.fields['Current'] !== true && forSubject(r));

    // Retire one row: a topic set TODAY is a mis-pick being corrected (it
    // produced the "24 Jul – 24 Jul" noise rows) → delete it; anything older
    // is real history → stamp Ended.
    const retireRow = async (row: any) => {
      if ((row.fields['Started'] || '') === today) {
        await airtableRequest(TABLE, `/${row.id}`, { method: 'DELETE' });
      } else {
        await airtableRequest(TABLE, `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Ended: today, Current: false } }) });
      }
    };
    const done = () => { invalidateScheduleStatics(); return NextResponse.json({ ok: true }); };
    // Flip a planned/ended row back into a live current topic.
    const startRow = (id: string) =>
      airtableRequest(TABLE, `/${id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Started: today, Current: true, Ended: null } }) });

    // ── Auto-start: promote ALL planned rows (any subject) to current.
    // Fired when the sheet opens on a TODAY lesson; idempotent (after
    // promotion no planned rows remain). Returns the promoted topic names
    // so the client can toast what just happened.
    if (action === 'autoStartPlanned') {
      const allPlanned = mine.filter((r: any) => !r.fields['Started'] && r.fields['Current'] !== true);
      for (const row of allPlanned) await startRow(row.id);
      if (allPlanned.length) invalidateScheduleStatics();
      return NextResponse.json({ ok: true, promoted: allPlanned.map((r: any) => r.fields['Topic'] || '').filter(Boolean) });
    }

    // ── End: one specific current topic (its chip's ✕) ──
    if (action === 'end') {
      const row = mine.find((r: any) => r.id === body.rowId);
      if (row) await retireRow(row);
      return done();
    }

    // ── Clear: end ALL current topics for the subject, create nothing ──
    if (action === 'clear') {
      for (const row of currentsForSubject) await retireRow(row);
      return done();
    }

    // ── Plan: ADD a "next lesson" topic (a row that hasn't started) ──
    if (action === 'plan') {
      if (!topic || !topic.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 });
      if (plannedsForSubject.some((r: any) => (r.fields['Topic'] || '').trim() === topic.trim())) {
        return NextResponse.json({ ok: true, unchanged: true });
      }
      await airtableRequest(TABLE, '', {
        method: 'POST',
        body: JSON.stringify({ fields: { Student: [studentId], Subject: subject, Topic: topic.trim() } }),
      });
      return done();
    }

    // ── Start a planned topic now (alongside any other current topics) ──
    if (action === 'startPlanned') {
      const row = body.rowId ? mine.find((r: any) => r.id === body.rowId) : plannedsForSubject[0];
      if (!row) return NextResponse.json({ error: 'no planned topic' }, { status: 400 });
      await startRow(row.id);
      return done();
    }

    if (!topic || !topic.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 });
    const sameCurrent = currentsForSubject.some((r: any) => (r.fields['Topic'] || '').trim() === topic.trim());

    // ── Add: another current topic alongside the existing ones ──
    if (action === 'add') {
      if (sameCurrent) return NextResponse.json({ ok: true, unchanged: true });
      // Re-adding a topic ended TODAY = undoing a mis-removal — resurrect it.
      const endedTodaySame = mine.find((r: any) =>
        forSubject(r) && r.fields['Current'] !== true
        && (r.fields['Ended'] || '') === today && (r.fields['Topic'] || '').trim() === topic.trim());
      if (endedTodaySame) { await startRow(endedTodaySame.id); return done(); }
      // Adding the topic that was planned consumes the plan (no duplicate row).
      const plannedSame = plannedsForSubject.find((r: any) => (r.fields['Topic'] || '').trim() === topic.trim());
      if (plannedSame) { await startRow(plannedSame.id); return done(); }
      await airtableRequest(TABLE, '', {
        method: 'POST',
        body: JSON.stringify({ fields: { Student: [studentId], Subject: subject, Topic: topic.trim(), Started: today, Current: true } }),
      });
      return done();
    }

    // ── Advance (legacy default — assistant/voice path): REPLACE current topic(s) ──
    if (sameCurrent && currentsForSubject.length === 1) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    for (const row of currentsForSubject) {
      if ((row.fields['Topic'] || '').trim() !== topic.trim()) await retireRow(row);
    }
    if (sameCurrent) return done(); // kept the matching row, retired the rest
    // Re-picking a topic that was ended TODAY = undoing a mis-pick — resurrect
    // the original row instead of splitting the topic's history in two.
    const endedTodaySame = mine.find((r: any) =>
      forSubject(r) && r.fields['Current'] !== true
      && (r.fields['Ended'] || '') === today && (r.fields['Topic'] || '').trim() === topic.trim());
    if (endedTodaySame) { await startRow(endedTodaySame.id); return done(); }
    // Advancing into the topic that was planned for next lesson consumes the plan.
    const plannedSame = plannedsForSubject.find((r: any) => (r.fields['Topic'] || '').trim() === topic.trim());
    if (plannedSame) { await startRow(plannedSame.id); return done(); }
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
