// Ad-hoc (date-windowed) sessions — create, list, cancel.
//
// Adrian, 18 Aug 2026: "able to let me have the options of creating them in
// /schedule? allow me to set these lessons as Sec or JC level or mix, and
// allow me to change the max capacity". Before this the 19–20 Aug ad-hoc week
// was hand-built in Airtable, one Slot row at a time, then hand-windowed.
//
// An ad-hoc session is an ORDINARY Slot row plus an entry in the
// `slot_date_windows` Settings row. The Slots table is weekday-based and has
// no date fields, so one Slot is created per (weekday, time) and its window
// spans that weekday's own picked dates. Everything downstream — the admin
// calendar, the bot's student reschedule pickers — already honours windows.
//
// LEVEL is the existing Slots.Level singleSelect, so no schema write is
// needed: Sec → 'Secondary', JC → 'JC', Mix → 'Adhoc'. Picking 'Secondary' is
// exactly what makes the Sec class-size toggle apply, because effectiveCapacity()
// keys off that value — no capacity code is duplicated here.
//
// MAX STUDENTS writes Makeup Capacity: that is the number every booking check
// consults (add lesson, reschedule, the bot) and the one the Sec toggle lowers.
// Normal Capacity — advisory, enrollment-only — is set to the level's standard
// and never exceeds the max.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { invalidateScheduleStatics } from '@/lib/schedule-static-cache';
import { SEC_CAP_SETTING, parseSecCapOverride, effectiveCapacity } from '@/lib/capacity-override';
import {
  SLOT_WINDOWS_SETTING, SLOT_TIMES, LEVEL_DEFAULT_CAPACITY, isSlotLevel,
  parseSlotWindows, serializeSlotWindows, mergeSlotWindows,
  dayFieldForDate, windowOccurrences, slotVisibleInWeek,
  type SlotLevel, type SlotWindow,
} from '@/lib/slot-windows';

export const runtime = 'nodejs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STUDENTS_LIMIT = 12;

type SettingsRow = { id: string; value: string | null } | null;

async function fetchSetting(name: string): Promise<SettingsRow> {
  const data = await airtableRequest(
    'Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='${name}'`)}&maxRecords=1`
  );
  const rec = data.records?.[0];
  return rec ? { id: rec.id, value: rec.fields['Value'] ?? null } : null;
}

