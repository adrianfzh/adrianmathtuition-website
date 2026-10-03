import { describe, expect, it } from 'vitest';
import { addQuestionImageRef, addSolutionImageRef, splitPartLabel } from './solution-image-add';

describe('splitPartLabel', () => {
  it('reads the usual spellings', () => {
    expect(splitPartLabel('(b)(ii)')).toEqual(['b', 'ii']);
    expect(splitPartLabel('b ii')).toEqual(['b', 'ii']);
    expect(splitPartLabel('bii')).toEqual(['b', 'ii']);
    expect(splitPartLabel('(c)')).toEqual(['c']);
    expect(splitPartLabel(null)).toEqual([]);
  });
});

describe('addSolutionImageRef', () => {
  const row = {
    parts: [
      { label: '(a)', solution: 'x' },
      { label: 'b', solution_image: 'old.png', subparts: [{ label: '(i)' }, { label: 'ii', solution_image: 'keep.png' }] },
    ],
    solution_images: ['s0.png'],
  };
  it('fills an empty part slot', () => {
    const r = addSolutionImageRef(row, 'new.png', 'a');
    expect(r.field).toBe('parts[0].solution_image');
    expect((r.patch.parts as { solution_image?: string }[])[0].solution_image).toBe('new.png');
    expect(row.parts[0]).not.toHaveProperty('solution_image');
  });
  it('fills an empty sub-part slot', () => {
    const r = addSolutionImageRef(row, 'new.png', '(b)(i)');
    expect(r.field).toBe('parts[1].subparts[0].solution_image');
  });
  it('never overwrites a drawing — it goes on the end instead', () => {
    expect(addSolutionImageRef(row, 'new.png', 'b').patch).toEqual({ solution_images: ['s0.png', 'new.png'] });
    expect(addSolutionImageRef(row, 'new.png', 'b ii').field).toBe('solution_images[1]');
  });
  it('no part, or no parts: the question list', () => {
    expect(addSolutionImageRef({ solution_images: null }, 'n.png', null)).toEqual({ patch: { solution_images: ['n.png'] }, field: 'solution_images[0]' });
    expect(addSolutionImageRef({ solution_images: '["a.png"]' }, 'n.png', 'z').patch).toEqual({ solution_images: ['a.png', 'n.png'] });
  });
});

describe('addQuestionImageRef', () => {
  const row = {
    image_url: '[]',
    parts: [{ label: 'i' }, { label: 'ii', image_url: ['question_images/old.png'] }, { label: 'b', subparts: [{ label: 'i' }] }],
  };
  it('adds to a part with no figure', () => {
    const r = addQuestionImageRef(row, 'question_images/new.png', '(i)');
    expect(r.field).toBe('parts[0].image_url');
    expect((r.patch.parts as { image_url?: string[] }[])[0].image_url).toEqual(['question_images/new.png']);
    expect(row.parts[0]).not.toHaveProperty('image_url');
  });
  it('appends after an existing figure, never replacing it', () => {
    const r = addQuestionImageRef(row, 'question_images/new.png', 'ii');
    expect((r.patch.parts as { image_url?: string[] }[])[1].image_url).toEqual(['question_images/old.png', 'question_images/new.png']);
  });
  it('adds to a sub-part', () => {
    expect(addQuestionImageRef(row, 'q/n.png', 'b(i)').field).toBe('parts[2].subparts[0].image_url');
  });
  it('falls back to the stem as a JSON-array string', () => {
    const r = addQuestionImageRef(row, 'question_images/new.png', null);
    expect(r.field).toBe('image_url[0]');
    expect(r.patch.image_url).toBe('["question_images/new.png"]');
    expect(addQuestionImageRef({ image_url: '["a.png"]' }, 'b.png', 'z').patch.image_url).toBe('["a.png","b.png"]');
  });
});
