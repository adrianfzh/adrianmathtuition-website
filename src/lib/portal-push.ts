// Web-push sender for the student portal.
//
// Subscriptions live in Supabase `portal_push_subscriptions` (service-role
// only; one row per browser endpoint, written by /api/portal/push). The first
// notification through here: "Your marked paper is ready ✅" fired from the
// mark-triage release action.
//
// Contract: sendPushToStudent is SAFE TO FIRE-AND-FORGET. It catches
// everything, logs, and never throws — a push failure must never fail (or
// delay) whatever outward action triggered it, release above all.
import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildPushPayload, type PortalPushMessage } from '@/lib/push-payload';

let vapidConfigured = false;

// Lazy so importing this module can never throw on a missing env var — only a
// send in an unconfigured environment degrades (to a logged no-op).
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails('mailto:adrianmathtuition@gmail.com', publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * Push `msg` to every subscribed browser of one student. Expired endpoints
 * (HTTP 404/410 from the push service — uninstalled PWA, cleared site data)
 * are deleted so the table self-cleans. Never throws.
 */
export async function sendPushToStudent(
  airtableStudentId: string,
  msg: PortalPushMessage
): Promise<void> {
  try {
    if (!airtableStudentId) return;
    if (!ensureVapid()) {
      console.warn('[portal-push] VAPID keys not configured — push skipped');
      return;
    }

    const supa = getSupabaseAdmin();
    const { data: subs, error } = await supa
      .from('portal_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('airtable_student_id', airtableStudentId);
    if (error) {
      console.warn('[portal-push] subscription read failed:', error.message);
      return;
    }
    if (!subs?.length) return;

    const payload = buildPushPayload(msg);
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint is gone for good — drop the row so we stop paying for it.
          const { error: delErr } = await supa
            .from('portal_push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
          if (delErr) console.warn('[portal-push] expired-row delete failed:', delErr.message);
        } else {
          console.warn(`[portal-push] send failed (${status ?? '?'}):`, (err as Error).message);
        }
      }
    }));
  } catch (err) {
    console.warn('[portal-push] sendPushToStudent failed:', (err as Error).message);
  }
}
