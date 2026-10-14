// /api/agent/listening-papers — the Fly worker's door for making listening papers on the plan
// (SPEC-ENGLISH-ORAL-LISTENING.md §More papers). Admin auth (the worker's MARKER_API_TOKEN).
//
//   GET  ?peek=1          → { wanted, levels[], toVoice[], madeThisMonth, monthlyCap }   (one-minute look)
//   GET  ?brief=<level>   → { prompt }   the writer's brief for one new paper at the level
//   POST { action: 'prompts', paper }  → { problems[], blind, review, guess }  the readers' prompts
//   POST { action: 'judge', paper, blind, review, guess } → { problems[] }   every check, nothing stored
//   POST { action: 'save', paper, blind, review, guess, madeFor? }
//        → { id, status, problems[] }   every check run here; a passing paper is voiced at once
//          when VOICE_NEW_PAPERS is on, else waits as 'checked'
//   POST { action: 'voice', id }       → { id, status }   record a checked paper (retry)
//   POST { action: 'retire' }          → { retired[] }    retire papers students' results show are weak
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { blindPrompt, guessPrompt, guessScore, isListeningLevel, paperProblems, reviewPrompt, VOICE_NEW_PAPERS, writerPrompt, type BlindAnswers, type ListeningPaper } from '@/lib/english-listening-papers';
import { judgePaper, listeningStock, loadPaperRow, paperList, retireWeakPapers, savePaper, setPaperStatus } from '@/lib/english-listening-store';
import { voicePart } from '@/lib/english-listening-voice';
import { LISTENING_SETS } from '@/lib/english-speaking-data';
import { englishWords } from '@/lib/english-listening-words';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const level = sp.get('brief');
  if (level !== null) {
    if (!isListeningLevel(level)) return NextResponse.json({ error: 'level is easier, standard or harder' }, { status: 400 });
    const titles = (await paperList()).length ? await usedTitles() : [];
    return NextResponse.json({ prompt: writerPrompt(level, LISTENING_SETS.find(s => s.id === 'ls02')!, titles) });
  }
  const stock = await listeningStock();
  const toVoice = VOICE_NEW_PAPERS ? (await paperList()).filter(p => p.status === 'checked').map(p => p.id) : [];
  return NextResponse.json({ wanted: stock.levels.reduce((n, l) => n + l.wanted, 0), ...stock, toVoice });
}

async function usedTitles(): Promise<string[]> {
  const out: string[] = LISTENING_SETS.map(s => s.title);
  for (const p of await paperList()) {
    if (p.status === 'rejected') continue;
    const row = await loadPaperRow(p.id);
    for (const s of row?.paper.parts ?? []) out.push(s.title);
  }
  return out;
}

async function voice(id: string): Promise<{ id: string; status: string }> {
  const row = await loadPaperRow(id);
  if (!row || row.status !== 'checked') return { id, status: row?.status ?? 'missing' };
  const audio: Record<string, { key: string; seconds: number; chars: number }> = {};
  for (const s of row.paper.parts) audio[s.id] = await voicePart(s, row.level);
  await setPaperStatus(id, 'ready', { audio, ready_at: new Date().toISOString() });
  return { id, status: 'ready' };
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; paper?: ListeningPaper; blind?: BlindAnswers; review?: unknown; guess?: BlindAnswers; madeFor?: string | null; id?: string; by?: string };
  try {
    if (body.action === 'retire') return NextResponse.json({ retired: await retireWeakPapers() });
    if (body.action === 'voice') {
      if (!VOICE_NEW_PAPERS) return NextResponse.json({ error: 'recording new papers is off' }, { status: 409 });
      return NextResponse.json(await voice(String(body.id ?? '')));
    }
    const paper = body.paper;
    if (!paper || !Array.isArray(paper.parts) || !isListeningLevel(paper.level)) return NextResponse.json({ error: 'a paper { level, parts[4] }' }, { status: 400 });
    const draft: ListeningPaper = { ...paper, id: 'lp000' };
    if (body.action === 'prompts') {
      return NextResponse.json({ problems: paperProblems(draft, { dict: englishWords() }), blind: blindPrompt(draft), review: reviewPrompt(draft), guess: guessPrompt(draft) });
    }
    if (body.action === 'judge') {
      const { problems } = await judgePaper(draft, body.blind ?? {}, body.review ?? null, { dict: englishWords(), guessed: body.guess ? guessScore(draft, body.guess) : undefined });
      return NextResponse.json({ problems });
    }
    if (body.action === 'save') {
      const saved = await savePaper(draft, body.blind ?? {}, body.review ?? null, {
        by: body.by ?? 'worker', madeBy: 'worker', dict: englishWords(), madeFor: body.madeFor ?? null, guessed: body.guess ? guessScore(draft, body.guess) : undefined,
      });
      if (saved.status === 'checked' && VOICE_NEW_PAPERS) return NextResponse.json({ ...saved, ...(await voice(saved.id)) });
      return NextResponse.json(saved);
    }
    return NextResponse.json({ error: 'action is prompts, judge, save, voice or retire' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
