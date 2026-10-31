// GET /api/app/notebooks  (Authorization: Bearer <app access token>)
//   → { notebooks: [{ id, title, updatedAt, deleted }], folders, foldersUpdatedAt }
// PUT /api/app/notebooks  { folders: [{ id, name, createdAt }] }  → { updatedAt }: the student's subjects
//
// ☁️ Notebook backup for the Notebook iPad app (SPEC-STUDENT-APP.md §0d, 31 Oct 2026).
// The list a device compares with its own on opening; lib/app-notebooks.ts has the model.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { backupCaller } from '@/lib/app-notebooks-server';
import { parseFolders } from '@/lib/app-notebooks';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const who = await backupCaller(req);
  if (!who.ok) return who.res;
  const db = createServiceClient();
  const [{ data: rows, error }, { data: f }] = await Promise.all([
    db.from('app_notebooks').select('notebook_id, title, updated_at, deleted_at').eq('user_id', who.account.id),
    db.from('app_notebook_folders').select('folders, updated_at').eq('user_id', who.account.id).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: 'Couldn’t load your notebooks.' }, { status: 500 });
  return NextResponse.json({
    notebooks: (rows || []).map(r => ({
      id: String(r.notebook_id).toUpperCase(),
      title: r.title,
      updatedAt: new Date(r.updated_at).getTime() / 1000,
      deleted: !!r.deleted_at,
    })),
    folders: f?.folders ?? null,
    foldersUpdatedAt: f ? new Date(f.updated_at).getTime() / 1000 : null,
  });
}

export async function PUT(req: Request) {
  const who = await backupCaller(req);
  if (!who.ok) return who.res;
  const parsed = parseFolders(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const now = new Date();
  const { error } = await createServiceClient().from('app_notebook_folders').upsert({
    user_id: who.account.id, identity: who.identity, folders: parsed.folders, updated_at: now.toISOString(),
  });
  if (error) return NextResponse.json({ error: 'Couldn’t save your subjects.' }, { status: 500 });
  return NextResponse.json({ ok: true, updatedAt: now.getTime() / 1000 });
}
