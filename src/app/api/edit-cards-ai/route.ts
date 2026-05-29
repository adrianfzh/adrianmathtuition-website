import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 120;

const WORKED_EXAMPLE_PROMPT = `You are editing ONE swipe-app worked-example card for a Singapore math student.

Cards are bite-sized — typically 120-220 words. They appear one-at-a-time in a TikTok-style vertical swipe interface and render via react-markdown + remark-math + rehype-katex with strict=false, trust=true.

OUTPUT RULES — ABSOLUTELY CRITICAL
- Return ONLY the updated card content body. No preamble, no postamble, no commentary.
- Do NOT include the card_title — that's edited separately.
- Do NOT wrap your output in markdown code fences.
- Do NOT include "Updated card:" or "Here's the rewrite:" or any framing.
- If generating an SVG diagram, output it as a raw <svg>...</svg> block inline in the markdown. Keep it minimal: no external dependencies, pure SVG 1.1 with basic shapes, text, and path elements. Width/height should use viewBox for scaling.

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

MULTI-PART STRUCTURE — CRITICAL
- If the current card has labelled parts like (a), (b), (c), (d) — or sub-parts (i), (ii), (iii) — you MUST preserve EVERY single label in your output. Do not drop any part. Do not collapse multiple parts into one.
- Before you start writing, count the parts in the input (every (a), (b), (i), (ii), etc.). Your output must contain at least as many part labels.
- When asked to "add solutions" or "add working" to a multi-part question, add the solution BELOW each part's text, keeping the original question text intact. Never replace the whole card with just one part's solution.
- "Style like the worked examples" means tone/formatting (Step 1, Step 2, Solution: blocks), NOT collapsing a multi-part question into a single short worked example.

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
      images,         // NEW: [{ data: string, mediaType: string }]  — multi-image
      imageData,      // legacy single-image (kept for backward compat)
      imageMediaType,
      password,
    } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Normalise to an array regardless of single vs multi format
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type AllowedMediaType = typeof allowedTypes[number];
    function resolveType(t?: string): AllowedMediaType {
      return allowedTypes.includes(t as AllowedMediaType) ? (t as AllowedMediaType) : 'image/jpeg';
    }

    type ImageEntry = { data: string; mediaType?: string };
    const imageList: ImageEntry[] = Array.isArray(images) && images.length > 0
      ? images
      : (typeof imageData === 'string' && imageData.length > 0
          ? [{ data: imageData, mediaType: imageMediaType }]
          : []);
    const hasImages = imageList.length > 0;

    // Instruction is required unless at least one image is provided
    if (!hasImages && !instruction?.trim()) {
      return new Response(JSON.stringify({ error: 'Instruction is required' }), { status: 400 });
    }

    // Upload images to Vercel Blob before calling Claude (when images are present)
    const blobUrls: string[] = [];
    if (hasImages) {
      for (let i = 0; i < imageList.length; i++) {
        const img = imageList[i];
        const ext = (img.mediaType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
        const filename = `card-images/${Date.now()}-${i}.${ext}`;
        const buffer = Buffer.from(img.data, 'base64');
        const blob = await put(filename, buffer, {
          access: 'public',
          contentType: img.mediaType ?? 'image/jpeg',
        });
        blobUrls.push(blob.url);
      }
    }

    const blobUrlLines = ''; // URLs are now embedded in textInstruction / blobNote directly

    const blobNote = blobUrls.length > 0
      ? `\n\nBlob URLs (use these if you need to embed diagrams as images):\n${blobUrls.map((u, i) => `Image ${i + 1}: ${u}`).join('\n')}`
      : '';

    const textInstruction = instruction?.trim() ||
      (imageList.length === 1
        ? `Extract the worked example from this image and write a complete card in markdown + LaTeX:
1. Read ALL text, equations, and steps from the image — treat every part as text to transcribe.
2. Include the question, all solution steps, and the final answer.
3. ONLY if there is a geometric diagram or figure (not equations/text), also embed it as <img src="${blobUrls[0] ?? ''}" alt="diagram" style="max-width:100%;display:block;margin:8px 0" /> at the correct position. Do NOT use an <img> tag for plain equation images — write those as LaTeX instead.`
        : `There are ${imageList.length} images (e.g. multiple pages of the same question). Read ALL text and equations from EVERY image and combine them into one complete card in markdown + LaTeX:
1. Transcribe ALL text, equations, and steps from each image in sequence.
2. Include the full question, all solution steps, and the final answer.
3. ONLY if an image contains a geometric diagram or figure (not equations/text), embed it as <img src="BLOB_URL" alt="diagram" style="max-width:100%;display:block;margin:8px 0" /> using the blob URL listed below. Do NOT use <img> for equation images — write those as LaTeX instead.`);

    const textBlock = `Level: ${level ?? ''}
Topic: ${topic ?? ''}
Sub-group: ${subgroupName ?? ''}
Sub-group scope: ${subgroupDescription ?? '—'}

Current card title: ${currentTitle ?? ''}

Current card content:
\`\`\`
${currentContent ?? ''}
\`\`\`

Instruction: ${textInstruction}${blobNote}`;

    // Build message content — images first (each as its own block), then text
    const imageBlocks = imageList.map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: resolveType(img.mediaType),
        data: img.data,
      },
    }));

    const userContent = hasImages
      ? [...imageBlocks, { type: 'text' as const, text: textBlock }]
      : [{ type: 'text' as const, text: textBlock }];

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
          model: 'claude-opus-4-8',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
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
