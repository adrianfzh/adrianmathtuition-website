import { describe, it, expect } from 'vitest';
import {
  countPracticePhotosToday, parseClassification, pickSeed, buildPhotoRequest, intentText,
  writingTitle, parseDoneBody, doneOutcome, parseReportBody, reportReasonText, DAILY_PRACTICE_PHOTO_CAP,
  type PhotoCountingClient,
} from './practice-photo';

const SG = { id: 12, name: 'Completing the square', topic: 'Quadratic Functions', description: 'Express in the form a(x+p)^2+q' };
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('countPracticePhotosToday', () => {
  it('counts tier practice-photo rows since the SGT day start', async () => {
    const calls: Array<[string, string | boolean]> = [];
    let since = '';
    const client: PhotoCountingClient = {
      from: () => ({
        select: () => {
          const q = {
            eq(c: string, v: string | boolean) { calls.push([c, v]); return q; },
            gte(_c: string, v: string) { since = v; return q; },
            then(res: (r: { count: number | null; error: unknown }) => unknown) { return Promise.resolve(res({ count: 3, error: null })); },
          };
          return q as never;
        },
      }),
    };
    // 2026-09-23 10:00 SGT = 02:00Z → the day began 2026-09-22T16:00:00.000Z
    const n = await countPracticePhotosToday(client, 'recA', new Date('2026-09-23T02:00:00Z'));
    expect(n).toBe(3);
    expect(calls).toEqual([['airtable_student_id', 'recA'], ['tier', 'practice-photo']]);
    expect(since).toBe('2026-09-22T16:00:00.000Z');
    expect(DAILY_PRACTICE_PHOTO_CAP).toBe(10);
  });
});

describe('parseClassification', () => {
  it('reads the bot reply and rounds marks', () => {
    const c = parseClassification({ ok: true, extractedText: 'Express x^2+4x', level: 'S3_AM', subgroup: { id: '12', name: 'CTS', topic: 'QF', description: null }, confidence: 0.9, reason: 'r', marks: 3.2, figureExpected: false });
    expect(c?.subgroup).toEqual({ id: 12, name: 'CTS', topic: 'QF', description: null });
    expect(c?.marks).toBe(3);
    expect(c?.figureExpected).toBe(false);
  });
  it('unreadable → empty text, no subgroup', () => {
    const c = parseClassification({ ok: true, extractedText: '', subgroup: null, confidence: null, reason: 'unreadable photo', marks: null, figureExpected: false });
    expect(c?.extractedText).toBe('');
    expect(c?.subgroup).toBeNull();
  });
  it('not-ok or malformed → null', () => {
    expect(parseClassification({ ok: false })).toBeNull();
    expect(parseClassification('x')).toBeNull();
    expect(parseClassification({ ok: true, subgroup: { id: 'abc', name: 'x' } })?.subgroup).toBeNull();
  });
});

describe('pickSeed', () => {
  const rows = [
    { id: U1, total_marks: 3, difficulty: 'Medium', ai_generated: false },
    { id: U2, total_marks: 6, difficulty: 'Hard', ai_generated: false },
    { id: '33333333-3333-4333-8333-333333333333', total_marks: 3, difficulty: 'Easy', ai_generated: true },
    { id: '44444444-4444-4444-8444-444444444444', total_marks: 3, difficulty: null, ai_generated: false, reported_at: '2026-09-01' },
  ];
  it('prefers marks within one and a real bank row, never a reported one', () => {
    const s = pickSeed(rows, { marks: 4, rand: 0 });
    expect(s?.id).toBe(U1);
    expect(s?.tier).toBe('standard');
  });
  it('without marks, any real row wins over a generated one; rand breaks ties', () => {
    expect(pickSeed(rows, { marks: null, rand: 0 })?.id).toBe(U1);
    expect(pickSeed(rows, { marks: null, rand: 0.99 })?.id).toBe(U2);
  });
  it('never the seed just served; falls to the generated row', () => {
    expect(pickSeed(rows, { marks: 3, avoidId: U1, rand: 0 })?.id).toBe('33333333-3333-4333-8333-333333333333');
  });
  it('null when nothing is left', () => {
    expect(pickSeed([], { marks: 2 })).toBeNull();
    expect(pickSeed([rows[3]], { marks: 2 })).toBeNull();
  });
});

