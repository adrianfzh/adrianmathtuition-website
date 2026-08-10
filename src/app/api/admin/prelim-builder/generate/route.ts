// POST /api/admin/prelim-builder/generate — deterministic paper assembly from
// data/paper-blueprints.json + the QB. No model calls. Two modes:
//   full paper: { level, paper, preset?, difficulty?, excludeSchool?, seed? }
//   reroll one slot: same + { reroll: { pos, topic, excludeIds: [] } }
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import {
  applyPreset,
  bleedOverlay,
  countParts,
  landTotal,
  mulberry32,
  pickForSlot,
  targetMarks,
  walkTopics,
  type BleedRow,
  type Candidate,
  type Difficulty,
  type PaperDef,
  type Preset,
  type SlotPick,
} from '@/lib/prelim-builder';

export const runtime = 'nodejs';

interface BlueprintFile {
  derived_at: string;
  papers: Record<string, PaperDef>;
  presets: Record<string, Preset>;
}

function loadBlueprint(): BlueprintFile {
  const p = path.join(process.cwd(), 'data', 'paper-blueprints.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// QB rows carry image paths as either a bare path or a JSON-encoded array.
function firstImagePath(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length > 0 ? String(arr[0]) : null;
    } catch {
      return null;
    }
  }
  return raw;
}

interface QbRow {
  id: string;
  question_text: string | null;
  total_marks: number;
  school: string | null;
  year: number | null;
  paper: string | null;
  question_number: string | null;
  difficulty: string | null;
  topics: string[] | null;
  parts: unknown;
  answer: string | null;
  solution: string | null;
  has_image: boolean | null;
  image_url: string | null;
}

function toCandidate(r: QbRow): Candidate & { preview: string; schoolYear: string } {
  return {
    id: r.id,
    total_marks: r.total_marks,
    school: r.school,
    year: r.year,
    difficulty: r.difficulty,
    has_image: r.has_image,
    image_url: firstImagePath(r.image_url),
    answer: r.answer,
    has_solution: !!r.solution,
    parts_count: countParts(r.parts),
    preview: (r.question_text || '').slice(0, 220),
    schoolYear: `${r.school ?? '?'} ${r.year ?? ''}`.trim(),
  };
}

async function fetchCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    level: string;
    topic: string;
    lo: number;
    hi: number;
    excludeSchool?: string;
    excludeIds: string[];
  }
) {
  let q = supabase
    .from('questions')
    .select(
      'id, question_text, total_marks, school, year, paper, question_number, difficulty, topics, parts, answer, solution, has_image, image_url'
    )
    .is('deleted_at', null)
    .eq('level', opts.level)
    .ilike('exam_type', '%prelim%')
    .contains('topics', [opts.topic])
    .gte('total_marks', opts.lo)
    .lte('total_marks', opts.hi)
    .order('year', { ascending: false })
    .limit(30);
  if (opts.excludeSchool) q = q.neq('school', opts.excludeSchool);
  const { data, error } = await q;
  if (error) throw new Error(`QB query failed (${opts.topic}): ${error.message}`);
  return (data as QbRow[]).filter((r) => !opts.excludeIds.includes(r.id)).map(toCandidate);
}

