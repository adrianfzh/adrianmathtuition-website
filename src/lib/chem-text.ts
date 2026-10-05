// Chemical formulae read as chemistry (5 Oct 2026, the readability rule): a worked solution
// stored as plain text writes "I2", "H2SO4", "Mr of I2 = 2 x 127". This sets the digits of a
// formula as subscripts (I₂, H₂SO₄) and a times sign between numbers (2 × 127), outside
// $…$ maths and code. Only real element symbols are touched, a lone "1" is never a
// subscript (so mark codes like B1 / M1 / A1 stay), and a charge ("Fe2+", "SO4 2-") keeps
// its digit. Pure, tested; applied to science solutions by the practice solution route.

const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
  + 'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pt Au Hg Tl Pb Bi Po At Rn Fr Ra U').split(' '));
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻' };
const sub = (d: string) => [...d].map(c => SUB[c]).join('');
const sup = (d: string) => [...d].map(c => SUP[c] ?? c).join('');
const isElements = (t: string) => { const p = t.match(/[A-Z][a-z]?\d*/g); return !!p && p.join('') === t && p.every(x => ELEMENTS.has(x.replace(/\d+$/, ''))); };

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
    // simple ions: Fe2+ → Fe²⁺, Al3+ → Al³⁺, Na+ → Na⁺, Cl- → Cl⁻ (an element, then the charge, then a break)
    .replace(/(^|[\s(,;:])([A-Z][a-z]?)([1-4]?)([+\-−])(?=[\s,.;:)]|$)/g, (m, pre: string, el: string, n: string, sign: string) =>
      ELEMENTS.has(el) && !(n === '' && /^[A-D]$/.test(el)) ? `${pre}${el}${sup(n + sign)}` : m)
    // (NH4)2SO4 → (NH₄)₂SO₄: the group's count after a bracket of element symbols
    .replace(/\(((?:[A-Z][a-z]?\d*){1,6})\)(\d+)/g, (m, inner: string, n: string) => isElements(inner) ? `(${inner})${sub(n)}` : m)
    .replace(/(^|[^A-Za-z_/.\-])((?:[A-Z][a-z]?\d*){1,8})(?![A-Za-z0-9+\-−^]|\s?\d?[+\-−](?:\s|$|[.,;)]))/g, (m, pre: string, tok: string) =>
      isFormula(tok) ? pre + tok.replace(/\d+/g, sub) : m)
    // units and powers: cm3 → cm³, m/s2 → m/s², s-1 → s⁻¹, 10^-3 → 10⁻³
    .replace(/\b(mm|cm|dm|km|m)([23])\b/g, (_m, u: string, n: string) => u + sup(n))
    .replace(/(\/\s?s)2\b/g, '$1²')
    .replace(/\b(m|cm|dm|s|kg|g|mol|J|N|K)\s?[-−]([1-3])\b/g, (_m, u: string, n: string) => `${u}${sup('-' + n)}`)
    .replace(/\b10\^\{?([-−]?\d+)\}?/g, (_m, n: string) => `10${sup(n)}`)
    .replace(/(\d)\s+[x×]\s+(\d)/g, '$1 × $2');
}

/** Tidy chemistry text outside $…$ / $$…$$ maths and `code`. */
export function tidyChemText(text: string): string {
  if (!text) return text;
  return text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|`[^`]*`|<[^>]+>|\]\([^)]*\)|\{\{IMG:[^}]*\}\})/).map((seg, i) => (i % 2 ? seg : tidyPlain(seg))).join('');
}
