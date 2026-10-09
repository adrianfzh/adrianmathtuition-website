import { describe, it, expect } from 'vitest';
import {
  studentView, studentRow, studentRows, hasPartMarks, hiddenParts, parsePartRef, partRefLabel,
  applyPartMark, likelyDependents, partMarksBlockServing, partMarksBlockAlways, dropHiddenSegments,
  labelStyle, partLabelsOf, shownPartLabel, originalPartKey, storedOriginalKey, hasRenames, confirmPartChecks, viewFingerprint,
  MIN_REMAINING_MARKS,
} from './part-syllabus';

// A complex-numbers question shaped like the real candidates: (a) [3], (b) with (i) [2],
// (ii) [4] de Moivre, (iii) [1], (iv) [2] "hence".
const complex = () => ({
  id: 'q1',
  question_text: 'The complex number $w$ is given by $w = -3 + 3i$.',
  total_marks: 12,
  answer: '(a) Other root: $1-3i$; (b)(i) $|w|=3\\sqrt2,\\ \\arg w=\\frac{3\\pi}{4}$; (b)(ii) $w^n = 3^n e^{i 3n\\pi/4}$; (b)(iii) $1$; (b)(iv) $n=8,\\ 16,\\ 24$',
  solution: null as string | null,
  parts: [
    { label: 'a', text: 'Find the other root.', marks: 3, answer: 'Other root: $1-3i$', solution: 'Roots come in conjugate pairs.' },
    {
      label: 'b', text: 'For the number $w$:', marks: 9,
      subparts: [
        { label: 'i', text: 'Find $|w|$ and $\\arg w$.', marks: 2, answer: '$3\\sqrt2$, $\\frac{3\\pi}{4}$', solution: 'Modulus and argument.' },
        { label: 'ii', text: 'Find $w^n$ in exponential form.', marks: 4, answer: '$3^n e^{i3n\\pi/4}$', solution: 'By de Moivre.', solution_image: 'question_images/sol_x.png' },
        { label: 'iii', text: 'State $\\mathrm{Re}(w/3)$.', marks: 1, answer: '$1$', solution: 'Read it off.' },
        { label: 'iv', text: 'Hence find the three smallest $n$ for which $w^n$ is real.', marks: 2, answer: '$n=8,16,24$', solution: 'From (ii).' },
      ],
    },
  ],
});

const mark = (row: ReturnType<typeof complex>, path: string, extra: Record<string, unknown> = {}) => {
  const [top, sub] = path.split('.');
  const p = row.parts.find((x) => x.label === top)!;
  const target = sub ? (p as { subparts: Record<string, unknown>[] }).subparts.find((x) => x.label === sub)! : p;
  Object.assign(target, { legacy: true, legacy_reason: 'de Moivre (not in 9758)', ...extra });
  return row;
};

describe('nothing marked', () => {
  it('returns the very same object — the feature is dark until a part is marked', () => {
    const row = complex();
    const v = studentView(row);
    expect(v.row).toBe(row);
    expect(v.changed).toBe(false);
    expect(v.servable).toBe(true);
    expect(studentRow(row)).toBe(row);
    expect(hasPartMarks(row.parts)).toBe(false);
  });
  it('legacy: false and a bare reason do not hide anything', () => {
    const row = complex();
    Object.assign(row.parts[0], { legacy: false, legacy_reason: 'old note' });
    expect(studentView(row).row).toBe(row);
  });
  it('tolerates no parts, null parts and malformed parts', () => {
    for (const parts of [null, undefined, [], 'x', [null, 3, 'a']]) {
      const row = { question_text: 'Find $x$. [4]', parts, total_marks: 4, answer: '2' };
      expect(studentRow(row as never)).toBe(row);
    }
  });
});

describe('one sub-part hidden', () => {
  const v = studentView(standAlone(mark(complex(), 'b.ii')));
  const parts = v.row.parts as { label: string; marks?: number; subparts?: { label: string }[] }[];

  it('removes the part and re-letters the ones after it', () => {
    expect(parts.map((p) => p.label)).toEqual(['a', 'b']);
    expect(parts[1].subparts!.map((s) => s.label)).toEqual(['i', 'ii', 'iii']);
  });
  it('recomputes the total and the parent figure', () => {
    expect(v.originalMarks).toBe(12);
    expect(v.marks).toBe(8);
    expect(v.row.total_marks).toBe(8);
    expect(parts[1].marks).toBe(5);
  });
  it('the answer line keeps its own wording, minus the hidden part, under the shown labels', () => {
    expect(v.row.answer).toBe('(a) Other root: $1-3i$; (b)(i) $|w|=3\\sqrt2,\\ \\arg w=\\frac{3\\pi}{4}$; (b)(ii) $1$; (b)(iii) $n=8,\\ 16,\\ 24$');
    expect(v.row.answer).not.toContain('e^{i');
  });
  it('an answer line that cannot be split is rebuilt from the remaining parts\' own answers', () => {
    const row = mark(complex(), 'b.ii');
    row.answer = 'Other root $1-3i$; modulus $3\\sqrt2$; $3^n e^{i3n\\pi/4}$; $1$; $n=8,16,24$';
    expect(studentView(row).row.answer).toBe('(a) Other root: $1-3i$; (b)(i) $3\\sqrt2$, $\\frac{3\\pi}{4}$; (b)(ii) $1$; (b)(iii) $n=8,16,24$');
  });
  it('carries nothing of the hidden part in what is sent on', () => {
    const json = JSON.stringify(v.row);
    for (const s of ['exponential', 'de Moivre', 'sol_x.png', 'legacy', 'needs_cleared', 'checked']) expect(json).not.toContain(s);
  });
  it('tells the admin view what was hidden and why', () => {
    expect(v.hidden).toEqual([{ key: 'b.ii', label: '(b)(ii)', reason: 'de Moivre (not in 9758)', via: 'marked', marks: 4 }]);
    expect(v.servable).toBe(true);
  });
  it('does not touch the row it was given', () => {
    const row = mark(complex(), 'b.ii');
    const copy = JSON.stringify(row);
    studentView(row);
    expect(JSON.stringify(row)).toBe(copy);
  });
  it('is the same going through twice', () => {
    expect(studentView(v.row).row).toBe(v.row);
  });
});

describe('"hence" parts', () => {
  it('a part that needs a hidden part goes with it', () => {
    const row = mark(complex(), 'b.ii');
    (row.parts[1] as { subparts: Record<string, unknown>[] }).subparts[3].needs = ['(b)(ii)'];
    const v = studentView(row);
    expect(v.hidden.map((h) => [h.key, h.via, h.reason])).toEqual([
      ['b.ii', 'marked', 'de Moivre (not in 9758)'],
      ['b.iv', 'needs', 'needs (b)(ii)'],
    ]);
    expect(v.marks).toBe(6);
  });
  it('follows a chain: c needs b, d needs c', () => {
    const row = {
      total_marks: 12,
      parts: [
        { label: 'a', marks: 6, text: 'x' },
        { label: 'b', marks: 2, text: 'x', legacy: true, legacy_reason: 'r' },
        { label: 'c', marks: 2, text: 'Hence', needs: ['b'] },
        { label: 'd', marks: 2, text: 'Hence', needs: ['c'] },
      ],
    };
    const v = studentView(row);
    expect(v.hidden.map((h) => h.key)).toEqual(['b', 'c', 'd']);
    expect(v.row.parts).toEqual([]);          // (a) alone is left: it is the question now
    expect(v.marks).toBe(6);
  });
  it('needing a parent counts when anything inside that parent is hidden', () => {
    const row = mark(complex(), 'b.ii');
    (row.parts as Record<string, unknown>[]).push({ label: 'c', marks: 2, text: 'Using (b)…', needs: ['b'] });
    row.total_marks = 14;
    expect(studentView(row).hidden.map((h) => h.key)).toEqual(['b.ii', 'c']);
  });
  it('a part that needs a part still shown stays', () => {
    const row = mark(complex(), 'b.ii');
    (row.parts[1] as { subparts: Record<string, unknown>[] }).subparts[2].needs = ['b.i'];
    expect(studentView(row).hidden.map((h) => h.key)).toEqual(['b.ii']);
  });
  it('a needs entry naming no real part is ignored and noted', () => {
    const row = mark(complex(), 'b.ii');
    (row.parts[0] as Record<string, unknown>).needs = ['z'];
    const v = studentView(row);
    expect(v.hidden.map((h) => h.key)).toEqual(['b.ii']);
    expect(v.notes).toContain('unknown_needs');
  });
});

