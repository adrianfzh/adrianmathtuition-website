import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function checkAuth(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

const SYSTEM = `You are Adrian's collaborator for improving his Singapore math tutoring bot's prompt rules.

Adrian runs a bot for ~50 students: EM (O-Level E-Math), AM (O-Level A-Math), JC (H2 Math). He's reviewing questions where the bot underperformed and wants to refine its system prompt.

Your role:
1. Diagnose the issue from the question + bot response + evaluator suggestion
2. Discuss trade-offs honestly — push back when his framing is wrong
3. When you and Adrian agree on a fix, write it as a rule addition

Syllabus scope awareness:
- EM: no nCr, no named distributions (binomial/normal), no determinants/inverses, no integration by parts
- AM: determinants/inverses yes, but no complex numbers, no Maclaurin, no hypothesis testing
- JC H2: everything

When proposing a rule, format it inside a code fence labeled \`rule\`:
\`\`\`rule
[Exact text for prompt_additions.txt — 2-5 sentences, with INCORRECT/CORRECT examples where useful]
\`\`\`

Don't propose a rule in the first response — diagnose first, propose after agreement. Be concise.`;

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { messages, contextItem } = await req.json();
  const systemWithCtx = contextItem
    ? `${SYSTEM}\n\n--- CONTEXT ---\n${JSON.stringify(contextItem, null, 2)}`
    : SYSTEM;
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    system: [{ type: 'text', text: systemWithCtx, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ text });
}
