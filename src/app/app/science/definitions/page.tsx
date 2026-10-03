// /app/science/definitions — the Physics definitions page (3 Oct 2026, Adrian:
// "we should just have a definition page … that students can easily access in
// the physics/science tab"). One list by topic, the scheme's key words marked,
// a search box. Behind the Science tab's gate, and Adrian's cookie only until
// SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS flips. Data: lib/science-definitions.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { BIOLOGY_DEFINITIONS_OPEN_TO_STUDENTS, SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS, scienceMarkingOpen, viewingAsStudent } from '@/lib/portal-beta';
import { DEFINITIONS, DEFINITION_TOPICS } from '@/lib/science-definitions';
import { BIOLOGY_DEFINITIONS, BIOLOGY_TOPICS } from '@/lib/biology-definitions';
import PortalIcon from '@/components/PortalIcon';
import DefinitionsList from './definitions-list';

export const dynamic = 'force-dynamic';

// One page, a list per science: ?s=biology is the Biology list (its own switch).
const LISTS = {
  physics: { title: 'Physics definitions', code: 'O-Level Physics (6091)', tile: 'bg-blue-600', list: DEFINITIONS, topics: DEFINITION_TOPICS, hint: 'Search — moment, half-life, refraction…', open: SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS },
  biology: { title: 'Biology definitions', code: 'O-Level Biology (6093)', tile: 'bg-emerald-600', list: BIOLOGY_DEFINITIONS, topics: BIOLOGY_TOPICS, hint: 'Search — osmosis, enzyme, allele…', open: BIOLOGY_DEFINITIONS_OPEN_TO_STUDENTS },
} as const;

export default async function ScienceDefinitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const L = LISTS[(await searchParams)?.s === 'biology' ? 'biology' : 'physics'];
  if (!(await scienceMarkingOpen())) redirect('/app');
  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  if (!L.open && !isAdmin) redirect('/app/science');
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${L.tile} text-white`}>
          <PortalIcon name="book" className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-navy leading-tight">{L.title}</h1>
          <p className="text-[12px] text-gray-500">The highlighted words are the ones that score</p>
        </div>
      </div>
      <DefinitionsList definitions={L.list} topics={L.topics} hint={L.hint} />
      <p className="text-[12px] text-gray-400">
        For {L.code}. Your school&apos;s wording may differ slightly. <Link href="/app/science" className="underline underline-offset-2">Back to Science</Link>
      </p>
    </div>
  );
}
