import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'June Holidays Revision 2026 – JC2 H2 Math | Adrian\'s Math Tuition',
  description: 'June 2026 holiday revision schedule for JC2 H2 Mathematics (12pm–2.30pm).',
};

const JC_COLOR  = '#0f766e';
const JC_BG    = '#f0fdfa';
const HEADER_BG = '#1e3a5f';

type JCWeek = { label: string; mon: string; thu: string };

const JC_WEEKS: JCWeek[] = [
  { label: 'Week 1 · 1 & 4 Jun',   mon: 'Graphing Techniques / Functions', thu: 'APGP / Series & Sequences' },
  { label: 'Week 2 · 8 & 11 Jun',  mon: 'Differentiation',                  thu: 'Integration' },
  { label: 'Week 3 · 15 & 18 Jun', mon: 'Vectors',                           thu: 'Complex Numbers / P&C' },
  { label: 'Week 4 · 22 & 25 Jun', mon: 'Probability / DRV',                 thu: 'Binomial / Normal / Sampling' },
];

export default function JuneRevisionJC2Page() {
  return (
    <main style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ background: HEADER_BG, color: '#fff', padding: '28px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Adrian's Math Tuition</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>June Holidays Revision 2026</h1>
        <div style={{ marginTop: 8, fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>JC2 · H2 Mathematics</div>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>1 June – 25 June 2026</div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* JC Calendar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 4, height: 32, background: JC_COLOR, borderRadius: 2, flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: JC_COLOR }}>H2 Mathematics (JC)</h2>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>Every Monday &amp; Thursday · <strong>12pm – 2.30pm</strong></div>
            </div>
          </div>
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 420 }}>
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '33%' }} />
                  <col style={{ width: '33%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ background: JC_COLOR, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, borderRadius: '8px 0 0 0' }}>Week</th>
                    <th style={{ background: JC_COLOR, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>Monday</th>
                    <th style={{ background: JC_COLOR, color: '#fff', padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, borderRadius: '0 8px 0 0' }}>Thursday</th>
                  </tr>
                </thead>
                <tbody>
                  {JC_WEEKS.map((w, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : JC_BG }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>{w.label}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>{w.mon}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>{w.thu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
          <strong style={{ color: '#0f172a' }}>Notes</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
            <li>1st hour will be teaching concepts, 2nd hour will be practice</li>
            <li>Classes are held at 203 Hougang Street 21, #03-51</li>
            <li>Bring your school notes, formulae booklet and calculator</li>
            <li>For enquiries, message Adrian at <strong>@adriannhz</strong> on Telegram</li>
          </ul>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#94a3b8' }}>
          <a href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>adrianmathtuition.com</a>
        </div>
      </div>
    </main>
  );
}
