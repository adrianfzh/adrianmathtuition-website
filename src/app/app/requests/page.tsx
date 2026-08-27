// /app/requests — the "Request" tab (v1, human-in-the-loop): ask Adrian for a
// worksheet / notes / anything, watch the status, collect the result link.
// Server component gates the session and preloads the list; the form is the
// client half. Deliberately does NOT call requireFullPortal() — requests are
// part of the marking-only beta surface, same as Submit and Marked.
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listStudentRequests } from '@/lib/portal-requests';
import { DAILY_REQUEST_CAP, countRequestsToday, type RequestCountingClient } from '@/lib/requests';
import RequestsClient from './requests-client';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const account = await currentAccount();
  const sid = portalIdentity(account); // rec… / acct:<uuid>
  // Best-effort preloads — a hiccup degrades to the client's own refetch, and
  // the POST-time cap check is the real gate anyway.
  const initial = await listStudentRequests(sid).catch(() => []);
  let usedToday = 0;
  try {
    usedToday = await countRequestsToday(getSupabaseAdmin() as unknown as RequestCountingClient, sid);
  } catch { /* form stays enabled; the route still enforces */ }
  return <RequestsClient initial={initial.map(r => ({
    id: r.id,
    kind: r.kind,
    detail: r.detail,
    status: r.status,
    adminNote: r.admin_note,
    resultUrl: r.result_url,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }))} usedToday={usedToday} cap={DAILY_REQUEST_CAP} />;
}
