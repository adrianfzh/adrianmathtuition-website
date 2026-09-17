// Back-test the score forecast over every student who sat a GCE paper under
// our marking: predict each such paper from the student's OTHER papers and
// compare with the real total. Run: npx tsx scripts/score-forecast/backtest.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { getSupabaseAdmin } from '../../src/lib/supabase';
import { loadGcePapers, loadStudentTopicPapers } from '../../src/lib/score-forecast-store';
import { backtest, type Level } from '../../src/lib/score-forecast';

(async () => {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('paper_marking_runs').select('student_id, paper_subject')
    .not('released_at', 'is', null).eq('result_json->paper_match->parsed->>exam', 'GCE').limit(2000);
  const pairs = new Set<string>();
  for (const r of (data ?? []) as { student_id: string | null; paper_subject: string | null }[]) {
    if (!r.student_id || !r.paper_subject) continue;
    const lvl = r.paper_subject === 'A Math' ? 'AM' : r.paper_subject === 'E Math' ? 'EM' : null;
    if (lvl) pairs.add(`${r.student_id}|${lvl}`);
  }
  for (const level of ['AM', 'EM'] as Level[]) {
    const gce = await loadGcePapers(level);
    const students = [];
    for (const p of pairs) {
      const [sid, lvl] = p.split('|'); if (lvl !== level) continue;
      const papers = await loadStudentTopicPapers(sid, level, gce);
      students.push({ studentId: sid, papers });
    }
    let qAll = 0, qUnmapped = 0;
    for (const st of students) for (const pp of st.papers) for (const q of pp.questions) { qAll++; if (!q.topics.length) qUnmapped++; }
    console.log(`\n   ${level}: ${qAll} marked questions, ${qUnmapped} (${Math.round(qUnmapped / Math.max(1, qAll) * 100)}%) with no bank topic`);
    const r = backtest(students, gce);
    const rp = backtest(students, gce, new Date(), { priorOnly: true });
    console.log(`\n== ${level}: ${r.summary.n} sat GCE papers across ${students.length} students`);
    console.log(`   all other papers : mean error ${r.summary.meanAbsError} marks · within 5: ${Math.round(r.summary.within5 * 100)}% · within 8: ${Math.round(r.summary.within8 * 100)}% · bias ${r.summary.bias > 0 ? '+' : ''}${r.summary.bias}`);
    console.log(`   earlier papers only (${rp.summary.n}): mean error ${rp.summary.meanAbsError} marks · within 5: ${Math.round(rp.summary.within5 * 100)}% · within 8: ${Math.round(rp.summary.within8 * 100)}% · bias ${rp.summary.bias > 0 ? '+' : ''}${rp.summary.bias}`);
    const well = r.cases.filter(c => c.forecast.unknownMarks <= 10);
    if (well.length) { const e = well.map(c => Math.abs(c.forecast.expected - c.actual)); console.log(`   where the profile covers the paper (unknown ≤ 10, n=${well.length}): mean error ${(e.reduce((a, b) => a + b, 0) / e.length).toFixed(1)} · within 8: ${Math.round(e.filter(x => x <= 8).length / e.length * 100)}%`); }
    for (const c of r.cases.sort((a, b) => Math.abs(b.forecast.expected - b.actual) - Math.abs(a.forecast.expected - a.actual))) {
      const e = c.forecast.expected - c.actual;
      console.log(`   ${c.studentId.slice(-6)} ${c.paperKey.padEnd(16)} actual ${String(c.actual).padStart(5)}  forecast ${String(c.forecast.expected).padStart(5)} [${c.forecast.low}–${c.forecast.high}]  err ${e > 0 ? '+' : ''}${e.toFixed(1)}  unknown ${c.forecast.unknownMarks}`);
    }
  }
})();
