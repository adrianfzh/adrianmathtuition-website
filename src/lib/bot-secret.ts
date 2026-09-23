// The secret shared with the Fly bot (BOT_INTERNAL_SECRET), TRIMMED.
//
// The value stored in Vercel carries a trailing newline (CLAUDE.md gotcha: every
// stored production value does). Outbound fetches never noticed — the Fetch spec
// strips whitespace off header values — but an exact compare of an INBOUND
// `Authorization: Bearer …` header against the raw env value can never match,
// and an HMAC signed with the raw value never verifies on the bot. Found 23 Sep
// 2026 when the practice-photo done webhook 401'd against prod. Every inbound
// compare and every signature on the website side reads the secret through here.
export function botInternalSecret(): string | undefined {
  const v = (process.env.BOT_INTERNAL_SECRET ?? '').trim();
  return v || undefined;
}
