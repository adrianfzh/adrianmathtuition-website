import { describe, it, expect } from 'vitest';
import { outcomeOf, parseRecropCheck, parseRecropVerdict, planCrop, keptShare, snapOutward, toPx, recropPrompt } from './figure-recrop';

describe('reading the judge', () => {
  it('reads kept boxes, dropped boxes, furniture; an option picture is marked', () => {
    const v = parseRecropVerdict('ok: {"keep":[{"what":"v-t graph","box":[100,200,900,500]},{"what":"option A","box":[100,600,400,900],"option":true}],"drop":[[0,0,1000,150]],"school_mark":null,"furniture":["[Turn over, bottom right"],"refuse":null}');
    expect(v.keep).toHaveLength(2);
    expect(v.keep[1].option).toBe(true);
    expect(v.drop).toEqual([{ x0: 0, y0: 0, x1: 1000, y1: 150 }]);
    expect(v.furniture).toEqual(['[Turn over, bottom right']);
    expect(v.refuse).toBeNull();
  });
  it('anything unreadable is a refusal, never a guess', () => {
    expect(parseRecropVerdict('no json here').refuse).toMatch(/no JSON/);
    expect(parseRecropVerdict('{"keep": [}').refuse).toMatch(/did not parse/);
    expect(parseRecropVerdict('{"keep":[],"drop":[]}').refuse).toBe('the judge kept nothing');
    expect(parseRecropVerdict('{"keep":[{"what":"x","box":[5,5,9,9]}]}').refuse).toBe('the judge kept nothing');   // a sliver
  });
  it('a school mark is a refusal whatever else was boxed (rule 3: never scrub a mark)', () => {
    const v = parseRecropVerdict('{"keep":[{"what":"graph","box":[100,100,900,800]}],"school_mark":"footer: Anglican High 2025 / 6091/01","refuse":null}');
    expect(outcomeOf(v, { ok: true, lost: [], leftover: [], note: '' }, 0.5)).toEqual({ outcome: 'refused-school-mark', why: 'footer: Anglican High 2025 / 6091/01' });
  });
  it('the prompt carries the rules he agreed to', () => {
    const p = recropPrompt('Which graph…', 'question number 25, prose and options A–D are inside the frame');
    expect(p).toMatch(/ONLY WHEN THEY ARE PICTURES/);
    expect(p).toMatch(/school_mark/);
    expect(p).toMatch(/When in doubt .* KEEP it/);
  });
});

describe('the cut', () => {
  const K = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
  it('one drawing, text above and below → one cut', () => {
    expect(planCrop([K(50, 200, 950, 600)], [K(0, 0, 1000, 150), K(0, 650, 1000, 1000)])).toEqual({ mode: 'single', regions: [K(50, 200, 950, 600)] });
  });
  it('a graph, a sentence, then four option graphs → the sentence goes, the two blocks are stacked', () => {
    const plan = planCrop([K(100, 50, 600, 300), K(50, 450, 250, 650), K(280, 450, 480, 650), K(510, 450, 710, 650), K(740, 450, 940, 650)], [K(40, 320, 900, 420)])!;
    expect(plan.mode).toBe('stack');
    expect(plan.regions).toEqual([K(100, 50, 600, 300), K(50, 450, 940, 650)]);   // the option row stays ONE region, side by side
  });
  it('nothing dropped lies between the drawings → one cut round all of them', () => {
    expect(planCrop([K(100, 100, 400, 400), K(500, 100, 800, 400)], [K(0, 0, 1000, 60)])).toEqual({ mode: 'single', regions: [K(100, 100, 800, 400)] });
  });
  it('nothing kept → no plan', () => { expect(planCrop([], [K(0, 0, 10, 10)])).toBeNull(); });
  it('kept share: a cut that keeps almost everything is refused', () => {
    const plan = planCrop([K(5, 5, 995, 990)], [])!;
    expect(keptShare(plan, 1000, 1000)).toBeGreaterThan(0.97);
    expect(outcomeOf(parseRecropVerdict('{"keep":[{"what":"all","box":[5,5,995,990]}]}'), { ok: true, lost: [], leftover: [], note: '' }, keptShare(plan, 1000, 1000)).outcome).toBe('refused');
  });
  it('grid → pixels rounds outward', () => {
    expect(toPx({ x0: 101, y0: 101, x1: 899, y1: 899 }, 640, 480)).toEqual({ x0: 64, y0: 48, x1: 576, y1: 432 });
  });
});

describe('snapping an edge off the ink', () => {
  // 40×40 white, a black bar from x=10..29 at rows 10..29
  const w = 40, h = 40;
  const grey = new Uint8Array(w * h).fill(255);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) grey[y * w + x] = 0;
  it('a box that cuts through the bar is walked out to blank paper', () => {
    const { box, sliced } = snapOutward(grey, w, h, { x0: 14, y0: 14, x1: 26, y1: 26 }, 160, 0.5);
    expect(box).toEqual({ x0: 9, y0: 9, x1: 31, y1: 31 });
    expect(sliced).toBe(false);
  });
  it('out of reach → reported sliced, so the second look decides', () => {
    const { sliced } = snapOutward(grey, w, h, { x0: 18, y0: 18, x1: 22, y1: 22 }, 160, 0.05);
    expect(sliced).toBe(true);
  });
});

