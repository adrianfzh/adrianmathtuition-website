import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { restoreJuneRegularLessons } from '@/lib/revision-regular-lessons';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { studentId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { studentId } = body;
  if (!studentId) {
    return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
  }

  try {
    // ── Step 1: Find the revision invoice ─────────────────────────────────────
    const revisionFormula = encodeURIComponent(
      `AND({Month}='June 2026',{Invoice Type}='Revision Sprint',{Status}!='Voided')`
    );
    const revisionInvoices = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${revisionFormula}&fields[]=Student&fields[]=Status`
    );

    const revisionInvoice = revisionInvoices.records.find(
      (r: { fields: Record<string, unknown[]> }) => r.fields['Student']?.[0] === studentId
    );

    // ── Step 2: Find and cancel revision sprint lessons ────────────────────────
    // Filter by Type=Revision Sprint and Status != Cancelled in Airtable, match student in JS
    const lessonsFormula = encodeURIComponent(
      `AND({Type}='Revision Sprint',{Status}!='Cancelled')`
    );
    const lessonsData = await airtableRequestAll(
      'Lessons',
      `?filterByFormula=${lessonsFormula}&fields[]=Student&fields[]=Status&fields[]=Source%20Invoice`
    );

    const revisionLessons = lessonsData.records.filter(
      (r: { fields: Record<string, unknown[]> }) => r.fields['Student']?.[0] === studentId
    );

    // Cancel each lesson
    for (const lesson of revisionLessons) {
      await airtableRequest('Lessons', `/${lesson.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: 'Cancelled' } }),
      });
    }

    // ── Step 3: Void the revision invoice ─────────────────────────────────────
    if (revisionInvoice) {
      await airtableRequest('Invoices', `/${revisionInvoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: 'Voided' } }),
      });
    }

    // ── Step 4: Restore original June 2026 regular invoice ────────────────────
    const regularFormula = encodeURIComponent(
      `AND({Month}='June 2026',{Invoice Type}='Regular',{Status}='Voided')`
    );
    const regularInvoices = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${regularFormula}&fields[]=Student&fields[]=Status&fields[]=Adjustment%20Notes`
    );

    const regularInvoice = regularInvoices.records.find(
      (r: { fields: Record<string, unknown[]> }) => r.fields['Student']?.[0] === studentId
    );

    if (regularInvoice) {
      const adjustmentNotes: string = (regularInvoice.fields['Adjustment Notes'] as string) || '';
      // Extract original status from notes: "Original status: Draft; voided for..."
      const match = adjustmentNotes.match(/Original status:\s*([^;]+)/);
      const originalStatus = match ? match[1].trim() : 'Draft';

      await airtableRequest('Invoices', `/${regularInvoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            Status: originalStatus,
            'Adjustment Notes': '',
          },
        }),
      });
    }

    // ── Step 5: Restore the regular June lessons we cancelled at sign-up ───────
    let regularRestored = 0;
    try { regularRestored = await restoreJuneRegularLessons(studentId); }
    catch (e) { console.error('[admin-revision-revert] restore June regular failed:', e); }

    // ── Step 6: Reset student revision status ─────────────────────────────────
    await airtableRequest('Students', `/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'June Revision 2026': 'No Response' } }),
    });

    return NextResponse.json({ success: true, regularRestored });
  } catch (e: unknown) {
    console.error('[admin-revision-revert] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
