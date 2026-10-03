// Command words for the sciences (3 Oct 2026): what each word at the start of
// a question asks for, with one worked pair, and the pattern for describing a
// graph. **bold** = what the answer must carry. Pure data.

export interface CommandWord {
  word: string;
  /** What the answer needs, one line. */
  needs: string;
  /** A short question and an answer that would score. */
  question: string;
  answer: string;
}

export const COMMAND_WORDS: readonly CommandWord[] = [
  { word: 'State', needs: 'A **short fact**. No reason.',
    question: 'State the function of the xylem.', answer: 'It transports water and mineral salts from the roots to the leaves.' },
  { word: 'Define', needs: 'The **exact meaning**, with the key words.',
    question: 'Define speed.', answer: 'Distance travelled per unit time.' },
  { word: 'Describe', needs: '**What happens**, in order. For a graph: the trend, **with values**. No reason.',
    question: 'Describe how the rate changes with temperature.', answer: 'The rate increases from 10 °C to 40 °C, then decreases to zero at 60 °C.' },
  { word: 'Explain', needs: '**Why** it happens: the cause, then **each step** to the effect. Use “because” or “so”.',
    question: 'Explain why the rate falls above 40 °C.', answer: 'The enzyme is denatured: the active site loses its shape, so the substrate no longer fits.' },
  { word: 'Suggest', needs: '**Apply what you know** to something new. One sensible idea with a reason scores.',
    question: 'Suggest why the plant on the windowsill grew taller.', answer: 'It received more light, so it photosynthesised faster and made more glucose for growth.' },
  { word: 'Compare', needs: '**Both** things in each sentence. A similarity and a difference. Use “whereas”.',
    question: 'Compare arteries and veins.', answer: 'Arteries have thick muscular walls whereas veins have thin walls. Veins have valves whereas arteries do not.' },
  { word: 'Calculate', needs: '**Formula, substitution, answer with unit**. Show the working.',
    question: 'Calculate the speed: 120 m in 8.0 s.', answer: 'speed = distance ÷ time = 120 ÷ 8.0 = 15 m/s' },
  { word: 'Deduce / Predict', needs: 'A **conclusion from the data given**, with the evidence you used.',
    question: 'Deduce which metal is more reactive.', answer: 'Metal X, because it displaced metal Y from its salt solution.' },
  { word: 'Identify / Name', needs: '**One word or name** from what is given. No sentence needed.',
    question: 'Name the gas produced.', answer: 'Hydrogen.' },
  { word: 'Outline', needs: 'The **main points only**, in order, without detail.',
    question: 'Outline how insulin is made by bacteria.', answer: 'The insulin gene is cut out, inserted into a bacterial plasmid, and the bacteria are grown to produce insulin.' },
];

/** Describing a graph: the steps, then the same graph described badly and well. */
export const GRAPH_STEPS: readonly string[] = [
  'Name both quantities: “As **temperature** increases, the **rate**…”',
  'Give the **trend**: increases, decreases, stays constant.',
  'Quote **values with units** from the graph: where it starts, where it changes, where it ends.',
  'Say **where the trend changes**: the peak, the plateau, the point it reaches zero.',
  'If the gradient changes, say so: “increases **rapidly**, then **more slowly**”.',
];

export const GRAPH_EXAMPLE = {
  weak: 'The rate goes up and then goes down.',
  strong: 'As temperature increases from 10 °C to 40 °C, the rate increases from 2 to 18 units. Above 40 °C the rate decreases rapidly, reaching zero at 60 °C.',
};

/** Describe versus explain — the pair students mix up most. */
export const DESCRIBE_VS_EXPLAIN = {
  describe: 'What you **see**. Trend and values. No “because”.',
  explain: 'The **reason**. Science ideas, step by step. Always a “because” or “so”.',
};