/** Write the windows map back, creating the Settings row on first use. */
async function saveWindows(row: SettingsRow, windows: Record<string, SlotWindow>) {
  const valueJson = serializeSlotWindows(windows);
  if (row) {
    await airtableRequest('Settings', `/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Value: valueJson } }),
    });
  } else {
    await airtableRequest('Settings', '', {
      method: 'POST',
      body: JSON.stringify({ fields: {
        'Setting Name': SLOT_WINDOWS_SETTING,
        Value: valueJson,
        Notes: 'Ad-hoc session date windows: {"recSlotId":{"from":"YYYY-MM-DD","until":"YYYY-MM-DD"}}. A slot listed here runs ONLY on those dates and is never part of the weekly timetable. Managed from /admin/schedule → ⚡ Ad-hoc.',
      } }),
    });
  }
}

/** Every active slot, with the fields both the collision check and the list need. */
async function fetchActiveSlots() {
  const data = await airtableRequestAll(
    'Slots',
    `?filterByFormula=${encodeURIComponent('{Is Active}=TRUE()')}`
  );
  return data.records as any[];
}

function describeSlot(rec: any, win: SlotWindow | undefined, secCap: number | null) {
  const day = rec.fields['Day'] || '';
  const level: string = rec.fields['Level'] || '';
  const storedMakeup = rec.fields['Makeup Capacity'] ?? null;
  return {
    id: rec.id,
    day,
    dayLabel: day.replace(/^\d+\s+/, ''),
    time: rec.fields['Time'] || '',
    level,
    maxStudents: storedMakeup,
    // What a booking check will actually enforce today — the Sec toggle lowers
    // this for Secondary sessions, so the UI can say "5 (Sec cap)" honestly.
    effectiveMax: effectiveCapacity(storedMakeup, level, secCap),
    normalCapacity: rec.fields['Normal Capacity'] ?? null,
    window: win ?? null,
    dates: windowOccurrences(win, day),
    // Slots.Lessons is a link field, so this costs no extra query. Used to warn
    // before cancelling a session students have already been booked into.
    lessonCount: (rec.fields['Lessons'] || []).length,
  };
}

// ── GET: the dated sessions that exist right now ────────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [windowsRow, secCapRow, slots] = await Promise.all([
      fetchSetting(SLOT_WINDOWS_SETTING),
      fetchSetting(SEC_CAP_SETTING),
      fetchActiveSlots(),
    ]);
    const windows = parseSlotWindows(windowsRow?.value ?? null);
    const secCap = parseSecCapOverride(secCapRow?.value ?? null);

    const sessions = slots
      .filter((r) => windows[r.id])
      .map((r) => describeSlot(r, windows[r.id], secCap))
      // Soonest first, so the list reads like a diary.
      .sort((a, b) => (a.window?.from || '').localeCompare(b.window?.from || '')
        || a.time.localeCompare(b.time));

    return NextResponse.json({ sessions, secCap, today: localToday() });
  } catch (err: any) {
    console.error('[adhoc-slots GET]', err?.message);
    return NextResponse.json({ error: 'Failed to load ad-hoc sessions' }, { status: 500 });
  }
}

// ── POST: create one session per (weekday, time) ────────────────────────────
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { dates?: string[]; times?: string[]; level?: string; maxStudents?: number; force?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const dates = [...new Set((body.dates || []).filter((d) => typeof d === 'string' && ISO_DATE.test(d)))].sort();
  const times = [...new Set((body.times || []).filter((t) => (SLOT_TIMES as readonly string[]).includes(t)))];
  const level = body.level;
  const maxStudents = body.maxStudents;

  if (!dates.length) return NextResponse.json({ error: 'Pick at least one date' }, { status: 400 });
  if (!times.length) return NextResponse.json({ error: 'Pick at least one time slot' }, { status: 400 });
  if (!isSlotLevel(level)) return NextResponse.json({ error: 'Level must be Secondary, JC or Adhoc' }, { status: 400 });
  if (!Number.isInteger(maxStudents) || (maxStudents as number) < 1 || (maxStudents as number) > MAX_STUDENTS_LIMIT) {
    return NextResponse.json({ error: `Max students must be a whole number between 1 and ${MAX_STUDENTS_LIMIT}` }, { status: 400 });
  }
  // Airtable rejects an unknown Day option, and a date typo is easier to spot
  // here than as a half-created batch.
  const dayByDate = new Map<string, string>();
  for (const d of dates) {
    const day = dayFieldForDate(d);
    if (!day) return NextResponse.json({ error: `Unrecognised date: ${d}` }, { status: 400 });
    dayByDate.set(d, day);
  }

  const typedLevel = level as SlotLevel;
  const cap = maxStudents as number;

  try {
    const [windowsRow, existingSlots] = await Promise.all([
      fetchSetting(SLOT_WINDOWS_SETTING),
      fetchActiveSlots(),
    ]);
    const windows = parseSlotWindows(windowsRow?.value ?? null);

    // One slot per weekday × time. Window = that weekday's own picked dates.
    const planned = [...new Set([...dayByDate.values()])].sort().flatMap((day) => {
      const forDay = dates.filter((d) => dayByDate.get(d) === day);
      const win: SlotWindow = { from: forDay[0], until: forDay[forDay.length - 1] };
      return times.map((time) => ({ day, time, win, picked: forDay }));
    });

    // Adrian teaches in one room, so an existing class at the same day+time is
    // almost always a mistake — surface it and let him tick through knowingly
    // rather than silently double-booking the room.
    const collisions = planned.flatMap(({ day, time, win }) =>
      existingSlots
        .filter((r) => {
          if (r.fields['Day'] !== day || r.fields['Time'] !== time) return false;
          // An existing DATED slot only clashes if its dates actually overlap.
          const other = windows[r.id];
          if (!other) return true;
          return slotVisibleInWeek(other, win.from as string, win.until as string);
        })
        .map((r) => ({
          id: r.id,
          day: day.replace(/^\d+\s+/, ''),
          time,
          level: r.fields['Level'] || '',
          dated: Boolean(windows[r.id]),
        }))
    );
    if (collisions.length && !body.force) {
      return NextResponse.json({
        error: 'There is already a class at that time',
        collisions,
      }, { status: 409 });
    }

    // Create the Slot rows, then window them in one Settings write. If a create
    // fails partway the rows made so far are still windowed below, so nothing
    // is left as a permanent weekly slot.
    const created: { id: string; day: string; time: string; win: SlotWindow }[] = [];
    let createError: string | null = null;
    for (const { day, time, win } of planned) {
      try {
        const rec = await airtableRequest('Slots', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            Day: day,
            Time: time,
            Level: typedLevel,
            'Normal Capacity': Math.min(LEVEL_DEFAULT_CAPACITY[typedLevel].normal, cap),
            'Makeup Capacity': cap,
            'Is Active': true,
          } }),
        });
        created.push({ id: rec.id, day, time, win });
      } catch (err: any) {
        createError = err?.message || 'Airtable rejected a slot';
        break;
      }
    }

    if (created.length) {
      const updates: Record<string, SlotWindow> = {};
      for (const c of created) updates[c.id] = c.win;
      await saveWindows(windowsRow, mergeSlotWindows(windows, updates));
      invalidateScheduleStatics();
    }

    if (createError) {
      return NextResponse.json({
        error: `Created ${created.length} of ${planned.length} sessions, then failed: ${createError}`,
        created: created.length,
      }, { status: 500 });
    }

    return NextResponse.json({
      created: created.length,
      sessions: created.map((c) => ({
        id: c.id,
        day: c.day.replace(/^\d+\s+/, ''),
        time: c.time,
        dates: windowOccurrences(c.win, c.day),
      })),
      level: typedLevel,
      maxStudents: cap,
    });
  } catch (err: any) {
    console.error('[adhoc-slots POST]', err?.message);
    return NextResponse.json({ error: 'Failed to create ad-hoc sessions' }, { status: 500 });
  }
}

// ── DELETE: cancel one session ──────────────────────────────────────────────
// Deactivates the slot and drops its window entry. Lessons already booked into
// it keep rendering on the calendar — /api/admin-schedule re-fetches any slot a
// week's lessons reference (extraSlotIds) — so this never orphans a booking.
export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { slotId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const slotId = body.slotId;
  if (!slotId) return NextResponse.json({ error: 'slotId is required' }, { status: 400 });

  try {
    const windowsRow = await fetchSetting(SLOT_WINDOWS_SETTING);
    const windows = parseSlotWindows(windowsRow?.value ?? null);
    // Only ever touch a DATED slot — a bad id must never deactivate a weekly
    // class and quietly empty the timetable.
    if (!windows[slotId]) {
      return NextResponse.json({ error: 'Not an ad-hoc session — refusing to deactivate' }, { status: 400 });
    }

    await airtableRequest('Slots', `/${slotId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Is Active': false } }),
    });
    await saveWindows(windowsRow, mergeSlotWindows(windows, { [slotId]: null }));
    invalidateScheduleStatics();

    return NextResponse.json({ removed: slotId });
  } catch (err: any) {
    console.error('[adhoc-slots DELETE]', err?.message);
    return NextResponse.json({ error: 'Failed to remove the session' }, { status: 500 });
  }
}