describe('nested parts', () => {
  it('hiding a parent hides everything inside it', () => {
    const v = studentView(mark(complex(), 'b'));
    expect(v.hidden.map((h) => [h.key, h.via])).toEqual([['b', 'marked'], ['b.i', 'parent'], ['b.ii', 'parent'], ['b.iii', 'parent'], ['b.iv', 'parent']]);
    expect(v.marks).toBe(3);
    expect(v.servable).toBe(false);   // 3 of 12 left
  });
  it('a parent left with nothing inside goes too', () => {
    const row = complex();
    for (const k of ['b.i', 'b.ii', 'b.iii', 'b.iv']) mark(row, k);
    const v = studentView(row);
    expect(v.hidden.find((h) => h.key === 'b')?.via).toBe('emptied');
    expect(v.row.parts).toEqual([]);          // only (a) is left: no letter, its text joins the stem
    expect(v.row.question_text).toContain('Find the other root.');
  });
  it('handles three levels', () => {
    const row = {
      total_marks: 10,
      parts: [{ label: 'a', subparts: [
        { label: 'i', marks: 4, text: 'x' },
        { label: 'ii', subparts: [{ label: 'a', marks: 3, text: 'x' }, { label: 'b', marks: 3, text: 'x', legacy: true, legacy_reason: 'r' }] },
      ] }],
    };
    const v = studentView(row);
    expect(v.hidden.map((h) => h.label)).toEqual(['(a)(ii)(b)']);
    expect(v.marks).toBe(7);
  });
});

describe('all parts hidden / too little left', () => {
  it('nothing left → never served, even on a student\'s own list', () => {
    const row = complex();
    mark(row, 'a'); mark(row, 'b');
    const v = studentView(row);
    expect(v.empty).toBe(true);
    expect(studentRow(row)).toBeNull();
    expect(studentRow(row, { assigned: true })).toBeNull();
    expect(partMarksBlockServing(row)).toBe(true);
  });
  it('under half the marks left → not served', () => {
    const row = mark(complex(), 'b');
    expect(studentRow(row)).toBeNull();
    expect(partMarksBlockServing(row)).toBe(true);
    expect(studentRows([row, complex()])).toHaveLength(1);
  });
  it('…unless the tutor put it on the student\'s list: shown with what is left', () => {
    const row = mark(complex(), 'b');
    const got = studentRow(row, { assigned: true })!;
    expect(got.parts).toEqual([]);
    expect(got.question_text).toContain('Find the other root.');
    expect(got.total_marks).toBe(3);
  });
  it(`under ${MIN_REMAINING_MARKS} marks left → not served, even when it is more than half`, () => {
    const row = { total_marks: 3, parts: [{ label: 'a', marks: 2, text: 'x' }, { label: 'b', marks: 1, text: 'x', legacy: true, legacy_reason: 'r' }] };
    expect(studentView(row).marks).toBe(2);
    expect(studentRow(row)).toBeNull();
  });
  it('exactly half left is served', () => {
    const row = { total_marks: 8, parts: [{ label: 'a', marks: 4, text: 'x' }, { label: 'b', marks: 4, text: 'x', legacy: true, legacy_reason: 'r' }] };
    expect(studentRow(row)?.total_marks).toBe(4);
  });
});

describe('marks', () => {
  it('uses the stored total minus the hidden marks when a remaining part has no marks', () => {
    // real row b72636c2: (a) 2, (b) none, total 3
    const row = { total_marks: 6, parts: [{ label: 'a', marks: 2, text: 'x', legacy: true, legacy_reason: 'r' }, { label: 'b', text: 'x' }] };
    const v = studentView(row);
    expect(v.marks).toBe(4);
    expect(v.notes).not.toContain('marks_unknown');
  });
  it('sums the parts when the row has no stored total', () => {
    const row = { total_marks: null, parts: [{ label: 'a', marks: 5, text: 'x' }, { label: 'b', marks: 2, text: 'x', legacy: true, legacy_reason: 'r' }] };
    const v = studentView(row);
    expect(v.originalMarks).toBe(7);
    expect(v.marks).toBe(5);
  });
  it('a hidden part with no marks → total unknown is noted, and the question is still served', () => {
    const row = { total_marks: 9, parts: [{ label: 'a', marks: 5, text: 'x' }, { label: 'b', text: 'x', legacy: true, legacy_reason: 'r' }] };
    const v = studentView(row);
    expect(v.notes).toContain('marks_unknown');
    expect(v.marks).toBe(5);
    expect(v.servable).toBe(true);
  });
  it('reads marks stored as text', () => {
    const row = { total_marks: '10', parts: [{ label: 'a', marks: '7', text: 'x' }, { label: 'b', marks: '3', text: 'x', legacy: true, legacy_reason: 'r' }] };
    expect(studentView(row).marks).toBe(7);
  });
  it('a parent whose own marks are NOT a repeat of its sub-parts keeps them when it has no marked sub-parts', () => {
    const row = { total_marks: 10, parts: [{ label: 'a', marks: 4, text: 'x' }, { label: 'b', marks: 6, text: 'x', subparts: [{ label: 'i', text: 'x' }, { label: 'ii', text: 'x' }] }, { label: 'c', marks: 0, text: 'x' }] };
    (row.parts[0] as Record<string, unknown>).legacy = true;
    (row.parts[0] as Record<string, unknown>).legacy_reason = 'r';
    const v = studentView(row);
    expect(v.marks).toBe(6);
    expect((v.row.parts as { marks?: number }[])[0].marks).toBe(6);
  });
});

describe('answer line split by part', () => {
  const leaves = (hidden: string[]) => ['a', 'b.i', 'b.ii', 'c'].map((key) => ({ key, tokens: key.split('.'), hidden: hidden.includes(key) }));

  it('drops the hidden part\'s share when the parts carry no answers of their own', () => {
    const row = {
      total_marks: 10,
      answer: '(i) kidney-shaped curve, intercepts $(\\pm2,0)$; (ii) $y=\\dfrac{1}{\\sqrt3}x$; (iii) area $\\approx4.30$ units$^2$',
      parts: [{ label: 'i', marks: 3, text: 'x' }, { label: 'ii', marks: 4, text: 'x' }, { label: 'iii', marks: 3, text: 'x', legacy: true, legacy_reason: 'parametric area' }],
    };
    expect(studentView(row).row.answer).toBe('(i) kidney-shaped curve, intercepts $(\\pm2,0)$; (ii) $y=\\dfrac{1}{\\sqrt3}x$');
  });
  it('handles spaces instead of semicolons, and a middle part', () => {
    const row = {
      total_marks: 12,
      answer: '(i) Engineering 11, Arts 90   (ii) $\\bar{x} = 58$ kg   (iii) least $m = 60$ kg',
      parts: [{ label: 'i', marks: 3, text: 'x', legacy: true, legacy_reason: 'stratified sampling' }, { label: 'ii', marks: 4, text: 'x' }, { label: 'iii', marks: 5, text: 'x' }],
    };
    expect(studentView(row).row.answer).toBe('(i) $\\bar{x} = 58$ kg   (ii) least $m = 60$ kg');
  });
  it('puts the parent label back on a sub-part that was written short', () => {
    expect(dropHiddenSegments('(a) 1; (b)(i) 2; (ii) 3; (c) 4', leaves(['b.i']))).toBe('(a) 1; (b)(ii) 3; (c) 4');
    expect(dropHiddenSegments('(a) 1; (b)(i) 2; (ii) 3; (c) 4', leaves(['b.ii']))).toBe('(a) 1; (b)(i) 2; (c) 4');
  });
  it('never reads a label inside maths as a part label', () => {
    const text = '(a) $f(a)=(b)^2$; (b)(i) 2; (b)(ii) 3; (c) $g(c)$';
    expect(dropHiddenSegments(text, leaves(['c']))).toBe('(a) $f(a)=(b)^2$; (b)(i) 2; (b)(ii) 3');
  });
  it('withholds the answer when the line cannot be split — never shows it whole', () => {
    const row = {
      total_marks: 9,
      answer: '$w = -3-3i$, $z = -2+2i$; $a = e^{-i\\pi/3}$',
      parts: [{ label: 'a', marks: 6, text: 'x' }, { label: 'b', marks: 3, text: 'x', legacy: true, legacy_reason: 'exponential form' }],
    };
    const v = studentView(row);
    expect(v.row.answer).toBeNull();
    expect(v.notes).toContain('answer_withheld');
  });
  it('withholds when a part is missing from the line', () => {
    // strict on purpose: an unlabelled share of the hidden part may be sitting in the line
    expect(dropHiddenSegments('(b) 2; (c) 3', [{ key: 'a', tokens: ['a'], hidden: true }, { key: 'b', tokens: ['b'], hidden: false }])).toBeNull();
    expect(dropHiddenSegments('(a) 2', [{ key: 'a', tokens: ['a'], hidden: false }, { key: 'b', tokens: ['b'], hidden: true }])).toBeNull();
  });
});