describe('buildPhotoRequest', () => {
  const c = { extractedText: ' Express x^2+4x+1 in the form (x+a)^2+b ', level: 'S3_AM', subgroup: SG, confidence: 0.8, reason: null, marks: 2, figureExpected: false };
  it('with a seed = re-skin, the seed’s tier', () => {
    const r = buildPhotoRequest({ portalAccountId: U2, classification: c, seed: { id: U1, tier: 'advanced', marks: 3 } });
    expect(r.requested_by).toBe('practice-photo:' + U2);
    expect(r.similarity_level).toBe('re-skin');
    expect(r.source_question_id).toBe(U1);
    expect(r.tier).toBe('advanced');
    expect(r.priority).toBe(1);
    expect(r.count).toBe(1);
    expect(r.status).toBe('pending');
    expect(r.figure_mode).toBeNull();
    expect(r.topic).toBe('Quadratic Functions');
    expect(r.intent_json.text).toBe('Express x^2+4x+1 in the form (x+a)^2+b');
    expect(r.intent_json.subgroup.id).toBe(12);
  });
  it('without a seed = same-skills on the sub-skill, standard; a figure asks for graph mode', () => {
    const r = buildPhotoRequest({ portalAccountId: U2, classification: { ...c, figureExpected: true }, seed: null });
    expect(r.similarity_level).toBe('same-skills');
    expect(r.source_question_id).toBeNull();
    expect(r.tier).toBe('standard');
    expect(r.figure_mode).toBe('graph');
    expect(r.source_text.startsWith('Sub-skill: Completing the square (Quadratic Functions)\nMarks: 2\n\nExpress')).toBe(true);
  });
  it('intentText says when marks were not printed', () => {
    expect(intentText({ extractedText: 'q', subgroup: null, marks: null })).toBe('Sub-skill: unknown\nMarks: not printed\n\nq');
  });
  it('writingTitle is the sub-skill name', () => {
    expect(writingTitle(SG)).toBe('Completing the square');
    expect(writingTitle({ name: '  ', topic: 'QF' })).toBe('QF');
  });
});

describe('done webhook', () => {
  it('parses a good body and keeps only uuid question ids', () => {
    const p = parseDoneBody({ requestId: U1, questionIds: [U2, 'nope'], error: '' });
    expect(p).toEqual({ ok: true, value: { requestId: U1, questionIds: [U2], error: null } });
  });
  it('rejects a missing request id', () => {
    expect(parseDoneBody({ questionIds: [] }).ok).toBe(false);
    expect(parseDoneBody(null).ok).toBe(false);
  });
  it('outcome: first question assigns; none revokes with the reason', () => {
    expect(doneOutcome({ questionIds: [U2], error: null })).toEqual({ status: 'assigned', questionId: U2 });
    expect(doneOutcome({ questionIds: [], error: 'no candidate passed the gates' })).toEqual({ status: 'revoked', reason: 'no candidate passed the gates' });
    expect(doneOutcome({ questionIds: [], error: null })).toEqual({ status: 'revoked', reason: 'no question written' });
  });
});

describe('report', () => {
  it('parses the reason; unknown → other; note trimmed and capped', () => {
    const p = parseReportBody({ assignmentId: U1, reason: 'wrong-answer', note: '  the answer is 5 not 3 ' });
    expect(p).toEqual({ ok: true, value: { assignmentId: U1, reason: 'wrong-answer', note: 'the answer is 5 not 3' } });
    const q = parseReportBody({ assignmentId: U1, reason: 'zzz', note: 'x'.repeat(500) });
    expect(q.ok && q.value.reason).toBe('other');
    expect(q.ok && q.value.note?.length).toBe(400);
    expect(parseReportBody({ assignmentId: 'x' }).ok).toBe(false);
  });
  it('reportReasonText joins label and note', () => {
    expect(reportReasonText('unclear', null)).toBe('I can’t tell what it’s asking');
    expect(reportReasonText('other', 'typo')).toBe('Something else — typo');
  });
});
