import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an assistant helping edit math revision notes for Singapore secondary/JC students.

You will receive:
1. The current notes content (markdown with LaTeX)
2. An instruction describing what to add, change, or remove

Your job: Return the COMPLETE updated notes content with the requested changes applied.

IMPORTANT: You MUST return the COMPLETE notes content from start to finish. Do NOT truncate, cut short, or summarise any sections. Every single line of the original content must appear in your output, with only the requested changes applied. If the content is long, that is fine — return all of it. Never end early or add a note like "(rest of content unchanged)".

Rules:
- Return ONLY the full updated content, no explanation or commentary
- Preserve ALL existing content exactly unless the instruction says to change it
- Use the same formatting style as the existing content:
  - **Bold numbered headings** for sections: **1. Section Name**
  - LaTeX: $inline$ and $$display$$
  - **Example N:** for worked examples
  - [Try: question] for practice questions
  - [Ans: answer] for answers
  - ### for sub-headings
  - **Note:** for important notes
- For worked examples, show clear step-by-step solutions
- Use Singapore syllabus methods and notation
- Keep language concise and student-friendly`;

export async function POST(req: NextRequest) {
  try {
    const { instruction, currentContent, topic, subject, password } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    if (!instruction?.trim()) {
      return new Response(JSON.stringify({ error: 'Instruction is required' }), { status: 400 });
    }

    const client = new Anthropic();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const send = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    (async () => {
      try {
        const stream = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Topic: ${topic || 'Unknown'}\nSubject: ${subject || 'AM'}\n\nCurrent notes content:\n\`\`\`\n${currentContent || ''}\n\`\`\`\n\nInstruction: ${instruction}`,
          }],
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
