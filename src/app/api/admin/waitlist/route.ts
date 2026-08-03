import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, fetchSecCapOverride } from '@/lib/schedule-helpers';
import { effectiveCapacity } from '@/lib/capacity-override';

export const runtime = 'nodejs';

// Web counterpart of the bot's /waitlist — same Airtable `Waitlist` table, so
// the 8am digest section and the 9am slot-opening cron pick up entries from
// either surface identically.
//
// GET  → { entries: [...], slots: [...] }   (all statuses; UI groups them)
// POST { name, contact?, parentContact?, level?, subjects?, slotId?, notes? }
// PATCH { id, status? , notes?, slotId? }

const TABLE = 'Waitlist';

function mapRec(r: any) {
  return {
    id: r.id,
    name: r.fields['Student Name'] || '',
    contact: r.fields['Contact'] || '',
    parentContact: r.fields['Parent Contact'] || '',
    slotId: r.fields['Preferred Slot']?.[0] || null,
    level: r.fields['Level'] || '',
    subjects: r.fields['Subjects'] || '',
    status: r.fields['Status'] || 'Waiting',
    notes: r.fields['Notes'] || '',
    added: r.fields['Added Date'] || null,
    notified: r.fields['Notified Date'] || null,
  };
}

async function activeSlots() {
  // The `Spots Remaining` FORMULA field knows nothing about the Sec-capacity
  // toggle, so when the override is on we recompute from Normal Capacity +
  // Enrolled Count (formula value kept as the fallback).
  const [data, secCap] = await Promise.all([
    airtableRequestAll('Slots',
      `?filterByFormula=${encodeURIComponent('{Is Active}=TRUE()')}&fields[]=Day&fields[]=Time&fields[]=Level&fields[]=Spots Remaining&fields[]=Normal Capacity&fields[]=Enrolled Count`),
    fetchSecCapOverride(),
  ]);
  return (data.records || []).map((r: any) => {
    const formulaSpots = typeof r.fields['Spots Remaining'] === 'number' ? r.fields['Spots Remaining'] : null;
    const eff = effectiveCapacity(r.fields['Normal Capacity'] ?? null, r.fields['Level'], secCap);
    const enrolled = typeof r.fields['Enrolled Count'] === 'number' ? r.fields['Enrolled Count'] : null;
    const spotsRemaining = secCap != null && eff != null && enrolled != null
      ? Math.max(0, eff - enrolled)
      : formulaSpots;
    return {
      id: r.id,
      label: `${String(r.fields['Day'] || '').replace(/^\d+\s+/, '')} ${r.fields['Time'] || ''} (${r.fields['Level'] || ''})`.trim(),
      spotsRemaining,
    };
  });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [data, slots] = await Promise.all([
      airtableRequestAll(TABLE, `?sort[0][field]=Added Date&sort[0][direction]=asc`),
      activeSlots(),
    ]);
    return NextResponse.json({ entries: (data.records || []).map(mapRec), slots });
  } catch (e) {
    console.error('[waitlist] GET failed:', e);
    return NextResponse.json({ error: 'Failed to load waitlist' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, contact, parentContact, level, subjects, slotId, notes } = await req.json().catch(() => ({}));
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  try {
    const fields: Record<string, any> = {
      'Student Name': String(name).trim(),
      Status: 'Waiting',
      'Added Date': new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
    };
    if (contact) fields['Contact'] = contact;
    if (parentContact) fields['Parent Contact'] = parentContact;
    if (level) fields['Level'] = level;
    if (subjects) fields['Subjects'] = subjects;
    if (slotId) fields['Preferred Slot'] = [slotId];
    if (notes) fields['Notes'] = notes;
    const rec = await airtableRequest(TABLE, '', { method: 'POST', body: JSON.stringify({ typecast: true, fields }) });
    return NextResponse.json({ ok: true, entry: mapRec(rec) });
  } catch (e) {
    console.error('[waitlist] POST failed:', e);
    return NextResponse.json({ error: 'Failed to add' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status, notes, slotId } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const fields: Record<string, any> = {};
    if (status !== undefined) fields['Status'] = status;
    if (notes !== undefined) fields['Notes'] = notes;
    if (slotId !== undefined) fields['Preferred Slot'] = slotId ? [slotId] : [];
    const rec = await airtableRequest(TABLE, `/${id}`, { method: 'PATCH', body: JSON.stringify({ typecast: true, fields }) });
    return NextResponse.json({ ok: true, entry: mapRec(rec) });
  } catch (e) {
    console.error('[waitlist] PATCH failed:', e);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
