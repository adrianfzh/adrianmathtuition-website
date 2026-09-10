import { describe, expect, it } from 'vitest';
import {
  MAX_OCR_CHARS, buildPhotoReadPrompt, buildSubgroupPrompt, levelTopicsFor, parsePhotoRead, parseSubgroupChoice, subgroupLevelFor,
} from './photo-tag';

describe('levelTopicsFor', () => {
  it('lists the canonical topics per QB level key, deduped, skipping unknown keys', () => {
    const out = levelTopicsFor(['AM', 'nonsense']);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('AM');
    expect(out[0].topics.length).toBeGreaterThan(10);
    expect(new Set(out[0].topics).size).toBe(out[0].topics.length);
  });
});

describe('subgroupLevelFor', () => {
  it('maps QB level keys onto subgroups.level', () => {
    expect(subgroupLevelFor('AM')).toBe('AM');
    expect(subgroupLevelFor('S3_AM')).toBe('AM');
    expect(subgroupLevelFor('S3_EM')).toBe('EM');
    expect(subgroupLevelFor('EM_NA')).toBe('EM');
    expect(subgroupLevelFor('S1')).toBe('S1');
    expect(subgroupLevelFor('JC2')).toBe('JC');
    expect(subgroupLevelFor(null)).toBeNull();
    expect(subgroupLevelFor('IP4')).toBeNull();
  });
});

describe('parsePhotoRead', () => {
  const levels = [{ key: 'AM', topics: ['Trigonometry (Identities)', 'Logarithms'] }, { key: 'EM', topics: ['Vectors', 'Mensuration'] }];
  it('snaps the topic to the allowed list, case-insensitively, under the named level', () => {
    const r = parsePhotoRead('Sure! {"text":"prove sin^2 + cos^2 = 1","level":"am","topic":"trigonometry (identities)"}', levels);
    expect(r).toEqual({ text: 'prove sin^2 + cos^2 = 1', topic: 'Trigonometry (Identities)', levelKey: 'AM' });
  });
  it('finds the topic under any level when the model names the wrong one', () => {
    const r = parsePhotoRead('{"text":"a","level":"AM","topic":"Vectors"}', levels);
    expect(r.topic).toBe('Vectors');
    expect(r.levelKey).toBe('EM');
  });
  it('drops a topic that is not on any list, and survives junk', () => {
    expect(parsePhotoRead('{"text":"x","level":"AM","topic":"Calculus"}', levels).topic).toBeNull();
    expect(parsePhotoRead('not json at all', levels)).toEqual({ text: '', topic: null, levelKey: null });
    expect(parsePhotoRead('{"text": 42, "topic": null}', levels)).toEqual({ text: '', topic: null, levelKey: null });
  });
  it('clips the transcript', () => {
    const long = 'x'.repeat(MAX_OCR_CHARS + 500);
    expect(parsePhotoRead(JSON.stringify({ text: long, topic: null }), levels).text).toHaveLength(MAX_OCR_CHARS);
  });
});

describe('parseSubgroupChoice', () => {
  const subs = [{ id: 700, name: 'Proofs using the Pythagorean identity', description: null }, { id: 702, name: 'Double/triple angle proof', description: 'x' }];
  it('returns the chosen row, accepts a numeric string, refuses an unknown id or null', () => {
    expect(parseSubgroupChoice('{"id": 702}', subs)?.name).toBe('Double/triple angle proof');
    expect(parseSubgroupChoice('{"id": "700"}', subs)?.id).toBe(700);
    expect(parseSubgroupChoice('{"id": 999}', subs)).toBeNull();
    expect(parseSubgroupChoice('{"id": null}', subs)).toBeNull();
    expect(parseSubgroupChoice('garbage', subs)).toBeNull();
  });
});

describe('prompts', () => {
  it('list every level and topic verbatim, and clip the transcript for the sub-skill call', () => {
    const p = buildPhotoReadPrompt([{ key: 'AM', topics: ['Logarithms', 'Circles'] }]);
    expect(p).toContain('AM: Logarithms | Circles');
    expect(p).toContain('"topic"');
    const s = buildSubgroupPrompt('Circles', [{ id: 1, name: 'Tangent-chord', description: 'd'.repeat(500) }], 'y'.repeat(5000));
    expect(s).toContain('- id 1: Tangent-chord');
    expect(s.length).toBeLessThan(3300);
  });
});
