import { NextResponse } from 'next/server';

const DAY_MAP: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

export async function GET() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    return NextResponse.json({ error: 'Missing Airtable credentials' }, { status: 500 });
  }

  try {
    const params = new URLSearchParams();
    params.set('filterByFormula', '{Is Active}=TRUE()');
    ['Day', 'Time', 'Level', 'Normal Capacity', 'Enrolled Count'].forEach(f => {
      params.append('fields[]', f);
    });

    const url = `https://api.airtable.com/v0/${baseId}/Slots?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Airtable API error' }, { status: 502 });
    }

    const data = await res.json();
    const slots = data.records.map((record: { fields: Record<string, unknown> }) => {
      const f = record.fields;
      const dayRaw = (f['Day'] as string) || '';
      const dayWord = dayRaw.replace(/^\d+\s+/, '');
      const day = DAY_MAP[dayWord] || dayWord;
      const level = (f['Level'] as string) || '';
      const type = level === 'Secondary' ? 'Sec' : level;
      return {
        day,
        time: (f['Time'] as string) || '',
        type,
        filled: (f['Enrolled Count'] as number) || 0,
        capacity: (f['Normal Capacity'] as number) || 4,
      };
    });

    return NextResponse.json({ slots }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
