// The qualitative-analysis page as PICTURES (3 Oct 2026, Adrian: "do a page
// that helps student remember instead — with diagrams arrows all that stuff").
// The same SEAB 6092 table as lib/qa-cards.ts, but as structure a drawing can
// read: which colour the precipitate is, whether it dissolves in excess, what
// the solution looks like. `reactionWords` turns a row back into the scheme's
// wording — the test pins it to QA_CARDS, so the picture and the words a
// marking point wants can never drift apart. Pure.

export type PptColour = 'white' | 'light blue' | 'green' | 'red-brown' | 'yellow';

/** What one reagent does to one cation. */
export type Reaction =
  | { kind: 'ppt'; colour: PptColour; excess: 'soluble' | 'insoluble'; solution?: 'colourless' | 'dark blue' }
  | { kind: 'slight' }      // no precipitate, or a very slight white one
  | { kind: 'ammonia' };    // no precipitate; ammonia on warming

export interface CationRow {
  key: string;
  ion: string;
  name: string;
  naoh: Reaction;
  nh3: Reaction | null;
  /** One short line that makes this ion stick. */
  hook: string;
}

const ppt = (colour: PptColour, excess: 'soluble' | 'insoluble', solution?: 'colourless' | 'dark blue'): Reaction =>
  ({ kind: 'ppt', colour, excess, ...(solution ? { solution } : {}) });

export const CATION_ROWS: readonly CationRow[] = [
  { key: 'al', ion: 'Al³⁺', name: 'aluminium', naoh: ppt('white', 'soluble', 'colourless'), nh3: ppt('white', 'insoluble'),
    hook: 'Dissolves in excess NaOH only.' },
  { key: 'nh4', ion: 'NH₄⁺', name: 'ammonium', naoh: { kind: 'ammonia' }, nh3: null,
    hook: 'No precipitate. Warm it — the gas turns damp red litmus blue.' },
  { key: 'ca', ion: 'Ca²⁺', name: 'calcium', naoh: ppt('white', 'insoluble'), nh3: { kind: 'slight' },
    hook: 'White with NaOH, stays. Almost nothing with ammonia.' },
  { key: 'cu', ion: 'Cu²⁺', name: 'copper(II)', naoh: ppt('light blue', 'insoluble'), nh3: ppt('light blue', 'soluble', 'dark blue'),
    hook: 'Blue. Excess ammonia gives a dark blue solution.' },
  { key: 'fe2', ion: 'Fe²⁺', name: 'iron(II)', naoh: ppt('green', 'insoluble'), nh3: ppt('green', 'insoluble'),
    hook: 'Green, and it stays.' },
  { key: 'fe3', ion: 'Fe³⁺', name: 'iron(III)', naoh: ppt('red-brown', 'insoluble'), nh3: ppt('red-brown', 'insoluble'),
    hook: 'Red-brown, and it stays.' },
  { key: 'zn', ion: 'Zn²⁺', name: 'zinc', naoh: ppt('white', 'soluble', 'colourless'), nh3: ppt('white', 'soluble', 'colourless'),
    hook: 'Dissolves in excess of both.' },
];

/** The scheme's own wording for a reaction — must equal the QA_CARDS result (tested). */
export function reactionWords(r: Reaction): string {
  if (r.kind === 'ammonia') return 'ammonia produced on warming';
  if (r.kind === 'slight') return 'no precipitate, or a very slight white precipitate';
  if (r.excess === 'insoluble') return `${r.colour} precipitate, insoluble in excess`;
  return `${r.colour} precipitate, soluble in excess giving a ${r.solution ?? 'colourless'} solution`;
}

/** The picture a result is drawn as. */
export type ResultPicture =
  | { kind: 'ppt'; colour: PptColour }
  | { kind: 'bubbles' }                 // effervescence
  | { kind: 'litmus'; from: 'red' | 'blue'; to: 'blue' | 'white' }
  | { kind: 'splint'; lit: 'pop' | 'relights' }
  | { kind: 'decolourise' };            // purple → colourless

export interface TestRow {
  /** The QA_CARDS id this row draws — the words come from that card. */
  id: string;
  symbol: string;
  name: string;
  /** The reagent steps, in order — one arrow each. */
  steps: string[];
  picture: ResultPicture;
  /** Short words under the picture. */
  see: string;
}

export const ANION_ROWS: readonly TestRow[] = [
  { id: 'anion:co3', symbol: 'CO₃²⁻', name: 'carbonate', steps: ['dilute acid'], picture: { kind: 'bubbles' }, see: 'effervescence — CO₂ turns limewater milky' },
  { id: 'anion:cl', symbol: 'Cl⁻', name: 'chloride', steps: ['dilute HNO₃', 'AgNO₃(aq)'], picture: { kind: 'ppt', colour: 'white' }, see: 'white precipitate' },
  { id: 'anion:i', symbol: 'I⁻', name: 'iodide', steps: ['dilute HNO₃', 'AgNO₃(aq)'], picture: { kind: 'ppt', colour: 'yellow' }, see: 'yellow precipitate' },
  { id: 'anion:so4', symbol: 'SO₄²⁻', name: 'sulfate', steps: ['dilute HNO₃', 'Ba(NO₃)₂(aq)'], picture: { kind: 'ppt', colour: 'white' }, see: 'white precipitate' },
  { id: 'anion:no3', symbol: 'NO₃⁻', name: 'nitrate', steps: ['NaOH(aq)', 'Al foil, warm'], picture: { kind: 'litmus', from: 'red', to: 'blue' }, see: 'ammonia produced — damp red litmus turns blue' },
];

export const GAS_ROWS: readonly TestRow[] = [
  { id: 'gas:h2', symbol: 'H₂', name: 'hydrogen', steps: ['lighted splint'], picture: { kind: 'splint', lit: 'pop' }, see: '"pops"' },
  { id: 'gas:o2', symbol: 'O₂', name: 'oxygen', steps: ['glowing splint'], picture: { kind: 'splint', lit: 'relights' }, see: 'relights' },
  { id: 'gas:co2', symbol: 'CO₂', name: 'carbon dioxide', steps: ['limewater'], picture: { kind: 'ppt', colour: 'white' }, see: 'white precipitate' },
  { id: 'gas:nh3', symbol: 'NH₃', name: 'ammonia', steps: ['damp red litmus'], picture: { kind: 'litmus', from: 'red', to: 'blue' }, see: 'turns blue' },
  { id: 'gas:cl2', symbol: 'Cl₂', name: 'chlorine', steps: ['damp litmus'], picture: { kind: 'litmus', from: 'blue', to: 'white' }, see: 'bleached' },
  { id: 'gas:so2', symbol: 'SO₂', name: 'sulfur dioxide', steps: ['acidified KMnO₄(aq)'], picture: { kind: 'decolourise' }, see: 'purple to colourless' },
];

/** The colours the page paints with — one place, so a tube and its legend agree. */
export const PPT_FILL: Record<PptColour, string> = {
  white: '#ffffff', 'light blue': '#8fd0f5', green: '#7fae7a', 'red-brown': '#9c4a2b', yellow: '#f3d84a',
};
export const SOLUTION_FILL = { clear: '#e6eef5', colourless: '#e6eef5', 'dark blue': '#2742b8', purple: '#8a2f9c' } as const;
