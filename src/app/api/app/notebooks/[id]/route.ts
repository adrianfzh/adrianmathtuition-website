// /api/app/notebooks/<notebook-id>  (Authorization: Bearer <app access token>)
//   POST { step: 'prepare', files: [{ path, size, sha256 }] }
//        → { send: [{ path, url }] }  — the app PUTs each changed file straight to its url
//   POST { step: 'commit', files, title, updatedAt }
//        → the server checks every file arrived, saves the row, removes files no longer used
//   GET  → { title, updatedAt, deleted, files: [{ path, size, sha256, url }] }  (signed read urls)
//   DELETE → the files go; the row stays as a tombstone so other devices delete their copy
//
// ☁️ Notebook backup for the Notebook iPad app (SPEC-STUDENT-APP.md §0d, 31 Oct 2026).
// Model and rules: lib/app-notebooks.ts. Files: student-files bucket, notebooks/<identity>/<id>/.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireActiveAccess } from '@/lib/portal-passes';
import { backupCaller } from '@/lib/app-notebooks-server';
import {
  filesToRemove, filesToSend, isNotebookId, missingFiles, notebookFileKey, notebookPrefix,
  parseCommit, parseManifest, type Manifest,
} from '@/lib/app-notebooks';
import {
  createDownloadUrls, createUploadUrl, listStudentFiles, removeStudentFiles, removeStudentFilesByPrefix,
} from '@/lib/student-files';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function storedRow(userId: string, id: string) {
  const { data } = await createServiceClient().from('app_notebooks')
    .select('title, updated_at, manifest, deleted_at').eq('user_id', userId).eq('notebook_id', id).maybeSingle();
  return data as { title: string; updated_at: string; manifest: Manifest; deleted_at: string | null } | null;
}

export async function POST(req: Request, ctx: Ctx) {
  const who = await backupCaller(req);
  if (!who.ok) return who.res;
  const id = (await ctx.params).id.toUpperCase();
  if (!isNotebookId(id)) return NextResponse.json({ error: 'Bad notebook.' }, { status: 400 });
  const body = await req.json().catch(() => null) as { step?: string } | null;
  const parsed = parseManifest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const stored = await storedRow(who.account.id, id);

  if (body?.step === 'prepare') {
    const access = await requireActiveAccess(who.account);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const send = await Promise.all(filesToSend(stored?.manifest, parsed.manifest).map(async path => {
      const u = await createUploadUrl(notebookFileKey(who.identity, id, path), { upsert: true });
      return { path, url: u.uploadUrl };
    }));
    return NextResponse.json({ send });
  }

  if (body?.step === 'commit') {
    const meta = parseCommit(body);
    if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });
    const prefix = notebookPrefix(who.identity, id);
    const inBucket = new Map((await listStudentFiles(prefix)).map(f => [f.key.slice(prefix.length + 1), f.size]));
    const missing = missingFiles(parsed.manifest, inBucket);
    if (missing.length) {
      return NextResponse.json({ error: 'Some pages didn’t arrive. Try again.', missing }, { status: 409 });
    }
    const bytes = Object.values(parsed.manifest).reduce((n, f) => n + f.size, 0);
    const { error } = await createServiceClient().from('app_notebooks').upsert({
      user_id: who.account.id, notebook_id: id, identity: who.identity, title: meta.title,
      updated_at: meta.updatedAt, manifest: parsed.manifest, bytes, deleted_at: null, saved_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: 'Couldn’t save this notebook.' }, { status: 500 });
    // Pages deleted on the device, and anything left from a send that never committed.
    const keep = new Set(Object.keys(parsed.manifest));
    const stale = [...new Set([...filesToRemove(stored?.manifest, parsed.manifest), ...[...inBucket.keys()].filter(p => !keep.has(p))])];
    if (stale.length) {
      await removeStudentFiles(stale.map(p => `${prefix}/${p}`)).catch(e => console.error('[app/notebooks] tidy failed:', (e as Error).message));
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bad step.' }, { status: 400 });
}

export async function GET(req: Request, ctx: Ctx) {
  const who = await backupCaller(req);
  if (!who.ok) return who.res;
  const id = (await ctx.params).id.toUpperCase();
  if (!isNotebookId(id)) return NextResponse.json({ error: 'Bad notebook.' }, { status: 400 });
  const row = await storedRow(who.account.id, id);
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const paths = Object.keys(row.manifest || {}).sort();
  const urls = paths.length ? await createDownloadUrls(paths.map(p => notebookFileKey(who.identity, id, p))) : [];
  return NextResponse.json({
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime() / 1000,
    deleted: !!row.deleted_at,
    files: paths.map((path, i) => ({ path, ...row.manifest[path], url: urls[i]?.url ?? null })),
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const who = await backupCaller(req);
  if (!who.ok) return who.res;
  const id = (await ctx.params).id.toUpperCase();
  if (!isNotebookId(id)) return NextResponse.json({ error: 'Bad notebook.' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await createServiceClient().from('app_notebooks').upsert({
    user_id: who.account.id, notebook_id: id, identity: who.identity, updated_at: now,
    manifest: {}, bytes: 0, deleted_at: now, saved_at: now,
  });
  if (error) return NextResponse.json({ error: 'Couldn’t delete this notebook.' }, { status: 500 });
  await removeStudentFilesByPrefix(notebookPrefix(who.identity, id)).catch(e => console.error('[app/notebooks] delete files failed:', (e as Error).message));
  return NextResponse.json({ ok: true });
}
