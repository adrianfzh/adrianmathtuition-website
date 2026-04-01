import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const sanitize = (str: unknown) => String(str || '').trim().replace(/[<>]/g, '').slice(0, 500);

const LEVEL_MAP: Record<string, string> = {
  Sec1: 'Sec 1', Sec2: 'Sec 2', Sec3: 'Sec 3',
  Sec4: 'Sec 4', Sec5: 'Sec 5', JC1: 'JC1', JC2: 'JC2',
};

async function airtableRequest(baseId: string, token: string, tableName: string, path: string, options: RequestInit = {}) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Airtable error [${tableName}${path}]: ${JSON.stringify(data)}`);
  return data;
}

export async function POST(request: NextRequest) {
  const airtableToken = process.env.AIRTABLE_TOKEN || '';
  const baseId        = process.env.AIRTABLE_BASE_ID || '';

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /**/ }

  const {
    slotId, level: rawLevel, subjects: subjectsParam, subjectLevel: subjectLevelParam,
    expires, sig, studentName, school, studentContact,
    parentName, parentContact, parentEmail, startDate, howHeard, referralType, referredBy,
  } = body;

  if (!slotId || !expires || !sig || !studentName || !parentName || !parentContact || !parentEmail || !startDate || !howHeard) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const at = (table: string, path: string, opts?: RequestInit) =>
    airtableRequest(baseId, airtableToken, table, path, opts);

  try {
    // Step 1: Validate HMAC
    const check = new URLSearchParams();
    check.set('slotId', String(slotId || ''));
    check.set('level', String(rawLevel || ''));
    check.set('subjects', String(subjectsParam || ''));
    if (subjectLevelParam) check.set('subjectLevel', String(subjectLevelParam));
    check.set('expires', String(expires || ''));
    const expectedSig = createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
      .update(check.toString()).digest('hex').slice(0, 16);
    if (sig !== expectedSig || Date.now() > parseInt(String(expires))) {
      return NextResponse.json({ error: 'Invalid or expired signup link.' }, { status: 400 });
    }

    const level = LEVEL_MAP[String(rawLevel)] || String(rawLevel);
    const subjectLevel = String(subjectLevelParam || '');
    const subjects = subjectsParam
      ? String(subjectsParam).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const slotIds = slotId ? [String(slotId)] : [];

    // Step 2: Create Student
    const studentFields: Record<string, unknown> = {
      'Student Name': sanitize(studentName),
      'Level': level,
      'Subject Level': subjectLevel,
      'Subjects': subjects,
      'Parent Name': sanitize(parentName),
      'Parent Contact': sanitize(parentContact),
      'Parent Email': sanitize(parentEmail),
      'Status': 'Active',
      'Join Date': startDate,
      'How Heard': sanitize(howHeard),
    };
    if (school) studentFields['School'] = sanitize(school);
    if (studentContact) studentFields['Student Contact'] = sanitize(studentContact);
    if (referralType) studentFields['Referral Type'] = sanitize(referralType);
    if (referredBy) studentFields['Referred By Name'] = sanitize(referredBy);

    const studentRecord = await at('Students', '', {
      method: 'POST',
      body: JSON.stringify({ fields: studentFields }),
    });
    const studentId = studentRecord.id;

    // Step 2b: Create registration token (non-fatal)
    let registrationToken: string | null = null;
    try {
      const tokenValue = Array.from({ length: 8 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
      ).join('');
      await at('Tokens', '', {
        method: 'POST',
        body: JSON.stringify({ fields: {
          Token: tokenValue,
          Student: [studentId],
          'Expires At': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          Status: 'Active',
          'Created At': new Date().toISOString(),
        }}),
      });
      registrationToken = tokenValue;
    } catch (err) {
      console.error('[signup] Token creation failed (non-fatal):', (err as Error).message);
    }

    // Step 3: Find Rate (non-fatal)
    let rateId: string | null = null;
    let ratePerLesson: number | null = null;
    let rateType: string | null = null;
    try {
      const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
      const rateParams = new URLSearchParams();
      rateParams.set('filterByFormula', `AND({Level}='${rateLevel}', {Is Current}=1)`);
      rateParams.set('maxRecords', '1');
      const rateData = await at('Rates', `?${rateParams.toString()}`);
      if (rateData.records?.length > 0) {
        const rec = rateData.records[0];
        rateId = rec.id;
        ratePerLesson = rec.fields['Amount'] ? rec.fields['Amount'] / 4 : null;
        rateType = 'Current';
      }
    } catch (err) {
      console.error('[signup] Rate lookup failed (non-fatal):', (err as Error).message);
    }

    // Step 4: Create Enrollment
    let enrollmentId: string | null = null;
    try {
      const enrollmentFields: Record<string, unknown> = {
        'Student': [studentId],
        'Subjects In This Slot': subjects,
        'Start Date': startDate,
        'Status': 'Active',
      };
      if (slotIds.length) enrollmentFields['Slot'] = slotIds;
      if (ratePerLesson !== null) enrollmentFields['Rate Per Lesson'] = ratePerLesson;
      if (rateType) enrollmentFields['Rate Type'] = rateType;

      const enrollmentRecord = await at('Enrollments', '', {
        method: 'POST',
        body: JSON.stringify({ fields: enrollmentFields }),
      });
      enrollmentId = enrollmentRecord.id;
    } catch (err) {
      console.error('[signup] Enrollment creation failed:', (err as Error).message);
      return NextResponse.json({
        error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId})`,
        partialSuccess: true,
      }, { status: 500 });
    }

    // Step 5: Create Rate History
    if (rateId) {
      try {
        await at('Rate History', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            'Student': [studentId],
            'Rate': [rateId],
            'Effective From': startDate,
          }}),
        });
      } catch (err) {
        console.error('[signup] Rate History failed:', (err as Error).message);
        return NextResponse.json({
          error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId}, Enrollment ${enrollmentId})`,
          partialSuccess: true,
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      studentName: sanitize(studentName),
      startDate,
      registrationToken,
    });
  } catch (error) {
    console.error('[signup] Unhandled error:', error);
    return NextResponse.json({
      error: 'Something went wrong. Please try again or contact Adrian directly via WhatsApp.',
    }, { status: 500 });
  }
}
