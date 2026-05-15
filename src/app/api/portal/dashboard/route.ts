// TODO PORTAL: GET /api/portal/dashboard — aggregations for the dashboard page.
//
// Auth: requireAuth() (Supabase session cookie).
//
// Returns:
//   {
//     greeting: { firstName, level },
//     nextLesson: { date, slotLabel, tutorName } | null,
//     thisWeek: {
//       attempts: number,
//       correct: number,
//       strongestTopic: string | null,    // most-correct subgroup_id name
//       weakestTopic: string | null,      // most-wrong subgroup_id name
//     },
//     recentActivity: Array<{
//       date: string,
//       verdict: 'correct' | 'partial' | 'wrong' | 'unmarked',
//       topic: string,
//       label: string,                     // "Practised differentiation chain rule"
//     }>,
//   }
//
// Sources:
// - Greeting + level: portal_accounts (Supabase) + Airtable Students (display_name)
// - Next lesson: Airtable Lessons WHERE Student=studentId AND Date>=today
//   ORDER BY Date ASC LIMIT 1. Use airtableRequest from lib/airtable.ts.
// - This week stats: aggregate student_attempts WHERE user_id=auth.uid()
//   AND attempted_at > now() - 7d.
// - Recent activity: last 5 student_attempts joined to questions+subgroups.
//
// Cache: 60-second response cache via Next's `revalidate` since dashboard data
// doesn't need real-time freshness.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // TODO PORTAL: implement
  return NextResponse.json(
    { error: 'Not implemented yet — see PORTAL.md' },
    { status: 501 }
  );
}
