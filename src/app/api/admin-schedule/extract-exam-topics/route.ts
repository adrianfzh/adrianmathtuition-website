import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { flattenExamTopics, parseExtractionResponse } from '@/lib/exam-topic-extract';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/admin-schedule/extract-exam-topics
// The exam dialog's "📷 From photo" button: a photo the student sent (school
// "topics tested" list, exam timetable, teacher's message) goes in; the
// topics it names come back mapped onto the SAME canonical list the picker
// shows, so the client just ticks them. Bonus fields when clearly visible:
// the exam date and a one-line caveat note ("Integration up to 10.1.6 only").
//
// Body: { image: dataURL | bare base64 (jpeg/png/webp, client-downscaled), level, subject }
// →     { topics: string[], examDate: string|null, note: string|null, photoUrl: string|null }
//
// photoUrl (2026-08-22): the same downscaled image is also kept on Vercel Blob
// (`exam-photos/<uuid>.<ext>`, random suffix) so Adrian can open the original
// later to verify the extraction — the dialog saves it with the exam entry
// (Exam Notes marker, lib/exam-notes-markers). Upload failure is non-fatal:
// the topics still come back, photoUrl is just null.
//
// School topic names rarely match canonical names, so the model maps by
// meaning; parseExtractionResponse then gates every returned topic against
// the canonical list (models author, deterministic gates verify).

const EXTRACTION_MODEL = 'claude-sonnet-5';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'extraction not configured' }, { status: 503 });
  }

  let body: { image?: string; level?: string; subject?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // Accept a data URL or bare base64. The client downscales to ≤1400px JPEG
  // (~200-400KB) — hard cap well under Vercel's 4.5MB body limit.
  const image = String(body.image || '');
  const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  const mediaType = (m ? m[1] : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
  const imageBase64 = m ? m[2] : image;
  if (!imageBase64 || imageBase64.length > 4_000_000) {
    return NextResponse.json({ error: 'image missing or too large' }, { status: 400 });
  }

  const level = String(body.level || '');
  const subject = String(body.subject || '');
  const canonical = flattenExamTopics(level, subject);

  const system = `You extract exam information from a photo for a Singapore math tutor. The photo is something a student sent about an upcoming school exam: a "topics tested" list, an exam timetable, a teacher's message, or similar. Work out which topics the exam tests and map them onto the tutor's canonical topic checklist.

Rules:
- "topics" must contain ONLY names copied exactly from the canonical list provided. Never invent or reword names.
- School topic names rarely match the canonical names — map by meaning, and expand umbrella entries to EVERY canonical topic they cover (e.g. "Sequences & Series" covers both "APGP" and "Series and Sequences"; "Applications of Differentiation" covers the Differentiation application topics).
- Include a canonical topic when the photo indicates any part of it is tested; put partial-coverage details in "note" instead of dropping the topic.
- Leave out canonical topics the photo does not indicate, and topics the photo explicitly excludes.
- "examDate": the exam's calendar date as YYYY-MM-DD, only if the photo clearly shows it (resolve short/relative dates using today's date — the exam is upcoming). Otherwise null.
- "note": ONE short line genuinely worth keeping (partial coverage, calculator rules), else null.

Reply with ONLY this JSON object, no markdown fences:
{"topics": ["..."], "examDate": "YYYY-MM-DD or null", "note": "... or null"}`;

  const userText = `Canonical topic list for ${subject || 'Math'} (${level || 'unknown level'}):\n${canonical.map(t => `- ${t}`).join('\n')}\n\nToday is ${localToday()} (Singapore). Extract the exam info from the photo.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1500,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: userText },
          ],
        },
      ],
    });
    const text = resp.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const extracted = parseExtractionResponse(text, canonical);
    let photoUrl: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
        const blob = await put(`exam-photos/${crypto.randomUUID()}.${ext}`, Buffer.from(imageBase64, 'base64'), {
          access: 'public', contentType: mediaType, addRandomSuffix: true,
        });
        photoUrl = blob.url;
      } catch (e) {
        console.error('[extract-exam-topics] photo upload failed:', e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ ...extracted, photoUrl });
  } catch (e) {
    console.error('[extract-exam-topics]', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Couldn't read exam info from that photo — try a clearer, closer shot" },
      { status: 502 }
    );
  }
}
