import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const LEVELS = [
  { slug: 's1', label: 'S1',    sub: 'Sec 1',     color: '#0369a1' },
  { slug: 's2', label: 'S2',    sub: 'Sec 2',     color: '#0369a1' },
  { slug: 'em', label: 'EM',    sub: 'E Math',    color: '#7c3aed' },
  { slug: 'am', label: 'AM',    sub: 'A Math',    color: '#0f766e' },
  { slug: 'jc', label: 'JC',    sub: 'H2 Maths',  color: '#b45309' },
];

export default async function NotesIndexPage() {
  const cookieStore = await cookies();
  const pw = cookieStore.get('admin_pw')?.value;
  if (!pw || pw !== process.env.ADMIN_PASSWORD) redirect('/admin');

  return (
    <div className="min-h-screen bg-gray-100 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← Back
          </Link>
          <div>
            <div className="text-base font-bold text-gray-900">📄 Notes</div>
            <div className="text-xs text-gray-500">Select a level to view and print revision notes</div>
          </div>
        </div>
      </div>

      {/* Level grid */}
      <div className="max-w-xl mx-auto px-4 mt-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {LEVELS.map(({ slug, label, sub, color }) => (
            <Link
              key={slug}
              href={`/admin/notes/${slug}`}
              className="block bg-white rounded-xl shadow-sm hover:shadow-md active:bg-gray-50 transition-shadow no-underline"
              style={{ borderLeft: `4px solid ${color}`, minHeight: '100px' }}
            >
              <div className="flex flex-col items-center justify-center h-full min-h-[100px] gap-1">
                <span className="text-3xl font-bold" style={{ color }}>{label}</span>
                <span className="text-xs text-gray-400 font-medium">{sub}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
