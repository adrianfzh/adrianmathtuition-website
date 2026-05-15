// GET /api/admin-invoices/referral-status
// Returns referred students who have reached 12 lessons but reward not yet applied.
// Used to show pending referral warnings on the invoices page.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch referred students where reward not yet applied
  const formula = encodeURIComponent(`AND({How Heard}='Referral',NOT({Referral Reward Applied}),{Status}='Active')`);
  const students = await airtableRequestAll('Students',
    `?filterByFormula=${formula}&fields[]=Student Name&fields[]=Referred By Name&fields[]=Referral Type`
  );

  if (!students.records.length) return NextResponse.json({ pending: [] });

  // Count completed lessons in JS (can't filter linked records by ID in Airtable)
  const allCompleted = await airtableRequestAll('Lessons',
    `?filterByFormula=${encodeURIComponent(`AND({Status}='Completed',{Type}!='Trial')`)}&fields[]=Student`
  );
  const lessonsByStudent: Record<string, number> = {};
  for (const r of allCompleted.records) {
    const sid = r.fields['Student']?.[0];
    if (sid) lessonsByStudent[sid] = (lessonsByStudent[sid] || 0) + 1;
  }

  // Fetch all active students for fuzzy matching
  const allActive = await airtableRequestAll('Students',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student Name`
  );

  const pending = [];
  for (const s of students.records) {
    const count = lessonsByStudent[s.id] || 0;
    const referrerName = (s.fields['Referred By Name'] || '') as string;
    const referralType = (s.fields['Referral Type'] || '') as string;

    // Only flag if 12+ lessons (eligible) or close (8+)
    if (count < 8) continue;

    let matchedName = '';
    let matchConfidence = 'none';
    // No name given: flag for follow-up (show in banner even without matching)
    if (referralType === 'Current Student' && !referrerName) {
      pending.push({
        studentId: s.id,
        studentName: s.fields['Student Name'] || '',
        referrerNameGiven: '',
        referralType,
        lessonsCompleted: count,
        eligible: count >= 12,
        matchedReferrer: '',
        matchConfidence: 'none',
      });
      continue;
    }
    if (referralType === 'Current Student' && referrerName) {
      const nl = referrerName.toLowerCase().trim();
      for (const a of allActive.records) {
        const name = ((a.fields['Student Name'] || '') as string).toLowerCase();
        if (name === nl) { matchedName = a.fields['Student Name'] as string; matchConfidence = 'exact'; break; }
        if (!matchedName) {
          const rw = nl.split(/\s+/);
          const nw = name.split(/\s+/);
          if (rw.filter((w: string) => w.length > 1 && nw.includes(w)).length >= 1) {
            matchedName = a.fields['Student Name'] as string;
            matchConfidence = 'fuzzy';
          }
        }
      }
    }

    pending.push({
      studentId: s.id,
      studentName: s.fields['Student Name'] || '',
      referrerNameGiven: referrerName,
      referralType,
      lessonsCompleted: count,
      eligible: count >= 12,
      matchedReferrer: matchedName,
      matchConfidence,
    });
  }

  // Also fetch cash referrals that are applied but not yet marked cash-paid
  // These are non-current-student referrals where Referral Reward Applied = true
  // but Referral Cash Paid is not set.
  const cashFormula = encodeURIComponent(`AND({How Heard}='Referral',{Referral Reward Applied}=TRUE(),NOT({Referral Cash Paid}),{Status}='Active',{Referral Type}!='Current Student')`);
  const cashPending = await airtableRequestAll('Students',
    `?filterByFormula=${cashFormula}&fields[]=Student Name&fields[]=Referred By Name&fields[]=Referral Type`
  );
  const pendingCash = cashPending.records.map((r: any) => ({
    studentId: r.id,
    studentName: r.fields['Student Name'] || '',
    referrerNameGiven: r.fields['Referred By Name'] || '',
    referralType: r.fields['Referral Type'] || '',
    type: 'cash_unpaid',
  }));

  return NextResponse.json({
    pending: pending.sort((a, b) => b.lessonsCompleted - a.lessonsCompleted),
    pendingCash,
  });
}
