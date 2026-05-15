// TODO PORTAL: GET /api/portal/practice-history — list of past practice attempts.
//
// Auth: requireAuth().
//
// Query params:
//   ?limit=50  (default 50)
//   ?topic=xxx (optional filter)
//
// Returns:
//   {
//     items: Array<{
//       id: number,
//       attemptedAt: string,
//       attemptedVia: 'portal' | 'telegram',
//       question: { id, text, parts, topic, marks },
//       answer: { text, imageUrl } | null,
//       verdict: 'correct' | 'partial' | 'wrong' | 'unmarked',
//       markingPdfUrl: string | null,
//     }>,
//     total: number,
//   }
//
// Sources:
// - student_attempts WHERE user_id=auth.uid() ORDER BY attempted_at DESC
// - Join to questions for stem + topic
// - Optionally join to subgroups via question_subgroups for richer topic display

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // TODO PORTAL: implement
  return NextResponse.json(
    { error: 'Not implemented yet — see PORTAL.md' },
    { status: 501 }
  );
}
