import { describe, it, expect } from 'vitest';
import { overlap, sectionFor, sectionOutcomes, returnedQuestions, closureLine } from './sheet-closure';

const sections = [
  { id: 's1', section_index: 1, title: 'Choosing between angle at centre and same segment', practice_texts: ['In the diagram, A, B and C are points on a circle, centre O. Angle OCB = 30° and angle OAB is 2.5 times angle OCB. (a) Find reflex angle AOC. (b) Explain why AO is parallel to BC.'] },
  { id: 's3', section_index: 3, title: 'Deciding between HCF and LCM', practice_texts: ['A box measures 54 cm by 78 cm by 204 cm. The box is completely filled with identical cubes. Find the minimum number of cubes required.', 'Peter has many cuboid blocks with dimensions 24 cm by 20 cm by 15 cm. He wishes to manufacture a box in the shape of a cube to pack the blocks. Find the smallest possible length of the box.'] },
];

describe('sheet closure', () => {
  it('matches a returned question to its section by the words of the stem, numbers included', () => {
    const q = { text: 'A box 54 cm by 78 cm by 204 cm is filled with identical cubes; find the minimum number of cubes.', question_number: '1', awarded: 2, max: 2, kinds: [] };
    expect(sectionFor(q, sections)!.section.id).toBe('s3');
    expect(overlap(q.text, sections[0].practice_texts[0])).toBeLessThan(0.45);
  });
  it('scores each section: closed / slip / still failing / unknown', () => {
    const out = sectionOutcomes(sections, [
      { text: 'A box 54 cm by 78 cm by 204 cm filled with identical cubes, minimum number of cubes', question_number: '1', awarded: 2, max: 2, kinds: [] },
      { text: 'Cuboid blocks 24 cm by 20 cm by 15 cm packed into a cube box, smallest length of the box', question_number: '2', awarded: 1, max: 2, kinds: ['careless'] },
    ]);
    expect(out.find(o => o.section_id === 's3')!.outcome).toBe('slip');
    expect(out.find(o => o.section_id === 's1')!.outcome).toBe('unknown');
    const still = sectionOutcomes(sections, [{ text: 'Points A, B, C on a circle centre O, angle OCB = 30°, find reflex angle AOC and explain why AO is parallel to BC', question_number: '1', awarded: 2, max: 5, kinds: ['concept'] }]);
    expect(still[0].outcome).toBe('still_failing');
    expect(closureLine(out)).toBe('2 sections: 1 slip, 1 unmatched');
  });
  it('reads the returned sheet off a run\'s results — prompt text, totals, the lost parts\' kinds; superseded entries skipped', () => {
    const rq = returnedQuestions([
      { question_number: '1', marking: { total_awarded: 3, total_max: 4 }, marking_output: { question: { number: '1', prompt: 'Two similar containers, base areas 16 : 49' }, parts: [{ awarded: 3, max: 4, error_kind: 'concept' }] } },
      { question_number: '2', superseded: true, marking_output: { question: 'x' , parts: [] } },
      { question_number: '3', marking_output: { question: 'no marks here', parts: [] } },
    ]);
    expect(rq).toEqual([{ text: 'Two similar containers, base areas 16 : 49', question_number: '1', awarded: 3, max: 4, kinds: ['concept'] }]);
  });
});
