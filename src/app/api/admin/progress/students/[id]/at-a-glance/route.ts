import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

// "At a glance" per student — composes existing signals into one view:
//   • upcoming exam (from the Exams table)
//   • exam schedule + results (WA1/WA2/WA3/EOY: date, tested topics, score/grade)
//   • ⭐ what to work on — weak topics derived from marked Submissions
//     (wrong final answers grouped by topic). Bot-question logs are intentionally
//     NOT used as a signal here.

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    // ── Exams (linked-record filter is unreliable → fetch all, filter in JS) ──
    const examsData = await airtableRequestAll('Exams', '');
    const exams = examsData.records
      .filter((r: any) => r.fields['Student']?.[0] === id)
      .map((r: any) => ({
        id: r.id,
        examType: r.fields['Exam Type'] ?? '',
        customName: r.fields['Custom Name'] ?? '',
        examDate: r.fields['Exam Date'] ?? '',
        testedTopics: r.fields['Tested Topics'] ?? '',
        resultScore: r.fields['Result Score'] ?? null,
        resultTotal: r.fields['Result Total'] ?? null,
        resultGrade: r.fields['Result Grade'] ?? '',
        noExam: r.fields['No Exam'] ?? false,
      }))
      .sort((a: any, b: any) => (a.examDate || '').localeCompare(b.examDate || ''));

    const todayIso = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]; // SGT
    const upcomingExam = exams.find((e: any) => !e.noExam && e.examDate && e.examDate >= todayIso) ?? null;

    // ── Weak topics from marked Submissions (wrong final answers by topic) ────
    let submissionsMarked = 0;
    let submissionsWrong = 0;
    const wrongByTopic: Record<string, number> = {};
    try {
      const subsData = await airtableRequestAll('Submissions', '');
      const mine = subsData.records.filter((r: any) => r.fields['Student']?.[0] === id);
      for (const r of mine) {
        submissionsMarked++;
        // Matches Correct is a checkbox; false/absent = wrong final answer.
        if (r.fields['Matches Correct'] !== true) {
          submissionsWrong++;
          const topic = (r.fields['Question Topic'] || '').trim() || 'Uncategorised';
          wrongByTopic[topic] = (wrongByTopic[topic] || 0) + 1;
        }
      }
    } catch {
      // Submissions table may not exist / be empty — degrade gracefully.
    }

    const weakTopics = Object.entries(wrongByTopic)
      .filter(([topic]) => topic !== 'Uncategorised')
      .map(([topic, missed]) => ({ topic, missed }))
      .sort((a, b) => b.missed - a.missed)
      .slice(0, 8);

    return NextResponse.json({
      upcomingExam,
      exams,
      weakTopics,
      stats: { submissionsMarked, submissionsWrong },
    });
  } catch (err: any) {
    console.error('[at-a-glance] error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load' }, { status: 500 });
  }
}