describe('worked solution split by part', () => {
  it('per-part working: the top-level copy is dropped and the hidden part\'s working is gone', () => {
    const row = mark(complex(), 'b.ii');
    row.solution = 'The whole thing, with de Moivre in it.';
    const v = studentView(row);
    expect(v.row.solution).toBeNull();
    expect(JSON.stringify(v.row.parts)).not.toContain('By de Moivre');
    expect(v.notes).not.toContain('solution_withheld');
  });
  it('one top-level solution with a heading per part is split on the headings', () => {
    const row = {
      total_marks: 10,
      solution: '**(a)**\n$x = 2$, used in part (c) later.\n\n**(b)**\nBy de Moivre, $z^5 = 1$.\n\n**(c)**\nSo the sum is $0$.',
      parts: [{ label: 'a', marks: 4, text: 'x' }, { label: 'b', marks: 3, text: 'x', legacy: true, legacy_reason: 'de Moivre' }, { label: 'c', marks: 3, text: 'x' }],
    };
    const v = studentView(row);
    // (c) is shown as (b): its heading and the sentence that names it both follow
    expect(v.row.solution).toBe('**(a)**\n$x = 2$, used in part (b) later.\n\n**(b)**\nSo the sum is $0$.');
    expect(v.needsCheck).toBe(false);
  });
  it('a top-level solution with no per-part headings is withheld, not shown whole', () => {
    const row = {
      total_marks: 10,
      solution: 'Finding $w$ and $z$. Then by de Moivre… then the argument.',
      parts: [{ label: 'a', marks: 7, text: 'x' }, { label: 'b', marks: 3, text: 'x', legacy: true, legacy_reason: 'de Moivre' }],
    };
    const v = studentView(row);
    expect(v.row.solution).toBeNull();
    expect(v.notes).toContain('solution_withheld');
  });
  it('whole-question solution pictures, whole-question images and the stored hint are withheld', () => {
    const row = {
      ...mark(complex(), 'b.ii'),
      solution_images: ['question_images/sol_all.png'],
      question_image_url: 'https://x/q.png', question_with_answer_image_url: 'https://x/qa.png', solution_image_url: 'https://x/s.png',
      hint: 'Use de Moivre.', figure_url: 'https://x/fig.png', image_url: '["question_images/stem.png"]',
    };
    const v = studentView(row);
    expect(v.row.solution_images).toEqual([]);
    expect(v.row.question_image_url).toBeNull();
    expect(v.row.question_with_answer_image_url).toBeNull();
    expect(v.row.solution_image_url).toBeNull();
    expect(v.row.hint).toBeNull();
    expect(v.row.figure_url).toBe('https://x/fig.png');           // the stem's figure stays
    expect(v.row.image_url).toBe('["question_images/stem.png"]');
    expect(v.notes).toContain('solution_images_withheld');
  });
});

