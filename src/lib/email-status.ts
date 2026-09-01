// ─── Resend delivery events → EmailLog Status ───────────────────────────────────
//
// Pure: the event→status map the webhook applies, and the Airtable PATCH body it
// applies it with.
//
// ⚠ `typecast: true` is LOAD-BEARING, not decoration. Airtable's EmailLog `Status`
// field is a singleSelect that shipped with exactly two options — `sent` and
// `failed`. Four of the five statuses below are not among them, and writing an
// unlisted option to a singleSelect is a 422 (INVALID_MULTIPLE_CHOICE_OPTIONS),
// not a silent no-op. The webhook's PATCH is wrapped in `.catch(console.error)`
// because a webhook must return 200 or Resend retries forever — so without
// typecast, every `delivered` event failed INVISIBLY: the row kept saying `sent`,
// nothing threw, nothing alarmed, and "did the parent get it?" stayed unanswerable.
// (Found 2026-09-02, an hour after fixing the webhook's other half — it had been
// subscribed to only `email.delivery_delayed` since June, so this second fault had
// never had an event to fail on.) Typecast makes Airtable create the option on
// first use; the map below is a closed set, so it can only ever mint these five.
export const STATUS_BY_EVENT: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/** The Airtable PATCH body for a delivery-status update. Always typecast — see above. */
export function statusPatchBody(status: string): { fields: { Status: string }; typecast: true } {
  return { fields: { Status: status }, typecast: true };
}
