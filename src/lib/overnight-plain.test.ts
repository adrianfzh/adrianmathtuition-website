// plainLine — every night job's stored summary → one plain line for Adrian's phone (12 Oct 2026).
// Fixtures are the real job_runs summaries of 6–12 Oct 2026 (cut to 400 characters as read),
// with every student's name and Telegram handle replaced by [student].
import { describe, expect, it } from 'vitest';
import { cutShort, needsWords, plainLine, staleWords } from './overnight';

const CASES: [job: string, summary: string, plain: string][] = [
  ['nightly-builder', 'nothing approved to build', 'Nothing approved to build.'],

  ['flag-review', '1 tickets read: 0 patterns, 1 one-offs (re-check code bug, fixed 9adc29d), 1 wrong replies (a right answer called wrong; same final answers)',
    "Checked 1 flagged answer and fixed the cause; the bot's reply was wrong once."],
  ['flag-review', '1 ticket read: 0 patterns, 1 one-off (re-check plumbing bug on multi-photo questions, fixed + pushed), 0 wrong replies',
    'Checked 1 flagged answer and fixed the cause.'],

  ['file-subgroups', 'fly: 2 left the backlog (filed or held), 0 still to file, 102s, exit 0', 'Filed 2 questions into practice groups; none left.'],
  ['file-subgroups', 'fly: 0 left the backlog (filed or held), 0 still to file, 10s, exit 0', 'No new questions to file.'],
  ['file-subgroups', 'fly: 164 left the backlog (filed or held), 15 still to file, 413s, exit 0', 'Filed 164 questions into practice groups; 15 still to file.'],
  ['file-subgroups', 'fly: 0 left the backlog (filed or held), 1512 still to file, 643s, exit 0', 'Filed none; 1512 still to file.'],

  ['day-review', '2026-10-11: 14 rows, 3 chats, 14 correct, 0 wrong, 1 label fixed (Physics→Math), 1 flag ticket (corrected a right answer; fixed in 9adc29d), Fly log unreadable (token expired)',
    'Read 14 chat-bot answers from yesterday: all right, 1 label fixed.'],
  ['day-review', '2026-10-11: 14 questions, 1 label fixed, 13 correct, 0 wrong, 1 incomplete, 1 flag (corrected a right answer, already fixed)',
    'Read 14 chat-bot answers from yesterday: 1 not complete, 1 label fixed.'],
  ['day-review', '2026-10-10: 66 rows, 11 chats, 44 photos, 0 science; 6 topic labels fixed; judged 66: 63 correct, 1 wrong (box-plot Q1 misread), 2 incomplete (hand-in status question, named Adrian); 0 flags',
    'Read 66 chat-bot answers from yesterday: 1 wrong, 2 not complete, 6 labels fixed.'],
  ['day-review', '2026-10-09 · 49 rows · 10 chats · labels fixed 7 · judged 49: 46 correct · 1 wrong · 2 incomplete · no digest (nothing urgent)',
    'Read 49 chat-bot answers from yesterday: 1 wrong, 2 not complete, 7 labels fixed.'],
  ['day-review', '2026-10-08: 46 rows, 7 chats, 12 science; labels fixed 0; judged 46: 43 correct, 1 wrong (Q20 bromine 2.8.8.8.8.1 endorsed), 2 incomplete (complex ion; interval notation); 7 issues; no digest sent',
    'Read 46 chat-bot answers from yesterday: 1 wrong, 2 not complete.'],
  ['day-review', '2026-10-07: 42 rows, 5 chats, 3 labels fixed (1 subject Physics→Math), 2 wrong (Pure-vs-Combined chem practical facts), no digest sent',
    'Read 42 chat-bot answers from yesterday: 2 wrong, 3 labels fixed.'],
  ['day-review', '2026-10-06: 40 rows, 9 chats, 5 science; 2 topics fixed (+2 ask_skills filed); 39 correct, 0 wrong, 1 incomplete (Q16b blanks, photo-memory seam); 1 flag ticket failed (5-byte image); no digest sent',
    'Read 40 chat-bot answers from yesterday: 1 not complete, 2 labels fixed.'],

  ['bot-review', "12 Oct 2026 Mon (day-review 11 Oct: 14 q / 3 chats / 0 wrong / 1 incomplete / 1 flag; week 289 q, 85% verified, 3 wrong): shipped d345f08 — Telegram log read the thread with a number key in a String-keyed Map, so since 2 Sept the subject classifier never saw the thread ([student]'s maths follow-ups filed Physics twice; replay with thread math 6/6, alone physics 3/6) and the student-correction ",
    'Fixed 1 thing in the chat bot.'],
  ['bot-review', "11 Oct 2026 Sun (day-review 10 Oct: 66 q / 11 chats / 1 wrong / 1 incomplete; 0 flags): proposed paper-marked-question (branch pushed c57e188, npm test green, replayed on the plan) — a student asking 'how will I know when my paper is marked?' was sent to her school and to 'Adrian or whoever runs the website'; her paper had been released to her own chat 80 min earlier (delivery fine); recorded, no ",
    '1 change waiting for your Ship.'],
  ['bot-review', '8 Oct 2026 Thu (day-review 7 Oct: 42 q / 5 chats / 2 wrong / 1 incomplete; 0 flags): shipped ea2486f — the 📎 line is not added when the answer already ends by asking (7 of 10 web 📎 answers in 30 d had two asks), deploy green; proposed web-carry-two-photos (stem two photos back missed) and exam-facts-not-from-memory (invented Pure-vs-Combined practical facts); digest sent with 3 items; $0 API',
    'Fixed 1 thing in the chat bot; 2 changes waiting for your Ship.'],
  ['bot-review', "6 Oct 2026 Tue (day-review 5 Oct: 32 q / 7 chats / 0 wrong / 2 incomplete; 0 flags, corrections, overrides): found why the web answers one photo twice — the client's network retry re-posts the same requestId — shipped a guard 313e44c (stored answer or 202; cause not proven from a log); proposed photo-after-photo (a web photo within 15 min carries the earlier photo; [student]'s TV-room figure, [student] 26 ",
    'Fixed 1 thing in the chat bot; 1 change waiting for your Ship.'],

  ['marking-review', '2026-10-12: 4 papers (2 maths, 2 chemistry), 38 pages read, ~103 findings (placement 67 · words 31 · read 5), comprehension 4/12, 13 min; digest sent (3 items)',
    'Read 38 marked pages from 4 papers; about 103 small slips; 3 sent to you.'],
  ['marking-review', '2026-10-07: 13 papers, 39 pages read, ~88 findings (placement ~50 · words ~26 · read ~12), comprehension 9/12; 33 pages with a slip; 3 items for Adrian ([student] Set 1 Q5(b) 1/1 vs B0, [student] TKGS P2 pencil proof 0/4 + Q6(c), [student] P2 p10 tick and cross on one answer); ~8 min',
    'Read 39 marked pages from 13 papers; about 88 small slips; 3 sent to you.'],

  ['marking-fix', "2026-10-12: 0 of Adrian's own reports done (#19 still needs his decision), 5 classes fixed (6 pages: F115-F119 — age range, value in one piece, a part's fix and note stay in their part, continuation false alarm), 0 proposed, 4 reported, 0 reverted, 1 repeat×3 closed (value-in-one-piece replaces F92/F104 patches); ~75 min",
    'Fixed 5 kinds of red-pen mistakes on 6 pages.'],
  ['marking-fix', "2026-10-08: 0 of Adrian's own reports new (19 still needs him — asked again), 9 classes fixed (F91 Venn on a grey photo, F92 maths broken at a relation / lone last word, F93 'from line ①' with no ①, F94 dash beside maths + units, F95 figure in the wrong part, F96 box in the next table row, F97 note beside the next part, F98 ✓ carried past the next line, F99 codes on her writing — general check) — ",
    'Fixed 9 kinds of red-pen mistakes.'],
  ['marking-fix', "2026-10-07: 7 of Adrian's own reports done (7, 10, 14, 22, 9, 16, 24), 5 proposed (12, 13, 18 wording; 2 with pictures: 17 no-hint-beside-the-solution, arrows-round-her-writing), 1 needs him (19: a reading miss, not pen code); 6 classes fixed from the reader/bench (F85 tick on the printed Answer, F86 short arrow along an underline, F87 raw caret, F88 the fix said twice, F89 a working line's tick a",
    'Fixed 6 kinds of red-pen mistakes; did 7 of your reports; 5 changes waiting for your Ship.'],
  ['marking-fix', 'the fixer ended without its logbook row — stopped with work unfinished; retrying', 'Stopped before it finished; it tries again.'],

  ['marking-learn', 'no new corrections since the last run', 'No new mark changes from you to learn from.'],
  ['marking-learn', '6 Oct: 1 corrections read, 0 patterns, 0 proposed, 1 watching', 'Read 1 mark change of yours; no pattern yet.'],

  ['extraction-learn', 'read 0 papers; applied 0, proposed 0, requeued 0', 'No new papers to learn from.'],
  ['extraction-learn', 'read 398 papers; applied 1, proposed 0, requeued 0', 'Read 398 new papers; added 1 reading rule.'],

  ['doc-sweep', '128 sure, 194 look · fixed 22 · proposed 2 (doc-sweep-1, doc-sweep-2)', 'Fixed 22 out-of-date lines in the instructions; 2 changes waiting for your Ship.'],
];

