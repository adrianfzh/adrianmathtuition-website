import { describe, expect, it } from 'vitest';
import { bibleFile, parseBankKey, preRefuse, questionClipSlug, type ClipQuestionRow } from './question-clip';

const q = (over: Partial<ClipQuestionRow> = {}): ClipQuestionRow => ({
  id: 'a118ba7c-0000-4000-8000-000000000000',
  question_text: 'Solve the equation $\\log_3 x-2\\log_9 3=\\log_9(x+4)$.',
  answer: '$x=12$', solution: '$\\log_3 x - 1 = \\ldots$', level: 'AM', parts: [], has_image: false, figure_url: null, images: '[]', image_url: '[]',
  ...over,
});

describe('preRefuse', () => {
  it('lets a plain equation through', () => expect(preRefuse(q())).toBeNull());
  it('refuses a figure', () => expect(preRefuse(q({ has_image: true }))?.kind).toBe('figure'));
  it('refuses a figure given only as an images list', () => expect(preRefuse(q({ images: ['x.png'] }))?.kind).toBe('figure'));
  it('refuses a show-that', () => expect(preRefuse(q({ question_text: 'Show that the solution of $2^x = 5$ is $\\lg 5/\\lg 2$.' }))?.kind).toBe('proof'));
  it('refuses a sketch', () => expect(preRefuse(q({ question_text: 'Sketch the graph of $y = \\ln(2-x)$.' }))?.kind).toBe('graph'));
  it('refuses a missing answer', () => expect(preRefuse(q({ answer: '' }))?.kind).toBe('no-answer'));
  it('refuses JC for now', () => expect(preRefuse(q({ level: 'JC' }))?.kind).toBe('level'));
  it('refuses three parts', () => expect(preRefuse(q({ parts: [{}, {}, {}] }))?.kind).toBe('long'));
});

describe('names', () => {
  it('slug is qc- + 8 hex', () => expect(questionClipSlug('A118BA7C-1234-4000-8000-000000000000')).toBe('qc-a118ba7c'));
  it('bible file', () => expect(bibleFile('Differentiation (Tangents and Normals)', 'AM')).toBe('differentiation-tangents-and-normals-am.md'));
  it('logs bible matches the existing file', () => expect(bibleFile('Logarithms', 'AM')).toBe('logarithms-am.md'));
});

describe('parseBankKey', () => {
  it('reads a GCE key', () => expect(parseBankKey('gce 2023 em p2')).toEqual({ school: 'gce', year: 2023, level: 'EM', paper: '2' }));
  it('reads a school with spaces', () => expect(parseBankKey('nan chiau 2024 am p1')?.school).toBe('nan chiau'));
  it('refuses anything else', () => expect(parseBankKey('math prelim p1 2026 sjc')).toBeNull());
});

describe('never-served questions', () => {
  it('refuses a part marked out of syllabus', () => expect(preRefuse(q({ parts: [{ label: '(a)', legacy: true, marks: 2 }, { label: '(b)', marks: 3 }] }))?.kind).toBe('syllabus'));
  it('refuses a national row', () => expect(preRefuse(q({ national: true }))?.kind).toBe('not-served'));
  it('refuses an unchecked twin', () => expect(preRefuse(q({ ai_generated: true, verified: false }))?.kind).toBe('not-served'));
});
