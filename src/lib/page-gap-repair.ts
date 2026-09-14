// ─── The self-fix under "a page in, is a page out" ──────────────────────────────
//
// Third layer of the remedy for the missing pages (Adrian, 14 Sep 2026: "we have
// to make sure such uploading errors don't occur again … they can't fail
// silently - someone must be monitoring and rectify if such errors occur … able
// to have a monitor and self fix system in place?").
//
//   1. PATCH THE CAUSE — the annotated JPEG upload is retried three times
//      (bot lib/student-files putStudentFile). Live.
//   2. CAN'T FAIL SILENTLY — a page with no annotated image still appears in the
//      marked copy, as the student's own photo (lib/marked-pdf-gaps, live).
//   3. MONITOR + SELF-FIX — this file. The gap is found on the run itself, the
//      page is redrawn from the stored original, and what could not be fixed is
//      named to Adrian rather than left for a student to notice. Alexis Wong
//      asked about her own missing pages; nobody should have to ask again.
//
// WHAT THIS DOES BY ITSELF (the doctrine's checkpoint, CLAUDE.md §Building
// doctrine: "the agent does everything reversible; a human approves the
// outward-facing step"):
//   • A run the student has NOT seen is repaired outright — redraw the missing
//     pages, rebuild the PDFs. Nothing has left the building, so nothing needs
//     approving.
//   • A run the student ALREADY HOLDS is repaired too, and told IN THE APP —
//     the sweep passes `allowReleased` and then re-issues on the app channel
//     (api/admin/mark-triage {channel:'app'}), which leaves a three-day line on
//     the paper's card and sends nothing.
//
//     Until 14 Sep 2026 a released run was only REPORTED, and the reason was
//     never the repair — it was that the only way to tell a student their copy
//     had changed was a Telegram line in Adrian's name, for plumbing he did not
//     do, at whatever hour the sweep fired. Adrian: "put the message in the app
//     (in the cards instead - don't send through telegram), and only have the
//     message last for 3 days" (lib/paper-notice). With that channel the
//     outward-facing step is no longer an interruption in his voice, so the
//     self-fix finishes the job. He is still told every time, in the sweep's own
//     line to the marking topic.
//
// The redraw door is /api/admin/desk/redraw with `reissue: false` — one paper
// with four missing pages must not rebuild its PDFs four times and tell the
// student four times about one copy (lib/desk-redraw).

import { missingAnnotatedPages, type PageGap } from './marked-pdf-gaps';
import { getSupabaseAdmin } from './supabase';

/** The slice of a marking run this module reads. */
export type GapRunRow = {
  id: string;
  student_name: string | null;
  paper_name: string | null;
  released_at: string | null;
  result_json: unknown;
};

export type RepairOutcome = {
  /** Pages that had no marked image when we started. */
  attempted: number;
  /** …and have one now. */
  repaired: number;
  /** The gaps still open — the ones a person has to see. */
  remaining: PageGap[];
  /** One line per page that would not redraw. Never thrown. */
  errors: string[];
  /** Set when the run was left alone (released and not allowed, run gone, …). */
  skipped?: string;
};

/**
 * The pages of one run whose marked image is missing — `result_json.source.photos`
 * minus `result_json.annotated_photos`, the same rule the marked-PDF assembly
 * falls back on, read off the run instead of off a request body. Pure.
 *
 * A source photo with no `original_url` is invisible here, deliberately: there
 * is neither an image to fall back on nor an original to redraw from, so there
 * is nothing this file could do about it.
 */
export function gapsForRun(resultJson: unknown): PageGap[] {
  const rj = (resultJson && typeof resultJson === 'object' ? resultJson : {}) as {
    source?: { photos?: unknown } | null;
    annotated_photos?: unknown;
  };
  return missingAnnotatedPages(rj.source?.photos, rj.annotated_photos);
}

/** 1-based page numbers, the way a person counts a paper. */
export function gapPageNumbers(gaps: PageGap[]): number[] {
  return gaps.map(g => g.photo_index + 1);
}

