import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/admin/voice-log
//
// In-class voice progress capture. Receives a short audio recording (multipart)
// plus the day's lesson roster (student names + lesson ids, passed by the
// client from /api/admin-schedule data). Pipeline, all in-memory:
//
//   1. Gemini transcribes the audio (GOOGLE_API_KEY, @google/generative-ai —
//      same stack as batch marking). Audio is NEVER stored anywhere.
//   2. claude-opus-4-8 parses the transcript into per-student updates
//      { lessonId, mastery?, topics?[], homeworkPrev?, note? }, fuzzy-matching
//      spoken names against the roster (case/partial). Speech that can't be
//      mapped to a rostered student lands in an `unassigned` bucket.
//
// Returns { transcript, updates, unassigned } for a client-side confirm sheet.
// The client then writes via the EXISTING lesson-update / lesson-prev-update
// routes (14-day window enforced there) — this route writes nothing.

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB ≈ plenty for a few minutes of speech

interface RosterEntry {
  lessonId: string;
  studentName: string;
  slotTime?: string;
}

export interface VoiceLogUpdate {
  lessonId: string;
  studentName: string;
  mastery?: 'Strong' | 'OK' | 'Slow';
  topics?: string[];
  homeworkPrev?: 'Yes' | 'Partial' | 'No';
  note?: string;
}

const MASTERY_VALUES = ['Strong', 'OK', 'Slow'] as const;
const HW_VALUES = ['Yes', 'Partial', 'No'] as const;

