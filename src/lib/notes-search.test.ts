import { describe, it, expect } from 'vitest';
import { normalize, entryMatches, SYNONYMS } from './notes-search';

// Mirrors what NotesShell does: normalize label+context once into a haystack,
// normalize+split the query into words, then run entryMatches — so these
// tests exercise the exact pipeline the search box runs, not the algorithm
// in isolation.
function matchEntry(label: string, context: string, query: string): boolean {
  const hay = normalize(`${label} ${context}`);
  const words = normalize(query).split(' ').filter(Boolean);
  return entryMatches(hay, words);
}

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Trigonometric   Identities  ')).toBe('trigonometric identities');
  });

  it('strips punctuation but keeps digits and letters', () => {
    expect(normalize("Pythagoras' Theorem: SOH-CAH-TOA!")).toBe('pythagoras theorem sohcahtoa');
  });

  it('folds diacritics to their base letter', () => {
    expect(normalize('café')).toBe('cafe');
  });

  it('maps superscript digits to plain digits before stripping symbols', () => {
    expect(normalize('x²')).toBe('x2');
  });

  it('collapses the three ways of writing the discriminant to one token', () => {
    // Punctuation is DELETED rather than turned into a space — that's the
    // whole reason 'b24ac' can be a single SYNONYMS key instead of three.
    expect(normalize('b²-4ac')).toBe('b24ac');
    expect(normalize('b^2-4ac')).toBe('b24ac');
    expect(normalize('b2-4ac')).toBe('b24ac');
  });
});

describe('entryMatches — substring and prefix (unchanged behaviour)', () => {
  it('matches a plain substring, case-insensitively', () => {
    expect(matchEntry('Gradient of a Line', 'Coordinate Geometry', 'gradient')).toBe(true);
    expect(matchEntry('Gradient of a Line', 'Coordinate Geometry', 'GRADIENT')).toBe(true);
  });

  it('matches every word independently across label and context', () => {
    expect(matchEntry('Rationalising', 'Surds', 'surds rationalising')).toBe(true);
  });

  it('matches a prefix of a longer word', () => {
    expect(matchEntry('Differentiation (Techniques)', 'AM', 'differentiat')).toBe(true);
  });

  it('fails when one query word has no match anywhere (every word must match)', () => {
    expect(matchEntry('Gradient of a Line', 'Coordinate Geometry', 'gradient zzzzz')).toBe(false);
  });

  it('never matches an empty query', () => {
    expect(entryMatches('anything here', [])).toBe(false);
  });
});

describe('entryMatches — typo tolerance', () => {
  it('finds "Trigonometric Identities" from a typo\'d query', () => {
    // Adrian, round 5: this exact query returned nothing under the old
    // substring-only matcher ("trigo" is a prefix hit; "identitis" is one
    // deletion away from "identities" — within the length-9 budget of 2).
    expect(
      matchEntry('Trigonometric Identities', 'Trigonometry (Identities)', 'trigo identitis'),
    ).toBe(true);
  });

  it('does not fuzzy-match short words — "sin" must not hit "sign"', () => {
    expect(matchEntry('Change of Sign', 'Numerical Methods', 'sin')).toBe(false);
    // Sanity check the other direction: "sin" still finds a real Sine entry,
    // via plain prefix — the guard is on fuzzy matching, not on "sin" itself.
    expect(matchEntry('Sine Rule', 'Trigonometry (Ratios)', 'sin')).toBe(true);
  });

  it('does not over-match on short garbage input', () => {
    expect(matchEntry('Gradient of a Line', 'Coordinate Geometry', 'zzqxw')).toBe(false);
    expect(
      matchEntry('Turning Point and Line of Symmetry', 'Quadratic Functions', 'qqzzz'),
    ).toBe(false);
  });

  it('tolerates exactly one edit at the 5-to-8-char tier, not two', () => {
    // Synthetic tokens (not real words) isolate the distance boundary from
    // any substring/synonym behaviour — neither string below is a substring
    // of the other, so this can only pass via stage (c).
    expect(entryMatches('aaaaaaaa', ['aaaaaaab'])).toBe(true); // 1 substitution, len 8
    expect(entryMatches('aaaaaaaa', ['aaaaaabb'])).toBe(false); // 2 substitutions, len 8
  });

  it('tolerates exactly two edits at the 9-plus-char tier, not three', () => {
    expect(entryMatches('aaaaaaaaa', ['aaaaaaabb'])).toBe(true); // 2 substitutions, len 9
    expect(entryMatches('aaaaaaaaa', ['aaaaaabbb'])).toBe(false); // 3 substitutions, len 9
  });
});

describe('entryMatches — curated synonyms', () => {
  it('"min point" finds a turning-point entry via the single-word "min" trigger', () => {
    expect(
      matchEntry(
        'Sketch from factored form: intercepts + turning point',
        'Quadratic Functions',
        'min point',
      ),
    ).toBe(true);
  });

  it('"minimum point" finds a turning-point entry via the two-word phrase key', () => {
    // "minimum" alone is deliberately NOT a SYNONYMS key (only "min" and
    // "minimum point" are), so this specifically exercises the adjacent-pair
    // phrase lookup rather than the single-word path the test above used.
    expect(
      matchEntry('Vertex Form & Turning Point', 'Quadratic Functions', 'minimum point'),
    ).toBe(true);
  });

  it('"min point" also reaches content that only says "stationary point"', () => {
    // Real content gap found while curating: some entries never say "turning
    // point" at all.
    expect(matchEntry('Stationary Points & Nature', 'Differentiation', 'min point')).toBe(true);
  });

  it('"factorize" (American spelling) finds "Factorisation"', () => {
    expect(matchEntry('Factorisation', 'Algebra', 'factorize')).toBe(true);
    expect(matchEntry('Factorise Cubic / Quartic Completely', 'Algebra', 'factorize')).toBe(true);
  });

  it('does not let a synonym trigger leak into an unrelated entry', () => {
    expect(matchEntry('Probability Trees', 'Statistics', 'min point')).toBe(false);
  });
});

describe('SYNONYMS — curation hygiene', () => {
  it('every key and target is already normalized (lowercase, no stray whitespace)', () => {
    for (const [key, targets] of Object.entries(SYNONYMS)) {
      expect(key).toBe(normalize(key));
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target).toBe(normalize(target));
      }
    }
  });
});
