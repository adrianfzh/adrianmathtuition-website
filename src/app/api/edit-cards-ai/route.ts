import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const WORKED_EXAMPLE_PROMPT = `You are editing ONE swipe-app worked-example card for a Singapore math student.

Cards are bite-sized — typically 120-220 words. They appear one-at-a-time in a TikTok-style vertical swipe interface and render via react-markdown + remark-math + rehype-katex with strict=false, trust=true.

OUTPUT RULES — ABSOLUTELY CRITICAL
- Return ONLY the updated card content body. No preamble, no postamble, no commentary.
- Do NOT include the card_title — that's edited separately.
- Do NOT wrap your output in markdown code fences.
- Do NOT include "Updated card:" or "Here's the rewrite:" or any framing.

FORMATTING CONVENTIONS
- Math: $inline$ for inline, $$display$$ for block.
- Multi-step equations MUST use $\\begin{aligned}...\\\\...\\end{aligned}$ so they render left-aligned on the = sign. Each line ends with \\\\.
- Bold labels: **Question:**, **Step 1.**, **Step 2.**, **Solution:**, **Check:**, **Common pitfall:**, **⚠ Watch out:** — pick whichever fit the card's structure.
- Address the student in second person ("you can simplify...", "you'll notice...").
- Use Singapore syllabus methods and notation. No US-isms.

CONTENT RULES
- Preserve the mathematical correctness exactly unless the instruction explicitly says to fix an error.
- Preserve the worked example's numeric values unless the instruction says to change them.
- Keep the same sub-skill scope — don't drift the card into a different concept.
- If the instruction asks for a fresh example, fully rewrite the card with new numbers/setup but the same sub-skill.

CONTEXT YOU'RE GIVEN
- Level (AM/EM/JC/S1/S2), topic, sub-group name, sub-group description — use these to keep the card scoped.

If the instruction is impossible or self-contradictory, return the current content unchanged.`;

const REFRESHER_PROMPT = `You are editing ONE swipe-app refresher card for a Singapore math student.

Refresher cards are SHORT memory aids — typically 40-100 words. They are NOT worked examples. They appear one-at-a-time in a TikTok-style vertical swipe interface and render via react-markdown + remark-math + rehype-katex with strict=false, trust=true.

OUTPUT RULES — ABSOLUTELY CRITICAL
- Return ONLY the updated card content body. No preamble, no postamble, no commentary.
- Do NOT include the card_title — that's edited separately.
- Do NOT wrap your output in markdown code fences.
- Do NOT include "Updated card:" or "Here's the rewrite:" or any framing.

REFRESHER CARD PURPOSE
A refresher card is a compact formula/rule/tip that a student glances at before a test.
- Focus on: key formula, key condition, common pitfall, or mnemonic.
- NOT a worked example — no long step-by-step workings.
- Bullet points and short lines preferred over prose.
- Math: $inline$ for inline, $$display$$ for a single formula.

FORMATTING CONVENTIONS
- Bold labels like **Formula:**, **Remember:**, **Watch out:**, **Key condition:** — pick the one that fits.
- Singapore syllabus methods and notation. No US-isms.

CONTENT RULES
- Keep the card tightly scoped to the sub-skill — don't drift.
- Preserve mathematical correctness unless the instruction says to fix an error.

If the instruction is impossible or self-contradictory, return the current content unchanged.`;

export async function POST(req: NextRequest) {
  try {
    const {
      instruction,
      currentTitle,
      currentContent,
      level,
      topic,
      subgroupName,
      subgroupDescription,
      content_kind,
      password,
    } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    if (!instruction?.trim()) {
      return new Response(JSON.stringify({ error: 'Instruction is required' }), { status: 400 });
    }

    const userMessage = `Level: ${level ?? ''}
Topic: ${topic ?? ''}
Sub-group: ${subgroupName ?? ''}
Sub-group scope: ${subgroupDescription ?? '—'}

Current card title: ${currentTitle ?? ''}

Current card content:
\`\`\`
${currentContent ?? ''}
\`\`\`

Instruction: ${instruction}`;

    const client = new Anthropic();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const send = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    (async () => {
      try {
        const systemPrompt = content_kind === 'refresher' ? REFRESHER_PROMPT : WORKED_EXAMPLE_PROMPT;
        const stream = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            await send({ chunk: event.delta.text });
          }
        }

        await send({ done: true });
      } catch (err: unknown) {
        await send({ error: err instanceof Error ? err.message : 'AI error' });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Server error' }),
      { status: 500 }
    );
  }
}
