// TODO PORTAL: Server-side Supabase client.
//
// Two flavours needed:
//
// 1. createServerClient() — uses anon key + cookie-based session for the
//    current authenticated user. Use in server components and API routes that
//    should respect RLS as the user.
//
//      Example shape (using @supabase/ssr):
//        import { createServerClient as _createServerClient } from '@supabase/ssr';
//        import { cookies } from 'next/headers';
//        export function createServerClient() {
//          const cookieStore = cookies();
//          return _createServerClient(
//            process.env.NEXT_PUBLIC_SUPABASE_URL!,
//            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//            {
//              cookies: {
//                get(name) { return cookieStore.get(name)?.value; },
//                set(name, value, options) { cookieStore.set(name, value, options); },
//                remove(name, options) { cookieStore.set(name, '', { ...options, maxAge: 0 }); },
//              },
//            }
//          );
//        }
//
// 2. createServiceClient() — uses service-role key, bypasses RLS. Use ONLY in
//    admin endpoints (/api/portal/invite) and trusted backend logic
//    (cron jobs, scheduled tasks).
//
//      Example shape:
//        import { createClient } from '@supabase/supabase-js';
//        export function createServiceClient() {
//          return createClient(
//            process.env.NEXT_PUBLIC_SUPABASE_URL!,
//            process.env.SUPABASE_SERVICE_ROLE_KEY!,
//            { auth: { persistSession: false, autoRefreshToken: false } }
//          );
//        }
//
// Env vars needed (add to Vercel + .env.local):
//   - NEXT_PUBLIC_SUPABASE_URL          (already exists for frontend)
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY     (already exists for frontend)
//   - SUPABASE_SERVICE_ROLE_KEY         (NEW — only on server)

export {};  // placeholder — remove once implementations land
