import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import crypto from 'crypto';

export const runtime = 'nodejs';

function verifySignature(studentId: string, expires: number, sig: string): boolean {
  const secret = process.env.SIGNUP_SECRET;
  if (!secret) return false;
  const payload = `${studentId}:${expires}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  // constant-time compare
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function makeToken(len = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('student') || '';
  const expStr = searchParams.get('exp') || '';
  const sig = searchParams.get('sig') || '';

  if (!studentId || !expStr || !sig) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const expires = parseInt(expStr, 10);
  if (!Number.isFinite(expires)) {
    return NextResponse.json({ error: 'Invalid expiry' }, { status: 400 });
  }

  if (Date.now() > expires) {
    return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 });
  }

  if (!verifySignature(studentId, expires, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  try {
    // Look up student
    const student = await at('Students', `/${studentId}`);
    const studentName = student?.fields?.['Student Name'] || 'Student';

    // Reuse an active unexpired token if one exists (idempotent on repeat clicks)
    const nowIso = new Date().toISOString();
    const existingTokensRes = await at(
      'Tokens',
      `?filterByFormula=${encodeURIComponent(
        `AND({Status}='Active', IS_AFTER({Expires At}, '${nowIso}'))`
      )}&fields[]=Token&fields[]=Student&fields[]=Expires At&fields[]=Status`
    );
    const existing = (existingTokensRes.records || []).find(
      (r: any) => (r.fields['Student'] || [])[0] === studentId
    );

    let token: string;
    let expiresAt: string;

    if (existing) {
      token = existing.fields['Token'];
      expiresAt = existing.fields['Expires At'];
    } else {
      token = makeToken(8);
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await at('Tokens', '', {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            Token: token,
            Student: [studentId],
            'Expires At': expiresAt,
            Status: 'Active',
            'Created At': nowIso,
          },
        }),
      });
    }

    return NextResponse.json({
      studentName,
      token,
      expiresAt,
      botUsername: 'AdrianMathBot',
    });
  } catch (err: any) {
    console.error('[invoice-register] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
