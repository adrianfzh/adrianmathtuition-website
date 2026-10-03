import { describe, it, expect } from 'vitest';
import { QA_CARDS } from './qa-cards';
import { ANION_ROWS, CATION_ROWS, GAS_ROWS, reactionWords } from './qa-visual';

const card = (id: string) => QA_CARDS.find(c => c.id === id);

describe('qa-visual — the pictures say what the scheme says', () => {
  it('every cation picture reads back as the QA_CARDS wording, reagent by reagent', () => {
    for (const row of CATION_ROWS) {
      expect(reactionWords(row.naoh), row.ion).toBe(card(`cation:${row.key}:naoh`)!.result);
      if (row.nh3) expect(reactionWords(row.nh3), row.ion).toBe(card(`cation:${row.key}:nh3`)!.result);
      else expect(card(`cation:${row.key}:nh3`)).toBeUndefined();
      expect(card(`cation:${row.key}:naoh`)!.subject.startsWith(row.ion)).toBe(true);
    }
    expect(CATION_ROWS).toHaveLength(7);
  });
  it('every anion and gas card is drawn exactly once, under its own symbol', () => {
    for (const [rows, group] of [[ANION_ROWS, 'anion'], [GAS_ROWS, 'gas']] as const) {
      expect(rows.map(r => r.id).sort()).toEqual(QA_CARDS.filter(c => c.group === group).map(c => c.id).sort());
      for (const r of rows) expect(card(r.id)!.subject.startsWith(r.symbol), r.id).toBe(true);
    }
  });
  it('a precipitate picture has the colour the card names; the silver and barium tests acidify first', () => {
    for (const r of [...ANION_ROWS, ...GAS_ROWS]) {
      if (r.picture.kind === 'ppt') expect(card(r.id)!.result, r.id).toContain(`${r.picture.colour} precipitate`);
    }
    for (const id of ['anion:cl', 'anion:i', 'anion:so4']) expect(ANION_ROWS.find(r => r.id === id)!.steps[0]).toBe('dilute HNO₃');
  });
  it('only zinc dissolves in excess of both; aluminium only in sodium hydroxide', () => {
    const sol = (k: string, which: 'naoh' | 'nh3') => { const r = CATION_ROWS.find(c => c.key === k)![which]; return !!r && r.kind === 'ppt' && r.excess === 'soluble'; };
    expect([sol('zn', 'naoh'), sol('zn', 'nh3')]).toEqual([true, true]);
    expect([sol('al', 'naoh'), sol('al', 'nh3')]).toEqual([true, false]);
    expect([sol('ca', 'naoh'), sol('ca', 'nh3')]).toEqual([false, false]);
  });
});
