import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const LEVELS = [
  { slug: 's1',    label: 'S1',    color: '#0369a1' },
  { slug: 's2',    label: 'S2',    color: '#0369a1' },
  { slug: 's3-em', label: 'S3 EM', color: '#7c3aed' },
  { slug: 's3-am', label: 'S3 AM', color: '#7c3aed' },
  { slug: 's4-em', label: 'S4 EM', color: '#0f766e' },
  { slug: 's4-am', label: 'S4 AM', color: '#0f766e' },
  { slug: 'jc1',   label: 'JC1',   color: '#b45309' },
  { slug: 'jc2',   label: 'JC2',   color: '#b45309' },
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LEVELS.map(({ slug, label, color }) => (
            <Link
              key={slug}
              href={`/admin/notes/${slug}`}
              className="block bg-white rounded-xl shadow-sm hover:shadow-md active:bg-gray-50 transition-shadow no-underline"
              style={{ borderLeft: `4px solid ${color}`, minHeight: '90px' }}
            >
              <div className="flex items-center justify-center h-full min-h-[90px]">
                <span
                  className="text-2xl font-bold"
                  style={{ color }}
                >
                  {label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
