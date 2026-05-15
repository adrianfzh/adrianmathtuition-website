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
  { label: 'Week 1 · 2–6 Jun',   mon: 'Graphing Techniques / Functions',  thu: 'APGP / Series & Sequences' },
  { label: 'Week 2 · 9–13 Jun',  mon: 'Differentiation',                   thu: 'Integration' },
  { label: 'Week 3 · 16–20 Jun', mon: 'Vectors',                            thu: 'Complex Numbers / P&C' },
  { label: 'Week 4 · 23–27 Jun', mon: 'Probability / DRV',                  thu: 'Binomial / Normal / Sampling' },
];

export default function JuneRevisionJCPage() {
  return (
    <main style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ background: HEADER_BG, color: '#fff', padding: '28px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Adrian's Math Tuition</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>June Holidays Revision 2026</h1>
        <div style={{ marginTop: 8, fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>JC2 · H2 Mathematics</div>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>2 June – 27 June 2026</div>
        <a href="/june-revision" style={{ display: 'inline-block', marginTop: 14, background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, padding: '7px 18px', fontSize: 13, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
          ← Sec 4 EM &amp; AM Schedule
        </a>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* JC Calendar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 4, height: 32, background: JC_COLOR, borderRadius: 2, flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: JC_COLOR }}>H2 Mathematics (JC)</h2>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>Every Monday &amp; Thursday · <strong>12pm – 2.30pm</strong></div>
            </div>
          </div>
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: `1px solid ${JC_BG}` }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 420 }}>
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '35%' }} />
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
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                        {w.label}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>
                        {w.mon}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', lineHeight: 1.5 }}>
                        {w.thu}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
          {[
            { week: 'Week 1', dates: 'Jun 2 & 5', topics: ['Graphs & Functions', 'APGP / Series'] },
            { week: 'Week 2', dates: 'Jun 9 & 12', topics: ['Differentiation', 'Integration'] },
            { week: 'Week 3', dates: 'Jun 16 & 19', topics: ['Vectors', 'Complex / P&C'] },
            { week: 'Week 4', dates: 'Jun 23 & 26', topics: ['Probability / DRV', 'Distributions'] },
          ].map((card, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: JC_COLOR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.week}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{card.dates}</div>
              {card.topics.map((t, j) => (
                <div key={j} style={{ fontSize: 13, color: '#334155', lineHeight: 1.4, marginTop: 2 }}>• {t}</div>
              ))}
            </div>
          ))}
        </div>

        {/* Notes */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
          <strong style={{ color: '#0f172a' }}>Notes</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
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
