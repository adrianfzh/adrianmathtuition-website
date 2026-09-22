import { describe, it, expect } from 'vitest';
import { notesChoice, layersFor, notesSuffix } from './marking-notes-layers';

describe('marking download notes layers', () => {
  it('reads the three choices and the legacy 1', () => {
    expect(notesChoice('mine')).toBe('mine');
    expect(notesChoice('adrian')).toBe('adrian');
    expect(notesChoice('1')).toBe('all');
    expect(notesChoice(null)).toBe('none');
    expect(notesChoice('junk')).toBe('none');
  });
  it('mine = only the student layer, adrian = only the teacher layer', () => {
    expect(layersFor('mine')).toEqual({ teacher: false, student: true });
    expect(layersFor('adrian')).toEqual({ teacher: true, student: false });
    expect(layersFor('all')).toEqual({ teacher: true, student: true });
    expect(layersFor('none')).toEqual({ teacher: false, student: false });
  });
  it('names the file by the choice', () => {
    expect(notesSuffix('mine')).toBe(' (with my notes)');
    expect(notesSuffix('adrian')).toBe(" (with Adrian's notes)");
    expect(notesSuffix('none')).toBe('');
  });
});
