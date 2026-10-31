// 🧮 "How to use your calculator" — the card a clip opens when the voice reads values off the
// calculator (Adrian, 1 Nov 2026: when the narrator says "⁷C₂ is 21, 2⁵ is 32" … "highlight the
// words and put a side note use calculator to calculate and a popup that students can click: how
// to use a calculator"). A beat carries `calc: [...]` naming the key presses it used; the card lists
// those, one idea a line. Keys are the school calculator's (Casio fx-97SG X / fx-96SG PLUS).

export type CalcKey = 'ncr' | 'power' | 'negative' | 'fraction' | 'term' | 'exact';
export const CALC_KEYS: readonly CalcKey[] = ['ncr', 'power', 'negative', 'fraction', 'term', 'exact'];

export type CalcHelp = { title: string; lines: string[] };

const HELP: Record<CalcKey, CalcHelp> = {
  ncr: {
    title: '$^7C_2$ (n C r)',
    lines: [
      'Press **7**.',
      'Press **SHIFT**, then **÷** (the key with nCr above it).',
      'Press **2**, then **=**.',
      'You get **21**.',
    ],
  },
  power: {
    title: '$2^5$ (a power)',
    lines: [
      'Press **2**.',
      'Press the power key **$x^{\\blacksquare}$**.',
      'Press **5**, then **=**.',
      'You get **32**.',
    ],
  },
  negative: {
    title: '$(-3)^4$ (a negative number to a power)',
    lines: [
      'Open a bracket **(** first.',
      'Press **(−)**, then **3**, then close the bracket **)**.',
      'Press **$x^{\\blacksquare}$**, then **4**, then **=**.',
      'You get **81**.',
      'Without the bracket the calculator gives **−81** — always bracket a negative.',
    ],
  },
  fraction: {
    title: '$\\left(-\\tfrac12\\right)^3$ (a fraction to a power)',
    lines: [
      'Open a bracket **(**, press **(−)**.',
      'Press the fraction key **$\\tfrac{\\blacksquare}{\\square}$**, type **1**, press **↓**, type **2**.',
      'Press **→** to leave the fraction, then close the bracket **)**.',
      'Press **$x^{\\blacksquare}$**, then **3**, then **=**.',
      'You get **$-\\tfrac18$**.',
    ],
  },
  term: {
    title: 'A whole term in one go',
    lines: [
      'Type the term as one line, e.g. $^6C_2 \\times 2^4 \\times \\left(-\\tfrac32\\right)^2$.',
      'Use **×** between the pieces and a bracket round every negative or fraction.',
      'Press **=** once at the end.',
      'You get **540**.',
    ],
  },
  exact: {
    title: 'Fraction or decimal',
    lines: [
      'The calculator shows a fraction when it can.',
      'Press **S⇔D** to switch between the fraction and the decimal.',
      'Leave an exact answer as the fraction.',
    ],
  },
};

/** The help cards for these keys, in the order given, each once; unknown keys are skipped. */
export function calcHelp(keys: readonly string[] | undefined): CalcHelp[] {
  const seen = new Set<string>();
  const out: CalcHelp[] = [];
  for (const k of keys ?? []) {
    if (seen.has(k) || !(CALC_KEYS as readonly string[]).includes(k)) continue;
    seen.add(k);
    out.push(HELP[k as CalcKey]);
  }
  return out;
}
