import { describe, it, expect } from 'vitest';
import {
  parseEvidence, groupShelf, applyShelfAction, parseQuestionRef,
  extractQuestionEvidence, defaultSkillLabel, lostMarkQuestions,
  MAX_EVIDENCE_PER_ENTRY, type ShelfEvidence,
} from './shelf';

const NOW = new Date('2026-09-02T04:00:00Z');

// Mirrors the real marker output (run 22a895ea…, Alessi's AM 2021 P1):
// marking_output.question is an OBJECT carrying the prompt, part labels are
// "(a)"/"(b)", and annotated_photos maps photo_index → url.
const RESULT_JSON = {
  results: [
    {
      question_number: '6',
      photo_index: 4,
      marking: {
        total_awarded: 3, total_max: 6,
        parts: [
          { label: '(a)', awarded: 2, max: 2, error_summary: null },
          { label: '(b)', awarded: 1, max: 4, error_summary: 'Stopped at the set-up: compare constants.' },
        ],
      },
      marking_output: {
        question: { number: '6', prompt: 'P = 2x^3 - x^2 - 13x + k; find a.', max_marks: 6 },
        meta: { topic_detected: 'Polynomials' },
      },
    },
    {
      question_number: '7',
      photo_index: 5,
      marking: { total_awarded: 5, total_max: 5, parts: [{ label: '(a)', awarded: 5, max: 5 }] },
      marking_output: { question: 'Old-style string prompt.', meta: {} },
    },
    {
      question_number: '14',
      photo_index: 10,
      marking: {
        total_awarded: 2, total_max: 10,
        parts: [
          { label: '(a)', awarded: 2, max: 5, error_summary: 'Normal gradient sign flipped.' },
          { label: '(b)', awarded: 0, max: 5, error_summary: 'Wrong region and limits.' },
        ],
      },
      marking_output: {
        question: { number: '14', prompt: 'Area bounded by the curve and the normal.', max_marks: 10 },
        meta: { topic_detected: 'Integration (Area)' },
      },
    },
  ],
  annotated_photos: [
    { photo_index: 4, url: 'https://blob.example/p4.jpg', url_with_solutions: 'https://blob.example/p4-sol.jpg' },
    { photo_index: 10, url: 'https://blob.example/p10.jpg' },
  ],
};

