import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'June Holidays Revision 2026 – Sec 4 EM & AM | Adrian\'s Math Tuition',
  description: 'June 2026 holiday revision schedule for Secondary 4 E Math (10am–12pm) and A Math (1–3pm).',
};

const EM_COLOR = '#0369a1';
const AM_COLOR = '#7c3aed';
const EM_BG   = '#f0f9ff';
const AM_BG   = '#faf5ff';
const HEADER_BG = '#1e3a5f';

type Week = { label: string; tue: string; fri: string };

const EM_WEEKS: Week[] = [
  { label: 'Week 1  |  2 & 5 Jun',   tue: 'Algebra + Indices',                     fri: 'Coordinate Geometry + Graphs' },
  { label: 'Week 2  |  9 & 12 Jun',  tue: 'Trigonometry + Congruency & Similarity', fri: 'Circle Properties + Circular Measure' },
  { label: 'Week 3  |  16 & 19 Jun', tue: 'Mensuration + Real World Qns',               fri: 'Number Patterns + Proportion + Polygons' },
];

const AM_WEEKS: Week[] = [
  { label: 'Week 1  |  2 & 5 Jun',   tue: 'Quadratic Functions + Surds',                     fri: 'Indices & Logarithms' },
  { label: 'Week 2  |  9 & 12 Jun',  tue: 'Coordinate Geometry & Circles',                    fri: 'Linear Law + Binomial Theorem' },
  { label: 'Week 3  |  16 & 19 Jun', tue: 'Polynomials & Partial Fractions + Plane Geometry', fri: 'Trigonometry' },
  { label: 'Week 4  |  23 & 26 Jun', tue: 'Differentiation and Applications',                  fri: 'Integration and Applications' },
];

function CalendarTable({ weeks, color, bg }: { weeks: Week[]; color: string; bg: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 420 }}>
        <colgroup>
          <col style={{ width: '34%' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '33%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ background: color, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, borderRadius: '8px 0 0 0' }}>Week</th>
            <th style={{ background: color, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>Tuesday</th>
            <th style={{ background: color, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, borderRadius: '0 8px 0 0' }}>Friday</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : bg }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>{w.label}</td>
              <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>{w.tue}</td>
              <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>{w.fri}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function JuneRevisionSec4Page() {
  return (
    <main style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ background: HEADER_BG, color: '#fff', padding: '28px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Adrian's Math Tuition</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>June Holidays Revision 2026</h1>
        <div style={{ marginTop: 8, fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>Secondary 4 · E Math &amp; A Math</div>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>2 June – 26 June 2026</div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* EM Calendar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 4, height: 32, background: EM_COLOR, borderRadius: 2, flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: EM_COLOR }}>E Math (EM)</h2>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>Every Tuesday &amp; Friday · <strong>10am – 12pm</strong></div>
            </div>
          </div>
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <CalendarTable weeks={EM_WEEKS} color={EM_COLOR} bg={EM_BG} />
          </div>
        </div>

        {/* AM Calendar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 4, height: 32, background: AM_COLOR, borderRadius: 2, flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: AM_COLOR }}>A Math (AM)</h2>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>Every Tuesday &amp; Friday · <strong>1pm – 3pm</strong></div>
            </div>
          </div>
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <CalendarTable weeks={AM_WEEKS} color={AM_COLOR} bg={AM_BG} />
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
          <strong style={{ color: '#0f172a' }}>Notes</strong>
          <p style={{ margin: '8px 0 0 0', lineHeight: 1.6 }}>Each session: 1 hour of focused concept teaching, followed by 1 hour of guided practice.</p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#94a3b8' }}>
          <a href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>adrianmathtuition.com</a>
        </div>
      </div>
    </main>
  );
}
