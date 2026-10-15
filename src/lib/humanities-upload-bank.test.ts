import { describe, it, expect } from 'vitest';
import { normaliseQuestion, questionFingerprint } from './humanities-upload-bank';

describe('the same school question, however it was photographed', () => {
  it('ignores the number in front, the marks, case and punctuation', () => {
    const a = '3 Study Source C. Why do you think this cartoon was published? Explain your answer. [6]';
    const b = 'Study source C — why do you think this cartoon was published?  Explain your answer (6 marks)';
    expect(normaliseQuestion(a)).toBe(normaliseQuestion(b));
    expect(questionFingerprint('social-studies', a, 'Source C: A cartoon, 2025.')).toBe(questionFingerprint('social-studies', b, 'Source C: a cartoon 2025'));
  });
  it('tells apart two papers that share a question line, and two subjects', () => {
    const q = 'Study Sources A and B. How similar are these two sources? Explain your answer. [6]';
    expect(questionFingerprint('social-studies', q, 'Source A: about tray return')).not.toBe(questionFingerprint('social-studies', q, 'Source A: about water prices'));
    expect(questionFingerprint('history', q, '')).not.toBe(questionFingerprint('social-studies', q, ''));
  });
});
