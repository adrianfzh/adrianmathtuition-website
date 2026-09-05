import { describe, it, expect } from 'vitest';
import {
  candidateChip, candidateClass, candidateCaption, candidateButtonLabel,
  candidateButtonColour, redrawFamily, type CandidateLike,
} from './solution-candidate-chip';

const cand = (over: Partial<CandidateLike> = {}): CandidateLike => ({
  verdict: 'apply', route: null, note: null, holdKind: null, holdReason: null, methodNote: null, ...over,
});

describe('candidateClass', () => {
  it('reads the class from the route, not from prose', () => {
    expect(candidateClass('registry-redraw')).toBe('redraw');
    expect(candidateClass('registry-redraw:graph-paper')).toBe('redraw');
    expect(candidateClass('REGISTRY-REDRAW:construction')).toBe('redraw');
    expect(candidateClass('clean-source-copy')).toBe('clean-copy');
    expect(candidateClass('xobject-blank')).toBe('exact');
    expect(candidateClass('flat-field-SUBTRACTION')).toBe('pixel-edit');
    expect(candidateClass(null)).toBe('pixel-edit');
  });
  it('names the registry family when the route carries one', () => {
    expect(redrawFamily('registry-redraw:graph-paper')).toBe('graph-paper');
    expect(redrawFamily('registry-redraw')).toBeNull();
    expect(redrawFamily('clean-source-copy')).toBeNull();
  });
});

describe('candidateChip — the claim it makes must be the thing that happened', () => {
  // The 5 Sep 2026 regression: every apply-ready candidate in the lane had a null
  // method_note, so all ten read "exact removal" — including five redraws.
  it('never says "exact" for a redraw', () => {
    for (const route of ['registry-redraw', 'registry-redraw:construction', 'registry-redraw:graph-paper']) {
      const chip = candidateChip(cand({ route }));
      expect(chip.text).not.toMatch(/exact/i);
      expect(chip.text).toMatch(/REDRAWN/);
      expect(chip.text).toMatch(/not the school's scan/);
    }
    expect(candidateChip(cand({ route: 'registry-redraw:graph-paper' })).text).toContain('graph-paper');
  });

  it('never says "exact" for a crop from another scan', () => {
    const chip = candidateChip(cand({ route: 'clean-source-copy' }));
    expect(chip.text).not.toMatch(/exact/i);
    expect(chip.text).toMatch(/CLEAN COPY/);
    expect(chip.hint).toMatch(/missing/);
  });

  it('never says "exact" for an undeclared pixel edit (the Northbrooks card)', () => {
    // Its own note underneath read "RECONSTRUCTED PIXELS, declared" while the chip
    // above it claimed an exact removal.
    const chip = candidateChip(cand({ route: 'flat-field', note: 'RECONSTRUCTED PIXELS, declared: a thin ribbon remained' }));
    expect(chip.text).toMatch(/NOT declared an exact removal/);
    // and it must not read as a green, settled clean
    expect(chip.text).not.toMatch(/·\s*exact removal/);
    expect(chip.colour).not.toBe('#15803d');
  });

  it('keeps saying "exact removal" only where the stamp object really was deleted', () => {
    const chip = candidateChip(cand({ route: 'xobject-blank' }));
    expect(chip.text).toMatch(/exact removal/);
    expect(chip.colour).toBe('#15803d');
  });

  it('still declares a reconstruction, with the method note as the hint', () => {
    const chip = candidateChip(cand({ route: 'flat-field-SUBTRACTION', methodNote: 'pixels under the stamp reconstructed by plate subtraction' }));
    expect(chip.text).toMatch(/RECONSTRUCTED/);
    expect(chip.hint).toMatch(/plate subtraction/);
  });

  it('leaves the hold chips exactly as they were', () => {
    expect(candidateChip(cand({ verdict: 'hold', holdKind: 'residue' })).text).toMatch(/faint lettering survives/);
    expect(candidateChip(cand({ verdict: 'hold', holdKind: 'unverified' })).text).toMatch(/not verified/);
    expect(candidateChip(cand({ verdict: 'hold' })).text).toMatch(/held — see note/);
    expect(candidateChip(cand({ verdict: 'unknown' })).text).toMatch(/no verdict recorded/);
  });

  it('a hold is never dressed as a redraw or a clean copy', () => {
    // Route classification applies to apply-verdict candidates only: a held redraw
    // must still read as held.
    expect(candidateChip(cand({ verdict: 'hold', route: 'registry-redraw', holdKind: 'residue' })).text)
      .toMatch(/faint lettering/);
  });
});

describe('caption and button follow the same class', () => {
  it('asks the right review question per class', () => {
    expect(candidateCaption(cand({ route: 'registry-redraw' }))).toMatch(/SAME maths/);
    expect(candidateCaption(cand({ route: 'clean-source-copy' }))).toMatch(/nothing on the left is missing/);
    expect(candidateCaption(cand({ route: 'flat-field' }))).toMatch(/pale lines and curves at 1:1/);
    expect(candidateCaption(null)).toMatch(/Cleaned candidate/);
  });
  it('labels the button for what it actually does', () => {
    expect(candidateButtonLabel(cand({ route: 'registry-redraw' }))).toBe('✓ Use the redrawn figure');
    expect(candidateButtonLabel(cand({ route: 'clean-source-copy' }))).toBe('✓ Use the clean copy');
    expect(candidateButtonLabel(cand({ route: 'xobject-blank' }))).toBe('✓ Use cleaned candidate');
    expect(candidateButtonLabel(cand({ verdict: 'hold', route: 'registry-redraw' }))).toBe('Use it anyway');
  });
  it('keeps green for a true clean of the school artwork only', () => {
    expect(candidateButtonColour(cand({ route: 'xobject-blank' }))).toBe('#15803d');
    expect(candidateButtonColour(cand({ route: 'registry-redraw' }))).toBe('#7c3aed');
    expect(candidateButtonColour(cand({ route: 'clean-source-copy' }))).toBe('#0369a1');
    expect(candidateButtonColour(cand({ verdict: 'hold' }))).toBe('#b45309');
  });
});
