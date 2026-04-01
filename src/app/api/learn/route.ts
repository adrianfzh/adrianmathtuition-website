import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const { subject, topic, action, studentAnswer, conversationHistory = [], _startMessage } =
    await req.json();

  // ── Fetch notes + visuals + subtopics from Airtable ──
  let adrianNotes = '';
  let visuals: Visual[] = [];
  let subtopics: string[] = [];

  try {
    const slug = `${topic.toLowerCase().replace(/\s+/g, '-')}-${subject === 'JC' ? 'jc' : 'sec'}`;
    const token = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (token && baseId) {
      const formula = encodeURIComponent(`{Slug}='${slug}'`);
      const resp = await fetch(
        `https://api.airtable.com/v0/${baseId}/Notes?filterByFormula=${formula}&fields[]=Content&fields[]=Visuals&fields[]=Subtopics`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await resp.json();
      const record = data.records?.[0]?.fields;
      adrianNotes = record?.Content || '';
      try { visuals = JSON.parse(record?.Visuals || '[]'); } catch { visuals = []; }
      try { subtopics = JSON.parse(record?.Subtopics || '[]'); } catch { subtopics = []; }
    }
  } catch { /* proceed without */ }

  // ── init action: no AI call, just metadata ──
  if (action === 'init') {
    return NextResponse.json(
      { subtopics, visuals, hasNotes: !!adrianNotes },
      { headers: CORS_HEADERS }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: CORS_HEADERS });
  }

  const client = new Anthropic({ apiKey });

  const notesContext = adrianNotes
    ? `\nAdrian's teaching notes:\n${adrianNotes.substring(0, 5000)}`
    : '';

  const visualRef = visuals.length
    ? `\nPRE-BUILT VISUALS AVAILABLE (embed by ID):\n${visuals.map((v) => `[${v.id}] ${v.type}: "${v.title}" (concept ${v.concept})`).join('\n')}\n\nTo embed a visual, write on its own line: [VISUAL:id]\nExample: [VISUAL:v1] inserts the Desmos graph or SVG stored for that ID.\nAlways embed at least one visual per concept when available.`
    : '\nNo pre-built visuals available. Use [STEPS] blocks for worked examples.';

  const subjectLabel =
    subject === 'AM' ? 'O-Level Additional Mathematics'
    : subject === 'EM' ? 'O-Level Elementary Mathematics'
    : 'A-Level H2 Mathematics';

  const systemPrompt = `You are an interactive math tutor delivering a fast, example-driven lesson on "${topic}" for Singapore ${subjectLabel}.

TEACHING PHILOSOPHY:
- GO STRAIGHT TO EXAMPLES. Do not explain theory first.
- Show a concrete example immediately, then explain the concept THROUGH the example.
- Be TO THE POINT. No lengthy preambles, no "let's explore", no "in this lesson we will learn".
- Students learn by SEEING how problems are solved, not by reading theory.
- Keep each response SHORT — max 2-3 paragraphs of explanation + 1 worked example.
- Use step-by-step reveal [STEPS] blocks for ALL worked examples.

LESSON STRUCTURE:
Each concept = 1-2 sentence intro + worked example (using [STEPS]) + check question.
That's it. No walls of text.

Example of good first response:
"Here's how to expand $(2+x)^3$ using the binomial theorem:
[STEPS]
Step: Write out the pattern
$$\\binom{3}{0}(2)^3(x)^0 + \\binom{3}{1}(2)^2(x)^1 + \\binom{3}{2}(2)^1(x)^2 + \\binom{3}{3}(2)^0(x)^3$$
---
Step: Calculate each coefficient using nCr on your calculator
$$1(8)(1) + 3(4)(x) + 3(2)(x^2) + 1(1)(x^3)$$
---
Step: Simplify
$$8 + 12x + 6x^2 + x^3$$
[/STEPS]
Now you try: Expand $(1+x)^4$."

VISUAL ELEMENTS:
- Only embed visuals when they are ESSENTIAL for understanding.
- Essential: trig graph transformations (y = a sin bx + c), coordinate geometry diagrams, curve sketching.
- NOT essential: algebraic expansions, equation solving, most calculation topics.
- If in doubt, skip the visual.
- Embed pre-built visuals using [VISUAL:id] on its own line.
- For worked examples, ALWAYS use [STEPS] blocks.

${visualRef}

ACTION RESPONSES:
- "start": Show the first worked example immediately. 1-2 sentences of context max, then [STEPS] example, then a check question.
- "answer": Check if correct. If right: "Correct!" + next example. If wrong: show where they went wrong in 1-2 sentences, give the right answer, move on.
- "next": Skip to next example/concept.
- "hint": One sentence hint only.
- "example": Another worked example with [STEPS].
- "explain": Give a deeper explanation of the current concept (theory, why it works — only when student explicitly asks).
- "practice": Practice question (show answer only, not solution).
- "solution": Full solution for last practice using [STEPS].
- "more": Another similar practice question.

RULES:
- Do NOT number concepts like "Concept 1 of 5".
- Singapore syllabus methods ONLY.
- One example at a time. Keep it fast.
- When giving check questions, keep them simple — students should be able to solve in 30 seconds.
- After 3-4 examples covering the topic, offer practice questions.
- Use the examples and style from Adrian's notes when available.

End EVERY response with exactly this line:
|||STATUS:{"hasMore":true/false,"questionActive":true/false}|||
${notesContext}`;

  const actionMessages: Record<string, string> = {
    start: _startMessage || 'Start the lesson. Teach me the first concept.',
    answer: studentAnswer || '',
    next: 'Skip. Teach me the next concept.',
    hint: 'Give me a hint.',
    example: 'Show me a worked example.',
    explain: 'Explain this concept in more depth. Why does it work? What is the theory behind it?',
    practice: 'Give me a practice question.',
    solution: 'Show me the full solution.',
    more: 'Give me another similar question.',
  };

  const messages = [
    ...conversationHistory,
    { role: 'user' as const, content: actionMessages[action] ?? action },
  ];

  // ── SSE streaming via TransformStream ──
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const sendEvent = (data: object) =>
    writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

  (async () => {
    try {
      // First event: metadata so frontend can resolve [VISUAL:id]
      await sendEvent({ visuals, subtopics });

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta'
        ) {
          await sendEvent({ chunk: event.delta.text });
        }
      }

      await sendEvent({ done: true });
    } catch (err) {
      console.error('[learn]', err);
      await sendEvent({ done: true, error: true });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Visual {
  id: string;
  type: 'desmos' | 'svg' | 'steps';
  title: string;
  concept?: string;
  expressions?: string[];
  svg?: string;
  steps?: string[];
}
