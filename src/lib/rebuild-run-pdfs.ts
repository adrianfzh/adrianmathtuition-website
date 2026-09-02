// Rebuild a marking run's two marked PDFs from what the run already holds.
//
// The "Where your marks went" cover is drawn INSIDE /api/admin/mark-paper-pdf at
// assembly time (buildFrontPage reads the run), so a cover that should follow
// the self-study sheet's diagnosis can only do so if the PDFs are assembled
// AFTER that diagnosis lands on the run. The sheet-jobs `done` handler stores
// the diagnosis and then calls rebuildRunPdfs — no browser, no bot, no
// re-marking: everything the route needs is already on the row (verified on run
// f0d82c18: result_json.results / annotated_photos / totals; student_name and
// paper_name are columns). Same posture as the bot's deliverQueuedRun and the
// release-with-sheet route — a same-origin fetch carrying the admin bearer.
//
// FAIL-SOFT, always. A rebuild that fails leaves the previous PDFs linked and
// says why in the outcome; it never throws into the caller, because a finished
// sheet must not be reported as failed over a cover that did not redraw.
//
// NEVER after release: once `released_at` is set the student has that copy, and
// a new file under the same links would make the copy in their hands and the
// copy on the run disagree.
//
// Only `pdf_url` / `photos_pdf_url` are ever written here (through the shared
// column map) — `annotated_pdf_url` is Adrian's own amended copy and nothing
// automated may touch it.

import { getSupabaseAdmin } from './supabase';
import { markedPdfColumn } from './marked-pdf-column';

export type RunRow = {
  id: string;
  student_name: string | null;
  paper_name: string | null;
  released_at: string | null;
  result_json: unknown;
};

type ResultJson = {
  results?: { question_number?: unknown; marking_output?: unknown; photo_index?: unknown }[];
  annotated_photos?: unknown[];
  totals?: unknown;
};

/** The body /api/admin/mark-paper-pdf takes — the same one the page and the bot post. */
export type RebuildBody = {
  results: { question_number: unknown; marking_output: unknown; photo_index: unknown }[];
  annotated_photos: unknown[];
  totals: unknown;
  student: { name: string; level: string };
  multi: boolean;
  runId: string;
  paperName: string | null;
};

export type RebuildMode = 'photos' | 'full';

export type RebuildOutcome = {
  /** True only when EVERY half that was attempted came back with a URL. */
  rebuilt: boolean;
  /** Why nothing was attempted (released, empty run, …). */
  skipped?: string;
  photos?: string | null;
  full?: string | null;
  errors?: string[];
};

/**
 * The POST body for a run, or the reason it must not be built. Pure — the
 * released guard and the "is there anything to draw" check live here so they
 * are tested, not re-derived.
 */
export function rebuildBodyFromRun(run: RunRow): { body: RebuildBody } | { skip: string } {
  if (run.released_at) return { skip: 'released — the student already has this copy' };
  const rj = (run.result_json || {}) as ResultJson;
  const results = Array.isArray(rj.results) ? rj.results : [];
  const photos = Array.isArray(rj.annotated_photos) ? rj.annotated_photos : [];
  if (!results.length && !photos.length) return { skip: 'no marking on the run' };
  return {
    body: {
      results: results.map(r => ({
        question_number: r.question_number, marking_output: r.marking_output, photo_index: r.photo_index,
      })),
      annotated_photos: photos,
      // The stored totals carry `max_source`, which decides the PAPER TOTAL
      // strip; passing them through keeps the rebuilt copy grounded the same way.
      totals: rj.totals,
      student: { name: run.student_name || '', level: '' },
      // Always the PDF path: the route's single-question shortcut returns a bare
      // PNG with no cover, and the cover is the whole reason for a rebuild.
      multi: true,
      runId: run.id,
      paperName: run.paper_name || null,
    },
  };
}

/** Which halves to build: the photos copy needs annotated pages to exist
 *  (the route answers "Nothing to render" otherwise). */
export function rebuildModes(body: Pick<RebuildBody, 'annotated_photos'>): RebuildMode[] {
  return body.annotated_photos.length ? ['photos', 'full'] : ['full'];
}

// Measured on the same route (docs/MARKING.md): images in seconds, full 17s warm /
// 70s cold / 110s on a 30-question prelim. Both halves run at once, so the wall
// time is the slower of the two — comfortably inside the caller's 300s.
const TIMEOUT_MS: Record<RebuildMode, number> = { photos: 90_000, full: 200_000 };

/**
 * Build both halves against the route and link each URL onto the run. Takes
 * `fetchImpl` / `link` so the flow is testable without a network or a database.
 */
export async function buildBothPdfs(
  body: RebuildBody,
  opts: {
    origin: string;
    headers: Record<string, string>;
    fetchImpl?: typeof fetch;
    /** Put the finished URL on the run. Defaults to the Supabase write below. */
    link?: (mode: RebuildMode, url: string) => Promise<void>;
  },
): Promise<RebuildOutcome> {
  const f = opts.fetchImpl ?? fetch;
  const link = opts.link ?? (async (mode, url) => {
    // The route already links its own output when it sees `runId` (so a dropped
    // connection can't lose a built PDF); this is the bot's belt-and-braces
    // second write, through the same tested column map, so the two stay in step.
    await getSupabaseAdmin().from('paper_marking_runs').update({ [markedPdfColumn(mode)]: url }).eq('id', body.runId);
  });

  const build = async (mode: RebuildMode): Promise<string> => {
    const r = await f(`${opts.origin}/api/admin/mark-paper-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: JSON.stringify({ ...body, mode }),
      signal: AbortSignal.timeout(TIMEOUT_MS[mode]),
    });
    const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!r.ok || !d.url) throw new Error(d.error || `HTTP ${r.status}`);
    try { await link(mode, d.url); } catch (e) { console.warn('[rebuild-run-pdfs] link failed', mode, (e as Error).message); }
    return d.url;
  };

  const modes = rebuildModes(body);
  const settled = await Promise.allSettled(modes.map(build));
  const out: RebuildOutcome = { rebuilt: true, errors: [] };
  settled.forEach((s, i) => {
    const mode = modes[i];
    if (s.status === 'fulfilled') out[mode] = s.value;
    else {
      out[mode] = null;
      out.rebuilt = false;
      out.errors!.push(`${mode}: ${(s.reason as Error)?.message || String(s.reason)}`);
    }
  });
  if (!out.errors!.length) delete out.errors;
  return out;
}

/**
 * Rebuild the PDFs of one run. Never throws.
 *
 * `origin` + `headers` come from the request that triggered it (same-origin
 * fetch with the admin bearer forwarded — the release-with-sheet pattern).
 */
export async function rebuildRunPdfs(
  runId: string,
  opts: { origin: string; headers: Record<string, string>; fetchImpl?: typeof fetch },
): Promise<RebuildOutcome> {
  try {
    const { data: run, error } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('id, student_name, paper_name, released_at, result_json')
      .eq('id', runId).maybeSingle<RunRow>();
    if (error) return { rebuilt: false, skipped: error.message };
    if (!run) return { rebuilt: false, skipped: 'run not found' };
    const prep = rebuildBodyFromRun(run);
    if ('skip' in prep) return { rebuilt: false, skipped: prep.skip };
    return await buildBothPdfs(prep.body, opts);
  } catch (e) {
    console.warn('[rebuild-run-pdfs] failed', runId, (e as Error).message);
    return { rebuilt: false, errors: [(e as Error).message] };
  }
}
