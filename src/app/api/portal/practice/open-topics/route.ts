import { NextResponse } from 'next/server';
import { SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS, SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_OPEN_TO_STUDENTS } from '@/lib/portal-beta';

export const runtime = 'nodejs';

// GET /api/portal/practice/open-topics — the science topics open to students (5 Oct 2026).
// Read by the Fly worker's nightly science-mcq-check (bot repo scripts/science-mcq-check.js),
// which checks the not-yet-checked MCQs of these topics first so they can be served.
// Also read by the nightly structured check (scripts/science-qcheck/pick.mjs, 14 Oct 2026), which
// needs the Combined Science list too (`combinedTopics`).
// Topic names only — nothing private; no auth.
export async function GET() {
  return NextResponse.json({ open: SCIENCE_PRACTICE_OPEN_TO_STUDENTS, topics: SCIENCE_PRACTICE_OPEN_TOPICS, combinedTopics: SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS });
}
