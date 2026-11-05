// 🧑‍🏫 The student's summary of a shared board — the server half (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026:
// "i want the summary functionality to be for the student, not for the tutor" → "yes"). Rules: lib/board-summary.
//
// 1. Catch up the board's reading (lib/board-read) so every page is in the text.
// 2. Sonnet 5.5 writes the summary from that text only; a line with a number not on the board is sent back
//    once, then dropped.
// 3. Two practice questions on the lesson's topic come from the bank through the student serving door
//    (practice_next with a plain student's audience + studentRow — what the portal serves), each with its
//    printed answer. None of this is ever written by the model.
// Made again only when the board has changed (summarySig). Usage is counted on the summary itself — the
// website has no cost ledger; about US$0.02–0.04 a summary on Sonnet 5.5 (told to Adrian before it ran).
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SONNET_55, anthropicText } from '@/lib/claude-models';
import { readBoard } from '@/lib/board-read';
import { ALL_TOPICS_FLAT, getTopicsForLevel } from '@/lib/canonical-topics';
import { bankScope } from '@/lib/qb-levels';
import { studentRow } from '@/lib/part-syllabus';
import { questionStructured, type BankQuestion } from '@/lib/bank-question-markdown';
import {
  boardTranscript, buildParentPrompt, buildSummaryPrompt, dropUnsupported, levelFrom, numbersNotOnBoard, parentNumbersNotOnBoard, parseParentNote, parseSummary, summaryHasContent, summarySig,
  type BoardSummary, type ParentNote, type SummaryDraft, type SummaryLevel, type SummaryPractice,
} from '@/lib/board-summary';
import type { PageText } from '@/lib/shared-board';

export const SUMMARY_MODEL = process.env.BOARD_SUMMARY_MODEL || SONNET_55;
/** A plain (not IP) student — tutor students have no portal account; this is what the portal serves such a student. */
const STUDENT_AUDIENCE = { p_is_ip: false, p_admin: false, p_ip_content: false };

async function practiceFor(level: SummaryLevel, topic: string): Promise<SummaryPractice[]> {
  const sb = getSupabaseAdmin();
  const scope = bankScope(level);
  const out: SummaryPractice[] = [];
  const skip: string[] = [];
  for (let tries = 0; tries < 8 && out.length < 2; tries++) {
    const { data, error } = await sb.rpc('practice_next', { p_level: scope.level, p_qlevel: scope.qlevel, p_topic: topic, p_exclude: skip, p_tier: null, p_subgroup: null, ...STUDENT_AUDIENCE });
    if (error) { console.warn('[board summary] practice_next:', error.message); break; }
    const raw = (data?.[0] ?? null) as (BankQuestion & { id: string; total_marks: number | null; figure_url: string | null }) | null;
    if (!raw) break;
    skip.push(raw.id);
    const q = studentRow(raw);
    if (!q) continue;
    const { data: a } = await sb.from('questions').select('answer').eq('id', raw.id).maybeSingle();
    const answer = String((a as { answer?: string | null } | null)?.answer ?? '').trim();
    if (!answer) continue;                                   // "answers hidden until tapped" needs an answer to show
    const { stem, parts } = questionStructured(q);
    out.push({ id: raw.id, stem, parts, marks: raw.total_marks ?? null, figureUrl: raw.figure_url ?? null, answer });
  }
  return out;
}

export type MakeResult = { summary: BoardSummary } | { empty: true };

export async function makeSummary(boardId: string): Promise<MakeResult> {
  await readBoard(boardId, { gapMs: 0, max: 12 }).catch(e => console.warn('[board summary] read:', (e as Error).message));
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('shared_boards').select('tutor_student_id, source_paper_id, page_text').eq('id', boardId).single();
  const b = data as { tutor_student_id: string; source_paper_id: string | null; page_text: PageText };
  const transcript = boardTranscript(b.page_text ?? {});
  if (!transcript.trim()) return { empty: true };

  const [{ data: st }, paper] = await Promise.all([
    sb.from('tutor_students').select('level').eq('id', b.tutor_student_id).maybeSingle(),
    b.source_paper_id ? sb.from('tutor_papers').select('paper_subject').eq('id', b.source_paper_id).maybeSingle().then(r => r.data) : Promise.resolve(null),
  ]);
  const level = levelFrom((paper as { paper_subject?: string } | null)?.paper_subject, (st as { level?: string } | null)?.level);
  const topics = level ? getTopicsForLevel(level).flatMap(c => c.topics) : ALL_TOPICS_FLAT;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let inTok = 0, outTok = 0, calls = 0;
  const ask = async (feedback?: string): Promise<SummaryDraft | null> => {
    const msg = await client.messages.create({ model: SUMMARY_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: buildSummaryPrompt({ transcript, level, topics, feedback }) }] }, { timeout: 50_000 });
    calls++; inTok += msg.usage?.input_tokens ?? 0; outTok += msg.usage?.output_tokens ?? 0;
    return parseSummary(anthropicText(msg), topics, level);
  };
  let draft = await ask();
  if (draft) {
    const bad = numbersNotOnBoard(draft, transcript);
    if (bad.length) {
      const again = await ask(`these numbers are not on the board: ${[...new Set(bad.map(x => x.number))].join(', ')}. Use only numbers that are on the board.`);
      draft = dropUnsupported(again ?? draft, transcript);
    }
  }
  if (!draft || !summaryHasContent(draft)) return { empty: true };

  const practice = draft.topic && draft.level ? await practiceFor(draft.level, draft.topic).catch(() => []) : [];
  const summary: BoardSummary = { ...draft, practice, sig: summarySig(b.page_text ?? {}), at: new Date().toISOString(), usage: { inTok, outTok, calls } };
  await sb.from('shared_boards').update({ summary }).eq('id', boardId);
  return { summary };
}

/**
 * 👪 The note to the parent (Adrian, 6 Nov 2026: "summary would be a good thing to send to parents" → "yes").
 * The TUTOR makes it and reads it before sending, so a number not on the board is sent back once and then the
 * note is kept as it is for the tutor to fix. Same writer, same board text as the student's summary.
 */
export async function makeParentNote(boardId: string): Promise<ParentNote | null> {
  await readBoard(boardId, { gapMs: 0, max: 12 }).catch(e => console.warn('[parent note] read:', (e as Error).message));
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('shared_boards').select('tutor_student_id, page_text').eq('id', boardId).single();
  const b = data as { tutor_student_id: string; page_text: PageText };
  const transcript = boardTranscript(b.page_text ?? {});
  if (!transcript.trim()) return null;
  const { data: st } = await sb.from('tutor_students').select('name').eq('id', b.tutor_student_id).maybeSingle();
  const childFirstName = String((st as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0] || 'your child';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let inTok = 0, outTok = 0, calls = 0;
  const ask = async (feedback?: string) => {
    const msg = await client.messages.create({ model: SUMMARY_MODEL, max_tokens: 4000, messages: [{ role: 'user', content: buildParentPrompt({ transcript, childFirstName, feedback }) }] }, { timeout: 50_000 });
    calls++; inTok += msg.usage?.input_tokens ?? 0; outTok += msg.usage?.output_tokens ?? 0;
    return parseParentNote(anthropicText(msg));
  };
  let note = await ask();
  if (note) {
    const bad = parentNumbersNotOnBoard(note, transcript);
    if (bad.length) note = (await ask(`these numbers are not on the board: ${[...new Set(bad)].join(', ')}. Use only numbers that are on the board.`)) ?? note;
  }
  return note ? { ...note, at: new Date().toISOString(), usage: { inTok, outTok, calls } } : null;
}
