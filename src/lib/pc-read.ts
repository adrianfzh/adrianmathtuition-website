// Turning a P&C question in words into a spec (lib/pc-count) — ADMIN PAGE ONLY
// (/admin/pc-coach). One model call (Sonnet 5.5, SONNET_55) reads the words; the
// counter, the method and the picture are then worked out without a model. The
// learn steps never call this: their specs are written in lib/pc-steps.ts.
// Cost: about 1,800 tokens in and 300–1,500 out (it thinks first) ≈ US$0.01–0.03 a question.
import Anthropic from '@anthropic-ai/sdk';
import { SONNET_55, anthropicText } from './claude-models';
import { costFor } from './model-pricing';
import type { PcSpec } from './pc-count';

export const PC_READ_MODEL = process.env.PC_READ_MODEL || SONNET_55;

const PROMPT = `You turn ONE Permutations & Combinations question (or one part of it) into a JSON spec for an exact counter that lists every outcome. Reply with the JSON only, in a \`\`\`json block.

Spec:
{
  "mode": "row" | "circle" | "choose" | "boxes" | "split",
  "items": [labels],          // the objects. IDENTICAL objects share a label (APPLE → ["A","P","P","L","E"]); different people get different labels ("B1","B2","G1"). Labels ≤ 3 characters.
  "r": number,                // row/choose: how many are placed or chosen (leave out = all). boxes: number of positions.
  "positions": [[labels]],    // boxes only, when positions have different lists (first digit 1-9, then 0-9 …)
  "labels": ["…"],            // boxes only: a short name per position
  "repeat": false,            // boxes only: when an object may NOT be used twice (default: repeats allowed)
  "sizes": [4,4,4], "labelled": false,   // split only: group sizes; labelled = the groups have names (box A, team X)
  "numbered": true,           // circle only: seats are numbered
  "rules": [rule]
}
Rules (labels refer to "items"; a rule on a label applies to all its copies):
  {"t":"together","items":[…]}           all of them side by side as one block
  {"t":"apart","items":[…]}              no two of them side by side (in split: no two in one group)
  {"t":"start","item":"L"} / {"t":"end","item":"A"}
  {"t":"between","a":"S","b":"T","k":4}  exactly k objects between a and b
  {"t":"count","items":[…],"min":2,"max":2}   how many of these are used/chosen ("at least", "exactly", "must include" = min 1, "excluded" = max 0)
  {"t":"any","rules":[…]}                one of these holds ("starts with L or ends with A")
  {"t":"not","rule":{…}}

Modes: "row" = arranged in a line (order matters); "circle" = round a table, all objects seated; "choose" = a selection, order does not matter; "boxes" = one choice per position from a list (codes, numbers, words with repeated letters allowed); "split" = into groups.
Empty seats in a row are identical objects with label "_".
If the question cannot be written in this language, reply {"error":"<why, one line>"}.`;

export interface PcRead { spec: PcSpec | null; error?: string; model: string; cost: number }

export async function readPcQuestion(text: string): Promise<PcRead> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: PC_READ_MODEL,
    max_tokens: 6000,
    system: PROMPT,
    messages: [{ role: 'user', content: text.slice(0, 4000) }],
  });
  const cost = costFor(msg.usage?.input_tokens ?? 0, msg.usage?.output_tokens ?? 0, PC_READ_MODEL);
  const raw = anthropicText(msg);
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  try {
    const j = JSON.parse(String(m[1]).trim());
    if (j && typeof j.error === 'string') return { spec: null, error: j.error, model: PC_READ_MODEL, cost };
    return { spec: j as PcSpec, model: PC_READ_MODEL, cost };
  } catch {
    return { spec: null, error: 'The reply was not a spec.', model: PC_READ_MODEL, cost };
  }
}
