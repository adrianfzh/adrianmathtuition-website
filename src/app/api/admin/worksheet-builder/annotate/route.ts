// POST /api/admin/worksheet-builder/annotate
// Rewrites a raw question-bank solution into an annotated teaching solution
// for the worksheet's Worked Examples section. One question per call —
// the client orchestrates sequentially to stay under Vercel's 60s limit.
//
// Body: { questionText, solution, answer, marks, allowDiagrams }
// Returns: { annotated }

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are preparing a worked example for a printed math worksheet used by a Singapore math tutor (O-Level EM/AM and JC H2 syllabuses).

You are given a question, its raw solution, the final answer, and the mark allocation. Rewrite the raw solution into an annotated TEACHING solution.

OUTPUT RULES — CRITICAL
- Return ONLY the annotated solution body. No preamble, no postamble, no commentary, no code fences around the whole output.
- Markdown + LaTeX: $...$ for inline math, $$...$$ for display math.
- Multi-step equation chains should use $$\\begin{aligned}...\\\\...\\end{aligned}$$ aligned on the = sign.
- Structure the working step by step, e.g. **Step 1.**, **Step 2.** labels where they help.
- Include short bold asides where genuinely useful: **Why this works:** ... and *Common mistake:* ... — at most one or two of each, kept to a sentence.
- End with the final answer in a display equation using \\boxed{...}.
- Use Singapore syllabus methods and notation. No US-isms.
- Preserve mathematical correctness exactly — the given answer is authoritative. If the raw solution is missing, derive a full correct solution yourself.
- Keep it worksheet-length: thorough working, but no essays.`;

const DIAGRAM_ALLOWED = `
DIAGRAMS
- If (and only if) a simple diagram or sketch genuinely aids understanding (e.g. a graph shape, triangle, vector sketch), you MAY include exactly ONE simple inline SVG inside a fenced code block:
\`\`\`svg
<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">...</svg>
\`\`\`
- Pure SVG 1.1 only: basic shapes, paths, lines, text. No external references, no images, no scripts. Keep it minimal and clearly labelled.
- If no diagram helps, do not include one.`;

const DIAGRAM_FORBIDDEN = `
DIAGRAMS
- Do NOT include any SVG, images, or diagrams. Express everything in text and LaTeX.`;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    questionText?: string;
    solution?: string;
    answer?: string;
    marks?: number | null;
    allowDiagrams?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { questionText, solution, answer, marks, allowDiagrams } = body;
  if (!questionText?.trim()) {
    return NextResponse.json({ error: 'questionText is required' }, { status: 400 });
  }

  const system = SYSTEM_PROMPT + (allowDiagrams ? DIAGRAM_ALLOWED : DIAGRAM_FORBIDDEN);

  const userText = `Question${marks ? ` [${marks} marks]` : ''}:
${questionText}

Raw solution:
${solution?.trim() || '(none provided — derive the full solution yourself)'}

Final answer: ${answer?.trim() || '(not provided)'}

Rewrite this as an annotated teaching solution following the rules.`;

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    });

    const annotated = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    if (!annotated) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 500 });
    }
    return NextResponse.json({ annotated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI error';
    console.error('[worksheet-builder/annotate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
