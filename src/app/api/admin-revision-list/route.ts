import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch active Sec 4 and JC2 students
    const studentFormula = encodeURIComponent(
      `AND({Status}='Active',OR({Level}='Sec 4',{Level}='JC2'))`
    );
    const studentsData = await airtableRequestAll(
      'Students',
      `?filterByFormula=${studentFormula}&fields[]=Student%20Name&fields[]=Level&fields[]=Parent%20Name&fields[]=Parent%20Contact&fields[]=Parent%20Email&fields[]=Subjects&fields[]=June%20Revision%202026`
    );

    // Fetch all June 2026 Revision Sprint invoices (match student in JS)
    const invoiceFormula = encodeURIComponent(
      `AND({Month}='June 2026',{Invoice Type}='Revision Sprint')`
    );
    const invoicesData = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${invoiceFormula}&fields[]=Student&fields[]=Final%20Amount&fields[]=Status&fields[]=Line%20Items`
    );

    // Build a map: studentId -> revision invoice
    const revisionInvoiceMap = new Map<string, { id: string; amount: number; lineItems: unknown[]; status: string }>();
    for (const inv of invoicesData.records) {
      const studentId = inv.fields['Student']?.[0];
      if (!studentId) continue;
      // Skip voided invoices when building the map
      if (inv.fields['Status'] === 'Voided') continue;
      let lineItems: unknown[] = [];
      try {
        lineItems = JSON.parse(inv.fields['Line Items'] || '[]');
      } catch {
        // ignore parse errors
      }
      revisionInvoiceMap.set(studentId, {
        id: inv.id,
        amount: inv.fields['Final Amount'] ?? 0,
        lineItems,
        status: (inv.fields['Status'] || 'Draft') as string,
      });
    }

    // Build student list
    const students = studentsData.records.map(r => {
      const studentId = r.id;
      const revStatus: string = r.fields['June Revision 2026'] || 'No Response';

      // Subjects from Students table
      let subjects: string[] = [];
      const rawSubjects = r.fields['Subjects'];
      if (Array.isArray(rawSubjects)) {
        subjects = rawSubjects;
      } else if (typeof rawSubjects === 'string') {
        subjects = rawSubjects.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      // Revision invoice data
      const revInvoice = revisionInvoiceMap.get(studentId);
      let revisionSubjects: string[] = [];
      let revisionTotal = 0;
      let revisionInvoiceId: string | null = null;
      let revisionInvoiceStatus: string | null = null;

      if (revInvoice) {
        revisionInvoiceId = revInvoice.id;
        revisionTotal = revInvoice.amount;
        revisionInvoiceStatus = revInvoice.status;
        // Parse subjects from line items
        const lineItems = revInvoice.lineItems as Array<{ description?: string }>;
        for (const item of lineItems) {
          const desc = item.description || '';
          if (desc.includes('E Math') || desc.includes('EM')) revisionSubjects.push('EM');
          else if (desc.includes('A Math') || desc.includes('AM')) revisionSubjects.push('AM');
          else if (desc.includes('H2') || desc.includes('JC')) revisionSubjects.push('JC');
        }
      }

      return {
        id: studentId,
        name: r.fields['Student Name'] || '',
        level: r.fields['Level'] as 'Sec 4' | 'JC2',
        parentName: r.fields['Parent Name'] || '',
        parentContact: r.fields['Parent Contact'] || '',
        parentEmail: r.fields['Parent Email'] || '',
        subjects,
        revisionStatus: (revStatus === 'No Response' || revStatus === 'Signed Up' || revStatus === 'Opted Out')
          ? revStatus as 'No Response' | 'Signed Up' | 'Opted Out'
          : 'No Response',
        revisionSubjects,
        revisionTotal,
        revisionInvoiceId,
        revisionInvoiceStatus,
      };
    });

    // Sort: No Response first, then Signed Up, then Opted Out; within each group alphabetically
    const statusOrder: Record<string, number> = { 'No Response': 0, 'Signed Up': 1, 'Opted Out': 2 };
    students.sort((a, b) => {
      const so = statusOrder[a.revisionStatus] - statusOrder[b.revisionStatus];
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ students });
  } catch (e: unknown) {
    console.error('[admin-revision-list] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
