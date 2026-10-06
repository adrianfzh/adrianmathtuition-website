import { describe, it, expect } from 'vitest';
import { pickDiagram, asksForDiagram, type LibraryDiagram } from './science-diagram-match';
import fixture from './__fixtures__/science-diagrams.json';

// Same fixture as the bot's test/fixtures/science-diagrams.json — the two matchers must agree.
const rows = (fixture as { id: number | string; subject: string; name: string; keywords: string }[])
  .map(r => ({ ...r, image_url: `x/${r.id}.png` })) as LibraryDiagram[];
const pick = (subject: string, text: string) => pickDiagram(rows.filter(r => r.subject === subject), text)?.id ?? null;

describe('science picture matching (twin of the bot pickDiagram)', () => {
  it('finds the picture a lost-mark question asks for', () => {
    expect(pick('biology', 'Label the diagram of the human heart to show the bicuspid valve and the septum.')).toBe(68);
    expect(pick('chemistry', 'Draw a dot-and-cross diagram of a water molecule, H2O.')).toBe('c04');
    expect(pick('chemistry', 'Draw a labelled diagram of the apparatus for the electrolysis of molten lead(II) bromide.')).toBe('c18');
    expect(pick('physics', 'Complete the ray diagram to show the image formed by the converging lens.')).toBe('p07');
    expect(pick('biology', 'Draw a labelled diagram of a root hair cell.')).toBe('b03');
  });
  it('gives no picture when the library has none (a wrong picture is worse)', () => {
    expect(pick('chemistry', 'Draw the apparatus for the electrolysis of dilute sulfuric acid.')).toBeNull();
    expect(pick('biology', 'Draw the carbon cycle.')).toBeNull();
  });
  it('knows a diagram question from a written one', () => {
    expect(asksForDiagram('Draw a labelled diagram of a root hair cell.')).toBe(true);
    expect(asksForDiagram('On Fig. 3.1, label the bicuspid valve.')).toBe(true);
    expect(asksForDiagram('Complete the ray diagram.')).toBe(true);
    expect(asksForDiagram('Explain why the left ventricle has a thicker wall.')).toBe(false);
    expect(asksForDiagram('Calculate the resistance of the wire.')).toBe(false);
  });
});