describe('the second look', () => {
  it('ok only when nothing is lost and nothing is left in', () => {
    expect(parseRecropCheck('{"ok":true,"lost":[],"leftover":[]}').ok).toBe(true);
    const c = parseRecropCheck('{"ok":true,"lost":["the unit on the y-axis is cut"],"leftover":["question number 4"]}');
    expect(c.ok).toBe(false);
    expect(c.note).toBe('lost: the unit on the y-axis is cut · still in: question number 4');
    expect(parseRecropCheck('nothing').ok).toBe(false);
  });
  it('a failed second look is never a re-crop', () => {
    const v = parseRecropVerdict('{"keep":[{"what":"graph","box":[100,100,900,800]}]}');
    expect(outcomeOf(v, parseRecropCheck('{"ok":false,"lost":["axis label"],"leftover":[]}'), 0.5).outcome).toBe('failed-check');
    expect(outcomeOf(v, null, 0.5).outcome).toBe('failed-check');
    expect(outcomeOf(v, parseRecropCheck('{"ok":true,"lost":[],"leftover":[]}'), 0.5).outcome).toBe('recrop');
  });
});

import { swapFigureRef } from './figure-recrop';

describe('pointing the question at the new picture', () => {
  const OLD = 'chem_x_2024_p1_q3_ab12cd34.png', NEW = 'chem_x_2024_p1_q3_ab12cd34__rc1.png';
  it('a bare name in image_url', () => {
    expect(swapFigureRef({ image_url: OLD }, OLD, NEW)).toEqual({ patch: { image_url: NEW }, fields: ['image_url'], count: 1 });
  });
  it('a JSON-array string, the prefix kept, other pictures untouched', () => {
    const r = swapFigureRef({ image_url: `["question_images/${OLD}","other.png"]` }, OLD, NEW);
    expect(r.patch.image_url).toBe(`["question_images/${NEW}","other.png"]`);
  });
  it('a part slot inside parts, an images array and an inline marker', () => {
    const r = swapFigureRef({ parts: [{ label: 'a', image_url: OLD }, { label: 'b', image_url: null }], images: [{ url: OLD, pos: 'top' }], question_text: `See {{IMG:${OLD}}} below.` }, OLD, NEW);
    expect(r.count).toBe(3);
    expect((r.patch.parts as { image_url: string }[])[0].image_url).toBe(NEW);
    expect((r.patch.images as { url: string }[])[0].url).toBe(NEW);
    expect(r.patch.question_text).toBe(`See {{IMG:${NEW}}} below.`);
    expect(r.fields.sort()).toEqual(['images', 'parts', 'question_text']);
  });
  it('never inside a longer name, and a second release finds nothing left to swap', () => {
    expect(swapFigureRef({ image_url: `my_${OLD}` }, OLD, NEW).count).toBe(0);
    expect(swapFigureRef({ image_url: NEW }, OLD, NEW).count).toBe(0);
  });
  it('a question that no longer points at the picture changes nothing', () => {
    expect(swapFigureRef({ image_url: 'something_else.png', parts: [] }, OLD, NEW)).toEqual({ patch: {}, fields: [], count: 0 });
  });
});

import { parseFitness, finalOf, isRecropCandidate, correctionNote } from './figure-recrop';

describe('fitness and the final word', () => {
  it('a verdict outside the vocabulary is unsure, and unsure holds the figure', () => {
    expect(parseFitness({ verdict: 'great', reason: 'x' }).verdict).toBe('unsure');
    expect(parseFitness('{"verdict":"ok","severity":"none","reason":"whole"}')).toEqual({ verdict: 'ok', severity: 'none', reason: 'whole' });
    expect(parseFitness('nonsense').verdict).toBe('unsure');
    expect(finalOf('recrop', parseFitness({ verdict: 'ok' }))).toBe('would-release');
    expect(finalOf('recrop', parseFitness({ verdict: 'mismatch' }))).toBe('held-by-fitness (mismatch)');
    expect(finalOf('recrop', null)).toBe('held-by-fitness (?)');
    expect(finalOf('refused-school-mark', null)).toBe('refused-school-mark');
  });
  it('only the flags this job is for', () => {
    expect(isRecropCandidate('figure-fitness 2026-10-04 · cosmetic · foreign · ripple tank whole; question number 25, prose and options A–D are inside the frame')).toBe(true);
    expect(isRecropCandidate('Adrian: repair · figure-fitness 2026-10-04 · cosmetic · foreign · question number in frame')).toBe(false);
    expect(isRecropCandidate('figure-fitness 2026-10-04 · blocks-answering · incomplete · the axis is cut; stem prose in frame')).toBe(false);
    expect(isRecropCandidate('figure-fitness 2026-10-04 · cosmetic · foreign · a stray label R at the edge')).toBe(false);
  });
  it('the correction names what the second look found', () => {
    const v = parseRecropVerdict('{"keep":[{"what":"graph","box":[100,100,900,800]}]}');
    expect(correctionNote(v, parseRecropCheck('{"ok":false,"lost":["x-axis title"],"leftover":[]}'))).toMatch(/lost: x-axis title/);
  });
});
