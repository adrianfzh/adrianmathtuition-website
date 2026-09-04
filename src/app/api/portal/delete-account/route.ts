// POST /api/portal/delete-account — PDPA right to erasure. Permanently removes
// the caller's practice attempts, weakness tags, assignments, notebook entries,
// clippings (rows + Blob images), requests, generated papers + generation log,
// learn/recall ledgers, push subscriptions, invite tokens, portal account
// (incl. consent record), and the Auth user. Airtable (lessons/billing) is
// untouched — that's Adrian's tutoring bookkeeping, outside the portal's scope.
//
// Deliberately RETAINED (documented in docs/RETENTION.md):
//   - paper_marking_runs + the mark-paper/portal/* photo blobs: the marking
//     Adrian performed is his business/teaching record (and the evidence base
//     for a paid-marking dispute). The retention cron ages them out instead.
//   - portal_passes: entitlement state only — Stripe/HitPay hold the payment
//     record of record, so nothing is lost however the account_id FK resolves
//     (verify + prefer ON DELETE CASCADE; see docs/RETENTION.md).
//
// Widened 2026-08-28 (Phase G audit): the 2026-08-21 version predated the
// notebook / clippings / requests / print-paper / assignments / passes builds
// and left all of those behind — Settings says "all stored data", so erasure
// has to keep up with what the portal stores.
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { keyFromUrl, removeStudentFilesByPrefix } from '@/lib/student-files';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation phrase missing' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Look up the account first (need airtable_student_id to purge invite tokens
  // and the portal identity to purge the identity-keyed tables).
  const { data: account } = await admin
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .maybeSingle();
  const identity = account ? portalIdentity(account) : null;

  // Order matters: children first, auth user last. Each step is idempotent so a
  // partial failure can be retried by the user. portal_assignments goes BEFORE
  // student_attempts — its attempt_id column references student_attempts, so
  // deleting the parent rows first could trip the FK.
  if (identity) {
    const { error: eAssign } = await admin.from('portal_assignments').delete().eq('airtable_student_id', identity);
    if (eAssign) return NextResponse.json({ error: `Could not delete assignments: ${eAssign.message}` }, { status: 500 });
  }

  const { error: e1 } = await admin.from('student_attempts').delete().eq('user_id', user.id);
  if (e1) return NextResponse.json({ error: `Could not delete attempts: ${e1.message}` }, { status: 500 });

  // Weakness tags are derived from the attempts — erasure covers them too
  // (gap found in the 2026-08-21 Phase G pass: they were left behind).
  const { error: eTags } = await admin.from('weakness_tags').delete().eq('user_id', user.id);
  if (eTags) return NextResponse.json({ error: `Could not delete weakness tags: ${eTags.message}` }, { status: 500 });

  if (identity) {
    // Clippings first fetch their Blob files: rows are the only pointer to the
    // portal-notes/* images, so a row-first delete would strand the files
    // forever. Blob deletion is best-effort — a Blob hiccup must not block the
    // erasure (the rows still go, and an orphaned image file is unreachable
    // without its URL; the retention sweep can collect it later).
    const { data: noteRows } = await admin
      .from('portal_notes').select('image_url').eq('airtable_student_id', identity);
    const imageUrls = (noteRows ?? [])
      .map(r => (r as { image_url: string | null }).image_url)
      .filter((u): u is string => !!u);
    const legacyUrls = imageUrls.filter(u => keyFromUrl(u) === null);
    if (legacyUrls.length) {
      try { await del(legacyUrls); }
      catch (e) { console.error('[delete-account] clipping blob cleanup failed:', (e as Error).message); }
    }
    // The private store: every clipping and assignment worksheet under this
    // identity, whether or not a row still points at it. (Hand-in photos stay
    // with their marking runs — the same retention stance as the runs above.)
    for (const prefix of [`clippings/${identity}`, `assignments/${identity}`]) {
      try { await removeStudentFilesByPrefix(prefix); }
      catch (e) { console.error('[delete-account] student-files cleanup failed for', prefix, (e as Error).message); }
    }

    // The identity-keyed portal tables (rec… / acct:<uuid> — same key the
    // features write). Each is fatal-on-error so the user can retry.
    for (const table of [
      'portal_notes',
      'notebook_entries',
      'portal_requests',
      'portal_generated_papers',
      'portal_generation_log',
    ] as const) {
      const { error } = await admin.from(table).delete().eq('airtable_student_id', identity);
      if (error) return NextResponse.json({ error: `Could not delete ${table}: ${error.message}` }, { status: 500 });
    }
  }

  // Learn + recall ledgers are keyed on the auth uid.
  const { error: eEvents } = await admin.from('unit_events').delete().eq('user_id', user.id);
  if (eEvents) return NextResponse.json({ error: `Could not delete learn events: ${eEvents.message}` }, { status: 500 });
  const { error: eRecall } = await admin.from('recall_messages').delete().eq('user_id', user.id);
  if (eRecall) return NextResponse.json({ error: `Could not delete recall history: ${eRecall.message}` }, { status: 500 });

  if (account?.airtable_student_id) {
    await admin.from('portal_invite_tokens').delete().eq('airtable_student_id', account.airtable_student_id);
  }

  // Push subscriptions are keyed on the portal identity (rec… / acct:<uuid>) —
  // without this, a deleted account's devices would keep receiving pushes.
  // Best-effort like the invite-token purge: never blocks the erasure.
  if (identity) {
    await admin.from('portal_push_subscriptions').delete()
      .eq('airtable_student_id', identity);
  }

  const { error: e2 } = await admin.from('portal_accounts').delete().eq('id', user.id);
  if (e2) return NextResponse.json({ error: `Could not delete account row: ${e2.message}` }, { status: 500 });

  const { error: e3 } = await admin.auth.admin.deleteUser(user.id);
  if (e3) return NextResponse.json({ error: `Could not delete login: ${e3.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
