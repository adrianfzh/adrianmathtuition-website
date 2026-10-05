import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildElementCheckPrompt, checkMethodChoice, checklistLine, closestPiece, drillOrder, h2ToolVisible, idsForModel,
  isJcLevel, matchElement, mergeChecklist, normaliseAnswer, parseElementCheckReply, ruleCheck, seededOrder,
  toMethodDrill, toStatsItem,
} from './h2-tools';

const DEMO = 'recDEMO';

describe('who sees the H2 tools', () => {
  it('JC levels', () => {
    expect(isJcLevel('JC1')).toBe(true);
    expect(isJcLevel('jc2')).toBe(true);
    expect(isJcLevel('JC')).toBe(true);
    expect(isJcLevel('Sec 4')).toBe(false);
    expect(isJcLevel(null)).toBe(false);
  });
  it('closed switch: admin and the preview student only', () => {
    const base = { open: false, previewIdentities: [DEMO] };
    expect(h2ToolVisible({ ...base, isAdmin: true })).toBe(true);
    expect(h2ToolVisible({ ...base, isAdmin: false, identity: DEMO, level: 'Sec 3' })).toBe(true);
    expect(h2ToolVisible({ ...base, isAdmin: false, identity: 'recX', level: 'JC2' })).toBe(false);
  });
  it('open switch: JC students only', () => {
    const base = { open: true, isAdmin: false, previewIdentities: [DEMO] };
    expect(h2ToolVisible({ ...base, identity: 'recX', level: 'JC1' })).toBe(true);
    expect(h2ToolVisible({ ...base, identity: 'recY', level: 'Sec 4' })).toBe(false);
  });
});

describe('method drills', () => {
  const row = { id: 'd1', area: 'integration', skill: 'by-parts', stem: 'Find $\\int x e^x dx$.', options: ['Sub', 'Parts', 'PF'], answer: 1, why: 'w', trap: 0, trap_why: 't' };
  it('reads a good row', () => {
    const d = toMethodDrill(row)!;
    expect(d.options).toHaveLength(3);
    expect(d.ask).toBeNull();
    expect(d.trap).toBe(0);
  });
  it('refuses a malformed row', () => {
    expect(toMethodDrill({ ...row, answer: 3 })).toBeNull();
    expect(toMethodDrill({ ...row, options: ['a', 'b'] })).toBeNull();
    expect(toMethodDrill({ ...row, area: 'algebra' })).toBeNull();
    expect(toMethodDrill({ ...row, options: ['a', '', 'c'] })).toBeNull();
  });
  it('drops a trap equal to the answer', () => {
    expect(toMethodDrill({ ...row, trap: 1 })!.trap).toBeNull();
  });
  it('checks a choice and names the trap', () => {
    const d = toMethodDrill(row)!;
    expect(checkMethodChoice(d, 1)).toMatchObject({ correct: true, choseTrap: false });
    expect(checkMethodChoice(d, 0)).toMatchObject({ correct: false, choseTrap: true, answer: 1 });
    expect(checkMethodChoice(d, 2)).toMatchObject({ correct: false, choseTrap: false });
  });
  it('the same shuffle all day, a different one tomorrow', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(seededOrder(xs, 'a|2026-10-05')).toEqual(seededOrder(xs, 'a|2026-10-05'));
    expect(seededOrder(xs, 'a|2026-10-05')).not.toEqual(seededOrder(xs, 'a|2026-10-06'));
    expect([...seededOrder(xs, 's')].sort((a, b) => a - b)).toEqual(xs);
  });
  it('missed first, then unseen, then right', () => {
    const items = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    const order = drillOrder(items, new Map([['a', true], ['c', false]]), 'seed').map(i => i.id);
    expect(order[0]).toBe('c');
    expect(order[3]).toBe('a');
    expect(order.slice(1, 3).sort()).toEqual(['b', 'd']);
  });
});

const ITEM = toStatsItem({
  id: 's1', kind: 'conclusion',
  context: 'A bakery claims mean mass 500 g; testing whether it is less. p-value 0.0321.',
  task: 'State the conclusion at the 5% level, in context.',
  elements: [
    { id: 'decision', label: 'The decision', scheme: 'Since p-value = 0.0321 < 0.05, we reject H0', match: [['reject'], ['0.0321', 'p-value', 'p value', '< 0.05']], forbid: ['do not reject', 'not reject', 'accept h0'] },
    { id: 'evidence', label: 'Sufficient evidence, with the level', scheme: 'There is sufficient evidence at the 5% level of significance', match: [['sufficient evidence', 'enough evidence'], ['5%', '0.05']] },
    { id: 'context', label: 'The claim in context', scheme: 'to conclude that the mean mass of a loaf is less than 500 g', match: [['mean', 'average'], ['mass', 'loaf'], ['less than 500', '< 500', 'below 500']] },
  ],
  model_answer: 'Since p-value $= 0.0321 < 0.05$, we reject $\\mathrm{H_0}$.',
})!;

