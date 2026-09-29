// Claude model ids that more than one route shares, and the one way to read a reply.
//
// Sonnet 5.5 (30 Sep 2026, Adrian approved moving the small Sonnet sites that passed the
// plan-billed test — correct and within budget). Its id is written HERE ONLY;
// claude-models.test.ts fails on a hard-coded sonnet-5-5 id anywhere else in src/.
// SONNET_55_MODEL moves every site on it at once (e.g. back to claude-sonnet-5).
//
// What Sonnet 5.5 refuses with a 400 (the 29–30 Sep test saw each): a forced
// tool_choice ({type:'tool'|'any'}), a non-default temperature / top_p / top_k, and
// thinking {type:'disabled'} or {type:'enabled', budget_tokens}. It always thinks, so
// a reply can START with a thinking block — read it with anthropicText, never
// content[0].text.
export const SONNET_55: string = process.env.SONNET_55_MODEL || 'claude-sonnet-5-5';

type Block = { type?: string; text?: string } | null | undefined;

/** The first TEXT block of a Claude reply ('' when there is none). Works on an SDK
 *  Message and on the raw JSON of a fetch to /v1/messages. A thinking block that
 *  comes first is skipped. */
export function anthropicText(resp: { content?: Block[] | null } | null | undefined): string {
  const blocks = Array.isArray(resp?.content) ? resp!.content! : [];
  for (const b of blocks) if (b && b.type === 'text' && typeof b.text === 'string') return b.text;
  return '';
}