/** "5", "5 and 7", "5, 7, 8 and 10" — the pages, as Adrian would say them. */
export function gapPagesText(gaps: PageGap[]): string {
  const n = gapPageNumbers(gaps);
  if (!n.length) return '';
  if (n.length === 1) return String(n[0]);
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/**
 * The watch-out line that rides a release (mark-triage's `watch` list, which the
 * bot prints under "👀 Watch out for"). Says what the student will see, because
 * that is the thing to check: the fallback puts their own photo of the page in
 * the copy, unmarked.
 */
export function gapWatchReason(gaps: PageGap[]): string | null {
  if (!gaps.length) return null;
  const p = gapPagesText(gaps);
  return gaps.length === 1
    ? `page ${p} has no marked image — the student's own photo of it is in the copy instead`
    : `pages ${p} have no marked image — the student's own photos of them are in the copy instead`;
}

/** One Telegram line about one run. `desk` is the link that fixes it. */
export function pageGapAlert(input: {
  studentName: string | null;
  paperName: string | null;
  gaps: PageGap[];
  repaired?: number;
  released: boolean;
  deskUrl: string;
}): string {
  const who = input.studentName || 'an untagged run';
  const paper = input.paperName || 'a paper';
  const pages = gapPagesText(input.gaps);
  const plural = input.gaps.length === 1 ? 'page' : 'pages';
  const fixed = input.repaired ? ` (${input.repaired} redrawn, ${input.gaps.length} still open)` : '';
  // Only pages the sweep could NOT fix reach this line, so the released tail is
  // no longer "go and re-ink it" — the attempt already happened and failed.
  const tail = input.released
    ? "The student already has this copy and the redraw wouldn't take — their own photo is standing in. Fix it from the desk; re-issuing then tells them in the app."
    : 'Redraw it from the desk before this goes out.';
  return `🕳 ${who} — ${paper}: ${plural} ${pages} came back with no marked image${fixed}.\n${tail}\n${input.deskUrl}`;
}

/**
 * Has this exact set of open pages already been reported? The sweep runs every
 * six hours and a gap it cannot fix stays a gap, so without this it would say
 * the same thing four times a day until Adrian acted — which teaches him to
 * ignore it. The stamp lives on the run (`result_json.page_gap_check`).
 */
export function alreadyReported(resultJson: unknown, remaining: PageGap[]): boolean {
  const prev = (resultJson && typeof resultJson === 'object'
    ? (resultJson as { page_gap_check?: { reported?: unknown } }).page_gap_check
    : null);
  const was = Array.isArray(prev?.reported) ? (prev!.reported as unknown[]).map(Number) : null;
  if (!was) return false;
  const now = remaining.map(g => g.photo_index);
  return was.length === now.length && now.every(i => was.includes(i));
}

/** What we write back on a run once it has been looked at. */
export function gapCheckStamp(out: RepairOutcome, at = new Date().toISOString()) {
  return {
    at,
    attempted: out.attempted,
    repaired: out.repaired,
    reported: out.remaining.map(g => g.photo_index),
    ...(out.errors.length ? { errors: out.errors.slice(0, 6) } : {}),
  };
}

/**
 * Redraw every page of one run that has no marked image, then re-read the run
 * and say what is left. Never throws.
 *
 * Serial on purpose: each redraw is a Gemini-class page render on the bot, and
 * four at once on one Fly machine is how a repair turns into an outage. The two
 * budgets are the caller's promise to whoever is waiting — `limit` caps the
 * pages, `budgetMs` stops STARTING new ones once the wall clock is spent (a
 * redraw already in flight is always finished). Whatever is left over is still
 * a gap, and the sweep will be back in six hours.
 *
 * `origin` + `headers` come from the request that triggered it — a same-origin
 * fetch with the admin bearer forwarded, the release-with-sheet pattern.
 */
export async function repairPageGaps(
  runId: string,
  opts: {
    origin: string;
    headers: Record<string, string>;
    /**
     * Re-ink a paper the student already holds. Re-inking is all this does — the
     * caller decides whether the student is told, and how (the sweep re-issues
     * once per paper on the app channel; nothing here sends anything).
     */
    allowReleased?: boolean;
    limit?: number;
    budgetMs?: number;
    fetchImpl?: typeof fetch;
    readRun?: (id: string) => Promise<GapRunRow | null>;
    now?: () => number;
  },
): Promise<RepairOutcome> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const limit = opts.limit ?? 8;
  const budgetMs = opts.budgetMs ?? 240_000;
  const read = opts.readRun ?? (async (id: string) => {
    const { data } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('id, student_name, paper_name, released_at, result_json')
      .eq('id', id).maybeSingle<GapRunRow>();
    return data ?? null;
  });

  const empty: RepairOutcome = { attempted: 0, repaired: 0, remaining: [], errors: [] };
  try {
    const run = await read(runId);
    if (!run) return { ...empty, skipped: 'run not found' };
    if (run.released_at && !opts.allowReleased) {
      const gaps = gapsForRun(run.result_json);
      return { ...empty, remaining: gaps, skipped: 'released — the student already has this copy' };
    }
    const gaps = gapsForRun(run.result_json);
    if (!gaps.length) return empty;

    const started = now();
    const errors: string[] = [];
    let attempted = 0;
    for (const gap of gaps.slice(0, limit)) {
      if (now() - started >= budgetMs) {
        errors.push(`out of time after ${attempted} page(s) — the sweep will finish it`);
        break;
      }
      attempted++;
      try {
        const r = await f(`${opts.origin}/api/admin/desk/redraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...opts.headers },
          body: JSON.stringify({
            runId,
            photoIndex: gap.photo_index,
            ...(opts.allowReleased ? { allowReleased: true } : {}),
            // One paper, one copy, one message — lib/desk-redraw §reissue.
            reissue: false,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) errors.push(`page ${gap.photo_index + 1}: ${d.error || `HTTP ${r.status}`}`);
      } catch (e) {
        errors.push(`page ${gap.photo_index + 1}: ${(e as Error).message}`);
      }
    }

    // The truth is the run, not what the redraws claimed: re-read and re-check.
    const after = await read(runId);
    const remaining = after ? gapsForRun(after.result_json) : gaps;
    return { attempted, repaired: Math.max(0, gaps.length - remaining.length), remaining, errors };
  } catch (e) {
    return { ...empty, errors: [(e as Error).message], skipped: 'failed' };
  }
}
