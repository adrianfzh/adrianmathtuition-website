import { describe, it, expect } from 'vitest';
import { dropboxFolderFor, legacyDropboxFolderFor, isPrintableKind, isKioskKind, titleFromFilename, NOTE_SLUG_TO_LEVELS } from './notes-list';

// The Dropbox folder layout is the contract between Adrian's Dropbox app folder
// and what the print pages list. A wrong path silently lists nothing (Dropbox
// not_found is swallowed as "empty"), so pin it.
describe('dropboxFolderFor', () => {
  it('puts notes under Notes/<LEVEL>', () => {
    expect(dropboxFolderFor('notes', 'am')).toBe('Notes/AM');
    expect(dropboxFolderFor('notes', 's1')).toBe('Notes/S1');
    expect(dropboxFolderFor('notes', 'jc')).toBe('Notes/JC');
  });

  // One folder per level since 26 Oct 2026 — worked examples and practice together.
  it('lists revision (worked-example) worksheets from Practice/<LEVEL> too', () => {
    expect(dropboxFolderFor('revision', 'am')).toBe('Practice/AM');
    expect(dropboxFolderFor('revision', 'em')).toBe('Practice/EM');
    expect(dropboxFolderFor('revision', 's2')).toBe('Practice/S2');
  });

  it('puts practice worksheets under Practice/<LEVEL>', () => {
    expect(dropboxFolderFor('practice', 'am')).toBe('Practice/AM');
    expect(dropboxFolderFor('practice', 'em')).toBe('Practice/EM');
    expect(dropboxFolderFor('practice', 's1')).toBe('Practice/S1');
  });

  it('puts prelim practice sets under Prelim/<LEVEL>', () => {
    expect(dropboxFolderFor('prelim', 'em')).toBe('Prelim/EM');
    expect(dropboxFolderFor('prelim', 'am')).toBe('Prelim/AM');
    expect(dropboxFolderFor('prelim', 'jc')).toBe('Prelim/JC');
  });

  it('covers every level slug the pages offer, for all kinds', () => {
    for (const slug of Object.keys(NOTE_SLUG_TO_LEVELS)) {
      expect(dropboxFolderFor('notes', slug)).toBeTruthy();
      expect(dropboxFolderFor('revision', slug)).toBeTruthy();
      expect(dropboxFolderFor('practice', slug)).toBeTruthy();
      expect(dropboxFolderFor('prelim', slug)).toBeTruthy();
    }
  });

  it('returns null for an unknown level rather than a bogus path', () => {
    expect(dropboxFolderFor('notes', 'jc3')).toBeNull();
    expect(dropboxFolderFor('revision', '')).toBeNull();
  });
});

describe('legacyDropboxFolderFor', () => {
  it('points notes at the old app-folder root so a half-done move still lists', () => {
    expect(legacyDropboxFolderFor('notes', 'am')).toBe('AM');
    expect(legacyDropboxFolderFor('notes', 'jc')).toBe('JC');
  });

  it('has nothing to fall back to for any kind but notes, or an unknown level', () => {
    expect(legacyDropboxFolderFor('revision', 'am')).toBeNull();
    expect(legacyDropboxFolderFor('practice', 'am')).toBeNull();
    expect(legacyDropboxFolderFor('prelim', 'am')).toBeNull();
    expect(legacyDropboxFolderFor('notes', 'jc3')).toBeNull();
  });
});

describe('isPrintableKind', () => {
  it('accepts only the four kinds', () => {
    expect(isPrintableKind('notes')).toBe(true);
    expect(isPrintableKind('revision')).toBe(true);
    expect(isPrintableKind('practice')).toBe(true);
    expect(isPrintableKind('prelim')).toBe(true);
    expect(isPrintableKind('worksheets')).toBe(false);
    expect(isPrintableKind(null)).toBe(false);
  });
});

// The kiosk serves three of the four kinds. Prelim practice sets are Adrian's
// own segment and have never been student-facing — if this ever goes green for
// 'prelim', students can print the prelim sets from the iPad.
describe('isKioskKind', () => {
  it('accepts the three student kinds and refuses prelim', () => {
    expect(isKioskKind('notes')).toBe(true);
    expect(isKioskKind('revision')).toBe(true);
    expect(isKioskKind('practice')).toBe(true);
    expect(isKioskKind('prelim')).toBe(false);
    expect(isKioskKind('worksheets')).toBe(false);
    expect(isKioskKind(null)).toBe(false);
  });
});

describe('titleFromFilename', () => {
  it('strips the extension and tidies separators', () => {
    expect(titleFromFilename('Trig-Identities_Revision.pdf')).toBe('Trig Identities Revision');
    expect(titleFromFilename('Circles.PDF')).toBe('Circles');
  });
});
