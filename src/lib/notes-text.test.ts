import { describe, it, expect } from 'vitest';
import { cleanDescription, cleanTitle } from './notes-text';

describe('cleanDescription', () => {
  it('strips the generator instruction from the tail', () => {
    // Verbatim from subgroups: AM / Coordinate Geometry.
    const raw =
      'Determine equations of lines parallel or perpendicular to a given line, ' +
      'passing through a specified point. Includes finding foot of perpendicular ' +
      'or reflected point. Generation hint: given a line and an external point; ' +
      'ask for perpendicular/parallel line equation through point.';
    const { summary, example } = cleanDescription(raw);
    expect(summary).not.toMatch(/generation hint/i);
    expect(summary).toBe(
      'Determine equations of lines parallel or perpendicular to a given line, ' +
        'passing through a specified point. Includes finding foot of ' +
        'perpendicular or reflected point.',
    );
    expect(example).toBeNull();
  });

  it('lifts a quoted trailing example out of the summary', () => {
    const raw =
      'Using the general term to find a specific coefficient. ' +
      "Example: 'Find the term independent of x in (2x^2 + 3/x)^9'.";
    expect(cleanDescription(raw)).toEqual({
      summary: 'Using the general term to find a specific coefficient.',
      example: 'Find the term independent of x in (2x^2 + 3/x)^9',
    });
  });

  it('keeps the quotes when the example is really two quoted questions', () => {
    const raw =
      "Approximating a numerical power. Example: 'Hence estimate (1.05)^10' " +
      "or 'Hence approximate (1.975)^8'.";
    const { example } = cleanDescription(raw);
    expect(example).toBe(
      "'Hence estimate (1.05)^10' or 'Hence approximate (1.975)^8'",
    );
  });

  it('handles a description that is only an example', () => {
    expect(cleanDescription("Example: 'Find k'.")).toEqual({
      summary: '',
      example: 'Find k',
    });
  });

  it('does not treat a mid-sentence "for example" as the example tail', () => {
    const raw = 'Matching given coefficients in a stated form, for example 1 - 12x.';
    expect(cleanDescription(raw).example).toBeNull();
  });

  it('collapses authoring whitespace', () => {
    expect(cleanDescription('  Two   points\n  and a line.  ').summary).toBe(
      'Two points and a line.',
    );
  });

  it('returns empty fields for a missing description', () => {
    expect(cleanDescription(null)).toEqual({ summary: '', example: null });
    expect(cleanDescription(undefined)).toEqual({ summary: '', example: null });
    expect(cleanDescription('')).toEqual({ summary: '', example: null });
  });
});

describe('cleanTitle', () => {
  it('drops the generator provenance tags', () => {
    expect(cleanTitle('Expand to first 3 terms (KB)')).toBe('Expand to first 3 terms');
    expect(cleanTitle('Expand to first 4 terms (fresh)')).toBe('Expand to first 4 terms');
  });

  it('keeps a trailing parenthetical that is part of the maths', () => {
    // These are real titles — the bracket says which case the example covers.
    expect(cleanTitle('Find k for line tangent to curve (Δ = 0)')).toBe(
      'Find k for line tangent to curve (Δ = 0)',
    );
    expect(cleanTitle('Circle equation (general form)')).toBe(
      'Circle equation (general form)',
    );
  });

  it('tolerates a null title', () => {
    expect(cleanTitle(null)).toBe('');
  });
});
