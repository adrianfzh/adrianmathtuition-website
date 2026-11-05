// 🧑‍🏫 Read the writing on shared-board pages into text, for search (server only).
// SPEC-TUTOR-TOOLS §8 — Adrian, 5 Nov 2026: "yes build search your handwriting".
//
// Each page is drawn as a picture (lib/board-render: the printed question, photos, stickers and both
// people's writing) and read by Gemini Flash on the Google key the site already has (the same key the
// oral transcriber uses). Which pages, and how often, is lib/shared-board pagesToRead. The tokens are
// counted on the board (shared_boards.read_usage) — the website has no cost ledger of its own.
// A rough cost, told to Adrian before it ran: about US$0.001 a page read.
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderBoardPage, type RenderableBoard } from '@/lib/board-render';
import { pageSig, pagesToRead, type PageText } from '@/lib/shared-board';

export const BOARD_READ_MODEL = 'gemini-2.5-flash';
const PROMPT = `This is one page of a maths lesson whiteboard shared by a tutor and a student in Singapore. It may hold a printed question, a photo, and handwriting.
Write out ALL the words and maths on the page as plain text, in reading order, one line per line on the page.
Write maths with ordinary keyboard symbols: x^2, sqrt(x), (a+b)/c, >=, pi, theta.
Do not explain, solve or correct anything. Do not describe drawings, except to name a graph or shape in a few words if it is labelled.
If nothing is written on the page, output exactly: [blank]`;

type Usage = { calls?: number; inTok?: number; outTok?: number };

async function readOne(jpg: Buffer): Promise<{ text: string; inTok: number; outTok: number } | null> {
  const key = (process.env.GOOGLE_API_KEY || '').trim();
  if (!key) { console.error('[board-read] GOOGLE_API_KEY missing'); return null; }
  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: BOARD_READ_MODEL });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpg.toString('base64') } }, { text: PROMPT }] }],
      // Flash "thinks" by default and the thinking spends the output allowance — the first test read
      // stopped half way down a marked page (5 Nov 2026). Reading needs no thinking: switched off.
      generationConfig: { temperature: 0, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 } } as GenerationConfig,
    });
    const raw = res.response.text().trim();
    const u = res.response.usageMetadata;
    return { text: /^\[?blank\]?\.?$/i.test(raw) ? '' : raw.slice(0, 4000), inTok: u?.promptTokenCount ?? 0, outTok: u?.candidatesTokenCount ?? 0 };
  } catch (e) {
    console.warn('[board-read] read failed:', (e as Error).message);
    return null;
  }
}

/**
 * Read what is behind on one board. `gapMs` = READ_GAP while someone writes (after a save); 0 when a
 * search is waiting. At most `max` pages per call. Returns how many pages were read.
 */
export async function readBoard(boardId: string, opts: { gapMs?: number; max?: number } = {}): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('shared_boards').select('pages, tutor_ink, student_ink, stickers, page_text').eq('id', boardId).maybeSingle();
  if (!data) return 0;
  const b = data as RenderableBoard & { page_text: PageText };
  const todo = pagesToRead(b, b.page_text ?? {}, Date.now(), opts.gapMs).slice(0, opts.max ?? 3);
  if (!todo.length) return 0;
  const read: PageText = {};
  let inTok = 0, outTok = 0, calls = 0;
  await Promise.all(todo.map(async i => {
    const jpg = await renderBoardPage(b, i, { maxWidth: 1200, quality: 80 }).catch(() => null);
    if (!jpg) return;
    const r = await readOne(jpg);
    calls++;
    if (!r) return;
    inTok += r.inTok; outTok += r.outTok;
    read[String(i)] = { text: r.text, sig: pageSig(b, i), at: new Date().toISOString() };
  }));
  if (!Object.keys(read).length && !calls) return 0;
  // Merge into the newest copy, so two readers never undo each other's pages.
  const { data: fresh } = await sb.from('shared_boards').select('page_text, read_usage').eq('id', boardId).maybeSingle();
  const f = (fresh ?? {}) as { page_text?: PageText; read_usage?: Usage };
  const u = f.read_usage ?? {};
  await sb.from('shared_boards').update({
    page_text: { ...(f.page_text ?? {}), ...read },
    read_usage: { calls: (u.calls ?? 0) + calls, inTok: (u.inTok ?? 0) + inTok, outTok: (u.outTok ?? 0) + outTok, model: BOARD_READ_MODEL },
  }).eq('id', boardId);
  return Object.keys(read).length;
}
