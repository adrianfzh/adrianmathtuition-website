const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, topic, action, studentAnswer, conversationHistory = [] } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Not configured' });

  const client = new Anthropic({ apiKey });

  // Fetch Adrian's notes AND pre-built visuals from Airtable
  let adrianNotes = '';
  let visuals = [];
  try {
    const slug = `${topic.toLowerCase().replace(/\s+/g, '-')}-${subject === 'JC' ? 'jc' : 'sec'}`;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (airtableToken && baseId) {
      const formula = encodeURIComponent(`{Slug}='${slug}'`);
      const resp = await fetch(
        `https://api.airtable.com/v0/${baseId}/Notes?filterByFormula=${formula}&fields[]=Content&fields[]=Visuals`,
        { headers: { Authorization: `Bearer ${airtableToken}` } }
      );
      const data = await resp.json();
      const record = data.records?.[0]?.fields;
      adrianNotes = record?.Content || '';
      try { visuals = JSON.parse(record?.Visuals || '[]'); } catch(e) { visuals = []; }
    }
  } catch (e) { /* proceed without */ }

  const notesContext = adrianNotes
    ? `\nAdrian's teaching notes:\n${adrianNotes.substring(0, 5000)}`
    : '';

  const visualRef = visuals.length
    ? `\nPRE-BUILT VISUALS AVAILABLE (embed by ID):\n${visuals.map(v => `[${v.id}] ${v.type}: "${v.title}" (concept ${v.concept})`).join('\n')}\n\nTo embed a visual, write on its own line: [VISUAL:id]\nExample: [VISUAL:v1] inserts the Desmos graph or SVG stored for that ID.\nAlways embed at least one visual per concept when available.`
    : '\nNo pre-built visuals available. Use [STEPS] blocks for worked examples.';

  const subjectLabel = subject === 'AM' ? 'O-Level Additional Mathematics'
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

  const messages = [...conversationHistory];
  const actionMessages = {
    'start': 'Start the lesson. Teach me the first concept.',
    'answer': studentAnswer || '',
    'next': 'Skip. Teach me the next concept.',
    'hint': 'Give me a hint.',
    'example': 'Show me a worked example.',
    'explain': 'Explain this concept in more depth. Why does it work? What is the theory behind it?',
    'practice': 'Give me a practice question.',
    'solution': 'Show me the full solution.',
    'more': 'Give me another similar question.'
  };
  messages.push({ role: 'user', content: actionMessages[action] || action });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Send visuals data as first SSE event so frontend can resolve [VISUAL:id] references
    res.write(`data: ${JSON.stringify({ visuals })}\n\n`);

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[learn] error:', err.message);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed' });
    res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
    res.end();
  }
};
