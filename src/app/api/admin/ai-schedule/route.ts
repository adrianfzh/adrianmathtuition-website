import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sseChunk(controller: ReadableStreamDefaultController, data: string) {
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
}

/** Returns Monday of the week containing dateStr (UTC-based, matches admin-schedule/route.ts) */
function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function addDaysToIso(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let messages: { role: string; content: string }[];
  try {
    ({ messages } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const today = localToday();
  const weekStart = getMondayOfWeek(today);
  const weekEnd = addDaysToIso(weekStart, 6);
  const weekEndExclusive = addDaysToIso(weekStart, 7);

  // ─── Fetch schedule data ─────────────────────────────────────────────────

  let scheduleTable = '';
  try {
    const lessonsFilter = `AND({Date}>='${weekStart}',{Date}<'${weekEndExclusive}',{Status}!='Cancelled')`;

    const [lessonsData, studentsData, slotsData] = await Promise.all([
      airtableRequestAll(
        'Lessons',
        `?filterByFormula=${encodeURIComponent(lessonsFilter)}` +
          `&sort[0][field]=Date&sort[0][direction]=asc` +
          `&fields[]=Date&fields[]=Slot&fields[]=Student&fields[]=Type&fields[]=Status&fields[]=Notes`
      ),
      airtableRequestAll('Students', `?fields[]=Student Name&fields[]=Level`),
      airtableRequestAll('Slots', `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}&fields[]=Day&fields[]=Time&fields[]=Level`),
    ]);

    const studentsById: Record<string, { name: string; level: string }> = Object.fromEntries(
      studentsData.records.map((r: any) => [
        r.id,
        { name: r.fields['Student Name'] || 'Unknown', level: r.fields['Level'] || '' },
      ])
    );

    const slotsById: Record<string, { time: string; level: string }> = Object.fromEntries(
      slotsData.records.map((r: any) => [
        r.id,
        { time: r.fields['Time'] || '', level: r.fields['Level'] || '' },
      ])
    );

    const rows = lessonsData.records.map((r: any) => {
      const f = r.fields;
      const dateStr: string = f['Date'] || '';
      const dayName = dateStr
        ? DAY_NAMES[new Date(dateStr + 'T00:00:00Z').getUTCDay()]
        : '';
      const slotId = f['Slot']?.[0] ?? '';
      const slot = slotsById[slotId] ?? { time: '', level: '' };
      const studentId = f['Student']?.[0] ?? '';
      const student = studentsById[studentId] ?? { name: 'Unknown', level: '' };

      return `${r.id} | ${dateStr} | ${dayName} | ${slot.time} | ${student.name} (${student.level}) | ${f['Type'] ?? ''} | ${f['Status'] ?? ''}`;
    });

    scheduleTable =
      'recId | Date | Day | Time | Student (Level) | Type | Status\n' +
      rows.join('\n');
  } catch (err: any) {
    scheduleTable = `(Error fetching schedule: ${err?.message ?? err})`;
  }

  // ─── Build system prompt ─────────────────────────────────────────────────

  const systemPrompt = `You are an AI assistant for Adrian's Math Tuition lesson schedule management.

Today: ${today}. Current week: ${weekStart} to ${weekEnd}.

## This week's schedule
${scheduleTable}

## What you can do
Answer questions, identify issues, and propose schedule actions.

When you want to take action, end your response with an action plan in this EXACT format (no extra text after the closing tag):
<ACTION_PLAN>
{"summary":"one-line description","actions":[{"id":"unique_id","label":"Short description for user","type":"mark_attendance","lessonId":"recXXX","status":"Completed"}],"followUp":"optional follow-up question"}
</ACTION_PLAN>

Action types and their required fields:
- mark_attendance: lessonId (string), status ("Completed"|"Absent"|"Cancelled"|"Cancelled-Prorated")
- add_lesson: payload (object matching /api/admin-schedule/add body: { slotId, studentId, date, type })
- delete_lesson: lessonId (string)

Rules:
- Always explain what you found and what you plan to do BEFORE the ACTION_PLAN block
- For destructive actions (deleting lessons), always confirm intent first
- If just answering a question, no ACTION_PLAN block needed
- Be concise — this is a mobile-friendly admin tool
- Record IDs (recXXX) are in the first column of the schedule data above
- "Today's lessons" means date == ${today}`;

  // ─── Stream response ─────────────────────────────────────────────────────

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicMessages = messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        let emittedLen = 0;
        let accText = '';
        let actionPlanEmitted = false;

        const response = await anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: anthropicMessages,
        });

        for await (const chunk of response) {
          if (
            chunk.type !== 'content_block_delta' ||
            chunk.delta.type !== 'text_delta'
          ) {
            continue;
          }

          accText += chunk.delta.text;

          if (actionPlanEmitted) continue;

          const planStart = accText.indexOf('<ACTION_PLAN>');

          if (planStart === -1) {
            const newText = accText.slice(emittedLen);
            if (newText) {
              sseChunk(controller, JSON.stringify({ type: 'text', content: newText }));
              emittedLen = accText.length;
            }
          } else {
            const safeEnd = planStart;
            if (safeEnd > emittedLen) {
              const newText = accText.slice(emittedLen, safeEnd);
              if (newText) {
                sseChunk(controller, JSON.stringify({ type: 'text', content: newText }));
                emittedLen = safeEnd;
              }
            }

            const planEnd = accText.indexOf('</ACTION_PLAN>');
            if (planEnd !== -1) {
              const jsonStr = accText.slice(planStart + 13, planEnd).trim();
              try {
                const plan = JSON.parse(jsonStr);
                sseChunk(controller, JSON.stringify({ type: 'action_plan', plan }));
              } catch {
                sseChunk(
                  controller,
                  JSON.stringify({ type: 'text', content: accText.slice(emittedLen) })
                );
              }
              actionPlanEmitted = true;
            }
          }
        }

        // After stream ends: flush any remaining un-emitted text
        if (!actionPlanEmitted) {
          const remaining = accText.slice(emittedLen);
          if (remaining) {
            sseChunk(controller, JSON.stringify({ type: 'text', content: remaining }));
          }
        }

        sseChunk(controller, '[DONE]');
      } catch (err: any) {
        console.error('[ai-schedule]', err);
        sseChunk(
          controller,
          JSON.stringify({ type: 'text', content: `Error: ${err?.message ?? err}` })
        );
        sseChunk(controller, '[DONE]');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
