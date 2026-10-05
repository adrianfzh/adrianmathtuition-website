// The ONE read a tutor-marked paper gets (lib/tutor-marked): the total the tutor
// wrote on the hand-marked copy. Never marks anything — it only looks for the
// circled / written total. Not sure → the student types the score.
import Anthropic from '@anthropic-ai/sdk';
import { fetchOurFile } from './student-files';
import { SCAN_READER_MODEL } from './scan-reader';
import { parseTotalRead, type TotalRead } from './tutor-marked';

const PROMPT = `These are photos of a student's maths exam paper that a tutor has ALREADY MARKED BY HAND in pen (ticks, crosses, marks per question, and usually a total).

Find the TOTAL the tutor wrote for the whole paper — usually on the cover page or the first page, often circled, written like "52/80", "52" over "80", or "Total: 52". Do not add up marks yourself unless no total is written AND every question's mark is clearly readable; if you add them up, sure must be false.

Answer with ONE JSON object and nothing else:
{"awarded": <whole number or null>, "max": <the paper's total marks, whole number or null>, "sure": true|false}
"sure" is true only when the total is clearly written and the out-of value is printed or written on the paper.`;

/** Which pages to look at: the first two and the last — where a total is written. */
export function pagesToRead(n: number): number[] {
  const out = [0, 1, n - 1].filter(i => i >= 0 && i < n);
  return [...new Set(out)];
}

export async function readTutorTotal(pageUrls: readonly string[], client = new Anthropic()): Promise<TotalRead | null> {
  const content: Anthropic.MessageParam['content'] = [];
  for (const i of pagesToRead(pageUrls.length)) {
    const res = await fetchOurFile(pageUrls[i]).catch(() => null);
    if (!res || !res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = (res.headers.get('content-type') || '').toLowerCase();
    const media = type.includes('png') ? 'image/png' : type.includes('webp') ? 'image/webp' : 'image/jpeg';
    content.push({ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } });
  }
  if (!content.length) return null;
  content.push({ type: 'text', text: PROMPT });
  const res = await client.messages.create({ model: SCAN_READER_MODEL, max_tokens: 200, messages: [{ role: 'user', content }] });
  const raw = res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
  return parseTotalRead(raw);
}
