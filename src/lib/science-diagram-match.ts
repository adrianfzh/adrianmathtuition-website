// The science picture library (Supabase `science_diagrams`, reviewed on
// /admin/science-diagrams) matched to a question — the website twin of the bot's
// ai/science-diagram.js `pickDiagram` (6 Oct 2026). Same rules, kept in step by the
// two test files: a wrong picture is worse than none, so a picture is chosen only
// when a keyword phrase matches in full, a phrase that fits several pictures counts
// half, the best needs MIN_MATCH_SCORE and must beat the runner-up.

export interface LibraryDiagram {
  id: number | string;
  name: string;
  subject: string;
  keywords: string | null;
  image_url: string;
}

export const MIN_MATCH_SCORE = 3;

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'its', 'it', 'is', 'are', 'be', 'how', 'what', 'which', 'diagram', 'diagrams', 'labelled', 'labeled', 'label', 'labels', 'showing', 'show', 'shows', 'draw', 'drawing', 'sketch', 'simple', 'simplified', 'annotated', 'picture', 'illustration', 'image', 'figure', 'view', 'typical', 'basic', 'including', 'into', 'from', 'that', 'this', 'their', 'there', 'when', 'using', 'used', 'set', 'up', 'setup']);
const SPELL: Record<string, string> = { sulphur: 'sulfur', sulphate: 'sulfate', sulphuric: 'sulfuric', fiber: 'fibre', neuron: 'neurone', neurons: 'neurone', foetus: 'fetus', esophagus: 'oesophagus', aluminum: 'aluminium', vapor: 'vapour', color: 'colour' };

function normWord(w: string): string {
  let t = SPELL[w] || w;
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) t = t.slice(0, -1);
  return SPELL[t] || t;
}
function words(text: string | null | undefined): string[] {
  return String(text || '').toLowerCase().replace(/(\d)\.(\d)/g, '$1$2').split(/[^a-z0-9]+/)
    .filter(w => w && !STOP.has(w)).map(normWord);
}
function phrases(row: LibraryDiagram): string[][] {
  return String(row.keywords || '').toLowerCase().split(/[,;]+/).map(s => words(s)).filter(p => p.length);
}

/** Every row scored against the text, best first. Pure. */
export function scoreDiagrams<T extends LibraryDiagram>(rows: T[], text: string): { row: T; score: number }[] {
  const specWords = new Set(words(text));
  const all = rows.map(r => ({ row: r, ph: phrases(r), vocab: new Set([...words(r.name), ...phrases(r).flat()]) }));
  const df = new Map<string, number>();
  for (const { ph } of all) for (const p of ph) {
    const k = p.join(' ');
    if (!df.has(k)) df.set(k, all.filter(a => p.every(w => a.vocab.has(w))).length);
  }
  return all.map(({ row, ph }) => {
    let score = 0;
    const seen = new Set<string>();
    for (const p of ph) {
      const key = p.join(' ');
      if (seen.has(key) || !p.every(w => specWords.has(w))) continue;
      seen.add(key);
      score += p.length * ((df.get(key) || 0) > 1 ? 1 : 2);
    }
    if (score > 0) for (const w of new Set(words(row.name))) if (specWords.has(w)) score += 1;
    return { row, score };
  }).sort((a, b) => b.score - a.score);
}

/** The one picture for the text, or null when nothing is a clear match. Pure. */
export function pickDiagram<T extends LibraryDiagram>(rows: T[], text: string): T | null {
  const [best, second] = scoreDiagrams(rows, text);
  if (!best || best.score < MIN_MATCH_SCORE) return null;
  if (second && second.score === best.score) return null;
  return best.row;
}

/** Does this question ask the student to draw, label or complete a diagram? Pure. */
export function asksForDiagram(text: string | null | undefined): boolean {
  const t = String(text || '');
  return /\b(draw|sketch)\b/i.test(t) || /\blabel(?:led|ling)?\b[^.]{0,60}\b(diagram|figure|parts?|structures?)\b/i.test(t)
    || /\bcomplete\b[^.]{0,40}\b(diagram|figure|ray diagram|circuit)\b/i.test(t) || /\bon (fig\.?|figure|the diagram)\b/i.test(t);
}