describe('the write-up trainer', () => {
  it('normalises symbols and LaTeX', () => {
    expect(normaliseAnswer('H₁: μ ≠ 50')).toBe('h₁: mu != 50');
    expect(normaliseAnswer('$H_1: \\mu > 50$')).toBe('h_1: mu > 50');
    expect(normaliseAnswer('$\\mu \\neq 3$  and\n\\leq')).toBe('mu != 3 and <=');
  });
  it('alternatives are normalised when the item is read', () => {
    const it2 = toStatsItem({ id: 'x', kind: 'hypotheses', context: 'c', task: 't', model_answer: 'm', elements: [{ id: 'h1', label: 'H1', scheme: 's', match: [['μ > 50']] }] })!;
    expect(it2.elements[0].match).toEqual([['mu > 50']]);
    expect(matchElement(it2.elements[0], normaliseAnswer('H1: μ > 50'))).toBe(true);
  });
  it('refuses an item with no elements or a bad kind', () => {
    expect(toStatsItem({ id: 'x', kind: 'essay', context: 'c', task: 't', model_answer: 'm', elements: [] })).toBeNull();
    expect(toStatsItem({ id: 'x', kind: 'tail', context: 'c', task: 't', model_answer: 'm', elements: [] })).toBeNull();
  });
  it('a full answer passes on the rule alone', () => {
    const ans = 'Since the p-value 0.0321 < 0.05, we reject H0. There is sufficient evidence at the 5% level to conclude that the mean mass of a loaf is less than 500 g.';
    const rule = ruleCheck(ITEM, ans);
    expect([...rule.values()].every(Boolean)).toBe(true);
    expect(idsForModel(ITEM, ans, rule)).toEqual([]);
    const res = mergeChecklist(ITEM, ans, rule, null);
    expect(res.every(r => r.ok && r.how === 'rule')).toBe(true);
    expect(checklistLine(res)).toBe('All 3 points there');
  });
  it('a forbid word fails the element and is not sent to the model', () => {
    const ans = 'We do not reject H0 since p value is 0.0321.';
    const rule = ruleCheck(ITEM, ans);
    expect(rule.get('decision')).toBe(false);
    expect(idsForModel(ITEM, ans, rule)).not.toContain('decision');
    const res = mergeChecklist(ITEM, ans, rule, [{ id: 'decision', ok: true, quote: 'x' }]);
    expect(res.find(r => r.id === 'decision')!.ok).toBe(false);
  });
  it('the model fills what the rule missed; the rule\'s ✓ stands', () => {
    const ans = 'p = 0.0321 is below 0.05 so we reject H0.\nThe bakery\'s loaves are lighter on average than claimed.';
    const rule = ruleCheck(ITEM, ans);
    expect(rule.get('decision')).toBe(true);
    const ids = idsForModel(ITEM, ans, rule);
    expect(ids).toEqual(['evidence', 'context']);
    const res = mergeChecklist(ITEM, ans, rule, [
      { id: 'evidence', ok: false, quote: null },
      { id: 'context', ok: true, quote: "The bakery's loaves are lighter on average than claimed." },
      { id: 'decision', ok: false, quote: null },
    ]);
    expect(res.map(r => [r.id, r.ok, r.how])).toEqual([['decision', true, 'rule'], ['evidence', false, 'model'], ['context', true, 'model']]);
    expect(checklistLine(res)).toBe('2 of 3 points there');
  });
  it('no model (cap reached): missed elements are ✗ with how=none', () => {
    const res = mergeChecklist(ITEM, 'reject H0', ruleCheck(ITEM, 'reject H0'), null);
    expect(res.filter(r => !r.ok).every(r => r.how === 'none')).toBe(true);
  });
  it('"you wrote" picks the closest line, or null', () => {
    const ans = 'We reject H0.\nThe mean mass of loaves is less than 500 g.';
    expect(closestPiece(ans, 'the mean mass of a loaf is less than 500 g')).toBe('The mean mass of loaves is less than 500 g.');
    expect(closestPiece('Hello there.', 'sufficient evidence')).toBeNull();
  });
  it('prompt lists only the asked elements; the reply is parsed and filtered', () => {
    const p = buildElementCheckPrompt(ITEM, 'ans', ['context']);
    expect(p).toContain('id "context"');
    expect(p).not.toContain('id "decision"');
    expect(parseElementCheckReply('Sure: {"elements":[{"id":"context","ok":true,"quote":"q"},{"id":"zzz","ok":true}]}', ['context']))
      .toEqual([{ id: 'context', ok: true, quote: 'q' }]);
    expect(parseElementCheckReply('nope', ['context'])).toBeNull();
    expect(parseElementCheckReply('{"elements":[{"id":"context","ok":"yes"}]}', ['context'])).toBeNull();
  });
});

// The committed write-up items: each carries a passing and a failing typed answer;
// the rule must give exactly the verdicts the examiner check pinned (SPEC-H2-TOOLS.md).
describe('data/h2-tools/stats-writeups.json through the rule', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'h2-tools', 'stats-writeups.json'), 'utf8')) as Record<string, unknown>[];
  it('every item reads', () => {
    expect(raw.length).toBeGreaterThanOrEqual(30);
    for (const r of raw) expect(toStatsItem({ id: 'x', ...r })).not.toBeNull();
  });
  for (const [k, r] of raw.entries()) {
    const t = r.tests as { pass: string; fail: string; fail_misses: string[] } | undefined;
    if (!t) continue;
    it(`item ${k} (${String(r.kind)}): pass hits all, fail misses exactly ${t.fail_misses.join(', ')}`, () => {
      const item = toStatsItem({ id: 'x', ...r })!;
      expect([...ruleCheck(item, t.pass).values()].every(Boolean)).toBe(true);
      const f = ruleCheck(item, t.fail);
      expect(item.elements.filter(e => !f.get(e.id)).map(e => e.id).sort()).toEqual([...t.fail_misses].sort());
    });
  }
});

describe('data/h2-tools/method-drills.json', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'h2-tools', 'method-drills.json'), 'utf8')) as Record<string, unknown>[];
  it('every drill reads, each area has items, no stem twice', () => {
    for (const r of raw) expect(toMethodDrill({ id: 'x', ...r })).not.toBeNull();
    for (const a of ['integration', 'vectors', 'distributions']) expect(raw.filter(r => r.area === a).length).toBeGreaterThanOrEqual(40);
    expect(new Set(raw.map(r => r.stem)).size).toBe(raw.length);
  });
});
