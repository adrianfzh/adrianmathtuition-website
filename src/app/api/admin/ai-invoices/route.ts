import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';
import { getInvoiceMonth } from '@/lib/invoice-month';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sseChunk(controller: ReadableStreamDefaultController, data: string) {
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
}

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
  const invoiceMonth = getInvoiceMonth();

  // ─── Fetch invoice data ──────────────────────────────────────────────────

  let invoiceTable = '';
  try {
    const formula = encodeURIComponent(
      `OR({Status}='Draft',{Status}='Approved',{Status}='Sent')`
    );
    const invoicesData = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${formula}&sort[0][field]=Student&sort[0][direction]=asc` +
        `&fields[]=Student&fields[]=Month&fields[]=Final Amount` +
        `&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Status` +
        `&fields[]=Sent At&fields[]=Line Items Extra&fields[]=Auto Notes` +
        `&fields[]=Deferred Amount&fields[]=Deferred Note&fields[]=Deferred To Month&fields[]=Deferred Applied`
    );

    // Fetch all students (avoid RECORD_ID filter truncation bug)
    const studentsData = await airtableRequestAll(
      'Students',
      `?fields[]=Student Name&fields[]=Level`
    );
    const studentsById: Record<string, string> = Object.fromEntries(
      studentsData.records.map((r: any) => [r.id, r.fields['Student Name'] || r.id])
    );

    const pendingDeferrals: string[] = [];
    const rows = invoicesData.records.map((r: any) => {
      const f = r.fields;
      const studentId = f['Student']?.[0] ?? '';
      const studentName = studentsById[studentId] || 'Unknown';
      const finalAmount: number = f['Final Amount'] ?? 0;
      const amountPaid: number = f['Amount Paid'] ?? 0;
      const outstanding = Math.max(0, finalAmount - amountPaid);
      const sentAt: string = f['Sent At'] ? String(f['Sent At']).slice(0, 10) : '—';
      const isPaid: boolean = f['Is Paid'] ?? false;

      // Collect any unapplied deferred adjustment carried on this invoice
      const defAmt: number = f['Deferred Amount'] ?? 0;
      const defApplied: boolean = f['Deferred Applied'] ?? false;
      if (defAmt !== 0 && !defApplied) {
        pendingDeferrals.push(
          `${r.id} | ${studentName} | carries $${defAmt.toFixed(2)} → ${f['Deferred To Month'] ?? '(no target month)'} | note: ${f['Deferred Note'] ?? ''}`
        );
      }

      return `${r.id} | ${studentName} | ${f['Month'] ?? ''} | $${finalAmount.toFixed(2)} | $${amountPaid.toFixed(2)} | $${outstanding.toFixed(2)} | ${f['Status'] ?? ''} | sent:${sentAt} | paid:${isPaid}`;
    });

    invoiceTable =
      'recId | Student | Month | Final | Paid | Outstanding | Status | SentAt | IsPaid\n' +
      rows.join('\n') +
      '\n\n## Pending deferred adjustments (not yet applied)\n' +
      (pendingDeferrals.length
        ? 'carrierRecId | Student | Carries → Target Month | Note\n' + pendingDeferrals.join('\n')
        : '(none)');
  } catch (err: any) {
    invoiceTable = `(Error fetching invoices: ${err?.message ?? err})`;
  }

  // ─── Build system prompt ─────────────────────────────────────────────────

  const systemPrompt = `You are an AI assistant for Adrian's Math Tuition invoice management.

Today: ${today}. Current invoice month: ${invoiceMonth.label}.

## Invoice data
${invoiceTable}

## What you can do
Answer questions about invoices, identify issues, and propose actions.

When you want to take action, end your response with an action plan in this EXACT format (no extra text after the closing tag):
<ACTION_PLAN>
{"summary":"one-line description","actions":[{"id":"unique_id","label":"Short description for user","type":"patch_invoice","recordId":"recXXX","fields":{"Final Amount":280}}],"followUp":"optional follow-up question"}
</ACTION_PLAN>

Action types and their required fields:
- patch_invoice: recordId (string), fields (object — ONLY the Invoices fields listed below)
- regenerate_pdfs: recordIds (string array)
- send_emails: recordIds (string array)
- mark_paid: recordId (string), amount (number), isPaid (boolean)

## Valid Invoices fields for patch_invoice (use these EXACT names — others 422)
- "Lessons Count" (number) — number of lessons billed. This IS stored on the invoice (a snapshot taken at generation) and you CAN edit it.
- "Line Items" (long text holding a JSON array) — the per-lesson rows shown on the PDF. Also stored on the invoice and editable. Each item looks like {"date":"2026-06-07","day":"Sun 3-5pm","type":"Regular","description":"..."}. To clear all lessons, set it to the literal string "[]".
- "Final Amount" (number) — the total billed.
- "Auto Notes" (long text) — admin/parent-facing note shown on the invoice. THIS is the notes field; there is NO field called "Notes".
- "Adjustment Notes" (long text) — reason for a manual adjustment.
- "Adjustment Amount" (number, signed) — manual one-off adjustment for THIS invoice.
- "Custom Email Message" (long text) — overrides the email body when sending.
- "Status" (one of: Draft, Approved, Sent, Paid, Overdue, Voided).
- "Issue Date" (date, "YYYY-MM-DD") — the invoice issue date. Editable. Today is ${today}.
- "Due Date" (date, "YYYY-MM-DD") — the payment due date. Editable; set to "" (empty string) to clear it (e.g. when no payment is required).
- "Deferred Amount" / "Deferred Note" / "Deferred To Month" — see deferred adjustments below.

These are plain invoice fields, NOT "PDF-template" or "computed" fields — you CAN patch Issue Date, Due Date, Lessons Count and Line Items directly. The PDF just renders whatever these fields say. Never tell the user a field must be fixed in the PDF template, generator settings, or lesson/schedule records — the invoice fields are authoritative.

## DEFAULT recipe: "no lessons this month" / "no payment required"
When the user says a student had no lessons / owes nothing for the invoice's month, DEFAULT to turning it into a $0 invoice (do NOT void it — voiding hides it from records; a $0 invoice is a clear document the parent receives). In ONE patch_invoice set:
  {"Lessons Count":0, "Line Items":"[]", "Line Items Extra":"", "Final Amount":0, "Adjustment Amount":0,
   "Issue Date":"${today}", "Due Date":"",
   "Auto Notes":"No lessons conducted in <Month> — no payment required.",
   "Custom Email Message":"Dear Parent/Student,\n\nThere are no lessons for <Student> in <Month>, so no payment is required. Please disregard any earlier invoice for this month.\n\nBest regards,\nAdrian"}
Replace <Month>/<Student> with the real values. Then offer to regenerate_pdfs (so the PDF shows $0, today's issue date, no due date) and send_emails. Only VOID instead if the user explicitly asks to cancel/void the invoice.

- To APPEND to a note, include the existing text plus your addition (PATCH replaces the whole field).
- There is NO "Title", "Label", or "Amended" field. An invoice is marked AMENDED automatically when it's re-sent (it already has a Sent At) — the email subject becomes "AMENDED Invoice…". To re-send an amended invoice, just regenerate_pdfs then send_emails; do not try to set an "Amended" field.

## Deferred adjustments (reminders that apply to a FUTURE month's invoice)
Use this when the user wants a credit/charge applied to a LATER month's invoice that does not exist yet (e.g. "defer Kiara's -$280 referral fee to July", "remind me to add $50 to Bob's August invoice").
- You CANNOT edit a future invoice directly (it isn't generated until that month). Instead, store the deferral on the student's CURRENT/most-recent invoice using patch_invoice with these fields:
  - "Deferred Amount": signed number (negative for a credit, e.g. -280; positive for an extra charge)
  - "Deferred Note": short reason shown on the future invoice
  - "Deferred To Month": the target month as exactly "Month YYYY" (e.g. "July 2026"). Today is ${today}, so infer the year.
  - Leave "Deferred Applied" unset/false — the invoice generator ticks it automatically when it applies the adjustment next month.
- When the generator runs for the target month, it auto-adds this as a line item, adjusts the Final Amount, and ticks Deferred Applied. A banner also reminds the admin.
- To CANCEL a pending deferral, patch_invoice that carrier record with {"Deferred Amount":0,"Deferred Note":"","Deferred To Month":""}.
- "Pending deferred adjustments" above lists deferrals already scheduled but not yet applied.

Rules:
- Always explain what you found and what you plan to do BEFORE the ACTION_PLAN block
- For destructive actions (sending emails), always include them in the plan so user can confirm
- If just answering a question, no ACTION_PLAN block needed
- Be concise — this is a mobile-friendly admin tool
- Record IDs (recXXX) are in the first column of the invoice data above`;

  // ─── Stream response ─────────────────────────────────────────────────────

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicMessages = messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        // Collect full response, then decide how to split text vs action plan.
        // We stream text chunks in real-time until we detect the <ACTION_PLAN> marker.
        let emittedLen = 0; // how many chars of plain text we've already sent
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
            // No plan marker yet — stream everything new
            const newText = accText.slice(emittedLen);
            if (newText) {
              sseChunk(controller, JSON.stringify({ type: 'text', content: newText }));
              emittedLen = accText.length;
            }
          } else {
            // Plan marker found — stream text before it (if any new chars)
            const safeEnd = planStart;
            if (safeEnd > emittedLen) {
              const newText = accText.slice(emittedLen, safeEnd);
              if (newText) {
                sseChunk(controller, JSON.stringify({ type: 'text', content: newText }));
                emittedLen = safeEnd;
              }
            }

            // Try to parse if closing tag also present
            const planEnd = accText.indexOf('</ACTION_PLAN>');
            if (planEnd !== -1) {
              const jsonStr = accText.slice(planStart + 13, planEnd).trim();
              try {
                const plan = JSON.parse(jsonStr);
                sseChunk(controller, JSON.stringify({ type: 'action_plan', plan }));
              } catch {
                // Malformed JSON — emit raw text fallback
                sseChunk(
                  controller,
                  JSON.stringify({ type: 'text', content: accText.slice(emittedLen) })
                );
              }
              actionPlanEmitted = true;
            }
            // else: closing tag not yet received — keep buffering
          }
        }

        // After stream ends: if plan marker appeared but closing tag never came, emit remaining text
        if (!actionPlanEmitted) {
          const remaining = accText.slice(emittedLen);
          if (remaining) {
            sseChunk(controller, JSON.stringify({ type: 'text', content: remaining }));
          }
        }

        sseChunk(controller, '[DONE]');
      } catch (err: any) {
        console.error('[ai-invoices]', err);
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
