import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an assistant helping edit math revision notes for Singapore secondary/JC students.

CRITICAL: You are editing ONE SPECIFIC SECTION of the notes, not the entire document.
- The content provided is ONLY the body of the section being edited.
- Return ONLY the updated section body content — nothing else.
- Do NOT add or repeat section headings like **1. Section Name** — headings are managed separately.
- Do NOT generate content for other sections.
- Do NOT wrap the output in markdown code fences.

Your job: Return the updated section body with the requested changes applied.

Rules:
- Return ONLY the updated section body, no explanation or commentary
- Preserve ALL existing content exactly unless the instruction says to change it
- Use the same formatting style as the existing content:
  - LaTeX: $inline$ and $$display$$
  - **Example N:** for worked examples
  - **Solution:** followed by **Step N:** for solutions
  - Q1. Q2. etc. for practice questions (each part on its own line)
  - [Try: question] for inline try-this callouts
  - [Ans: answer] for click-to-reveal answers
  - ### for sub-headings within a section
  - **Note:** for important notes
- For parts (a), (b), (i), (ii) etc. — put EACH part on its OWN line
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
            content: `Topic: ${topic || 'Unknown'}\nSubject: ${subject || 'AM'}\n\nSection body content (return ONLY the updated body for this section):\n\`\`\`\n${currentContent || ''}\n\`\`\`\n\nInstruction: ${instruction}`,
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
