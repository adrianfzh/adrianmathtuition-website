import { describe, it, expect } from 'vitest';
import { dropboxFolderFor, isPrintableKind, titleFromFilename, NOTE_SLUG_TO_LEVELS } from './notes-list';

// The Dropbox folder layout is the contract between Adrian's Dropbox app folder
// and what the print pages list. A wrong path silently lists nothing (Dropbox
// not_found is swallowed as "empty"), so pin it.
describe('dropboxFolderFor', () => {
  it('puts notes at the app-folder root, one folder per level', () => {
    expect(dropboxFolderFor('notes', 'am')).toBe('AM');
    expect(dropboxFolderFor('notes', 's1')).toBe('S1');
    expect(dropboxFolderFor('notes', 'jc')).toBe('JC');
  });

  it('puts revision worksheets under Revision/<LEVEL>', () => {
    expect(dropboxFolderFor('revision', 'am')).toBe('Revision/AM');
    expect(dropboxFolderFor('revision', 'em')).toBe('Revision/EM');
    expect(dropboxFolderFor('revision', 's2')).toBe('Revision/S2');
  });

  it('covers every level slug the pages offer, for both kinds', () => {
    for (const slug of Object.keys(NOTE_SLUG_TO_LEVELS)) {
      expect(dropboxFolderFor('notes', slug)).toBeTruthy();
      expect(dropboxFolderFor('revision', slug)).toBeTruthy();
    }
  });

  it('returns null for an unknown level rather than a bogus path', () => {
    expect(dropboxFolderFor('notes', 'jc3')).toBeNull();
    expect(dropboxFolderFor('revision', '')).toBeNull();
  });
});

describe('isPrintableKind', () => {
  it('accepts only the two kinds', () => {
    expect(isPrintableKind('notes')).toBe(true);
    expect(isPrintableKind('revision')).toBe(true);
    expect(isPrintableKind('worksheets')).toBe(false);
    expect(isPrintableKind(null)).toBe(false);
  });
});

describe('titleFromFilename', () => {
  it('strips the extension and tidies separators', () => {
    expect(titleFromFilename('Trig-Identities_Revision.pdf')).toBe('Trig Identities Revision');
    expect(titleFromFilename('Circles.PDF')).toBe('Circles');
  });
});
