import { describe, it, expect } from 'vitest';
import { parseRedrawBody, redrawReleaseRefusal, partsForPage } from './desk-redraw';

describe('parseRedrawBody', () => {
  it('takes runId + photoIndex, and defaults to refusing a released paper', () => {
    expect(parseRedrawBody({ runId: '9e66d0b4', photoIndex: 3 })).toEqual({
      req: { runId: '9e66d0b4', photoIndex: 3, allowReleased: false, reissue: true },
    });
    expect(parseRedrawBody({ runId: '9e66d0b4', photoIndex: 0 })).toEqual({
      req: { runId: '9e66d0b4', photoIndex: 0, allowReleased: false, reissue: true },
    });
  });

  it('opens the released door on a literal true only', () => {
    expect(parseRedrawBody({ runId: 'r', photoIndex: 3, allowReleased: true })).toEqual({
      req: { runId: 'r', photoIndex: 3, allowReleased: true, reissue: true },
    });
    // A student's copy is not replaced because a body said "true", or 1, or {}.
    for (const v of ['true', 1, {}, 'yes', null]) {
      expect(parseRedrawBody({ runId: 'r', photoIndex: 3, allowReleased: v })).toEqual({
        req: { runId: 'r', photoIndex: 3, allowReleased: false, reissue: true },
      });
    }
  });

  it('turns the re-issue off on a literal false only', () => {
    expect(parseRedrawBody({ runId: 'r', photoIndex: 3, allowReleased: true, reissue: false })).toEqual({
      req: { runId: 'r', photoIndex: 3, allowReleased: true, reissue: false },
    });
    // Anything else still replaces the student's copy — a body that forgot the
    // field, or carried a 0, must not leave them holding the old one silently.
    for (const v of [undefined, 'false', 0, {}, null, true]) {
      expect(parseRedrawBody({ runId: 'r', photoIndex: 3, allowReleased: true, reissue: v })).toEqual({
        req: { runId: 'r', photoIndex: 3, allowReleased: true, reissue: true },
      });
    }
  });

  it('rejects a missing runId, a negative page and a non-integer page', () => {
    for (const b of [{}, null, { photoIndex: 3 }, { runId: '  ', photoIndex: 3 }, { runId: 'r' }, { runId: 'r', photoIndex: -1 }, { runId: 'r', photoIndex: 1.5 }, { runId: 'r', photoIndex: 'three' }]) {
      expect(parseRedrawBody(b)).toEqual({ error: 'runId and photoIndex are required' });
    }
  });
});

describe('redrawReleaseRefusal', () => {
  it('refuses a released run unless the caller asked for it', () => {
    expect(redrawReleaseRefusal(null, false)).toBeNull();
    expect(redrawReleaseRefusal(null, true)).toBeNull();
    expect(redrawReleaseRefusal('2026-09-09T02:00:00Z', false)).toMatch(/already released/);
    expect(redrawReleaseRefusal('2026-09-09T02:00:00Z', true)).toBeNull();
  });
});

describe('partsForPage', () => {
  const results = [
    { photo_index: 3, question_number: '10', marking: { parts: [{ label: '(a)', awarded: 2 }, { label: '(b)', awarded: 2 }] } },
    { photo_index: 3, question_number: 11, marking: { parts: [{ label: '(c)', awarded: 1 }] } },
    { photo_index: 4, question_number: '12', marking: { parts: [{ label: '(a)', awarded: 3 }] } },
    { photo_index: 3, question_number: '13', marking: { parts: [{ awarded: 1 }, { label: '  ', awarded: 1 }] } },
    { photo_index: 3, question_number: '14' },
  ];

  it('returns every labelled part on that page, and nothing from another page', () => {
    expect(partsForPage(results, 3)).toEqual([
      { question: '10', label: '(a)', awarded: 2 },
      { question: '10', label: '(b)', awarded: 2 },
      { question: '11', label: '(c)', awarded: 1 },
    ]);
    expect(partsForPage(results, 4)).toEqual([{ question: '12', label: '(a)', awarded: 3 }]);
  });

  it('is empty for a page with no part marks, and for a run with no results', () => {
    expect(partsForPage(results, 9)).toEqual([]);
    expect(partsForPage(undefined, 0)).toEqual([]);
    expect(partsForPage({ not: 'an array' }, 0)).toEqual([]);
  });

  it('reads a missing awarded as 0 rather than NaN — the bot clamps a number, not a blank', () => {
    expect(partsForPage([{ photo_index: 0, question_number: '1', marking: { parts: [{ label: '(a)' }] } }], 0)).toEqual([
      { question: '1', label: '(a)', awarded: 0 },
    ]);
  });

  // Isabelle Toh Si Xian's page 4 (run 308c0fd0), 14 Sep 2026: an unlabelled
  // continuation of Q5 and of Q6, 6/6 and 7/7. The old filter emptied the page,
  // so a page whose annotated image had been lost could never be redrawn.
  it("keeps a question's only part when it has no label — the bot matches it on the question", () => {
    const continuation = [
      { photo_index: 3, question_number: '5', marking: { parts: [{ label: '', awarded: 6, max: 6 }] } },
      { photo_index: 3, question_number: '6', marking: { parts: [{ awarded: 7, max: 7 }] } },
    ];
    expect(partsForPage(continuation, 3)).toEqual([
      { question: '5', label: '', awarded: 6 },
      { question: '6', label: '', awarded: 7 },
    ]);
  });

  it('still drops TWO nameless parts under one question — they would answer to the same key', () => {
    const twins = [{ photo_index: 0, question_number: '13', marking: { parts: [{ awarded: 1 }, { label: '  ', awarded: 4 }] } }];
    expect(partsForPage(twins, 0)).toEqual([]);
  });
});