describe('rows with no parts list', () => {
  const row = { id: 'q', question_text: 'Find $w$ in the form $re^{i\\theta}$. Hence find the three smallest $n$.', parts: null, total_marks: 7, answer: 'x', solution: 'y' };
  it('the feature cannot apply: the view is the row, and a mark is refused with a plain reason', () => {
    expect(studentRow(row)).toBe(row);
    const r = applyPartMark(row, { part: 'a', legacy: true, reason: 'exponential form' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no parts list/);
  });
});

describe('labels', () => {
  it('reads every way a person writes a part', () => {
    for (const s of ['(b)(ii)', 'b(ii)', 'b.ii', 'B ii', ' (B) (II) ', 'b/ii']) expect(parsePartRef(s)).toBe('b.ii');
    expect(parsePartRef('(c)')).toBe('c');
    expect(parsePartRef('')).toBe('');
    expect(partRefLabel('b.ii')).toBe('(b)(ii)');
  });
  it('matches a stored label written with brackets or capitals', () => {
    const row = { total_marks: 10, parts: [{ label: '(A)', marks: 5, text: 'x' }, { label: 'B)', marks: 3, text: 'x', legacy: true, legacy_reason: 'r' }, { label: '(C)', marks: 2, text: 'x' }] };
    const v = studentView(row);
    expect(v.hidden[0].key).toBe('b');
    // shown in the spelling it was stored in — brackets and capitals kept, the letter moved up
    expect((v.row.parts as { label: string }[]).map((p) => p.label)).toEqual(['(A)', '(B)']);
  });
});

describe('applyPartMark', () => {
  it('sets a mark, leaving every other key on every part alone', () => {
    const row = complex();
    const r = applyPartMark(row, { part: '(b)(ii)', legacy: true, reason: '  de Moivre  ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sub = (r.parts[1] as { subparts: Record<string, unknown>[] }).subparts;
    expect(sub[1]).toMatchObject({ legacy: true, legacy_reason: 'de Moivre', solution_image: 'question_images/sol_x.png', marks: 4 });
    expect(r.parts[0]).toEqual(row.parts[0]);
    expect(sub[0]).toEqual((row.parts[1] as { subparts: unknown[] }).subparts[0]);
    expect(r.view.marks).toBe(8);
    expect(hasPartMarks(row.parts)).toBe(false);   // the input is not touched
  });
  it('clears a mark', () => {
    const row = mark(complex(), 'b.ii');
    const r = applyPartMark(row, { part: 'b.ii', legacy: false });
    expect(r.ok && !hasPartMarks(r.parts)).toBe(true);
    if (r.ok) expect(JSON.stringify(r.parts)).not.toContain('legacy_reason');
  });
  it('sets and clears needs without touching the mark', () => {
    const row = mark(complex(), 'b.ii');
    const r = applyPartMark(row, { part: 'b.iv', needs: ['(b)(ii)'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.hidden.map((h) => h.key)).toEqual(['b.ii', 'b.iv']);
    const back = applyPartMark({ ...row, parts: r.parts }, { part: 'b.iv', needs: [] });
    expect(back.ok && back.view.hidden.map((h) => h.key)).toEqual(['b.ii']);
  });
  it('refuses: unknown part, no reason, a twice-used label, needs naming nothing, hiding everything', () => {
    const row = complex();
    expect(applyPartMark(row, { part: 'z', legacy: true, reason: 'r' }).ok).toBe(false);
    expect(applyPartMark(row, { part: 'a', legacy: true }).ok).toBe(false);
    expect(applyPartMark(row, { part: 'a', needs: ['q'] }).ok).toBe(false);
    expect(applyPartMark(row, { part: 'a', needs: ['a'] }).ok).toBe(false);
    const dup = { parts: [{ label: 'a', marks: 1 }, { label: 'a', marks: 2 }] };
    expect(applyPartMark(dup, { part: 'a', legacy: true, reason: 'r' }).ok).toBe(false);
    const one = { parts: [{ label: 'a', marks: 5, text: 'x' }] };
    expect(applyPartMark(one, { part: 'a', legacy: true, reason: 'r' }).ok).toBe(false);
  });
  it('allows a mark that leaves too little — and says the question will not be served', () => {
    const r = applyPartMark(complex(), { part: 'b', legacy: true, reason: 'r' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.view.servable).toBe(false);
  });
});

describe('likelyDependents — a prompt for the person marking', () => {
  it('flags a "Hence" right after the part, and a part that names it', () => {
    const row = complex();
    expect(likelyDependents(row.parts, 'b.iii').map((d) => d.key)).toEqual(['b.iv']);
    const named = [{ label: 'a', text: 'x' }, { label: 'b', text: 'x' }, { label: 'c', text: 'Using your answer to part (a), find…' }];
    expect(likelyDependents(named, 'a').map((d) => d.key)).toEqual(['c']);
  });
  it('says nothing about parts that stand alone', () => {
    const plain = [{ label: 'a', text: 'Find $x$.' }, { label: 'b', text: 'Find $y$.', solution: '$y = 3$' }, { label: 'c', text: 'Sketch the curve.' }];
    expect(likelyDependents(plain, 'a')).toEqual([]);
  });
});

describe('hiddenParts', () => {
  it('is empty for unmarked parts', () => {
    expect(hiddenParts(complex().parts)).toEqual({ hidden: [], unknownNeeds: false });
  });
});

// ── the surfaces' shared gates and renderers, on a marked row ────────────────
/** What a person does after reading the "Hence" warning: every later part flagged is said to stand alone. */
function standAlone<T extends { parts: unknown }>(row: T): T {
  const by = new Map<string, string[]>();
  for (const d of studentView(row).dependents) by.set(d.key, [...(by.get(d.key) ?? []), d.on]);
  for (const [key, on] of by) {
    const r = applyPartMark(row, { part: key, cleared: on });
    if (r.ok) row.parts = r.parts as never;
  }
  return row;
}

import { serveRefusal } from './serve-gate';
import { practiceEligibility, previewOf } from './portal-find';
import { questionStructured, questionMarkdown, solutionMarkdown, totalMarksOf } from './bank-question-markdown';
import { fromDetail, ansLine } from './pick-worksheet';
import { flattenParts, type Part } from './kiosk-worksheet-images';
import { collectScheme } from './practice-grade-prompt';
import { usableCheckAnswer } from './lesson-load';

describe('through the surfaces', () => {
  const student = { allowedQLevels: ['JC1', 'JC2'], isIp: false, assigned: false };
  const gateRow = (row: object) => ({ level: 'JC2', school: 'HCI', national: false, deleted_at: null, ai_generated: false, verified: false, flagged_count: 0, legacy_syllabus: false, ...row });

  it('practice: the grid, the flat text and the total have no hidden part', () => {
    const row = studentRow(standAlone(mark(complex(), 'b.ii')))!;
    const { parts } = questionStructured(row as never);
    expect(parts[1].subparts.map((s) => s.label)).toEqual(['i', 'ii', 'iii']);
    expect(totalMarksOf(parts)).toBe(8);
    expect(row.total_marks).toBe(8);
    expect(questionMarkdown(row as never)).not.toContain('exponential form');
  });
  it('the worked solution reveal has no hidden working, answer or picture', () => {
    const md = solutionMarkdown(studentRow(standAlone(mark(complex(), 'b.ii')))! as never);
    expect(md).not.toContain('de Moivre');
    expect(md).not.toContain('sol_x.png');
    expect(md).toContain('**(b)(iii)**\n\nFrom (ii).');   // the old (iv), under its shown letter
    expect(md).not.toContain('**(b)(iv)**');
  });
  it('marking: the scheme given to the marker has no hidden part, and the total is the reduced one', () => {
    const row = studentRow(standAlone(mark(complex(), 'b.ii')), { assigned: true })!;
    const scheme: string[] = [];
    collectScheme(row.parts, scheme);
    expect(scheme.join('\n')).not.toContain('de Moivre');
    expect(scheme.join('\n')).toContain('(b.iii) [2m] Hence');   // the marker reads the labels the student wrote under
    expect(scheme.join('\n')).not.toMatch(/b\.iv\b/);
    expect(row.total_marks).toBe(8);
  });
  it('kiosk / worksheet sheet: the printed text and the answer line skip the hidden part', () => {
    const row = studentRow(standAlone(mark(complex(), 'b.ii')))!;
    const flat = flattenParts(row.question_text, row.parts as Part[]);
    expect(flat.text).not.toContain('exponential form');
    expect(flat.answer).not.toContain('e^{i3n');
  });
  it('the worksheet picker builds its sheet from the student row', () => {
    const marked = standAlone(mark(complex(), 'b.ii'));
    const q = fromDetail({ id: 'q1', marks: 12, questionMd: marked.question_text, parts: marked.parts, answer: marked.answer, solution: null });
    expect(q.marks).toBe(8);
    expect(q.parts[1].subparts.map((s) => s.label)).toEqual(['i', 'ii', 'iii']);
    expect(ansLine(q)).not.toContain('e^{i');
    expect(Object.keys(q.partSolutions)).toEqual(['a', 'b.i', 'b.ii', 'b.iii']);
    expect(Object.values(q.partSolutions).join(' ')).not.toContain('de Moivre');
  });
  it('Find a question: the preview never quotes a hidden part', () => {
    expect(previewOf(mark(complex(), 'b.ii'), 2000)).not.toContain('exponential form');
    expect(previewOf(complex(), 2000)).toContain('exponential form');
  });
  it('too little left: refused by the by-id gate and by practice eligibility, like legacy_syllabus', () => {
    const little = mark(complex(), 'b');
    expect(serveRefusal(gateRow(little), student)).toBe('legacy');
    expect(serveRefusal(gateRow(little), { ...student, assigned: true })).toBeNull();
    expect(practiceEligibility(gateRow(little) as never).ok).toBe(false);
    const fine = standAlone(mark(complex(), 'b.ii'));
    expect(serveRefusal(gateRow(fine), student)).toBeNull();
    expect(practiceEligibility(gateRow(fine) as never).ok).toBe(true);
    const none = complex(); mark(none, 'a'); mark(none, 'b');
    expect(serveRefusal(gateRow(none), { ...student, assigned: true })).toBe('legacy');
  });
  it('a lesson check answers from the student row', () => {
    const row = gateRow({ ...standAlone(mark(complex(), 'b.ii')), id: 'q1' });
    expect(usableCheckAnswer(row as never)).not.toContain('e^{i');
  });
  it('nothing marked: every one of these is byte-for-byte what it was', () => {
    const row = complex();
    expect(JSON.stringify(questionStructured(studentRow(row)! as never))).toBe(JSON.stringify(questionStructured(row as never)));
    expect(solutionMarkdown(studentRow(row)! as never)).toBe(solutionMarkdown(row as never));
    expect(serveRefusal(gateRow(row), student)).toBeNull();
  });
});

// ── RE-LETTERING (Adrian, 9 Oct 2026) ────────────────────────────────────────
import { asrjc2023Q9, ri2024Q8 } from './part-syllabus.fixtures';

type P = { label?: string; text?: string; marks?: number; answer?: string; solution?: string; subparts?: P[]; [k: string]: unknown };
const labelsOf = (ps: unknown): unknown[] => (ps as P[]).map((p) => (p.subparts ? [p.label, labelsOf(p.subparts)] : p.label));
const hide = (p: P, reason = 'r'): P => Object.assign(p, { legacy: true, legacy_reason: reason });

describe('label styles are read off the siblings', () => {
  it('knows (a),(b) / (i),(ii) / 1,2 — and nothing else', () => {
    expect(labelStyle(['a', 'b', 'c'])).toBe('alpha');
    expect(labelStyle(['i', 'ii', 'iii', 'iv', 'v', 'vi'])).toBe('roman');
    expect(labelStyle(['1', '2', '3'])).toBe('numeric');
    expect(labelStyle(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])).toBe('alpha');   // the ninth letter, not a roman one
    expect(labelStyle(['i'])).toBe('roman');
    expect(labelStyle(['a', 'c'])).toBeNull();
    expect(labelStyle(['ai', 'aii', 'bi'])).toBeNull();
    expect(labelStyle([])).toBeNull();
  });
  it('re-letters each style in its own run', () => {
    const q = (labels: string[], out: number) => ({
      total_marks: 4 * labels.length,
      parts: labels.map((label, i) => (i === out ? hide({ label, marks: 4, text: `t${i}` }) : { label, marks: 4, text: `t${i}` })),
    });
    expect(labelsOf(studentView(q(['a', 'b', 'c', 'd'], 1)).row.parts)).toEqual(['a', 'b', 'c']);
    expect(labelsOf(studentView(q(['i', 'ii', 'iii', 'iv'], 0)).row.parts)).toEqual(['i', 'ii', 'iii']);
    expect(labelsOf(studentView(q(['1', '2', '3'], 0)).row.parts)).toEqual(['1', '2']);
    expect(labelsOf(studentView(q(['I', 'II', 'III'], 0)).row.parts)).toEqual(['I', 'II']);
  });
  it('a part hidden at the END changes no letter', () => {
    const v = studentView({ total_marks: 9, parts: [{ label: 'a', marks: 3, text: 'x' }, { label: 'b', marks: 3, text: 'y' }, hide({ label: 'c', marks: 3, text: 'z' })] });
    expect(labelsOf(v.row.parts)).toEqual(['a', 'b']);
    expect(hasRenames(v.labels)).toBe(false);
  });
  it('only the level that lost a part is touched', () => {
    const v = studentView({
      total_marks: 12,
      parts: [hide({ label: 'a', marks: 2, text: 'x' }), { label: 'b', marks: 5, subparts: [{ label: 'i', marks: 2, text: 'p' }, { label: 'ii', marks: 3, text: 'q' }] }, { label: 'c', marks: 5, text: 'y' }],
    });
    expect(labelsOf(v.row.parts)).toEqual([['a', ['i', 'ii']], 'b']);
    expect(v.labels.renames.map((r) => `${r.fromLabel}>${r.toLabel}`)).toEqual(['(b)>(a)', '(b)(i)>(a)(i)', '(b)(ii)>(a)(ii)', '(c)>(b)']);
  });
  it('labels that are not a plain run are NOT guessed at: kept, and the question waits for a person', () => {
    const v = studentView({ total_marks: 9, parts: [hide({ label: 'a-i', marks: 3, text: 'x' }), { label: 'a-ii', marks: 3, text: 'y' }, { label: 'b-i', marks: 3, text: 'z' }] });
    expect(labelsOf(v.row.parts)).toEqual(['a-ii', 'b-i']);
    expect(v.checks.map((c) => c.code)).toContain('label_style');
    expect(v.needsCheck).toBe(true);
    expect(v.servable).toBe(false);
  });
});

describe('one part left at a level: no letter', () => {
  const two = () => ({
    id: 'q', question_text: 'The curve $C$ has equation $y = x^2$.', total_marks: 9,
    answer: '(a) $r = 2e^{i\\pi/3}$; (b) $x = 3$',
    solution: null as string | null,
    parts: [
      hide({ label: 'a', marks: 3, text: 'Write $w$ in exponential form.', answer: '$r = 2e^{i\\pi/3}$', solution: 'Polar.' }) as P,
      { label: 'b', marks: 6, text: 'Find the value of $x$.', answer: '$x = 3$', solution: 'Solve.', solution_image: 'question_images/sol_b.png' } as P,
    ],
  });
  it('(a)+(b) with one hidden → one plain question: text after the stem, its marks the total, the answer and working with no "(b)"', () => {
    const v = studentView(two());
    expect(v.row.parts).toEqual([]);
    expect(v.row.question_text).toBe('The curve $C$ has equation $y = x^2$.\n\nFind the value of $x$.');
    expect(v.row.total_marks).toBe(6);
    expect(v.row.answer).toBe('$x = 3$');
    expect(v.row.solution).toBe('Solve.');
    expect((v.row as { solution_images?: unknown }).solution_images).toEqual(['question_images/sol_b.png']);   // the part's own picture, never the whole-question one
    expect(v.labels.renames).toEqual([{ from: 'b', to: '', fromLabel: '(b)', toLabel: '' }]);
    expect(v.servable).toBe(true);
    expect(JSON.stringify(v.row)).not.toMatch(/\(b\)|exponential|Polar/);
  });
  it('renders as a question with no parts on every shared renderer', () => {
    const row = studentRow(two())!;
    const s = questionStructured(row as never);
    expect(s.parts).toEqual([]);
    expect(s.stem).toContain('Find the value of $x$.');
    const md = solutionMarkdown(row as never);
    expect(md).toContain('**Answer:** $x = 3$');
    expect(md).toContain('Solve.');
    expect(md).not.toContain('**(');
    const flat = flattenParts(row.question_text, row.parts as Part[]);
    expect(flat.text).not.toContain('**(');
  });
  it('the same one level down: (b)(i),(b)(ii) with (ii) hidden → just "(b)"', () => {
    const row = {
      total_marks: 12, answer: '(a) 1; (b)(i) $|w| = 2$; (b)(ii) $w^5$',
      parts: [
        { label: 'a', marks: 5, text: 'Solve.', answer: '1' },
        { label: 'b', marks: 7, text: 'The number $w$ is $1 + i\\sqrt3$.', subparts: [
          { label: 'i', marks: 4, text: 'Find $|w|$.', answer: '$|w| = 2$', solution: 'Pythagoras.' },
          hide({ label: 'ii', marks: 3, text: 'Find $w^5$.', answer: '$w^5$', solution: 'de Moivre.' }),
        ] },
      ],
    };
    const v = studentView(row);
    const parts = v.row.parts as P[];
    expect(labelsOf(parts)).toEqual(['a', 'b']);
    expect(parts[1]).toEqual({ label: 'b', marks: 4, text: 'The number $w$ is $1 + i\\sqrt3$.\n\nFind $|w|$.', answer: '$|w| = 2$', solution: 'Pythagoras.' });
    expect(v.row.answer).toBe('(a) 1; (b) $|w| = 2$');
    expect(v.labels.shown).toEqual({ a: 'a', b: 'b', 'b.i': 'b' });
    expect(v.labels.renames).toEqual([{ from: 'b.i', to: 'b', fromLabel: '(b)(i)', toLabel: '(b)' }]);
    expect(solutionMarkdown(v.row as never)).toContain('**(b)**\n\nPythagoras.');
  });
  it('one top-level part left that has sub-parts: its letter goes, the sub-parts move up', () => {
    const v = studentView(standAlone(asrjc2023Q9Marked()));
    expect(labelsOf(v.row.parts)).toEqual(['i', 'ii', 'iii']);
    expect(v.row.question_text).toBe(`${asrjc2023Q9().question_text}\n\n$z_4 = \\cos\\theta + i\\sin\\theta$.`);
    expect(v.labels.renames.map((r) => `${r.fromLabel}>${r.toLabel}`)).toEqual(['(b)>', '(b)(i)>(i)', '(b)(ii)>(ii)', '(b)(iii)>(iii)']);
  });
  it('both levels at once: (a) hidden, and (b)(i) the only sub-part left → a plain question', () => {
    const v = studentView({
      question_text: 'Stem.', total_marks: 10, answer: '(a) 1; (b)(i) 2; (b)(ii) 3',
      parts: [hide({ label: 'a', marks: 3, text: 'A.' }), { label: 'b', text: 'Intro.', subparts: [{ label: 'i', marks: 5, text: 'Find it.', answer: '2' }, hide({ label: 'ii', marks: 2, text: 'B.' })] }],
    });
    expect(v.row.parts).toEqual([]);
    expect(v.row.question_text).toBe('Stem.\n\nIntro.\n\nFind it.');
    expect(v.row.answer).toBe('2');
    expect(v.labels.shown).toEqual({ b: '', 'b.i': '' });
    expect(originalPartKey(v.labels, '')).toBe('b.i');
  });
  it('a lone part that carries its own figure keeps a letter, and a person is asked to look', () => {
    const v = studentView({
      question_text: 'Stem.', total_marks: 8,
      parts: [hide({ label: 'a', marks: 3, text: 'A.' }), { label: 'b', marks: 5, text: 'Use the diagram.', image_url: 'question_images/fig.png' }],
    });
    expect(labelsOf(v.row.parts)).toEqual(['a']);
    expect(v.checks.map((c) => c.code)).toEqual(['lone_part_kept']);
    expect(studentRow(v.row)).not.toBeNull();
    expect(v.needsCheck).toBe(true);
  });
  it('a level that had ONE part all along is left alone', () => {
    const v = studentView({ total_marks: 10, parts: [{ label: 'a', subparts: [{ label: 'i', marks: 4, text: 'x' }, hide({ label: 'ii', marks: 3, text: 'y' }), { label: 'iii', marks: 3, text: 'z' }] }] });
    expect(labelsOf(v.row.parts)).toEqual([['a', ['i', 'ii']]]);
  });
});

function asrjc2023Q9Marked() {
  const row = asrjc2023Q9();
  hide(row.parts[0] as P, 'product and quotient in polar form (not in 9758)');
  return row;
}

describe('the label map: original ⇄ shown', () => {
  const v = studentView(standAlone(mark(complex(), 'b.ii')));
  it('goes out and comes back', () => {
    expect(v.labels.shown).toEqual({ a: 'a', b: 'b', 'b.i': 'b.i', 'b.iii': 'b.ii', 'b.iv': 'b.iii' });
    expect(v.labels.renames.map((r) => `${r.fromLabel}>${r.toLabel}`)).toEqual(['(b)(iii)>(b)(ii)', '(b)(iv)>(b)(iii)']);
    for (const [orig, shown] of Object.entries(v.labels.shown)) {
      expect(shownPartLabel(v.labels, orig)).toBe(partRefLabel(shown));
      if (orig !== 'b' || shown !== 'b') expect(originalPartKey(v.labels, shown)).toBe(orig);
    }
    expect(shownPartLabel(v.labels, '(b)(iv)')).toBe('(b)(iii)');
    expect(originalPartKey(v.labels, 'b(ii)')).toBe('b.iii');      // what the student calls (ii) is the bank's (iii)
    expect(originalPartKey(v.labels, '(a)')).toBe('a');
  });
  it('travels with the row, and never into JSON', () => {
    expect(partLabelsOf(v.row)).toBe(v.labels);
    expect(partLabelsOf({ ...v.row })).toBe(v.labels);
    expect(partLabelsOf(studentRow(standAlone(mark(complex(), 'b.ii'))))).toEqual(v.labels);
    expect(JSON.stringify(v.row)).not.toContain('renames');
    expect(Object.keys(v.row)).not.toContain('labels');
    expect(hasRenames(partLabelsOf(complex()))).toBe(false);
  });
  it('an attempt is marked against the labels the student saw, and read back to the bank\'s parts', () => {
    // going out: the scheme the marker is given names the parts as the student's page did
    const row = studentRow(standAlone(mark(complex(), 'b.ii')), { assigned: true })!;
    const scheme: string[] = [];
    collectScheme(row.parts, scheme);
    expect(scheme.filter((l) => /^\(/.test(l)).map((l) => l.split(' ')[0])).toEqual(['(a)', '(b)', '(b.i)', '(b.ii)', '(b.iii)']);
    // coming in: the marker answers per shown label; the attempt stores the map it was shown with
    const stored = partLabelsOf(row).original;
    const breakdown = [{ label: 'a', awarded: 3 }, { label: 'b(i)', awarded: 2 }, { label: 'b(ii)', awarded: 1 }, { label: 'b(iii)', awarded: 0 }];
    expect(breakdown.map((p) => storedOriginalKey(stored, p.label))).toEqual(['a', 'b.i', 'b.iii', 'b.iv']);
    // an attempt stored before re-lettering carries no map: its labels are the bank's own
    expect(['a', 'b(iii)', '(b)(iv)'].map((l) => storedOriginalKey(undefined, l))).toEqual(['a', 'b.iii', 'b.iv']);
    expect(storedOriginalKey(null, '(b)(ii)')).toBe('b.ii');
  });
  it('a later change to the marks cannot move an attempt: the stored map is the record', () => {
    const then = partLabelsOf(studentRow(standAlone(mark(complex(), 'b.ii')), { assigned: true })!).original;
    const later = studentView(standAlone(mark(mark(complex(), 'b.ii'), 'b.i'))).labels.original;   // (b)(i) marked afterwards
    expect(storedOriginalKey(later, '(b)(ii)')).toBe('b.iv');                                       // today's page calls another part (b)(ii)
    expect(storedOriginalKey(then, '(b)(ii)')).toBe('b.iii');
  });
});

describe('a sentence that names a part', () => {
  const base = () => ({
    question_text: 'Stem.', total_marks: 12,
    answer: null as string | null, solution: null as string | null,
    parts: [
      { label: 'i', marks: 3, text: 'Find $a$.', answer: '1', solution: 'One.' },
      { label: 'ii', marks: 3, text: 'Find $w^5$.', answer: '2', solution: 'Two.' },
      { label: 'iii', marks: 3, text: 'Find $b$.', answer: '3', solution: 'Three.' },
      { label: 'iv', marks: 3, text: 'Find $c$.', answer: '4', solution: 'Four.' },
    ] as P[],
  });
  const withText = (text: string, extra: Partial<P> = {}) => { const r = base(); hide(r.parts[1], 'de Moivre'); Object.assign(r.parts[3], { text }, extra); return r; };
  const shownIv = (v: ReturnType<typeof studentView>) => ((v.row as { parts: P[] }).parts[2]);

  it('"using your answer to part (iii)" follows the part to its new letter', () => {
    const v = studentView(standAlone(withText('Using your answer to part (iii), find $c$.')));
    expect(shownIv(v).text).toBe('Using your answer to part (ii), find $c$.');
    expect(v.needsCheck).toBe(false);
  });
  it('several spellings: "from (iii)", "parts (i) and (iii)", "part iii", "in (iii)"', () => {
    expect(shownIv(studentView(withText('From (iii), deduce $c$.'))).text).toBe('From (ii), deduce $c$.');
    expect(shownIv(studentView(withText('Use parts (i) and (iii) to find $c$.'))).text).toBe('Use parts (i) and (ii) to find $c$.');
    expect(shownIv(studentView(withText('Use part iii to find $c$.'))).text).toBe('Use part (ii) to find $c$.');
    expect(shownIv(studentView(withText('The value found in (iii) is $b$. Find $c$.'))).text).toBe('The value found in (ii) is $b$. Find $c$.');
  });
  it('the working and the answer are rewritten too', () => {
    const v = studentView(withText('Find $c$.', { solution: 'From (iii), $b = 3$, so $c = 4$.', answer: 'as in part (iii)' }));
    expect(shownIv(v).solution).toBe('From (ii), $b = 3$, so $c = 4$.');
    expect(shownIv(v).answer).toBe('as in part (ii)');
  });
  it('the stem and the stored answer line follow as well', () => {
    const r = withText('Find $c$.');
    r.question_text = 'In part (iv) you may use $\\pi = 3.14$.';
    r.answer = '(i) 1; (ii) 2; (iii) 3; (iv) 4, as in part (iii)';
    const v = studentView(r);
    expect(v.row.question_text).toBe('In part (iii) you may use $\\pi = 3.14$.');
    expect(v.row.answer).toBe('(i) 1; (ii) 3; (iii) 4, as in part (ii)');
  });
  it('a full path keeps its shape, and a part folded into its parent is named by the parent', () => {
    const r = {
      total_marks: 14, parts: [
        { label: 'a', marks: 4, text: 'x' },
        { label: 'b', subparts: [hide({ label: 'i', marks: 3, text: 'x' }), { label: 'ii', marks: 3, text: 'Find $k$.' }] },
        { label: 'c', marks: 4, text: 'Using your answer to (b)(ii), find $m$. Compare with part (a).' },
      ] as P[],
    };
    const v = studentView(r);
    expect((v.row.parts as P[])[2].text).toBe('Using your answer to (b), find $m$. Compare with part (a).');
  });
  it('a part that NAMES a hidden part depends on it: nothing is rewritten, and it is not served until a person decides', () => {
    const r = withText('Using your answer to part (ii), find $c$.');
    const v = studentView(r);
    expect(shownIv(v).text).toBe('Using your answer to part (ii), find $c$.');      // untouched — (ii) here is the hidden part
    expect(v.dependents).toEqual([{ key: 'iv', label: '(iv)', on: 'ii', onLabel: '(ii)', why: 'names (ii)' }]);
    expect(v.needsCheck).toBe(true);
    expect(studentRow(r)).toBeNull();
    expect(studentRow(r, { assigned: true })).toBeNull();
    // decision 1 — it needs it: gone with it
    const needs = applyPartMark(r, { part: 'iv', needs: ['ii'] });
    expect(needs.ok && needs.view.hidden.map((h) => h.key)).toEqual(['ii', 'iv']);
    expect(needs.ok && needs.view.needsCheck).toBe(false);
    // decision 2 — it stands alone: shown
    const alone = applyPartMark(r, { part: 'iv', cleared: ['ii'] });
    expect(alone.ok && alone.view.needsCheck).toBe(false);
    expect(alone.ok && alone.view.servable).toBe(true);
  });
  it('the stem naming a hidden part waits for a person', () => {
    const r = withText('Find $c$.');
    r.question_text = 'The result of part (ii) may be quoted.';
    const v = studentView(r);
    expect(v.checks.map((c) => c.code)).toEqual(['names_hidden']);
    expect(v.needsCheck).toBe(true);
  });

  describe('things that only look like labels are left alone', () => {
    const untouched = (text: string) => {
      const v = studentView(standAlone(withText(text)));
      expect(shownIv(v).text).toBe(text);
      return v;
    };
    it('roman numerals and brackets inside maths', () => {
      expect(untouched('Find $(iii)^2 + f(iii)$ and $\\left(iv\\right)$ where $x = (i)(ii)$.').needsCheck).toBe(false);
      expect(untouched('Solve \\((iii) + x = 0\\) for $x$.').needsCheck).toBe(false);
    });
    it('a list inside the part: "(i) … (ii) … (iii) …"', () => {
      expect(untouched('Find the range of $x$ when (i) $x > 0$, (ii) $x < 0$, (iii) $x = 0$.').needsCheck).toBe(false);
      expect(untouched('State (a) the modulus (b) the argument (c) the conjugate.').needsCheck).toBe(false);
    });
    it('the option letters of a multiple-choice question', () => {
      const r = { total_marks: 9, parts: [hide({ label: 'a', marks: 3, text: 'x' }), { label: 'b', marks: 3, text: 'Which is true? (A) $x>0$ (B) $x<0$ (C) $x=0$ (D) none' }, { label: 'c', marks: 3, text: 'Explain.' }] };
      const v = studentView(r);
      expect((v.row.parts as P[])[0].text).toBe('Which is true? (A) $x>0$ (B) $x<0$ (C) $x=0$ (D) none');
      expect(v.needsCheck).toBe(false);
    });
    it('function brackets and words in brackets', () => {
      expect(untouched('Given g(iii) = 2 and h(i) = 1 (here $x$ is real), find $c$ (in cm).').needsCheck).toBe(false);
    });
    it('a label that did not move is never touched, cue or no cue', () => {
      expect(untouched('Using your answer to part (i), find $c$.').needsCheck).toBe(false);
    });
  });

  it('a bare label that may or may not be a part name is NOT guessed: the question waits for a person', () => {
    const r = withText('Find $c$ (iii).');
    const v = studentView(r);
    expect(shownIv(v).text).toBe('Find $c$ (iii).');
    expect(v.checks.map((c) => c.code)).toEqual(['reference_unclear']);
    expect(v.needsCheck).toBe(true);
    expect(v.servable).toBe(false);
    expect(studentRow(r)).toBeNull();
    expect(studentRow(r, { assigned: true })).toBeNull();
    expect(partMarksBlockAlways(r)).toBe(true);
    // the by-id gate refuses it even on the student's own list
    const gate = { level: 'JC2', school: 'HCI', national: false, deleted_at: null, ai_generated: false, verified: false, flagged_count: 0, legacy_syllabus: false, ...r };
    expect(serveRefusal(gate, { allowedQLevels: ['JC2'], isIp: false, assigned: true })).toBe('legacy');
  });
});

describe('needs_check: cleared by a person, for exactly this content', () => {
  const unclear = () => ({
    question_text: 'Stem.', total_marks: 9,
    parts: [hide({ label: 'i', marks: 3, text: 'x' }) as P, { label: 'ii', marks: 3, text: 'Find $b$.' } as P, { label: 'iii', marks: 3, text: 'Find $c$ (ii).' } as P],
  });
  it('confirm → served; any later edit → waits again', () => {
    const row = unclear();
    expect(studentRow(row)).toBeNull();
    const ok = confirmPartChecks(row);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const confirmed = { ...row, parts: ok.parts };
    expect(ok.view.checksConfirmed).toBe(true);
    expect(ok.view.needsCheck).toBe(false);
    expect(studentRow(confirmed)).not.toBeNull();
    expect((ok.parts[0] as P).checked).toBe(viewFingerprint(row));
    expect(JSON.stringify(studentRow(confirmed))).not.toContain(viewFingerprint(row));
    // the text of a part changes afterwards: the confirmation no longer covers it
    const edited = { ...confirmed, parts: (confirmed.parts as P[]).map((p) => (p.label === 'iii' ? { ...p, text: 'Find $c$ and $d$ (ii).' } : p)) };
    expect(studentView(edited).needsCheck).toBe(true);
    expect(studentRow(edited)).toBeNull();
  });
  it('a confirm does not stand in for the "does it need it?" decision', () => {
    const row = { total_marks: 9, parts: [hide({ label: 'a', marks: 3, text: 'x' }), { label: 'b', marks: 3, text: 'Hence find $y$.' }, { label: 'c', marks: 3, text: 'z' }] };
    const r = confirmPartChecks(row);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/\(b\) need \(a\)/);
  });
  it('nothing to check → nothing to confirm, and the question is served', () => {
    const v = studentView({ total_marks: 9, parts: [hide({ label: 'a', marks: 3, text: 'x' }), { label: 'b', marks: 3, text: 'y' }, { label: 'c', marks: 3, text: 'z' }] });
    expect(v.checks).toEqual([]);
    expect(v.needsCheck).toBe(false);
  });
});

describe('FIX — the "Hence" warning looks past the next part (RI 2024 Prelim P1 Q8)', () => {
  it('(b)(iii) "Hence find tan π/12" is listed for (b)(i), though (b)(ii) sits between', () => {
    const row = ri2024Q8();
    expect(likelyDependents(row.parts, '(b)(i)')).toEqual([{ key: 'b.iii', label: '(b)(iii)', why: 'says “Hence” after (b)(i)' }]);
  });
  it('the working alone gives it away when the wording does not', () => {
    const row = ri2024Q8();
    const iii = (row.parts[1] as P).subparts![2];
    iii.text = 'Find the value of $\\tan \\frac{\\pi}{12}$.';
    expect(likelyDependents(row.parts, 'b.i')).toEqual([{ key: 'b.iii', label: '(b)(iii)', why: 'its working names (b)(i)' }]);
    iii.solution = 'Since $\\arg(z) = \\frac{11\\pi}{12}$, we get $\\tan\\frac{\\pi}{12} = 2-\\sqrt3$.';
    expect(likelyDependents(row.parts, 'b.i')).toEqual([{ key: 'b.iii', label: '(b)(iii)', why: 'its working uses the answer to (b)(i)' }]);
  });
  it('every wording: hence, deduce, using your answer, from part', () => {
    const q = (text: string) => [{ label: 'a', text: 'x', answer: '$11$' }, { label: 'b', text: 'y' }, { label: 'c', text }];
    for (const t of ['Hence find $k$.', 'Deduce the value of $k$.', 'Using your answer, find $k$.', 'Using the result above, find $k$.', 'From part (a), find $k$.']) {
      expect(likelyDependents(q(t), 'a').map((d) => d.key), t).toEqual(['c']);
    }
    expect(likelyDependents(q('Find $k$.'), 'a')).toEqual([]);
  });
  it('same level or deeper, anywhere after; a shallower part only straight after', () => {
    const parts = [
      { label: 'a', subparts: [{ label: 'i', text: 'x' }, { label: 'ii', text: 'y' }] },
      { label: 'b', text: 'Hence find $p$.' },
      { label: 'c', text: 'Hence find $q$.', subparts: [{ label: 'i', text: 'Hence find $r$.' }] },
    ];
    expect(likelyDependents(parts, 'a.ii').map((d) => d.key)).toEqual(['b', 'c.i']);   // (b) is straight after; (c) is shallower and later; (c)(i) is as deep
    expect(likelyDependents(parts, 'a').map((d) => d.key)).toEqual(['b', 'c', 'c.i']);
  });
  it('the door will not serve a question whose listed part is undecided — the real row', () => {
    const row = ri2024Q8();
    hide((row.parts[1] as P).subparts![0], 'argument of a quotient');
    const v = studentView(row);
    expect(v.dependents.map((d) => `${d.label} on ${d.onLabel}`)).toEqual(['(b)(iii) on (b)(i)']);
    expect(v.needsCheck).toBe(true);
    expect(studentRow(row, { assigned: true })).toBeNull();
    const decided = applyPartMark(row, { part: '(b)(iii)', needs: ['(b)(i)'] });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.view.needsCheck).toBe(false);
    expect(decided.view.marks).toBe(6);
    // (b)(ii) is the only sub-part left: it is "(b)" now
    expect(labelsOf(decided.view.row.parts)).toEqual(['a', 'b']);
    expect(decided.view.row.answer).toBe('(a) $w = 1 + 3i$ and $w = 1 - i$; (b) $z = \\frac{-1 - \\sqrt{3}}{2} + \\frac{\\sqrt{3} - 1}{2}i$');
  });
});

describe('FIX — the answer line that vanished (ASRJC 2023 Prelim P1 Q9)', () => {
  it('"(bi) (bii) (biii)" is understood: only (a) hidden, and the line is back', () => {
    const v = studentView(standAlone(asrjc2023Q9Marked()));
    expect(v.notes).not.toContain('answer_withheld');
    expect(v.row.answer).toBe('(i) $i\\cot\\dfrac{\\theta}{2}$ (ii) shown (iii) $\\tan\\dfrac{\\pi}{8}=\\sqrt{2}-1$');
    expect(v.row.answer).not.toContain('7\\pi');
    expect(v.marks).toBe(8);
    expect(v.servable).toBe(true);
  });
  it('the fallback tolerates a "show that" part with no answer of its own', () => {
    const row = asrjc2023Q9Marked();
    row.answer = 'see the working';                    // cannot be split → built from the parts' own answers
    const v = studentView(standAlone(row));
    expect(v.row.answer).toBe('(i) $k = i$; (iii) $\\sqrt{2} - 1$');
    expect(v.notes).not.toContain('answer_withheld');
  });
  it('a part with no answer that is NOT a "show that" still fails the fallback', () => {
    const row = { total_marks: 9, answer: 'x and y', parts: [hide({ label: 'a', marks: 3, text: 'x', answer: '1' }), { label: 'b', marks: 3, text: 'Find $y$.' }, { label: 'c', marks: 3, text: 'Find $z$.', answer: '3' }] };
    const v = studentView(row);
    expect(v.row.answer).toBeNull();
    expect(v.notes).toContain('answer_withheld');
  });
  it('every label spelling surveyed on the live bank (9 Oct 2026)', () => {
    const leaves = (hidden: string) => ['a', 'b.i', 'b.ii', 'c'].map((key) => ({ key, tokens: key.split('.'), hidden: key === hidden }));
    const want = '(a) 1; (b)(ii) 3; (c) 4';
    for (const line of [
      '(a) 1; (b)(i) 2; (b)(ii) 3; (c) 4',
      '(a) 1; (bi) 2; (bii) 3; (c) 4',
      '(a) 1; b(i) 2; b(ii) 3; (c) 4',
      '(a) 1; bi) 2; bii) 3; (c) 4',
      '(a) 1; (b) (i) 2; (b) (ii) 3; (c) 4',
      '(a) 1; (b)(i) 2; (ii) 3; (c) 4',
      'a) 1; b)(i) 2; b)(ii) 3; c) 4',
    ]) expect(dropHiddenSegments(line, leaves('b.i')), line).toBe(want);
    expect(dropHiddenSegments('Part (a): 1; Part (b)(i): 2; Part (b)(ii): 3; Part (c): 4', leaves('b.i'))).toBe('Part (a): 1; Part (b)(ii): 3; Part (c): 4');
    expect(dropHiddenSegments('(a) 1\n(b)(i) 2\n(b)(ii) 3\n(c) 4', leaves('b.ii'))).toBe('(a) 1\n(b)(i) 2\n(c) 4');
    expect(dropHiddenSegments('**(a)** 1 **(b)(i)** 2 **(b)(ii)** 3 **(c)** 4', leaves('c'))).toBe('**(a)** 1 **(b)(i)** 2 **(b)(ii)** 3');
    const num = ['1', '2', '3'].map((key) => ({ key, tokens: [key], hidden: key === '2' }));
    expect(dropHiddenSegments('(1) x; (2) y; (3) z', num)).toBe('(1) x; (3) z');
  });
  it('a bracket inside a sentence is not a label: sin(a), f(b)', () => {
    const leaves = ['a', 'b'].map((key) => ({ key, tokens: [key], hidden: key === 'b' }));
    expect(dropHiddenSegments('(a) h = p sin(b) + q; (b) 2', leaves)).toBe('(a) h = p sin(b) + q');
  });
  it('a "show that" part left out of the line does not fail it — any other gap still does', () => {
    const leaves = [{ key: 'a', tokens: ['a'], hidden: false, optional: true }, { key: 'b', tokens: ['b'], hidden: true }, { key: 'c', tokens: ['c'], hidden: false }];
    expect(dropHiddenSegments('(b) 2; (c) 3', leaves)).toBe('(c) 3');
    expect(dropHiddenSegments('(b) 2; (c) 3', leaves.map((l) => ({ ...l, optional: false })))).toBeNull();
  });
  it('a hidden part\'s own answer riding inside a neighbour\'s share withholds the line', () => {
    const row = {
      total_marks: 9, answer: '(a) $x = 2$ and $w = 5e^{i\\pi/7}$; (c) 4',
      parts: [{ label: 'a', marks: 5, text: 'Find $x$.', answer: '$x = 2$' }, hide({ label: 'b', marks: 2, text: 'Show that $w$…', answer: '$w = 5e^{i\\pi/7}$' }), { label: 'c', marks: 2, text: 'Find $t$.', answer: '4' }],
    };
    // "(b)" is a show-that part missing from the line, so the split goes through — but its answer is sitting in (a)'s share
    expect(studentView(row).row.answer).toBe('(a) $x = 2$; (b) 4');
  });
});

describe('threshold stays', () => {
  it('fewer than 3 marks, or under half → not served; re-lettering changes neither', () => {
    const q = (marks: number[], out: number[]) => ({ total_marks: marks.reduce((a, b) => a + b, 0), parts: marks.map((m, i) => (out.includes(i) ? hide({ label: 'abcdef'[i], marks: m, text: 'x' }) : { label: 'abcdef'[i], marks: m, text: 'x' })) });
    expect(studentView(q([4, 3, 3], [0])).servable).toBe(true);        // 6 of 10
    expect(studentView(q([6, 2, 2], [0])).servable).toBe(false);       // 4 of 10
    expect(studentView(q([6, 2, 2], [0])).enoughLeft).toBe(false);
    expect(studentView(q([2, 1, 1], [0])).servable).toBe(false);       // 2 marks
    expect(studentView(q([5, 5], [0])).servable).toBe(true);           // exactly half
  });
});
