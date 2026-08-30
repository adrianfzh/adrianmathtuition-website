// POST /api/portal/print-paper — a student generates a printable paper
// (SPEC-PRINT-PAPER.md). Three presets:
//   mock      — full EM/AM P1/P2 assembled by the prelim-builder blueprint walk
//   topics    — chosen topics drawn from the kiosk-pool eligibility gate
//   weakspots — same draw, topics ranked by the student's own mastery ledger
//
// The insert into portal_generated_papers IS the pre-registration: the ordered
// question ids are what the marking loop reads when this paper is handed back
// in through /app/submit?paper=<id>. No PDF is stored — GET ./pdf renders it
// on demand from the row (same nothing-stored reasoning as practice-pdf).
//
// GET — this student's generated papers plus the week's remaining allowance
// (the /app/print page's data, kept here so the page and the POST can never
// disagree on the allowance).
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { practiceAuth, levelAllowed } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { fetchWorksheetPool, figureServable, hasPrintableAnswer } from '@/lib/kiosk-pool';
import { dailyDraw, sgtDate } from '@/lib/kiosk-draw';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { computeMastery, type MasteryEntry } from '@/lib/mastery';
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MAX_TOPICS_PER_PAPER,
  MOCK_LEVELS,
  PRINT_POOL_SCOPE,
  WEEKLY_PRINT_CAP,
  assembleMockFromCandidates,
  blueprintFamily,
  blueprintKeyFor,
  rankWeakTopics,
  sgtStartOfWeekIso,
  storageUrl,
  type PrintQuestionRef,
} from '@/lib/print-paper';
import {
  applyPreset,
  countParts,
  mulberry32,
  targetMarks,
  walkTopics,
  type Candidate,
  type PaperDef,
  type Preset,
} from '@/lib/prelim-builder';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Same columns as /app/marking & the notebook — buildStudentMarking's input.
const RUN_COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, pdf_url, released_at, result_json';

interface BlueprintFile {
  papers: Record<string, PaperDef>;
  presets: Record<string, Preset>;
}

function loadBlueprint(): BlueprintFile {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8'));
}

async function papersThisWeek(studentId: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from('portal_generated_papers')
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', studentId)
    .gte('created_at', sgtStartOfWeekIso());
  return count ?? 0;
}

/** Mock-slot candidates — the prelim-builder query, scoped and gated for a
 * STUDENT sheet:
 *  - pool scope matches the documented PRINT_POOL_SCOPE tagging (multi-level
 *    `.in('level', tagLevels)`, no exam_type narrowing — the old
 *    `.eq('level')` + `%prelim%` pair silently excluded most of the bank);
 *  - servability = the CANONICAL kiosk-pool predicates (hasPrintableAnswer +
 *    figureServable), imported, never re-implemented;
 *  - `solution` is never selected, so worked solutions are structurally absent
 *    from this route; school/year are fetched for spread/recency scoring only
 *    and never survive past the assembled refs. */
async function fetchSlotCandidates(opts: { tagLevels: string[]; topic: string; lo: number; hi: number }): Promise<Candidate[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('questions')
    .select('id, total_marks, school, year, difficulty, parts, answer, has_image, image_url, figure_url, image_watermark_status')
    .is('deleted_at', null)
    .in('level', opts.tagLevels)
    .contains('topics', [opts.topic])
    .gte('total_marks', opts.lo)
    .lte('total_marks', opts.hi)
    .order('year', { ascending: false })
    .limit(40);
  if (error) throw new Error(`QB query failed (${opts.topic}): ${error.message}`);
  type Row = {
    id: string; total_marks: number; school: string | null; year: number | null;
    difficulty: string | null; parts: unknown; answer: string | null;
    has_image: boolean | null; image_url: string | null; figure_url: string | null;
    image_watermark_status: string | null;
  };
  return (data as Row[])
    .filter(r => hasPrintableAnswer(r) && figureServable(r))
    .map(r => ({
      id: r.id,
      total_marks: r.total_marks,
      school: r.school,
      year: r.year,
      difficulty: r.difficulty,
      has_image: r.has_image,
      // What the mock PDF can actually draw: a clean scan's crop. Engine-drawn
      // figure_url rows pass the gate but this renderer has no figure_url path,
      // so leave them image-less — the scorer's missing-diagram penalty keeps
      // them off the paper rather than printing a figureless figure question.
      image_url: r.figure_url ? null : storageUrl(r.image_url),
      answer: r.answer,
      has_solution: false, // never selected here — uniform, so scoring is unaffected
      parts_count: countParts(r.parts),
    }));
}

const MOCK_ATTEMPTS = 3;

