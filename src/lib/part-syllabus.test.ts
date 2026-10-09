import { describe, it, expect } from 'vitest';
import {
  studentView, studentRow, studentRows, hasPartMarks, hiddenParts, parsePartRef, partRefLabel,
  applyPartMark, likelyDependents, partMarksBlockServing, dropHiddenSegments,
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
  const v = studentView(mark(complex(), 'b.ii'));
  const parts = v.row.parts as { label: string; marks?: number; subparts?: { label: string }[] }[];

  it('removes the part and keeps every other label as it was', () => {
    expect(parts.map((p) => p.label)).toEqual(['a', 'b']);
    expect(parts[1].subparts!.map((s) => s.label)).toEqual(['i', 'iii', 'iv']);
  });
  it('recomputes the total and the parent figure', () => {
    expect(v.originalMarks).toBe(12);
    expect(v.marks).toBe(8);
    expect(v.row.total_marks).toBe(8);
    expect(parts[1].marks).toBe(5);
  });
  it('the answer line keeps its own wording and labels, minus the hidden part', () => {
    expect(v.row.answer).toBe('(a) Other root: $1-3i$; (b)(i) $|w|=3\\sqrt2,\\ \\arg w=\\frac{3\\pi}{4}$; (b)(iii) $1$; (b)(iv) $n=8,\\ 16,\\ 24$');
    expect(v.row.answer).not.toContain('e^{i');
  });
  it('an answer line that cannot be split is rebuilt from the remaining parts\' own answers', () => {
    const row = mark(complex(), 'b.ii');
    row.answer = 'Other root $1-3i$; modulus $3\\sqrt2$; $3^n e^{i3n\\pi/4}$; $1$; $n=8,16,24$';
    expect(studentView(row).row.answer).toBe('(a) Other root: $1-3i$; (b)(i) $3\\sqrt2$, $\\frac{3\\pi}{4}$; (b)(iii) $1$; (b)(iv) $n=8,16,24$');
  });
  it('carries nothing of the hidden part in what is sent on', () => {
    const json = JSON.stringify(v.row);
    for (const s of ['exponential', 'de Moivre', 'sol_x.png', 'legacy']) expect(json).not.toContain(s);
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
    expect((v.row.parts as { label: string }[]).map((p) => p.label)).toEqual(['a']);
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
    expect((v.row.parts as unknown[]).length).toBe(1);
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
    expect((got.parts as { label: string }[]).map((p) => p.label)).toEqual(['a']);
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
    expect(studentView(row).row.answer).toBe('(ii) $\\bar{x} = 58$ kg   (iii) least $m = 60$ kg');
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
      solution: '**(a)**\n$x = 2$, from part (b) later.\n\n**(b)**\nBy de Moivre, $z^5 = 1$.\n\n**(c)**\nSo the sum is $0$.',
      parts: [{ label: 'a', marks: 4, text: 'x' }, { label: 'b', marks: 3, text: 'x', legacy: true, legacy_reason: 'de Moivre' }, { label: 'c', marks: 3, text: 'x' }],
    };
    const v = studentView(row);
    expect(v.row.solution).toBe('**(a)**\n$x = 2$, from part (b) later.\n\n**(c)**\nSo the sum is $0$.');
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
    const row = { total_marks: 8, parts: [{ label: '(A)', marks: 5, text: 'x' }, { label: 'B)', marks: 3, text: 'x', legacy: true, legacy_reason: 'r' }] };
    const v = studentView(row);
    expect(v.hidden[0].key).toBe('b');
    expect((v.row.parts as { label: string }[])[0].label).toBe('(A)');   // shown exactly as stored
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
    expect(likelyDependents(complex().parts, 'a')).toEqual([]);
  });
});

describe('hiddenParts', () => {
  it('is empty for unmarked parts', () => {
    expect(hiddenParts(complex().parts)).toEqual({ hidden: [], unknownNeeds: false });
  });
});

// ── the surfaces' shared gates and renderers, on a marked row ────────────────
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
    const row = studentRow(mark(complex(), 'b.ii'))!;
    const { parts } = questionStructured(row as never);
    expect(parts[1].subparts.map((s) => s.label)).toEqual(['i', 'iii', 'iv']);
    expect(totalMarksOf(parts)).toBe(8);
    expect(row.total_marks).toBe(8);
    expect(questionMarkdown(row as never)).not.toContain('exponential form');
  });
  it('the worked solution reveal has no hidden working, answer or picture', () => {
    const md = solutionMarkdown(studentRow(mark(complex(), 'b.ii'))! as never);
    expect(md).not.toContain('de Moivre');
    expect(md).not.toContain('sol_x.png');
    expect(md).toContain('**(b)(iii)**');
  });
  it('marking: the scheme given to the marker has no hidden part, and the total is the reduced one', () => {
    const row = studentRow(mark(complex(), 'b.ii'), { assigned: true })!;
    const scheme: string[] = [];
    collectScheme(row.parts, scheme);
    expect(scheme.join('\n')).not.toContain('de Moivre');
    expect(scheme.join('\n')).not.toMatch(/b\.ii\b/);
    expect(row.total_marks).toBe(8);
  });
  it('kiosk / worksheet sheet: the printed text and the answer line skip the hidden part', () => {
    const row = studentRow(mark(complex(), 'b.ii'))!;
    const flat = flattenParts(row.question_text, row.parts as Part[]);
    expect(flat.text).not.toContain('exponential form');
    expect(flat.answer).not.toContain('e^{i3n');
  });
  it('the worksheet picker builds its sheet from the student row', () => {
    const marked = mark(complex(), 'b.ii');
    const q = fromDetail({ id: 'q1', marks: 12, questionMd: marked.question_text, parts: marked.parts, answer: marked.answer, solution: null });
    expect(q.marks).toBe(8);
    expect(q.parts[1].subparts.map((s) => s.label)).toEqual(['i', 'iii', 'iv']);
    expect(ansLine(q)).not.toContain('e^{i');
    expect(Object.keys(q.partSolutions).some((k) => /ii$/.test(k) && !/iii$/.test(k))).toBe(false);
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
    const fine = mark(complex(), 'b.ii');
    expect(serveRefusal(gateRow(fine), student)).toBeNull();
    expect(practiceEligibility(gateRow(fine) as never).ok).toBe(true);
    const none = complex(); mark(none, 'a'); mark(none, 'b');
    expect(serveRefusal(gateRow(none), { ...student, assigned: true })).toBe('legacy');
  });
  it('a lesson check answers from the student row', () => {
    const row = gateRow({ ...mark(complex(), 'b.ii'), id: 'q1' });
    expect(usableCheckAnswer(row as never)).not.toContain('e^{i');
  });
  it('nothing marked: every one of these is byte-for-byte what it was', () => {
    const row = complex();
    expect(JSON.stringify(questionStructured(studentRow(row)! as never))).toBe(JSON.stringify(questionStructured(row as never)));
    expect(solutionMarkdown(studentRow(row)! as never)).toBe(solutionMarkdown(row as never));
    expect(serveRefusal(gateRow(row), student)).toBeNull();
  });
});