describe('plainLine — the real summaries of 6–12 Oct 2026', () => {
  for (const [job, summary, plain] of CASES) {
    it(`${job}: ${summary.slice(0, 50)}`, () => expect(plainLine(job, summary)).toBe(plain));
  }

  it('never lets a name through, even from the fallback', () => {
    for (const [job, summary] of CASES) expect(plainLine(job, summary)).not.toContain('[student]');
    expect(plainLine('marking-review', 'Isabelle p1: boxes swapped')).not.toContain('Isabelle');
    expect(cutShort('read Chloe and Joey pages twice; more')).toBe('Read and pages twice.');
  });

  it('falls back to a cut-short first clause for a shape it does not know', () => {
    expect(plainLine('bot-review', 'looked around quietly; nothing else')).toBe('Looked around quietly.');
    expect(plainLine('some-new-job', '2026-10-12: tidied 4 caches (old ones) and more')).toBe('Tidied 4 caches.');
    expect(plainLine('day-review', '')).toBe('');
    const long = plainLine('nightly-builder', 'a very long line that keeps going and going and going well past the point where a phone can show it');
    expect(long.length).toBeLessThanOrEqual(72);
    expect(long.endsWith('…')).toBe(true);
  });

  it('a twin lane reads its count from meta', () => {
    expect(plainLine('twin-batch', 'whatever', { published: 1 })).toBe('Wrote 1 new question.');
  });
});

describe('Needs your look, in words', () => {
  it('says what each number is', () => {
    const w = needsWords(1, [{ value: '2', label: 'Extraction rules to decide' }, { value: '0', label: 'Hand-ins failed on a phone' }]);
    expect(w).toEqual({ count: 3, parts: ['1 job failed or late', '2 extraction rules to decide'], sub: '2 kinds, below' });
    expect(needsWords(0, [{ value: '4', label: 'Proposals that did not ship' }]).sub).toBe('4 proposals that did not ship');
    expect(needsWords(0, [])).toEqual({ count: 0, parts: [], sub: 'nothing' });
  });

  it('a failed job is said in plain words, without its stored summary', () => {
    expect(staleWords('marking-fix', 'last run FAILED — the fixer ended without its logbook row — stopped')).toBe('Last run failed: stopped before it finished; it tries again.');
    expect(staleWords('x', 'last run FAILED')).toBe('Last run failed.');
    expect(staleWords('x', "hasn't run in 30h (expected daily)")).toBe('Has not run for 30 hours.');
  });
});