async function assembleMock(level: string, paper: string): Promise<{ refs: PrintQuestionRef[]; title: string; totalMarks: number } | { error: string }> {
  // Student levels JC1/JC2 share the 'JC' blueprint family (H2 9758); the
  // candidate pool still scopes by the STUDENT level via PRINT_POOL_SCOPE,
  // whose JC entries fan out to the JC/JC1/JC2 tag levels.
  const key = blueprintKeyFor(level, paper);
  const blueprint = loadBlueprint();
  const paperDef = blueprint.papers[key];
  if (!paperDef) return { error: `No mock blueprint for ${key}` };
  const scope = PRINT_POOL_SCOPE[level];
  if (!scope) return { error: `Unknown level ${level}` };

  const overlaid = applyPreset(paperDef, blueprint.presets['standard']?.overlay ?? {});
  const targets = targetMarks(overlaid, { difficulty: 'standard' });

  // One fetch per distinct (topic, band) — slots are fetched IN PARALLEL (the
  // old sequential walk was up to 26 awaited round trips) and cached across
  // retry attempts so a re-walk only fetches topics it hasn't seen.
  const cache = new Map<string, Promise<Candidate[]>>();
  const candidatesFor = (topic: string, lo: number, hi: number): Promise<Candidate[]> => {
    const k = `${topic}|${lo}|${hi}`;
    let hit = cache.get(k);
    if (!hit) {
      hit = fetchSlotCandidates({ tagLevels: scope.tagLevels, topic, lo, hi });
      cache.set(k, hit);
    }
    return hit;
  };

  let lastError = 'Not enough servable questions to build a full mock right now';
  for (let attempt = 0; attempt < MOCK_ATTEMPTS; attempt++) {
    const rng = mulberry32(Math.floor(Math.random() * 1e9));
    let topics: string[];
    try {
      topics = walkTopics(overlaid, rng);
    } catch {
      continue; // blueprint constraints unsatisfiable this walk — redraw
    }
    const candidateLists = await Promise.all(
      overlaid.slots.map((slot, i) => candidatesFor(topics[i], slot.marks[0], slot.marks[1])),
    );
    const out = assembleMockFromCandidates(
      overlaid.slots.map((slot, i) => ({ pos: slot.pos, topic: topics[i], target: targets[i], candidates: candidateLists[i] })),
      overlaid.total_marks,
      rng,
    );
    if (out.ok) {
      const family = blueprintFamily(level);
      const subject = family === 'AM' ? 'A Math' : family === 'JC' ? 'H2 Mathematics' : 'E Math';
      return {
        refs: out.refs,
        totalMarks: out.totalMarks,
        title: `${subject} mock ${paper === 'P1' ? 'Paper 1' : 'Paper 2'}`,
      };
    }
    lastError = out.error;
  }
  return { error: lastError };
}

