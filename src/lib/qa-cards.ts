// Qualitative analysis flashcards (24 Sep 2026, the chemistry study loop —
// Adrian: "Build all three chemistry study ideas"): the SEAB O-Level Chemistry
// (6092) Notes for Qualitative Analysis as cards — the tests for cations,
// anions and gases, in the scheme's own words, so what a student recalls IS the
// wording the marking point wants. Pure: the page (/app/science/qa) renders
// these; nothing here touches the network. No switches — the drill is a small
// door on the Chemistry tab of Science Home.
//
// One card per (ion or gas, reagent). A cation has two cards — with aqueous
// sodium hydroxide and with aqueous ammonia — because the scheme asks for both
// and the pair is what tells Al³⁺ from Zn²⁺.

export type QaGroup = 'cation' | 'anion' | 'gas';

export interface QaCard {
  id: string;
  group: QaGroup;
  /** The ion or gas — "Al³⁺ (aluminium)". */
  subject: string;
  /** The reagent or procedure — "add NaOH(aq)". */
  test: string;
  /** The observation, in the scheme's words. */
  result: string;
}

export const QA_GROUP_LABEL: Record<QaGroup, string> = { cation: 'Cations', anion: 'Anions', gas: 'Gases' };

const NAOH = 'add NaOH(aq)';
const NH3 = 'add NH₃(aq)';

function cation(key: string, subject: string, naoh: string, nh3: string | null): QaCard[] {
  const out: QaCard[] = [{ id: `cation:${key}:naoh`, group: 'cation', subject, test: NAOH, result: naoh }];
  if (nh3) out.push({ id: `cation:${key}:nh3`, group: 'cation', subject, test: NH3, result: nh3 });
  return out;
}

export const QA_CARDS: readonly QaCard[] = [
  // ── Cations (aqueous sodium hydroxide · aqueous ammonia) ──────────────────
  ...cation('al', 'Al³⁺ (aluminium)',
    'white precipitate, soluble in excess giving a colourless solution',
    'white precipitate, insoluble in excess'),
  ...cation('nh4', 'NH₄⁺ (ammonium)',
    'ammonia produced on warming',
    null),
  ...cation('ca', 'Ca²⁺ (calcium)',
    'white precipitate, insoluble in excess',
    'no precipitate, or a very slight white precipitate'),
  ...cation('cu', 'Cu²⁺ (copper(II))',
    'light blue precipitate, insoluble in excess',
    'light blue precipitate, soluble in excess giving a dark blue solution'),
  ...cation('fe2', 'Fe²⁺ (iron(II))',
    'green precipitate, insoluble in excess',
    'green precipitate, insoluble in excess'),
  ...cation('fe3', 'Fe³⁺ (iron(III))',
    'red-brown precipitate, insoluble in excess',
    'red-brown precipitate, insoluble in excess'),
  ...cation('zn', 'Zn²⁺ (zinc)',
    'white precipitate, soluble in excess giving a colourless solution',
    'white precipitate, soluble in excess giving a colourless solution'),
  // ── Anions ────────────────────────────────────────────────────────────────
  { id: 'anion:co3', group: 'anion', subject: 'CO₃²⁻ (carbonate)',
    test: 'add dilute acid', result: 'effervescence; carbon dioxide produced (limewater turns milky)' },
  { id: 'anion:cl', group: 'anion', subject: 'Cl⁻ (chloride, in solution)',
    test: 'acidify with dilute nitric acid, then add AgNO₃(aq)', result: 'white precipitate' },
  { id: 'anion:i', group: 'anion', subject: 'I⁻ (iodide, in solution)',
    test: 'acidify with dilute nitric acid, then add AgNO₃(aq)', result: 'yellow precipitate' },
  { id: 'anion:no3', group: 'anion', subject: 'NO₃⁻ (nitrate, in solution)',
    test: 'add NaOH(aq), then aluminium foil; warm carefully', result: 'ammonia produced' },
  { id: 'anion:so4', group: 'anion', subject: 'SO₄²⁻ (sulfate, in solution)',
    test: 'acidify with dilute nitric acid, then add Ba(NO₃)₂(aq)', result: 'white precipitate' },
  // ── Gases ─────────────────────────────────────────────────────────────────
  { id: 'gas:nh3', group: 'gas', subject: 'NH₃ (ammonia)',
    test: 'damp red litmus paper', result: 'turns blue' },
  { id: 'gas:co2', group: 'gas', subject: 'CO₂ (carbon dioxide)',
    test: 'bubble through limewater', result: 'white precipitate forms (dissolves with excess of the gas)' },
  { id: 'gas:cl2', group: 'gas', subject: 'Cl₂ (chlorine)',
    test: 'damp litmus paper', result: 'bleached' },
  { id: 'gas:h2', group: 'gas', subject: 'H₂ (hydrogen)',
    test: 'lighted splint', result: '"pops"' },
  { id: 'gas:o2', group: 'gas', subject: 'O₂ (oxygen)',
    test: 'glowing splint', result: 'relights' },
  { id: 'gas:so2', group: 'gas', subject: 'SO₂ (sulfur dioxide)',
    test: 'acidified KMnO₄(aq)', result: 'turns from purple to colourless' },
];

/** 'forward' = the ion and the test on the front, the observation behind;
 *  'reverse' = the test and the observation on the front, the ion(s) behind. */
export type QaDirection = 'forward' | 'reverse';

export interface DeckCard {
  /** Stable across shuffles — the "known" ledger is keyed on it. */
  id: string;
  group: QaGroup;
  /** The small grey line above the front ("with NaOH(aq)"). */
  cue: string;
  front: string;
  back: string;
}

/**
 * The deck for a direction and a set of groups. In reverse, two ions with the
 * SAME observation under the SAME test become ONE card whose back names both
 * (Al³⁺ or Zn²⁺ with NaOH(aq) — the honest answer, and the reason the NH₃ card
 * exists), so a student is never marked wrong for the ambiguity the table has.
 */
export function buildDeck(cards: readonly QaCard[], direction: QaDirection, groups: readonly QaGroup[]): DeckCard[] {
  const chosen = cards.filter(c => groups.includes(c.group));
  if (direction === 'forward') {
    return chosen.map(c => ({ id: c.id, group: c.group, cue: c.test, front: c.subject, back: c.result }));
  }
  const byFront = new Map<string, DeckCard & { subjects: string[] }>();
  for (const c of chosen) {
    const key = `${c.group}|${c.test}|${c.result}`;
    const hit = byFront.get(key);
    if (hit) { hit.subjects.push(c.subject); hit.id = `${hit.id}+${c.id}`; continue; }
    byFront.set(key, { id: c.id, group: c.group, cue: c.test, front: c.result, back: '', subjects: [c.subject] });
  }
  return [...byFront.values()].map(({ subjects, ...d }) => ({ ...d, back: subjects.join(' or ') }));
}

/** A deterministic shuffle (mulberry32) so a seed replays a round; never Math.random in a test. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The round's queue: unknown cards first (the ones to learn), known ones after — or only the unknown ones. */
export function orderRound(deck: readonly DeckCard[], known: ReadonlySet<string>, onlyUnknown: boolean): DeckCard[] {
  const unknown = deck.filter(d => !known.has(d.id));
  if (onlyUnknown) return unknown;
  return [...unknown, ...deck.filter(d => known.has(d.id))];
}
