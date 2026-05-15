// TODO PORTAL: Build /app — the Dashboard page.
//
// Sections (mobile-first card stack):
// 1. Greeting card: "Hi {firstName} 👋"
// 2. Next lesson card: pull from Airtable Lessons via /api/portal/dashboard
//    Show date + slot label + tutor name. Empty state if no upcoming lesson.
// 3. This-week stats card:
//      - Questions practised (count from student_attempts WHERE attempted_at > now() - 7d)
//      - Strongest topic (most common subgroup_id with verdict='correct')
//      - Working on (most common subgroup_id with verdict='wrong'/'partial')
// 4. Quick actions:
//      [✏️ Find practice question] → /app/practice
//      [📚 Browse notes]            → /app/notes
// 5. Recent activity:
//    Last 5 entries from student_attempts (verdict ✓/✗ + topic + date)
//
// Data fetching pattern: server component, fetch from /api/portal/dashboard
// (server-side, joins Supabase + Airtable). Don't dump raw queries on the client.

export default async function DashboardPage() {
  // TODO PORTAL: fetch dashboard data via /api/portal/dashboard
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-sm text-gray-600">
        {/* TODO PORTAL: replace with real cards */}
        Dashboard cards coming soon. See PORTAL.md.
      </p>
    </div>
  );
}