async function drawTopics(levelKey: string, topics: string[], total: number, studentId: string):
  Promise<{ refs: PrintQuestionRef[]; used: string[] } | { error: string }> {
  const scope = PRINT_POOL_SCOPE[levelKey];
  if (!scope) return { error: `Unknown level ${levelKey}` };
  const perTopic = Math.max(1, Math.ceil(total / topics.length));
  const picked: { id: string; marks: number }[] = [];
  const used: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics.slice(0, MAX_TOPICS_PER_PAPER)) {
    const { items, error } = await fetchWorksheetPool(getSupabaseAdmin(), {
      seedLevels: scope.tagLevels, topicsKey: scope.topicsKey, topic, tier: null,
    });
    if (error) return { error };
    // Seeded per student+day: regenerating the same request today reprints the
    // same sheet instead of farming fresh draws out of the weekly allowance.
    const drawn = dailyDraw(items.filter(i => !seen.has(i.id)), `print|${studentId}|${sgtDate()}|${levelKey}|${topic}`, perTopic);
    if (drawn.length) used.push(topic);
    for (const d of drawn.slice(0, Math.max(0, total - picked.length))) {
      seen.add(d.id);
      picked.push({ id: d.id, marks: d.marks ?? 0 });
    }
    if (picked.length >= total) break;
  }
  if (!picked.length) return { error: 'No servable questions found for those topics' };
  return { refs: picked.map((p, i) => ({ id: p.id, pos: i + 1, marks: p.marks })), used };
}

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sid = portalIdentity(caller.account);
  const { data } = await getSupabaseAdmin()
    .from('portal_generated_papers')
    .select('id, preset, level, paper, title, total_marks, status, created_at')
    .eq('airtable_student_id', sid)
    .order('created_at', { ascending: false })
    .limit(30);
  return NextResponse.json({
    papers: data ?? [],
    remaining: Math.max(0, WEEKLY_PRINT_CAP - await papersThisWeek(sid)),
    cap: WEEKLY_PRINT_CAP,
  });
}

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const account = caller.account;
  const sid = portalIdentity(account); // rec… / acct:<uuid>

  // Assembling a paper is a QB-heavy, allowance-spending operation ("mock
  // papers" is literally what the pass sells) — tuition short-circuits free; a
  // stranger needs an active pass or gets the 402 → /app/pass.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: { preset?: unknown; level?: unknown; paper?: unknown; topics?: unknown; count?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const preset = String(body.preset ?? '');
  const level = String(body.level ?? '');
  if (!['mock', 'topics', 'weakspots'].includes(preset)) return NextResponse.json({ error: 'Unknown preset' }, { status: 400 });
  if (!levelAllowed(caller, level)) return NextResponse.json({ error: 'Level not available' }, { status: 403 });

  const usedThisWeek = await papersThisWeek(sid);
  if (usedThisWeek >= WEEKLY_PRINT_CAP) {
    return NextResponse.json({
      error: `This week's ${WEEKLY_PRINT_CAP} paper prints are used — a fresh allowance opens on Monday.`,
    }, { status: 429 });
  }

  let refs: PrintQuestionRef[];
  let title: string;
  let paper: string | null = null;

  if (preset === 'mock') {
    const p = String(body.paper ?? 'P1');
    if (!(MOCK_LEVELS as readonly string[]).includes(level)) {
      return NextResponse.json({ error: 'Mock papers are available for E Math, A Math and H2 Math' }, { status: 400 });
    }
    if (!['P1', 'P2'].includes(p)) return NextResponse.json({ error: 'paper must be P1 or P2' }, { status: 400 });
    let out: Awaited<ReturnType<typeof assembleMock>>;
    try {
      out = await assembleMock(level, p);
    } catch {
      return NextResponse.json({ error: 'The question bank is unreachable right now — try again in a minute.' }, { status: 502 });
    }
    // Fail LOUDLY rather than shipping a short paper: an unfillable/unlandable
    // mock is a 422 the client shows, and no allowance is spent (no insert).
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: 422 });
    refs = out.refs; title = out.title; paper = p;
  } else {
    const total = Math.min(MAX_QUESTION_COUNT, Math.max(4, Number(body.count) || DEFAULT_QUESTION_COUNT));
    let topics: string[];
    if (preset === 'topics') {
      topics = Array.isArray(body.topics) ? body.topics.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [];
      if (!topics.length) return NextResponse.json({ error: 'Pick at least one topic' }, { status: 400 });
    } else {
      // weakspots: the student's own mastery ledger picks the topics — the
      // same assembly the notebook page uses (released runs + re-attempts).
      const svc = getSupabaseAdmin();
      const [{ data: runs }, { data: entries }] = await Promise.all([
        svc.from('paper_marking_runs').select(RUN_COLUMNS)
          .eq('student_id', sid).not('released_at', 'is', null)
          .is('superseded_by', null)   // superseded re-marks would double-count a paper's weak topics
          .order('created_at', { ascending: false }).limit(30),
        svc.from('notebook_entries').select('topic, attempts').eq('airtable_student_id', sid),
      ]);
      const { papers } = buildStudentMarking((runs ?? []) as unknown as MarkingRunRow[]);
      const mastery = computeMastery(papers, (entries ?? []) as MasteryEntry[]);
      topics = rankWeakTopics(mastery, new Set(mastery.map(m => m.topic)));
      if (!topics.length) {
        return NextResponse.json({
          error: 'Not enough marked work yet to find your weak spots — hand in a paper or two first, or pick topics yourself.',
        }, { status: 400 });
      }
    }
    const out = await drawTopics(level, topics, total, sid);
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: 502 });
    refs = out.refs;
    const label = preset === 'weakspots' ? 'Weak-spots practice' : 'Topic practice';
    title = `${label} — ${out.used.slice(0, 3).join(', ')}${out.used.length > 3 ? '…' : ''}`;
  }

  const totalMarks = refs.reduce((s, r) => s + r.marks, 0);
  const { data: row, error: insErr } = await getSupabaseAdmin()
    .from('portal_generated_papers')
    .insert({
      airtable_student_id: sid, preset, level, paper, title,
      question_ids: refs, total_marks: totalMarks,
    })
    .select('id')
    .single();
  if (insErr || !row) return NextResponse.json({ error: 'Could not save the paper — try again.' }, { status: 500 });

  return NextResponse.json({ ok: true, paperId: row.id, title, questions: refs.length, totalMarks });
}