describe('parseEvidence', () => {
  it('accepts the agreed element shape and cleans it', () => {
    const r = parseEvidence([
      { question_number: ' 6(b) ', prompt: 'Find a.', awarded: 1, max: 4, annotated_page_url: 'https://x/p.jpg', error: 'stopped early' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.evidence[0]).toEqual({
      question_number: '6(b)', prompt: 'Find a.', awarded: 1, max: 4,
      annotated_page_url: 'https://x/p.jpg', error: 'stopped early',
    });
  });

  it('treats missing evidence as an empty list', () => {
    expect(parseEvidence(undefined)).toEqual({ ok: true, evidence: [] });
    expect(parseEvidence(null)).toEqual({ ok: true, evidence: [] });
  });

  it('refuses a non-array and names the broken element', () => {
    expect(parseEvidence('nope').ok).toBe(false);
    const bad = parseEvidence([{ prompt: 'no number', awarded: 1, max: 2, annotated_page_url: '' }]);
    expect(bad).toEqual({ ok: false, error: 'evidence[0].question_number is required' });
  });

  it('refuses non-numeric or negative scores', () => {
    expect(parseEvidence([{ question_number: '1', awarded: 'x', max: 2 }]).ok).toBe(false);
    expect(parseEvidence([{ question_number: '1', awarded: 1, max: -2 }]).ok).toBe(false);
  });

  it('caps the list length', () => {
    const many = Array.from({ length: MAX_EVIDENCE_PER_ENTRY + 1 }, (_, i) => ({
      question_number: String(i + 1), awarded: 0, max: 1, prompt: '', annotated_page_url: '',
    }));
    expect(parseEvidence(many).ok).toBe(false);
  });

  it('drops an empty error rather than storing ""', () => {
    const r = parseEvidence([{ question_number: '2', awarded: 0, max: 3, error: '  ' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect('error' in r.evidence[0]).toBe(false);
  });
});

describe('groupShelf', () => {
  it('splits by status, waiting first, and folds unknown statuses into done', () => {
    const rows = [
      { id: 'a', status: 'done' },
      { id: 'b', status: 'waiting' },
      { id: 'c', status: 'started' },
      { id: 'd', status: 'dropped' }, // legacy pre-migration value
    ];
    const g = groupShelf(rows);
    expect(g.waiting.map(r => r.id)).toEqual(['b']);
    expect(g.started.map(r => r.id)).toEqual(['c']);
    expect(g.done.map(r => r.id)).toEqual(['a', 'd']);
  });
});

describe('applyShelfAction', () => {
  it('start moves a waiting entry to started', () => {
    const r = applyShelfAction({ status: 'waiting' }, 'start', undefined, NOW);
    expect(r).toEqual({ ok: true, patch: { status: 'started', updated_at: NOW.toISOString() } });
  });

  it('start refuses a done entry — reopen first', () => {
    expect(applyShelfAction({ status: 'done' }, 'start').ok).toBe(false);
  });

  it('done stamps decided_at', () => {
    const r = applyShelfAction({ status: 'started' }, 'done', undefined, NOW);
    expect(r).toEqual({
      ok: true,
      patch: { status: 'done', decided_at: NOW.toISOString(), updated_at: NOW.toISOString() },
    });
  });

  it('reopen clears decided_at and refuses an already-waiting entry', () => {
    const r = applyShelfAction({ status: 'done' }, 'reopen', undefined, NOW);
    expect(r).toEqual({
      ok: true,
      patch: { status: 'waiting', decided_at: null, updated_at: NOW.toISOString() },
    });
    expect(applyShelfAction({ status: 'waiting' }, 'reopen').ok).toBe(false);
  });

  it('edit renames the skill label and refuses an empty one', () => {
    const r = applyShelfAction({ status: 'waiting' }, 'edit', '  Split the region  ', NOW);
    expect(r).toEqual({ ok: true, patch: { skill_label: 'Split the region', updated_at: NOW.toISOString() } });
    expect(applyShelfAction({ status: 'waiting' }, 'edit', '   ').ok).toBe(false);
  });

  it('refuses an unknown action', () => {
    expect(applyShelfAction({ status: 'waiting' }, 'dropped').ok).toBe(false);
  });
});

describe('parseQuestionRef', () => {
  it('parses bare, part-labelled and Q-prefixed refs', () => {
    expect(parseQuestionRef('6')).toEqual({ base: '6', part: '' });
    expect(parseQuestionRef('6(b)')).toEqual({ base: '6', part: '(b)' });
    expect(parseQuestionRef('Q13(a)(ii)')).toEqual({ base: '13', part: '(a)(ii)' });
  });

  it('returns null with no leading number', () => {
    expect(parseQuestionRef('(b)')).toBeNull();
    expect(parseQuestionRef('')).toBeNull();
  });
});

describe('extractQuestionEvidence', () => {
  it('question-level: totals, joined part diagnoses, page url, topic', () => {
    const r = extractQuestionEvidence(RESULT_JSON, '6');
    expect(r).not.toBeNull();
    expect(r!.evidence).toEqual({
      question_number: '6',
      prompt: 'P = 2x^3 - x^2 - 13x + k; find a.',
      awarded: 3, max: 6,
      annotated_page_url: 'https://blob.example/p4.jpg',
      error: '(b) 1/4 — Stopped at the set-up: compare constants.',
    });
    expect(r!.topic).toBe('Polynomials');
    expect(r!.lost).toBe(3);
  });

  it('part-level: the named part carries its own scores and diagnosis', () => {
    const r = extractQuestionEvidence(RESULT_JSON, '14(b)');
    expect(r!.evidence).toEqual({
      question_number: '14(b)',
      prompt: 'Area bounded by the curve and the normal.',
      awarded: 0, max: 5,
      annotated_page_url: 'https://blob.example/p10.jpg',
      error: 'Wrong region and limits.',
    });
    expect(r!.lost).toBe(5);
  });

  it('handles the legacy string prompt and a missing photo url', () => {
    const r = extractQuestionEvidence(RESULT_JSON, '7');
    expect(r!.evidence.prompt).toBe('Old-style string prompt.');
    expect(r!.evidence.annotated_page_url).toBe(''); // photo 5 has no annotated copy
    expect(r!.lost).toBe(0);
  });

  it('returns null for a question or part the run never marked', () => {
    expect(extractQuestionEvidence(RESULT_JSON, '99')).toBeNull();
    expect(extractQuestionEvidence(RESULT_JSON, '6(z)')).toBeNull();
    expect(extractQuestionEvidence({}, '6')).toBeNull();
  });
});

describe('defaultSkillLabel', () => {
  const ev = (error?: string): ShelfEvidence =>
    ({ question_number: '6', prompt: '', awarded: 1, max: 4, annotated_page_url: '', ...(error ? { error } : {}) });

  it('takes the first diagnosis, shorn of its part prefix', () => {
    expect(defaultSkillLabel(ev('(b) 1/4 — Stopped at the set-up.; (c) 0/2 — Blank.'), 'Polynomials'))
      .toBe('Stopped at the set-up.');
  });

  it('falls back to the topic, then the question', () => {
    expect(defaultSkillLabel(ev(), 'Polynomials')).toBe('Fix: Polynomials');
    expect(defaultSkillLabel(ev(), null)).toBe('Fix Q6');
  });
});

describe('lostMarkQuestions', () => {
  it('lists below-max questions in paper order with topics', () => {
    expect(lostMarkQuestions(RESULT_JSON)).toEqual([
      { questionNumber: '6', awarded: 3, max: 6, topic: 'Polynomials' },
      { questionNumber: '14', awarded: 2, max: 10, topic: 'Integration (Area)' },
    ]);
  });

  it('is calm about junk input', () => {
    expect(lostMarkQuestions(null)).toEqual([]);
    expect(lostMarkQuestions({ results: 'nope' })).toEqual([]);
  });
});
