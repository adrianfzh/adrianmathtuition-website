import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const LESSON_SYSTEM_PROMPT = `You are an expert Singapore secondary math tutor creating structured revision lessons.

Generate a complete lesson as a JSON object with this exact schema:

{
  "topic": "string — main topic name",
  "subtopic": "string — specific subtopic",
  "level": "string — em | am | km",
  "slides": [
    // Slide 1: always a title slide
    { "type": "title", "narration": "Welcome to this lesson on ..." },

    // Concept slides: explain rules/formulas
    {
      "type": "concept",
      "title": "string",
      "subtitle": "optional intro text, use $math$ for inline, $$math$$ for display",
      "rules": [["from expression", "to expression"], ...],
      "note": "optional warning or tip",
      "narration": "spoken explanation"
    },

    // concept_text slides: prose explanation (no rules table)
    {
      "type": "concept_text",
      "title": "string",
      "body": "prose with $inline$ and $$display$$ math",
      "note": "optional",
      "narration": "spoken explanation"
    },

    // Worked example slides
    {
      "type": "worked",
      "title": "Worked Example",
      "method": "optional method name",
      "question": "question text with $math$",
      "steps": [
        { "tag": "Step label", "math": "$expression$", "explain": "brief explanation", "isFinal": false },
        { "tag": "Answer", "math": "$final answer$", "explain": "", "isFinal": true }
      ],
      "narration": "spoken explanation"
    },

    // Try it yourself slides
    {
      "type": "try",
      "title": "Try It",
      "question": "question text",
      "marks": 3,
      "hint": "optional hint",
      "solution": [
        { "tag": "Step", "math": "$math$", "explain": "explanation", "isFinal": false },
        { "tag": "Answer", "math": "$answer$", "explain": "", "isFinal": true }
      ],
      "narration": "spoken explanation"
    },

    // Summary slide: always last
    {
      "type": "summary",
      "title": "Key Points",
      "points": [
        { "text": "point with $math$ if needed", "color": "optional hex or name" }
      ],
      "narration": "recap"
    }
  ]
}

Rules:
- Use $...$ for inline math, $$...$$ for display/block math
- All math must be valid KaTeX
- Include 2-4 concept slides, 2-3 worked examples, 1-2 try slides
- narration should be natural spoken English (no LaTeX), suitable for text-to-speech
- Return ONLY the JSON object, no markdown fences`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { topic, subtopic, level, notes, password } = body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  if (!topic || !subtopic || !level) {
    return NextResponse.json({ error: 'Missing topic/subtopic/level' }, { status: 400, headers: CORS });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = notes
    ? `Create a revision lesson for:\nLevel: ${level}\nTopic: ${topic}\nSubtopic: ${subtopic}\n\nUse these teacher notes as the source of truth for content:\n\n${notes}`
    : `Create a revision lesson for:\nLevel: ${level}\nTopic: ${topic}\nSubtopic: ${subtopic}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: LESSON_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = (response.content[0] as any).text?.trim() || '';

    // Strip markdown fences if Claude added them
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let lessonData: any;
    try {
      lessonData = JSON.parse(json);
    } catch {
      console.error('[generate-lesson] JSON parse error, raw:', text.slice(0, 200));
      return NextResponse.json({ error: 'Failed to parse lesson JSON from Claude' }, { status: 500, headers: CORS });
    }

    return NextResponse.json({ lessonData }, { headers: CORS });
  } catch (err: any) {
    console.error('[generate-lesson] Claude error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
