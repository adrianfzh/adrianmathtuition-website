// The re-crop door (7 Oct 2026, Adrian: "can i use the cloud workers $250 credit?").
// A claude.ai cloud session does the LOOKING — where is the drawing, did the cut lose
// anything, is the new picture fit — on the cloud credit, and the server does everything
// else: it hands out the next figures, serves the pictures, cuts, stores the new picture
// beside the original and writes the science project's `figure_recrops` row. No database
// key reaches the cloud, and nothing here can release a figure: release stays Adrian's, on
// /admin/figures-bank?kind=recrop. Same posture as the twins door (docs/CLOUD.md).
//
// AGENT_TOKEN_FIGURES or the admin password; every call → agent_actions (scope 'figures');
// at most RATE_PER_HOUR calls an hour, counted from that table.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from './agent-auth';
import { verifyAdminAuth } from './schedule-helpers';
import { getSupabaseAdmin } from './supabase';
import { getScienceClient, scienceConfigured } from './science-bank';
import { logJobRun } from './job-log';

export const RATE_PER_HOUR = 3000;
/** A figure handed out and not finished within this long goes back in the queue. */
export const WORKING_STALE_MS = 90 * 60_000;
export const CLOUD_BATCH = () => `recrop-cloud-${new Date().toISOString().slice(0, 10)}`;

export async function recropDoor(req: NextRequest, action: string, detail?: unknown): Promise<NextResponse | null> {
  const admin = verifyAdminAuth(req);
  if (!admin && !verifyAgentAuth(req, 'figures', { route: req.nextUrl.pathname, action, detail })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!scienceConfigured()) return NextResponse.json({ error: 'science bank not configured' }, { status: 503 });
  if (admin) return null;
  try {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await getSupabaseAdmin().from('agent_actions').select('id', { count: 'exact', head: true }).eq('scope', 'figures').gte('created_at', since);
    if ((count ?? 0) > RATE_PER_HOUR) return NextResponse.json({ error: `over ${RATE_PER_HOUR} re-crop door calls in the last hour — wait and retry` }, { status: 429, headers: { 'retry-after': '600' } });
  } catch { /* an unreadable count never blocks the door */ }
  return null;
}

export const sci = () => getScienceClient();

export function scienceObjectUrl(name: string): string {
  const base = (process.env.SUPABASE_URL_SCIENCE || '').trim().replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/question_images/${encodeURIComponent(name.replace(/^question_images\//, ''))}`;
}

export async function fetchScienceObject(name: string): Promise<Buffer> {
  const r = await fetch(scienceObjectUrl(name), { cache: 'no-store' });
  if (!r.ok) throw new Error(`picture ${name}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

let lawCache: { at: number; text: string } | null = null;
/** The "## Figure fitness" section of the live law row (maths project), cut fresh at most every 10 min. */
export async function fitnessLaw(): Promise<string> {
  if (lawCache && Date.now() - lawCache.at < 600_000) return lawCache.text;
  const { data, error } = await getSupabaseAdmin().from('extraction_worker_prompt').select('prompt_text').eq('id', 'exam-extraction').maybeSingle();
  if (error) throw new Error(error.message);
  const full = String(data?.prompt_text ?? ''); const i = full.indexOf('\n## Figure fitness');
  if (i < 0) throw new Error('law row has no "## Figure fitness" section');
  const rest = full.slice(i + 1); const j = rest.indexOf('\n## ', 5);
  lawCache = { at: Date.now(), text: j > 0 ? rest.slice(0, j) : rest };
  return lawCache.text;
}

export const newNameFor = (path: string) => `${path.replace(/^question_images\//, '').replace(/\.png$/i, '')}__rc1.png`;

export function stampRecrop(ok: boolean, summary: string, meta?: Record<string, unknown>) {
  return logJobRun('recrop-cloud', ok, summary, meta);
}
