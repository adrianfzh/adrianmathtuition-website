import { describe, it, expect } from 'vitest';
import { assignmentNudge } from './assignment-nudge';

const SITE = 'https://www.adrianmathtuition.com';
const RUN = '94da9689-ac42-457a-a696-e6cbfb49e67e';

describe('assignmentNudge — what the student is told when work lands', () => {
  it('a Practice Again sheet Adrian released is compulsory and says so, linking to the paper', () => {
    const n = assignmentNudge({ kind: 'worksheet', title: 'Practice Again — A Math · GCE 2021 · Paper 1', source: 'practice-again', source_run_id: RUN, required_at: '2026-09-08T04:00:00Z' }, SITE);
    expect(n.text).toContain('he asked you to do this one');
    expect(n.text).toContain(`${SITE}/app/marking/${RUN}`);
    expect(n.push.url).toBe(`/app/marking/${RUN}`);
    expect(n.push.title).toBe('📘 Practice Again from Adrian');
    expect(n.push.body).toContain('Adrian asked you to do this one');
  });
  it('a Practice Again sheet the student asked for is "ready", not an instruction', () => {
    const n = assignmentNudge({ kind: 'worksheet', title: 'Practice Again — E Math · Prelim', source: 'practice-again', source_run_id: RUN, required_at: null }, SITE);
    expect(n.text).toMatch(/^📘 Your Practice Again sheet is ready/);
    expect(n.text).not.toContain('asked you to do');
    expect(n.push.title).toBe('📘 Your Practice Again sheet is ready');
    expect(n.push.url).toBe(`/app/marking/${RUN}`);
  });
  it('escapes HTML in the title and never breaks the Telegram markup', () => {
    const n = assignmentNudge({ kind: 'worksheet', title: 'Sec 4 <A&B>', source: 'practice-again', source_run_id: RUN, required_at: null }, SITE);
    expect(n.text).toContain('<b>Sec 4 &lt;A&amp;B&gt;</b>');
    expect(n.push.body).toBe('Sec 4 <A&B>');
  });
  it('ordinary sent work keeps the original nudge: kind, due label, the note, /app', () => {
    const n = assignmentNudge({ kind: 'question', title: 'Indices Q3', note: 'Try before Thursday', due_on: '2026-09-11', source: 'adrian' }, SITE);
    expect(n.text).toMatch(/^📬 Adrian sent you a question: <b>Indices Q3<\/b> \(/);
    expect(n.text).toContain('“Try before Thursday”');
    expect(n.text).toContain(`Open it: ${SITE}/app`);
    expect(n.push).toEqual({ title: '📬 New work from Adrian', body: 'Indices Q3', url: '/app/assignments' });
  });
  it('a Practice Again row with no source run still lands on the Papers list', () => {
    const n = assignmentNudge({ kind: 'worksheet', title: 'Practice Again', source: 'practice-again', source_run_id: null, required_at: null }, SITE);
    expect(n.push.url).toBe('/app/marking');
  });
});
