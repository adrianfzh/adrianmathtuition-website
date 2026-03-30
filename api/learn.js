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

  // Fetch Adrian's notes from Airtable if available
  let adrianNotes = '';
  try {
    const slug = `${topic.toLowerCase().replace(/\s+/g, '-')}-${subject === 'JC' ? 'jc' : 'sec'}`;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (airtableToken && baseId) {
      const formula = encodeURIComponent(`{Slug}='${slug}'`);
      const resp = await fetch(
        `https://api.airtable.com/v0/${baseId}/Notes?filterByFormula=${formula}&fields[]=Content`,
        { headers: { Authorization: `Bearer ${airtableToken}` } }
      );
      const data = await resp.json();
      adrianNotes = data.records?.[0]?.fields?.Content || '';
    }
  } catch (e) { /* proceed without notes */ }

  const notesContext = adrianNotes
    ? `\n\nAdrian's teaching notes for this topic (use these as your PRIMARY reference for teaching style, explanations, and approach. Generate similar examples with different numbers):\n${adrianNotes.substring(0, 5000)}`
    : '';

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

ACTION RESPONSES:
- "start": Briefly introduce the topic (1-2 sentences), then teach the first concept. End with a check question.
- "answer": Evaluate the student's answer. If correct, praise and move to the next concept + new check question. If wrong, explain the mistake kindly, show the correct approach, then move on.
- "next": Student wants to skip. Move to the next concept + check question.
- "hint": Give a helpful hint for the current check question without giving the answer.
- "example": Show a fully worked example for the current concept.
- "practice": Give a practice question (just the question and answer, no full solution). The student can ask for hints or the solution separately.
- "solution": Show the full solution for the most recent practice question.
- "more": Give another similar practice question.

RULES:
- Do NOT number steps like "Step 1 of 5" or "Concept 2/4". Let it flow naturally.
- Singapore syllabus methods only. No methods outside the syllabus.
- Keep each response focused — one concept at a time, don't overwhelm.
- When there are no more concepts to teach, offer practice questions instead of ending.

At the very end of EVERY response, on its own line, output exactly:
|||STATUS:{"hasMore":true/false,"questionActive":true/false}|||
- hasMore: true if there are more concepts to teach
- questionActive: true if you asked a question and are waiting for an answer
This line will be parsed by the frontend and hidden from the student.
${notesContext}`;

  const messages = [...conversationHistory];
  const actionMessages = {
    'start': 'Start the lesson. Teach me the first concept.',
    'answer': studentAnswer || '',
    'next': 'Skip this question. Teach me the next concept.',
    'hint': 'Give me a hint for this question.',
    'example': 'Show me a worked example for this concept.',
    'practice': 'Give me a practice question. Just the question and answer, not the full solution.',
    'solution': 'Show me the full solution for that practice question.',
    'more': 'Give me another similar practice question.'
  };
  messages.push({ role: 'user', content: actionMessages[action] || action });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
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
