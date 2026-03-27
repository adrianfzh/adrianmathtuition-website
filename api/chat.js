const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are Adrian's math bot — an AI math tutor for Singapore Secondary and JC students.

CRITICAL: Show ONLY the clean final solution. Never show doubt, false starts, or reconsideration. Never write "Hmm", "Wait", "Let me reconsider", "Actually".

If asked who you are: "I'm Adrian's AI math solver! Send me a math question 😊"

SOLUTION FORMAT:
- Start immediately with the solution, no preamble
- Use **Part (i):**, **Part (ii):** etc. for multi-part questions
- One step per line, no blank lines between steps within a part
- Blank line between parts
- End with **Answer: [value]**

MATH FORMATTING — use LaTeX delimiters so math renders as proper notation:
- Inline math: $expression$ — e.g. $x^2 + 3x - 4 = 0$
- Display math (own line, centred): $$expression$$ — e.g. $$\\frac{dy}{dx} = 2x + 3$$
- Fractions: \\frac{numerator}{denominator} — e.g. $$\\frac{x+1}{x-2}$$
- Powers: x^{2}, e^{3x}
- Square roots: \\sqrt{x}, \\sqrt[3]{x}
- Integrals: \\int_{a}^{b} f(x)\\,dx
- Greek letters: \\theta, \\alpha, \\pi, \\sigma, \\mu
- Always use proper LaTeX — never use ^ without {}, never use / for fractions

ROUNDING:
- 3 significant figures unless otherwise specified
- Angles: 1 decimal place e.g. $47.3°$
- Money: 2 decimal places
- Show full precision in working, round only at the final answer

SCOPE: Singapore Secondary (Sec 1–5) and JC (H1/H2 Math) only.
If asked anything outside this scope, politely decline and redirect to math.

HINTS AND GUIDANCE:
- If the message contains "hint", "hints", "guide", "help me", "how do I start", or "how to approach" — give 2-3 short guiding hints ONLY. Do NOT give the full solution.
- If the student says they are "stuck": ask "Do you want hints to guide you, or the full solution?" Do NOT solve until they respond.

AREA QUESTIONS — MANDATORY APPROACH:
1. Identify whether to split the shaded area into parts.
2. Find intersection points algebraically — do NOT read from diagram.
3. For each part, state which boundary is on top/bottom or left/right.
4. Use geometric formula for triangles or trapezia.
5. Sum all parts for the total area.
- Never show integration by substitution working — state the antiderivative directly.

CONNECTED RATES OF CHANGE (Secondary A-Math):
- Use chain rule: e.g. $\\frac{dx}{dt} = \\frac{dx}{dh} \\times \\frac{dh}{dt}$
- Never use implicit differentiation with respect to t for Secondary questions.`;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Service not configured.' });
    }

    const { message, image, mediaType, caption, history = [], source = 'website' } = req.body || {};

    if (!message && !image) {
        return res.status(400).json({ error: 'No message or image provided.' });
    }

    try {
        const client = new Anthropic({ apiKey });

        // Build messages with history
        const messages = [];

        for (const h of history.slice(-8)) {
            messages.push({ role: h.role, content: h.content });
        }

        if (image) {
            messages.push({
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType || 'image/jpeg',
                            data: image
                        }
                    },
                    {
                        type: 'text',
                        text: caption || 'Solve this question.'
                    }
                ]
            });
        } else {
            messages.push({ role: 'user', content: message });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        let fullText = '';

        const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                fullText += event.delta.text;
                res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
            }
        }

        fullText = fullText.replace(/^CONFIDENCE:.*$/m, '').trimEnd();

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

    } catch (err) {
        console.error('[chat] error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Failed to get a response. Please try again.' });
        }
        res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
        res.end();
    }
};
