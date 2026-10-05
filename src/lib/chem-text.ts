// Chemical formulae read as chemistry (5 Oct 2026, the readability rule): a worked solution
// stored as plain text writes "I2", "H2SO4", "Mr of I2 = 2 x 127". This sets the digits of a
// formula as subscripts (I₂, H₂SO₄) and a times sign between numbers (2 × 127), outside
// $…$ maths and code. Only real element symbols are touched, a lone "1" is never a
// subscript (so mark codes like B1 / M1 / A1 stay), and a charge ("Fe2+", "SO4 2-") keeps
// its digit. Pure, tested; applied to science solutions by the practice solution route.

const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
  + 'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pt Au Hg Tl Pb Bi Po At Rn Fr Ra U').split(' '));
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

function isFormula(tok: string): boolean {
  if (!/\d/.test(tok)) return false;
  const parts = tok.match(/[A-Z][a-z]?\d*/g);
  if (!parts || parts.join('') !== tok) return false;
  if (!parts.every(p => ELEMENTS.has(p.replace(/\d+$/, '')))) return false;
  // a single symbol with "1" (B1, P1) is a mark code or a label, never a formula
  if (parts.length === 1 && /^[A-Z][a-z]?1$/.test(tok)) return false;
  // P1 / P2 / P3 are paper numbers far more often than phosphorus
  if (/^P[1-3]$/.test(tok)) return false;
  return true;
}

function tidyPlain(t: string): string {
  return t
    .replace(/(^|[^A-Za-z0-9_/.\-])((?:[A-Z][a-z]?\d*){1,8})(?![A-Za-z0-9+\-−^]|\s?\d?[+\-−](?:\s|$|[.,;)]))/g, (m, pre: string, tok: string) =>
      isFormula(tok) ? pre + tok.replace(/\d+/g, d => [...d].map(c => SUB[c]).join('')) : m)
    .replace(/(\d)\s+[x×]\s+(\d)/g, '$1 × $2');
}

/** Tidy chemistry text outside $…$ / $$…$$ maths and `code`. */
export function tidyChemText(text: string): string {
  if (!text) return text;
  return text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|`[^`]*`|<[^>]+>|\]\([^)]*\))/).map((seg, i) => (i % 2 ? seg : tidyPlain(seg))).join('');
}
