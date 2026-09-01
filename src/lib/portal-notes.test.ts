import { describe, it, expect } from 'vitest';
import {
  parseCreatePayload,
  parseUpdatePayload,
  isPngBytes,
  sniffImageType,
  isUuid,
  groupNotes,
  groupGallery,
  galleryChips,
  applyGalleryChip,
  noteKind,
  GALLERY_CHIP_THRESHOLD,
  MAX_IMAGE_B64,
  MAX_NOTE,
  MAX_SOURCE_LABEL,
  PHOTO_GROUP_LABEL,
  PHOTO_SOURCE_LABEL,
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

  it('defaults kind to clip for the legacy clipper payload', () => {
    const out = parseCreatePayload({ sourceLabel: 'Paper', image: B64 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.kind).toBe('clip');
  });

  it('accepts a photo: JPEG data URL, no sourceLabel, defaults it', () => {
    const out = parseCreatePayload({
      kind: 'photo',
      image: `data:image/jpeg;base64,${B64}`,
      note: 'school worksheet on vectors',
      topic: 'Vectors',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.kind).toBe('photo');
      expect(out.value.sourceLabel).toBe(PHOTO_SOURCE_LABEL);
      expect(out.value.imageBase64).toBe(B64);
      expect(out.value.topic).toBe('Vectors');
      expect(out.value.note).toBe('school worksheet on vectors');
    }
  });

  it('a photo can never carry a runId — outside work has no marking run', () => {
    const out = parseCreatePayload({ kind: 'photo', image: B64, runId: RUN_ID });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.runId).toBeNull();
  });

  it('accepts a JPEG data URL for a clip too, and rejects unknown kinds', () => {
    const jpegClip = parseCreatePayload({ sourceLabel: 'P', image: `data:image/jpeg;base64,${B64}` });
    expect(jpegClip.ok).toBe(true);
    expect(parseCreatePayload({ kind: 'video', image: B64 }).ok).toBe(false);
    expect(parseCreatePayload({ kind: 1, image: B64 }).ok).toBe(false);
  });

  it('still requires a sourceLabel for clips', () => {
    expect(parseCreatePayload({ kind: 'clip', image: B64 }).ok).toBe(false);
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

describe('sniffImageType', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  it('tells PNG from JPEG by magic bytes', () => {
    expect(sniffImageType(png)).toBe('png');
    expect(sniffImageType(jpeg)).toBe('jpeg');
  });

  it('rejects other files and truncated headers', () => {
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe('noteKind', () => {
  const base = 'https://x.blob.vercel-storage.com/portal-notes/recABC123';

  it('reads photo vs clipping off the blob filename', () => {
    expect(noteKind(`${base}/photo-b4964b5d-80c0-40e5-8b9c-cb2f75c87240.jpg`)).toBe('photo');
    expect(noteKind(`${base}/b4964b5d-80c0-40e5-8b9c-cb2f75c87240.png`)).toBe('clip');
  });

  it('survives Blob random suffixes and query strings', () => {
    expect(noteKind(`${base}/photo-b4964b5d-abc-XyZ123.jpg?download=1`)).toBe('photo');
    expect(noteKind(`${base}/b4964b5d-abc-XyZ123.png?download=1#x`)).toBe('clip');
  });

  it('treats every pre-feature row as a clipping', () => {
    expect(noteKind(`${base}/9c1d8e77-1111-2222-3333-444455556666.png`)).toBe('clip');
    expect(noteKind('')).toBe('clip');
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

// Row factories for the kind-aware helpers — url shape mirrors what the route
// writes (photos carry the photo- filename prefix).
const clip = (id: string, label: string, topic: string | null = null) => ({
  id,
  source_label: label,
  topic,
  image_url: `https://b/portal-notes/rec1/${id}0000-0000-4000-8000-000000000000.png`,
});
const photo = (id: string, topic: string | null = null) => ({
  id,
  source_label: PHOTO_SOURCE_LABEL,
  topic,
  image_url: `https://b/portal-notes/rec1/photo-${id}0000-0000-4000-8000-000000000000.jpg`,
});

describe('groupGallery', () => {
  it('groups clippings by paper and folds all photos into one 📷 group', () => {
    const out = groupGallery([photo('1'), clip('2', 'AMKSS P1'), photo('3'), clip('4', 'AMKSS P1')]);
    expect(out.map(g => [g.label, g.kind])).toEqual([
      [PHOTO_GROUP_LABEL, 'photo'],
      ['AMKSS P1', 'clip'],
    ]);
    expect(out[0].notes.map(x => x.id)).toEqual(['1', '3']);
    expect(out[1].notes.map(x => x.id)).toEqual(['2', '4']);
  });

  it('keeps newest-first order across mixed groups, like groupNotes', () => {
    const out = groupGallery([clip('1', 'B'), photo('2'), clip('3', 'A')]);
    expect(out.map(g => g.label)).toEqual(['B', PHOTO_GROUP_LABEL, 'A']);
  });

  it('handles a null source_label on a clipping without crashing', () => {
    const out = groupGallery([{ id: '1', source_label: null, topic: null, image_url: 'https://b/x/a.png' }]);
    expect(out[0].label).toBe('Clippings');
    expect(out[0].kind).toBe('clip');
  });
});

describe('galleryChips + applyGalleryChip', () => {
  const small = [photo('1', 'Vectors'), clip('2', 'P', 'Circles')];
  const big = [
    ...Array.from({ length: 8 }, (_, i) => photo(`p${i}`, i < 4 ? 'Vectors' : null)),
    ...Array.from({ length: 7 }, (_, i) => clip(`c${i}`, 'AMKSS P1', i < 2 ? 'Circles' : null)),
  ];

  it('shows no chips until the collection outgrows the threshold', () => {
    expect(galleryChips(small)).toEqual([]);
    expect(big.length).toBeGreaterThan(GALLERY_CHIP_THRESHOLD);
    expect(galleryChips(big).length).toBeGreaterThan(0);
  });

  it('offers All, the topics present (sorted), and both kinds', () => {
    expect(galleryChips(big).map(c => c.key)).toEqual([
      'all', 'topic:Circles', 'topic:Vectors', 'kind:photo', 'kind:clip',
    ]);
  });

  it('omits a kind chip when that kind is absent, and hides a useless row', () => {
    const onlyPhotos = Array.from({ length: 14 }, (_, i) => photo(`p${i}`, i < 3 ? 'Vectors' : null));
    const keys = galleryChips(onlyPhotos).map(c => c.key);
    expect(keys).toContain('kind:photo');
    expect(keys).not.toContain('kind:clip');
    // One kind, zero topics — filtering could change nothing, so no row at all.
    const untaggedPhotos = Array.from({ length: 14 }, (_, i) => photo(`p${i}`));
    expect(galleryChips(untaggedPhotos)).toEqual([]);
  });

  it('applyGalleryChip filters by kind and by topic, and All passes everything', () => {
    expect(applyGalleryChip(big, 'kind:photo').every(r => noteKind(r.image_url) === 'photo')).toBe(true);
    expect(applyGalleryChip(big, 'kind:clip').every(r => noteKind(r.image_url) === 'clip')).toBe(true);
    expect(applyGalleryChip(big, 'topic:Vectors').map(r => r.topic)).toEqual(['Vectors', 'Vectors', 'Vectors', 'Vectors']);
    expect(applyGalleryChip(big, 'all')).toHaveLength(big.length);
    expect(applyGalleryChip(big, 'garbage')).toHaveLength(big.length);
  });
});