// GET — picker metadata: paper keys + presets (name, description, applies_to).
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blueprint = loadBlueprint();
  return NextResponse.json({
    derivedAt: blueprint.derived_at,
    papers: Object.keys(blueprint.papers),
    presets: [
      ...Object.entries(blueprint.presets).map(([name, p]) => ({
        name,
        description: p.description ?? '',
        appliesTo: p.applies_to ?? null,
      })),
      {
        name: 'targeted',
        description:
          'Closes the loop: overweights the topics your students lost the most marks on in recent AI-marked papers (bleed table).',
        appliesTo: null,
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const level: string = body.level;
    const paperNum: string = body.paper; // 'P1' | 'P2'
    const presetName: string = body.preset || 'standard';
    const difficulty: Difficulty = body.difficulty === 'hard' ? 'hard' : 'standard';
    const excludeSchool: string | undefined = body.excludeSchool || undefined;
    const seed: number = Number.isFinite(body.seed) ? body.seed : Math.floor(Math.random() * 1e9);

    const key = `${level}-${paperNum}`;
    const blueprint = loadBlueprint();
    const paperDef = blueprint.papers[key];
    if (!paperDef) return NextResponse.json({ error: `Unknown paper ${key}` }, { status: 400 });

    const rng = mulberry32(seed);
    const supabase = createServiceClient();

    // 'targeted' is a dynamic preset: its overlay is computed fresh from the
    // marking-history bleed (bleed_topic_aggregate) instead of the blueprint.
    let preset: Preset;
    let targetedTopics: Record<string, number> | null = null;
    if (presetName === 'targeted') {
      const { data: bleedRows, error: bleedErr } = await supabase.rpc('bleed_topic_aggregate', {
        level_filter: level,
      });
      if (bleedErr) return NextResponse.json({ error: `bleed query: ${bleedErr.message}` }, { status: 500 });
      const poolTopics = [
        ...new Set(paperDef.slots.flatMap((s) => s.topic_pool.map((p) => p.topic))),
      ];
      targetedTopics = bleedOverlay((bleedRows ?? []) as BleedRow[], poolTopics);
      preset = { overlay: { topic_weight_multipliers: targetedTopics } };
    } else {
      const found = blueprint.presets[presetName];
      if (!found) return NextResponse.json({ error: `Unknown preset ${presetName}` }, { status: 400 });
      if (found.applies_to && !found.applies_to.includes(key)) {
        return NextResponse.json({ error: `Preset ${presetName} does not apply to ${key}` }, { status: 400 });
      }
      preset = found;
    }

    const overlaid = applyPreset(paperDef, preset.overlay);
    const targets = targetMarks(overlaid, { difficulty, markBand: preset.overlay?.mark_band });

    // ---- reroll mode: refresh a single slot, keep everything else client-side ----
    if (body.reroll) {
      const { pos, topic, excludeIds = [], usedSchools = [] } = body.reroll;
      const slot = overlaid.slots.find((s) => s.pos === pos);
      if (!slot) return NextResponse.json({ error: `No slot ${pos}` }, { status: 400 });
      const cands = await fetchCandidates(supabase, {
        level,
        topic,
        lo: slot.marks[0],
        hi: slot.marks[1],
        excludeSchool,
        excludeIds,
      });
      const { pick, alternates } = pickForSlot(
        cands,
        {
          target: targets[overlaid.slots.indexOf(slot)],
          difficulty,
          usedSchools: new Set(usedSchools),
          usedIds: new Set(excludeIds),
          schoolStyle: preset.overlay?.school_style,
        },
        rng
      );
      return NextResponse.json({ pos, topic, pick, alternates, seed });
    }

    // ---- full assembly ----
    const topics = walkTopics(overlaid, rng);
    const usedSchools = new Set<string>();
    const usedIds = new Set<string>();
    const picks: SlotPick[] = [];

    for (let i = 0; i < overlaid.slots.length; i++) {
      const slot = overlaid.slots[i];
      const cands = await fetchCandidates(supabase, {
        level,
        topic: topics[i],
        lo: slot.marks[0],
        hi: slot.marks[1],
        excludeSchool,
        excludeIds: [...usedIds],
      });
      const { pick, alternates } = pickForSlot(
        cands,
        {
          target: targets[i],
          difficulty,
          usedSchools,
          usedIds,
          schoolStyle: preset.overlay?.school_style,
        },
        rng
      );
      if (pick) {
        usedIds.add(pick.id);
        if (pick.school) usedSchools.add(pick.school);
      }
      picks.push({ pos: slot.pos, topic: topics[i], target: targets[i], pick, alternates });
    }

    const { landed } = landTotal(picks, overlaid.total_marks);
    const total = picks.reduce((a, p) => a + (p.pick?.total_marks ?? 0), 0);

    return NextResponse.json({
      level,
      paper: paperNum,
      preset: presetName,
      difficulty,
      excludeSchool: excludeSchool ?? null,
      seed,
      blueprintDerivedAt: blueprint.derived_at,
      targetedTopics,
      totalTarget: overlaid.total_marks,
      total,
      landed,
      emptySlots: picks.filter((p) => !p.pick).map((p) => p.pos),
      slots: picks,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'generate failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
