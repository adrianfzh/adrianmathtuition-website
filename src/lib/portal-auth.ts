// TODO PORTAL: Auth helpers used by /app/* pages and /api/portal/* routes.
//
// Three core functions:
//
// 1. requireAuth() — async, called from server components. Returns the
//    Supabase session OR redirects to /login. Use at the top of every
//    /app/** layout and page.
//
//      export async function requireAuth() {
//        const supabase = createServerClient();
//        const { data: { session } } = await supabase.auth.getSession();
//        if (!session) redirect('/login');
//        return session;
//      }
//
// 2. currentStudent() — given a session, returns the joined portal_account
//    row (Supabase) PLUS the matching Airtable Students record (display name,
//    level, parent contact, etc.). Cached per request.
//
//      export async function currentStudent() {
//        const session = await requireAuth();
//        const supabase = createServerClient();
//        const { data: account } = await supabase
//          .from('portal_accounts').select('*').eq('id', session.user.id).single();
//        if (!account) redirect('/login');
//        const airtableRecord = await airtableRequest('Students',
//          `/${account.airtable_student_id}`);
//        return { account, airtableRecord, session };
//      }
//
// 3. requireAdmin(req: NextRequest) — for /api/portal/invite and any other
//    admin-only portal endpoint. Reuses the existing ADMIN_PASSWORD check
//    from src/lib/schedule-helpers.ts.

export {};  // placeholder
