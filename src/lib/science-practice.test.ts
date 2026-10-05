import { describe, it, expect } from 'vitest';
import { lostTopics, mcqTapAction, parsePracticeKind, parseSkill, sciencePracticeHref, skillLabel, skillsFor, topicsForKind, TOPIC_SKILLS } from './science-practice';

describe('science practice — the pure rules (1 Oct 2026)', () => {
  it('lostTopics: live mistakes of that science only, most first, capped, matched to the bank names', () => {
    const rows = [
      { subject: 'Physics', topic: 'Kinematics', state: 'dark' },
      { subject: 'Physics', topic: 'kinematics', state: 'light' },
      { subject: 'Physics', topic: 'Moments', state: 'dark' },
      { subject: 'Physics', topic: 'Waves', state: 'fixed' },            // done with
      { subject: 'Chemistry', topic: 'Acids and bases', state: 'dark' },  // another science
      { subject: 'Physics', topic: 'Not in bank', state: 'dark' },
      { subject: 'Physics', topic: 'Electricity', state: 'dark' },
      { subject: 'Physics', topic: null, state: 'dark' },
    ];
    expect(lostTopics(rows, 'physics', ['Kinematics', 'Moments', 'Electricity', 'Waves'])).toEqual([
      { topic: 'Kinematics', lost: 2 }, { topic: 'Electricity', lost: 1 }, { topic: 'Moments', lost: 1 },
    ]);
    expect(lostTopics(rows, 'physics', ['Kinematics', 'Moments', 'Electricity'], 1)).toEqual([{ topic: 'Kinematics', lost: 2 }]);
    expect(lostTopics(rows, 'chemistry')).toEqual([{ topic: 'Acids and bases', lost: 1 }]);
    expect(lostTopics(rows, 'biology')).toEqual([]);
  });
  it('topicsForKind: MCQ needs lettered answers, structured needs the rest; no counts leak', () => {
    const counts = [{ topic: 'A', n: 10, mcq_count: 10 }, { topic: 'B', n: 5, mcq_count: 0 }, { topic: 'C', n: 8, mcq_count: 3 }];
    expect(topicsForKind(counts, 'mcq')).toEqual(['A', 'C']);
    expect(topicsForKind(counts, 'structured')).toEqual(['B', 'C']);
  });
  it('parsePracticeKind + the run href', () => {
    expect(parsePracticeKind('structured')).toBe('structured');
    expect(parsePracticeKind('anything')).toBe('mcq');
    expect(sciencePracticeHref('PHY', 'Current electricity', 'mcq')).toBe('/app/science/practice/run?level=PHY&topic=Current%20electricity&mode=mcq');
  });
});

describe('one skill inside a topic (3 Oct 2026)', () => {
  it('chemistry calculations carry the nine skills, MCQ only', () => {
    expect(skillsFor('CHEM', 'Chemical Calculations', 'mcq').map(s => s.slug)).toEqual([
      'formula-mass', 'mass-moles', 'gas-volume', 'concentration', 'mole-ratio', 'limiting-reagent', 'yield-purity', 'empirical-formula', 'titration',
    ]);
    expect(skillsFor('CHEM', 'Chemical Calculations', 'structured')).toEqual([]);
    expect(skillsFor('CHEM', 'Acids and Bases', 'mcq')).toEqual([]);
    expect(skillsFor('PHY', 'Chemical Calculations', 'mcq')).toEqual([]);
    const slugs = TOPIC_SKILLS.CHEM.skills.map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('parseSkill keeps only a slug the topic has', () => {
    expect(parseSkill('CHEM', 'Chemical Calculations', 'titration')).toBe('titration');
    expect(parseSkill('CHEM', 'Chemical Calculations', 'nope')).toBeNull();
    expect(parseSkill('CHEM', 'Energy Changes', 'titration')).toBeNull();
    expect(parseSkill('CHEM', 'Chemical Calculations', null)).toBeNull();
    expect(skillLabel('CHEM', 'Chemical Calculations', 'gas-volume')).toBe('Gas volume ↔ moles (24 dm³)');
    expect(skillLabel('CHEM', 'Chemical Calculations', null)).toBeNull();
  });
  it('the run link carries the skill only when there is one', () => {
    expect(sciencePracticeHref('CHEM', 'Chemical Calculations', 'mcq', 'mass-moles')).toBe('/app/science/practice/run?level=CHEM&topic=Chemical%20Calculations&mode=mcq&skill=mass-moles');
    expect(sciencePracticeHref('CHEM', 'Chemical Calculations', 'mcq')).not.toContain('skill');
  });
  it('the hold switch: a tap checks at once unless the student asked to wait', () => {
    expect(mcqTapAction(false)).toBe('check');
    expect(mcqTapAction(true)).toBe('select');
  });
});

import { scienceTopicOpen, scienceRowOpen } from './science-practice';
describe('the per-topic science switch (5 Oct 2026)', () => {
  const open = { PHY: ['Kinematics'], CHEM: ['Chemical Calculations'], BIO: [] };
  it('opens only listed topics, exact names, per level', () => {
    expect(scienceTopicOpen(open, 'CHEM', 'Chemical Calculations')).toBe(true);
    expect(scienceTopicOpen(open, 'CHEM', 'chemical calculations')).toBe(false);
    expect(scienceTopicOpen(open, 'PHY', 'Chemical Calculations')).toBe(false);
    expect(scienceTopicOpen(open, 'BIO', 'Enzymes')).toBe(false);
    expect(scienceTopicOpen(open, 'XX', 'Kinematics')).toBe(false);
    expect(scienceTopicOpen(open, 'PHY', null)).toBe(false);
  });
  it('null = Adrian\'s preview: everything open', () => {
    expect(scienceTopicOpen(null, 'BIO', 'Enzymes')).toBe(true);
    expect(scienceRowOpen(null, 'BIO', [])).toBe(true);
  });
  it('a row is open when any of its topics is', () => {
    expect(scienceRowOpen(open, 'PHY', ['Forces', 'Kinematics'])).toBe(true);
    expect(scienceRowOpen(open, 'PHY', ['Forces'])).toBe(false);
    expect(scienceRowOpen(open, 'PHY', null)).toBe(false);
  });
});

import { serveTopicKey } from './science-practice';
import { sciencePoolLevels } from './science-levels';
describe('science pools (5 Oct 2026)', () => {
  it('pure and Combined Science draw from their own bank levels', () => {
    expect(sciencePoolLevels('PHY', false)).toEqual(['PHYS']);
    expect(sciencePoolLevels('CHEM', true)).toEqual(['CS_CHEM', 'CS_CHEM_NA']);
    expect(sciencePoolLevels('XX', true)).toEqual([]);
  });
  it('each pool has its own allow-list key', () => {
    expect(serveTopicKey('BIO', false)).toBe('BIO');
    expect(serveTopicKey('BIO', true)).toBe('CS_BIO');
  });
});
