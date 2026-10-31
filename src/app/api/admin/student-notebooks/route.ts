// GET /api/admin/student-notebooks?studentId=<rec…>  (admin)
//   → { notebooks: [{ id, title, updatedAt, pageCount, pages: [{ n, url, verdict, summary }] }] }
//
// 📓 The student's Notebook iPad app notebooks on their profile (SPEC-STUDENT-APP.md §0e,
// 31 Oct 2026, Adrian: "yes" to seeing a student's notebook before a lesson). Read-only: the
// backed-up copies (lib/app-notebooks.ts), each written page as the picture the app sent,
// served through /api/files (admin may read any student file).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { notebookFileKey, writtenPages, type Manifest } from '@/lib/app-notebooks';
import { downloadStudentFile, fileHref, fileUrl } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId') || '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'bad studentId' }, { status: 400 });

  const { data: rows, error } = await createServiceClient().from('app_notebooks')
    .select('notebook_id, title, updated_at, manifest')
    .eq('identity', studentId).is('deleted_at', null)
    .order('updated_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notebooks = await Promise.all((rows || []).map(async r => {
    const id = String(r.notebook_id).toUpperCase();
    let details: unknown = null;
    try {
      details = JSON.parse(await (await downloadStudentFile(notebookFileKey(studentId, id, 'notebook.json'))).text());
    } catch { /* listed without pages */ }
    const pages = writtenPages(details, r.manifest as Manifest).map(p => ({
      n: p.n, verdict: p.verdict, summary: p.summary,
      url: fileHref(fileUrl(notebookFileKey(studentId, id, p.picture))),
    }));
    const pageCount = Array.isArray((details as { pages?: unknown[] } | null)?.pages) ? (details as { pages: unknown[] }).pages.length : 0;
    return { id, title: r.title, updatedAt: r.updated_at, pageCount, pages };
  }));
  return NextResponse.json({ notebooks });
}
