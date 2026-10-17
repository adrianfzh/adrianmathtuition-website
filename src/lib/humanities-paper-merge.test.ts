import { describe, it, expect } from 'vitest';
import { mergePaperItems, markable } from './humanities-paper-merge';

describe('mergePaperItems', () => {
  it('joins a question split across two batches of pages', () => {
    const out = mergePaperItems([
      [{ number: '1', question: '(a) Describe … [3]\n(b) Explain … [4]', material: 'Fig. 1 [Picture: graph]', answer: '(a) It rose.' }],
      [{ number: 'Q1', question: '', material: 'Fig. 1 [Picture: graph]', answer: '(b) Because of the pandemic.' }, { number: '2', question: 'To what extent …? [9]', material: '', answer: 'I agree …' }],
    ]);
    expect(out.map(i => i.number)).toEqual(['1', '2']);
    expect(out[0].answer).toBe('(a) It rose.\n(b) Because of the pandemic.');
    expect(out[0].material).toBe('Fig. 1 [Picture: graph]');
    expect(out[0].question).toContain('(b) Explain');
  });
  it('orders by question number', () => {
    expect(mergePaperItems([[{ number: '3', question: 'q', material: '', answer: 'a b c' }, { number: '1', question: 'q', material: '', answer: 'a b c' }]]).map(i => i.number)).toEqual(['1', '3']);
  });
});

describe('markable', () => {
  it('needs the question and an answer', () => {
    expect(markable({ number: '1', question: 'q', material: '', answer: 'one two three' })).toBe(true);
    expect(markable({ number: '1', question: '', material: '', answer: 'one two three' })).toBe(false);
    expect(markable({ number: '1', question: 'q', material: '', answer: '' })).toBe(false);
  });
});
