// ✅ Check this page — the server half (SPEC-STUDENT-APP.md §0c). The route and the bench
// (scripts/check-page-bench) both run a page through here, so the bench measures exactly
// what students get.
//
// 1. The answer key: when the page is a worksheet whose question is in our bank, its right
//    answer and worked solution go into the prompt (Adrian, 1 Nov 2026: "yes").
// 2. Two looks at the same time: the main marker and a second, small one. Where they
//    disagree on a line, that line gets a "?" (lib/app-check-page mergeLooks).
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GRADING_MODEL } from './practice-grade';
import {
  buildCheckPagePrompt, keyPhrases, mergeLooks, parseCheckPageReply, pickKeyRows,
  type CheckPageRequest, type CheckPageResult, type KeyQuestion,
} from './app-check-page';

export const SECOND_LOOK_MODEL = 'claude-haiku-5-5';
const PHRASE_LIMIT = 25;

/** The bank questions printed on the page, with their answers. Empty when none is sure. */
export async function findPrintedQuestions(db: SupabaseClient, printed: string): Promise<{ ids: string[]; key: KeyQuestion[] }> {
  const phrases = keyPhrases(printed);
  if (!phrases.length) return { ids: [], key: [] };
  const hits = await Promise.all(phrases.map(async p => {
    const { data } = await db.from('questions').select('id').is('deleted_at', null)
      .ilike('search_text', `%${p.replace(/[%_]/g, '')}%`).limit(PHRASE_LIMIT);
    return (data || []).map(r => String(r.id));
  }));
  const ids = pickKeyRows(hits, PHRASE_LIMIT).slice(0, 6);
  if (!ids.length) return { ids: [], key: [] };
  const { data } = await db.from('questions').select('id, question_text, answer, parts, solution').in('id', ids);
  const seen = new Set<string>();
  const key: KeyQuestion[] = [];
  for (const id of ids) {
    const q = (data || []).find(r => String(r.id) === id);
    if (!q) continue;
    const parts = Array.isArray(q.parts) ? (q.parts as { label?: string; answer?: string }[]).filter(p => p?.answer) : [];
    const answer = [q.answer, ...parts.map(p => `(${p.label ?? ''}) ${p.answer}`)].filter(Boolean).join('; ');
    const text = String(q.question_text || '').slice(0, 800);
    const sig = text.slice(0, 80) + '|' + answer;
    if (!answer || seen.has(sig)) continue;
    seen.add(sig);
    key.push({ text, answer: answer.slice(0, 400), solution: String(q.solution || '').slice(0, 1500) });
    if (key.length >= 3) break;
  }
  return { ids, key };
}

async function look(anthropic: Anthropic, model: string, req: CheckPageRequest, prompt: string, tries: number): Promise<CheckPageResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image } },
            { type: 'text', text: prompt + (attempt ? '\n\nYour last reply was not valid JSON. Reply with the JSON only.' : '') },
          ],
        }],
      });
      return parseCheckPageReply(msg.content.map(c => (c.type === 'text' ? c.text : '')).join(''), req.lines);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export interface PageCheckRun {
  result: CheckPageResult;
  main: CheckPageResult;
  second: CheckPageResult | null;
  keyIds: string[];
}

/** One page, start to finish. Throws only when the main look fails twice. */
export async function checkPage(db: SupabaseClient, req: CheckPageRequest, opts: { anthropic?: Anthropic; useKey?: boolean; useSecond?: boolean } = {}): Promise<PageCheckRun> {
  const anthropic = opts.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const found = opts.useKey === false || !req.printed
    ? { ids: [], key: [] }
    : await findPrintedQuestions(db, req.printed).catch(() => ({ ids: [] as string[], key: [] as KeyQuestion[] }));
  const prompt = buildCheckPagePrompt(req.lines, found.key);
  const [main, second] = await Promise.all([
    look(anthropic, GRADING_MODEL, req, prompt, 2),
    opts.useSecond === false ? Promise.resolve(null) : look(anthropic, SECOND_LOOK_MODEL, req, prompt, 1).catch(() => null),
  ]);
  return { result: mergeLooks(main, second), main, second, keyIds: found.ids };
}