function extractJson(text: string): unknown {
  // Strip markdown fences if present, then parse the first {...} block.
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let audio: File | null = null;
  let roster: RosterEntry[] = [];
  try {
    const form = await req.formData();
    audio = form.get('audio') as File | null;
    const lessonsRaw = form.get('lessons');
    if (typeof lessonsRaw === 'string') roster = JSON.parse(lessonsRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  if (!audio || typeof audio.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 20 MB)' }, { status: 400 });
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    return NextResponse.json({ error: 'Missing lessons roster' }, { status: 400 });
  }
  roster = roster
    .filter(r => r && typeof r.lessonId === 'string' && typeof r.studentName === 'string')
    .slice(0, 50);
  if (roster.length === 0) {
    return NextResponse.json({ error: 'Roster has no valid entries' }, { status: 400 });
  }

  // ── 1. Transcribe with Gemini (in-memory only) ─────────────────────────────
  const audioBuffer = Buffer.from(await audio.arrayBuffer());
  const mimeType = audio.type && audio.type.startsWith('audio/') ? audio.type.split(';')[0] : 'audio/webm';
  const studentNames = roster.map(r => r.studentName).join(', ');

  let transcript = '';
  try {
    const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBuffer.toString('base64') } },
          {
            text:
              'Transcribe this audio verbatim. It is a math tuition teacher in Singapore ' +
              'dictating quick end-of-class progress notes about students. ' +
              `Student names that may be mentioned: ${studentNames}. ` +
              'Prefer these spellings when a spoken name sounds like one of them. ' +
              'Output ONLY the transcript text, no commentary.',
          },
        ],
      }],
    });
    transcript = result.response.text().trim();
  } catch (err) {
    console.error('[voice-log] Gemini transcription failed:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  if (!transcript) {
    return NextResponse.json({ error: 'Empty transcript — no speech detected' }, { status: 422 });
  }

  // ── 2. Parse into per-student updates with Claude ──────────────────────────
  const rosterList = roster
    .map(r => `- lessonId: ${r.lessonId} | student: ${r.studentName}${r.slotTime ? ` | slot: ${r.slotTime}` : ''}`)
    .join('\n');

  const system =
    `You convert a tuition teacher's spoken end-of-class notes into structured per-student progress updates.\n\n` +
    `Today's lesson roster (the ONLY valid lessonIds):\n${rosterList}\n\n` +
    `Rules:\n` +
    `- Match spoken names to roster students fuzzily: case-insensitive, first-name-only, partial or slightly mispronounced names all count. ` +
    `If exactly one roster student plausibly matches, use them.\n` +
    `- mastery: "Strong" | "OK" | "Slow" — infer from phrases like "did well / solid / strong" → Strong, "okay / fine / average" → OK, "struggled / weak / slow / lost" → Slow. Omit if not mentioned.\n` +
    `- topics: array of short topic names the teacher says were covered (e.g. "Differentiation", "Vectors"). Omit if none mentioned.\n` +
    `- homeworkPrev: "Yes" | "Partial" | "No" — whether the student returned/did their PREVIOUS homework ("didn't do homework" → No, "did half" → Partial, "homework done" → Yes). Omit if not mentioned.\n` +
    `- note: one concise sentence capturing anything else said about that student (behaviour, plans, reminders). Omit if nothing beyond the fields above.\n` +
    `- One entry per student maximum — merge multiple mentions.\n` +
    `- Speech that cannot be confidently assigned to a rostered student goes in "unassigned" as short verbatim-ish fragments.\n\n` +
    `Respond with ONLY this JSON, no prose:\n` +
    `{"updates":[{"lessonId":"...","studentName":"...","mastery":"...","topics":["..."],"homeworkPrev":"...","note":"..."}],"unassigned":["..."]}`;

  let parsed: { updates?: unknown[]; unassigned?: unknown[] };
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: `Transcript:\n"""\n${transcript}\n"""` }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    parsed = extractJson(text) as { updates?: unknown[]; unassigned?: unknown[] };
  } catch (err) {
    console.error('[voice-log] Claude parse failed:', err);
    // Still return the transcript so the admin's dictation isn't lost.
    return NextResponse.json(
      { error: 'Could not parse transcript into updates', transcript },
      { status: 502 }
    );
  }

  // ── 3. Validate against the roster (never trust model-invented ids) ────────
  const byId = new Map(roster.map(r => [r.lessonId, r]));
  const unassigned: string[] = (parsed.unassigned ?? [])
    .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    .map(u => u.trim());
  const seen = new Set<string>();
  const updates: VoiceLogUpdate[] = [];

  for (const raw of parsed.updates ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const u = raw as Record<string, unknown>;
    let entry = typeof u.lessonId === 'string' ? byId.get(u.lessonId) : undefined;
    // Fallback: recover by (fuzzy) name if the model mangled the id.
    if (!entry && typeof u.studentName === 'string') {
      const needle = u.studentName.trim().toLowerCase();
      const matches = roster.filter(r => {
        const name = r.studentName.toLowerCase();
        return name === needle || name.includes(needle) || needle.includes(name.split(' ')[0]);
      });
      if (matches.length === 1) entry = matches[0];
    }
    if (!entry || seen.has(entry.lessonId)) {
      const frag = [u.studentName, u.note].filter(v => typeof v === 'string' && v).join(': ');
      if (frag) unassigned.push(frag);
      continue;
    }
    seen.add(entry.lessonId);

    const mastery = MASTERY_VALUES.includes(u.mastery as never) ? (u.mastery as VoiceLogUpdate['mastery']) : undefined;
    const homeworkPrev = HW_VALUES.includes(u.homeworkPrev as never) ? (u.homeworkPrev as VoiceLogUpdate['homeworkPrev']) : undefined;
    const topics = Array.isArray(u.topics)
      ? u.topics.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim()).slice(0, 12)
      : undefined;
    const note = typeof u.note === 'string' && u.note.trim() !== '' ? u.note.trim().slice(0, 500) : undefined;

    if (!mastery && !homeworkPrev && !(topics && topics.length) && !note) continue;
    updates.push({
      lessonId: entry.lessonId,
      studentName: entry.studentName,
      ...(mastery ? { mastery } : {}),
      ...(topics && topics.length ? { topics } : {}),
      ...(homeworkPrev ? { homeworkPrev } : {}),
      ...(note ? { note } : {}),
    });
  }

  return NextResponse.json({ transcript, updates, unassigned });
}
