import { describe, it, expect } from 'vitest';
import { batchLaneNote, markerUnreachableNote } from './bot-queue-status';

describe('batchLaneNote', () => {
  it('reads "off" as an amber note naming the consequence', () => {
    expect(batchLaneNote('off')).toEqual({
      text: 'Batch lane: off — every hand-back is drawn on the marker',
      tone: 'amber',
    });
  });

  it('reads "on" as a quiet grey confirmation', () => {
    expect(batchLaneNote('on')).toEqual({ text: 'Batch lane: on', tone: 'grey' });
  });

  it('says nothing for an unknown/missing/garbage value', () => {
    expect(batchLaneNote(undefined)).toBeNull();
    expect(batchLaneNote(null)).toBeNull();
    expect(batchLaneNote('')).toBeNull();
    expect(batchLaneNote('ON')).toBeNull(); // case matters — the bot always sends lower-case
    expect(batchLaneNote(true)).toBeNull();
  });
});

describe('markerUnreachableNote', () => {
  it('flags an explicit false', () => {
    expect(markerUnreachableNote(false)).toBe('Marker process unreachable');
  });

  it('says nothing for true, missing, or a non-boolean', () => {
    expect(markerUnreachableNote(true)).toBeNull();
    expect(markerUnreachableNote(undefined)).toBeNull();
    expect(markerUnreachableNote(null)).toBeNull();
    expect(markerUnreachableNote('false')).toBeNull();
  });
});
