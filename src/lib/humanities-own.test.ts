import { describe, it, expect } from 'vitest';
import { guessSkill, checkOwn, ownContext, contextForRun, mentionsSources } from './humanities-own';
import { buildHumanitiesPayload } from './humanities-prompt';
import { questionById } from './humanities-questions';

describe('guessSkill', () => {
  const ss = (q: string) => guessSkill('social-studies', q);
  it('reads the source-based types from the wording', () => {
    expect(ss('Study Sources A and B. How different are these two sources? Explain your answer.')).toBe('comparison');
    expect(ss('Study Source C. Why do you think the cartoon was published? Explain your answer.')).toBe('purpose');
    expect(ss('Study Source D. Are you surprised by this source? Explain your answer.')).toBe('surprise');
    expect(ss('Study Sources E and F. Does this mean one of them is less believable? Explain.')).toBe('reliability');
    expect(ss('Study Source D. Does Source D prove Source C wrong? Explain your answer.')).toBe('reliability');
    expect(ss('Study Source E. How useful is Source E as evidence about the vote?')).toBe('usefulness');
    expect(ss('Study Source A. What is the message of this poster? Explain your answer.')).toBe('inference');
    expect(ss("'Canadians welcome diversity.' Using the sources in this case study, explain how far you agree.")).toBe('how_far');
  });
  it('reads Section B, History and Geography', () => {
    expect(ss('Extract 1 shows people want more say. Explain two ways in which citizens can take part.')).toBe('sr_explain');
    expect(ss('Extracts 2 and 3 describe a challenge. Which factor is more important? Explain your answer.')).toBe('sr_weigh');
    expect(guessSkill('history', 'How far do you agree that the Treaty of Versailles caused the war?')).toBe('hist_evaluate');
    expect(guessSkill('geography', "'Tourism does more harm than good.' To what extent do you agree?")).toBe('geo_evaluate');
    expect(guessSkill('geography', 'Describe the pattern shown in Fig. 1.')).toBeNull();
  });
  it('knows a question that needs sources', () => {
    expect(mentionsSources('Study Source A.')).toBe(true);
    expect(mentionsSources('Explain two ways people can help.')).toBe(false);
  });
});

describe('checkOwn', () => {
  const base = { subject: 'social-studies', skill: 'comparison', question: 'How similar are Sources A and B?', sources: 'Source A: a long enough text from a newspaper about the vote. Source B: a speech.' };
  it('accepts a whole question', () => {
    const r = checkOwn({ ...base, marks: '6' });
    expect(r.ok && r.own.marks).toBe(6);
  });
  it('asks for the sources a source question needs', () => {
    expect(checkOwn({ ...base, sources: '' }).ok).toBe(false);
  });
  it('refuses a type the subject does not have', () => {
    expect(checkOwn({ ...base, subject: 'geography' }).ok).toBe(false);
    expect(checkOwn({ ...base, skill: 'geo_describe' }).ok).toBe(false);
  });
});

describe('ownContext', () => {
  it('builds a context the reader takes, with the sources in view', () => {
    const ctx = ownContext('own-1', { subject: 'social-studies', skill: 'comparison', question: 'How similar are Sources A and B?', sources: 'Source A: … Source B: …' })!;
    const p = buildHumanitiesPayload(ctx, 'They are similar because both say voting helps.');
    expect(p.skill).toBe('comparison');
    expect(p.sources).toHaveLength(1);
    expect(p.scheme?.levels.length).toBeGreaterThan(0);
    expect(p.question).toBe('How similar are Sources A and B?');
  });
  it('a structured question carries no sources', () => {
    const ctx = ownContext('own-2', { subject: 'social-studies', skill: 'sr_explain', question: 'Explain two ways citizens can take part.', sources: '' })!;
    expect(ctx.set.kind).toBe('structured');
    expect(ctx.inView).toEqual([]);
  });
  it('contextForRun takes the bank for a bank question', () => {
    expect(contextForRun({ question_id: 's11-q1' }, questionById)?.question.id).toBe('s11-q1');
    expect(contextForRun({ question_id: 'own-3', own_question: { subject: 'history', skill: 'hist_evaluate', question: 'How far do you agree?', sources: '' } }, questionById)?.set.title).toBe('Your own question');
  });
});
