import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { airtableRequestAll } from '@/lib/airtable';

const LEVELS = [
  { slug: 's1', label: 'S1', sub: 'Secondary 1',  atLevel: 'S1', from: '#1d4ed8', to: '#3b82f6' },
  { slug: 's2', label: 'S2', sub: 'Secondary 2',  atLevel: 'S2', from: '#0369a1', to: '#0ea5e9' },
  { slug: 'em', label: 'EM', sub: 'E Maths',       atLevel: 'EM', from: '#6d28d9', to: '#a855f7' },
  { slug: 'am', label: 'AM', sub: 'A Maths',       atLevel: 'AM', from: '#065f46', to: '#10b981' },
  { slug: 'jc', label: 'JC', sub: 'H2 Maths',      atLevel: 'JC', from: '#92400e', to: '#f59e0b' },
];

export default async function NotesIndexPage() {
  const cookieStore = await cookies();
  const pw = cookieStore.get('admin_pw')?.value;
  if (!pw || pw !== process.env.ADMIN_PASSWORD) redirect('/admin');

  // Note counts per level (best-effort)
  const counts: Record<string, number> = {};
  try {
    const data = await airtableRequestAll('PrintNotes', '?fields[]=Level');
    for (const r of data.records || []) {
      const lv = r.fields?.['Level'] as string | undefined;
      if (lv) counts[lv] = (counts[lv] || 0) + 1;
    }
  } catch { /* counts are best-effort */ }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #16305a, #24466f)', padding: '18px 20px 18px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            ← Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>🖨️ Print Notes</div>
            {total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.14)', padding: '3px 10px', borderRadius: 20 }}>
                {total} total
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
            Tap a level to open and print
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '22px 16px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {LEVELS.map(({ slug, label, sub, atLevel, from, to }, i) => {
            const isLast = i === LEVELS.length - 1 && LEVELS.length % 2 !== 0;
            const n = counts[atLevel] || 0;
            return (
              <Link
                key={slug}
                href={`/admin/notes/${slug}`}
                style={{
                  gridColumn: isLast ? 'span 2' : undefined,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  background: `linear-gradient(140deg, ${from}, ${to})`,
                  borderRadius: 20,
                  padding: '20px 20px 18px',
                  minHeight: isLast ? 128 : 148,
                  textDecoration: 'none',
                  boxShadow: `0 10px 24px -8px ${from}66, 0 2px 6px rgba(16,24,40,0.08)`,
                  position: 'relative', overflow: 'hidden',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* soft light sweep */}
                <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
                <div style={{ position: 'absolute', bottom: -50, right: 20, width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

                {/* top row: count pill */}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 700, color: '#fff',
                    background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 20,
                    backdropFilter: 'blur(2px)',
                  }}>
                    {n === 0 ? 'No notes yet' : `${n} note${n === 1 ? '' : 's'}`}
                  </span>
                </div>

                {/* bottom: label + sub + arrow */}
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', fontWeight: 600 }}>{sub}</span>
                    <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
