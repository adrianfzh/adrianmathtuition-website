import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const slotId       = sp.get('slotId')       || '';
  const level        = sp.get('level')        || '';
  const subjectsRaw  = sp.get('subjects')     || '';
  const subjectLevel = sp.get('subjectLevel') || '';
  const expires      = sp.get('expires')      || '';
  const sig          = sp.get('sig')          || '';

  if (!slotId || !level || !expires || !sig) {
    return NextResponse.json({ error: 'Invalid signup link.' }, { status: 400 });
  }

  if (Date.now() > parseInt(expires)) {
    return NextResponse.json({ error: 'This signup link has expired.' }, { status: 400 });
  }

  const check = new URLSearchParams();
  check.set('slotId', slotId);
  check.set('level', level);
  check.set('subjects', subjectsRaw);
  if (subjectLevel) check.set('subjectLevel', subjectLevel);
  check.set('expires', expires);
  const expectedSig = createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
    .update(check.toString()).digest('hex').slice(0, 16);

  if (sig !== expectedSig) {
    return NextResponse.json({ error: 'Invalid signup link.' }, { status: 400 });
  }

  const airtableToken = process.env.AIRTABLE_TOKEN;
  const baseId        = process.env.AIRTABLE_BASE_ID;
  if (!airtableToken || !baseId) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 500 });
  }

  try {
    const slotRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/Slots/${slotId}`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!slotRes.ok) return NextResponse.json({ error: 'Invalid slot.' }, { status: 400 });
    const slotData = await slotRes.json();
    const sf = slotData.fields;
    const dayRaw  = (sf['Day'] || '').replace(/^\d+\s+/, '').trim();
    const slotName = `${dayRaw} ${sf['Time'] || ''}`.trim();
    const slotTime = sf['Time'] || '';
    const subjects = subjectsRaw ? subjectsRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    return NextResponse.json({ level, subjects, subjectLevel, slotId, slotName, slotDay: dayRaw, slotTime });
  } catch (err) {
    console.error('signup-data error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
