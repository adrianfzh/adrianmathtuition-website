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

  const systemPrompt = `You are an interactive math tutor delivering a mini-lesson on "${topic}" for Singapore ${subjectLabel}.

TEACHING STYLE:
- Break the topic into 3-5 bite-sized concepts, progressing from basic to advanced
- Each concept: 2-4 short paragraphs, clear and encouraging
- After each concept, ask ONE quick check question to test understanding
- Use LaTeX: $inline$ and $$display$$ for all math
- For multi-step working, use $$\\begin{aligned} ... \\end{aligned}$$
- Be warm and encouraging. Praise correct answers. When wrong, explain gently.

VISUAL ELEMENTS:
Embed pre-built visuals using [VISUAL:id] on its own line.
If no pre-built visual fits, create a [STEPS] block:
[STEPS]
Step: description
$$math$$
---
Step: description
$$math$$
[/STEPS]

${visualRef}

ACTION RESPONSES:
- "start": Introduce topic briefly, teach first concept with visuals, end with check question.
- "answer": Evaluate. Correct → praise + next concept. Wrong → explain gently, move on.
- "next": Skip to next concept + check question.
- "hint": Helpful hint without giving the answer.
- "example": Worked example using [VISUAL:id] or [STEPS].
- "practice": Practice question (answer only, no full solution).
- "solution": Full solution for last practice question using [STEPS].
- "more": Another similar practice question.

RULES:
- Do NOT number steps like "Step 1 of 5". Let it flow naturally.
- Singapore syllabus methods only.
- One concept at a time.
- When no more concepts, offer practice.

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
