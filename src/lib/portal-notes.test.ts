import { describe, it, expect } from 'vitest';
import {
  parseCreatePayload,
  parseUpdatePayload,
  isPngBytes,
  isUuid,
  groupNotes,
  MAX_IMAGE_B64,
  MAX_NOTE,
  MAX_SOURCE_LABEL,
} from './portal-notes';

const RUN_ID = 'b4964b5d-80c0-40e5-8b9c-cb2f75c87240';
// Comfortably above MIN_IMAGE_B64 and valid base64.
const B64 = 'A'.repeat(400);

describe('parseCreatePayload', () => {
  it('accepts a full data URL and strips the prefix', () => {
    const out = parseCreatePayload({
      sourceLabel: 'AMKSS Prelim P1',
      image: `data:image/png;base64,${B64}`,
      runId: RUN_ID,
      topic: 'Vectors',
      note: 'remember the modulus',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.imageBase64).toBe(B64);
      expect(out.value.runId).toBe(RUN_ID);
      expect(out.value.topic).toBe('Vectors');
      expect(out.value.note).toBe('remember the modulus');
    }
  });

  it('accepts bare base64 and defaults the optional fields', () => {
    const out = parseCreatePayload({ sourceLabel: 'Paper', image: B64 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.runId).toBeNull();
      expect(out.value.topic).toBeNull();
      expect(out.value.note).toBe('');
    }
  });

  it('rejects a missing source label, a missing image, and junk bodies', () => {
    expect(parseCreatePayload({ image: B64 }).ok).toBe(false);
    expect(parseCreatePayload({ sourceLabel: 'P', image: '' }).ok).toBe(false);
    expect(parseCreatePayload(null).ok).toBe(false);
    expect(parseCreatePayload([1]).ok).toBe(false);
    expect(parseCreatePayload('x').ok).toBe(false);
  });

  it('rejects images that are too small, too large, or not base64', () => {
    expect(parseCreatePayload({ sourceLabel: 'P', image: 'AAAA' }).ok).toBe(false);
    expect(parseCreatePayload({ sourceLabel: 'P', image: 'A'.repeat(MAX_IMAGE_B64 + 4) }).ok).toBe(false);
    expect(parseCreatePayload({ sourceLabel: 'P', image: '<script>'.repeat(60) }).ok).toBe(false);
  });

  it('rejects a runId that is not a UUID instead of silently keeping it', () => {
    const out = parseCreatePayload({ sourceLabel: 'P', image: B64, runId: 'DROP TABLE' });
    expect(out.ok).toBe(false);
  });

  it('clamps overlong text fields instead of failing the save', () => {
    const out = parseCreatePayload({
      sourceLabel: 'x'.repeat(500),
      image: B64,
      note: 'n'.repeat(5000),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.sourceLabel.length).toBe(MAX_SOURCE_LABEL);
      expect(out.value.note.length).toBe(MAX_NOTE);
    }
  });
});

describe('parseUpdatePayload', () => {
  it('accepts an id + note and trims/clamps the note', () => {
    const out = parseUpdatePayload({ id: RUN_ID, note: '  keep this  ' });
    expect(out).toEqual({ ok: true, value: { id: RUN_ID, note: 'keep this' } });
  });

  it('allows clearing the note with an empty string', () => {
    const out = parseUpdatePayload({ id: RUN_ID, note: '' });
    expect(out).toEqual({ ok: true, value: { id: RUN_ID, note: '' } });
  });

  it('rejects a non-UUID id and a missing note', () => {
    expect(parseUpdatePayload({ id: 'abc', note: 'x' }).ok).toBe(false);
    expect(parseUpdatePayload({ id: RUN_ID }).ok).toBe(false);
  });
});

describe('isPngBytes', () => {
  it('recognises the PNG signature and rejects everything else', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
    expect(isPngBytes(png)).toBe(true);
    expect(isPngBytes(jpeg)).toBe(false);
    expect(isPngBytes(new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts a UUID and rejects path-shaped strings', () => {
    expect(isUuid(RUN_ID)).toBe(true);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('groupNotes', () => {
  const n = (id: string, label: string) => ({ id, source_label: label });

  it('groups by source_label preserving newest-first order at both levels', () => {
    const out = groupNotes([n('1', 'B'), n('2', 'A'), n('3', 'B')]);
    expect(out.map(g => g.label)).toEqual(['B', 'A']);
    expect(out[0].notes.map(x => x.id)).toEqual(['1', '3']);
    expect(out[1].notes.map(x => x.id)).toEqual(['2']);
  });

  it('folds blank labels into a named bucket and handles empty input', () => {
    expect(groupNotes([])).toEqual([]);
    const out = groupNotes([n('1', '  ')]);
    expect(out[0].label).toBe('Clippings');
  });
});
