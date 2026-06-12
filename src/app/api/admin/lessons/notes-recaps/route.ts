// POST /api/admin/lessons/notes-recaps
// Generates the per-concept "Review of Techniques" recap boxes for the one-shot notes DOCX:
// key formulas + standard method outline + common mistakes, grounded in the chosen example
// questions. One call covers every concept in the lesson.
//
// Body: {
//   level: string, topics: string[],
//   model?: 'opus' | 'fable',
//   concepts: string[],                                  // section order — one recap per entry
//   examples: Array<{ concept: string; brief: string }>, // chosen example question (+solution) per concept
// }
// Returns: { recaps: Array<{ concept, content }>, meta: { model, input_tokens, output_tokens } }
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 180;

const SYSTEM = `You are writing the "Review of Techniques" recap boxes for a Singapore math tuition teacher's revision notes (O-Level AM/EM or A-Level H2). You receive a list of CONCEPTS and, for most, the worked EXAMPLE question chosen to illustrate it.

For EACH concept write a compact recap box in markdown:

**Key formulas & method**
- the formula(s) the student must know, in LaTeX inside $...$ (e.g. $\\overrightarrow{OM} = \\frac{\\lambda\\mathbf{a} + \\mu\\mathbf{b}}{\\lambda + \\mu}$)
- the standard method as 2-4 terse steps ("dot with the normal", "set discriminant < 0"), not prose paragraphs

**Watch out**
- 1-3 specific mistakes students actually make on THIS concept (sign slips, wrong formula variant, missing case) — grounded in the example question where one is given

Rules:
- Terse and exam-focused, like a teacher's board summary. NO introductions, NO "in this section".
- ALL math in $...$ (inline) — never bare LaTeX, never \\( \\) delimiters, never $$ display blocks.
- Keep each recap under ~120 words.

OUTPUT — return ONLY a JSON object, no fences, no commentary:
{"recaps":[{"concept":"<exactly the concept string given>","content":"<markdown>"}]}
The output must be STRICTLY valid JSON — inside JSON strings every LaTeX backslash must be escaped as \\\\ (e.g. "\\\\frac{a}{b}") and newlines as \\n.`;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { level?: string; topics?: string[]; model?: string; concepts?: string[]; examples?: Array<{ concept: string; brief: string }> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { level, topics = [], concepts, examples = [] } = body;
  if (!level || !Array.isArray(concepts) || concepts.length === 0) {
    return NextResponse.json({ error: 'level and concepts required' }, { status: 400 });
  }
  const model = body.model === 'fable' ? 'claude-fable-5' : 'claude-opus-4-8';

  const briefByConcept = new Map(examples.map(e => [e.concept, e.brief]));
  const blocks = concepts.map(c => {
    const brief = briefByConcept.get(c);
    return `CONCEPT: ${c}\n${brief ? `EXAMPLE QUESTION (with solution where available):\n${brief.slice(0, 6000)}` : '(no example chosen — write the recap from the concept alone)'}`;
  }).join('\n\n=====\n\n');

  const client = new Anthropic();
  const msg = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `LEVEL: ${level}\nTOPIC: ${topics.join(' + ')}\n\n${blocks}` }],
  });
  if (msg.stop_reason === 'max_tokens') {
    return NextResponse.json({ error: `recap generation cut off at token limit (${msg.usage?.output_tokens} out)` }, { status: 502 });
  }

  const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return NextResponse.json({ error: 'AI returned no JSON', raw: text.slice(0, 400) }, { status: 502 });
  }
  const jsonStr = text.slice(jsonStart, jsonEnd + 1);
  const tryParse = (s: string): Record<string, unknown> | null => {
    try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
  };
  // Same LaTeX-backslash escape repair as the propose route.
  const escFixed = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  const parsed = tryParse(jsonStr) ?? tryParse(escFixed) ?? tryParse(escFixed.replace(/,\s*([}\]])/g, '$1'));
  if (!parsed) {
    console.error(`[notes-recaps] invalid JSON from ${model}: ${jsonStr.slice(0, 300)}`);
    return NextResponse.json({ error: 'AI returned invalid JSON (even after escape repair)', raw: text.slice(0, 400) }, { status: 502 });
  }

  const recaps = (Array.isArray(parsed.recaps) ? parsed.recaps : [])
    .filter((r): r is { concept: string; content: string } =>
      !!r && typeof (r as { concept?: unknown }).concept === 'string' && typeof (r as { content?: unknown }).content === 'string');
  console.log(`[notes-recaps] model=${model} in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens} recaps=${recaps.length}/${concepts.length}`);

  return NextResponse.json({
    recaps,
    meta: { model, input_tokens: msg.usage?.input_tokens ?? null, output_tokens: msg.usage?.output_tokens ?? null },
  });
}
