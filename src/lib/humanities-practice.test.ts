import { describe, it, expect } from 'vitest';
import { skillsOf, questionsOf, skillStandings, practiceRun, nextOfSkill, shareText, PRACTICE_RUN } from './humanities-practice';

const row = (skill: string, question_id: string, lo: number, hi: number, max: number, at = '2026-10-07T00:00:00Z') =>
  ({ skill, question_id, status: 'marked', level_lo: lo, level_hi: hi, levels_max: max, created_at: at });

describe('practice by skill (D)', () => {
  it('each subject offers the skills it has questions for', () => {
    expect(skillsOf('social-studies')).toEqual(['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'surprise', 'how_far', 'sr_explain', 'sr_weigh']);
    expect(skillsOf('history')).toContain('hist_evaluate');
    expect(skillsOf('geography')).toEqual(['geo_describe', 'geo_explain', 'geo_evaluate']);
    for (const s of ['social-studies', 'history', 'geography'] as const) for (const k of skillsOf(s)) expect(questionsOf(s, k).length, `${s} ${k}`).toBeGreaterThan(0);
  });

  it('a run is five questions, unanswered first, moving across sets', () => {
    const run = practiceRun('social-studies', 'reliability', new Set());
    expect(run.length).toBe(PRACTICE_RUN);
    expect(new Set(run.map(c => c.set.id)).size).toBe(PRACTICE_RUN);
    const first = run[0].question.id;
    const next = practiceRun('social-studies', 'reliability', new Set([first]));
    expect(next.map(c => c.question.id)).not.toContain(first);
  });

  it('when few are left, answered ones fill the run', () => {
    const all = questionsOf('history', 'purpose').map(c => c.question.id);
    const run = practiceRun('history', 'purpose', new Set(all));
    expect(run.length).toBe(Math.min(PRACTICE_RUN, all.length));
    expect(nextOfSkill('history', 'purpose', new Set(all))).toBeNull();
    expect(nextOfSkill('history', 'purpose', new Set(), all[0])).not.toBe(all[0]);
  });

  it('skills are offered weakest first, then the ones not tried', () => {
    const st = skillStandings('social-studies', [row('inference', 's01-q9', 3, 3, 3), row('reliability', 's02-q2', 1, 2, 4), row('comparison', 's01-q1', 3, 3, 4)]);
    expect(st.slice(0, 3).map(s => s.skill)).toEqual(['reliability', 'comparison', 'inference']);
    expect(st[3].share).toBeNull();
    expect(st.find(s => s.skill === 'comparison')!.left).toBe(st.find(s => s.skill === 'comparison')!.total - 1);
  });

  it('a zero on a point-marked answer counts — it is the weakest, not untried', () => {
    const st = skillStandings('geography', [row('geo_explain', 'g01-q1', 0, 0, 4), row('geo_describe', 'g01-q2', 3, 3, 3)]);
    expect(st.map(s => s.skill)).toEqual(['geo_explain', 'geo_describe', 'geo_evaluate']);
    expect(st[0].share).toBe(0);
    expect(shareText(0.62)).toBe('about 6 marks in 10');
  });
});
