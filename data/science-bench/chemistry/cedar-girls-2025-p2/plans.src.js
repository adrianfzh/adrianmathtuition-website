// The three seeded scripts for Cedar Girls 2025 Chemistry P2 (bench §1, 24 Sep 2026).
// Each part: the student's answer, the defect code and the truth mark the scheme gives.
// Codes are SPEC-SCIENCE-BENCH §1's, plus two chemistry ones:
//   NO_STATE     — equation right but the state symbols the scheme asks for are missing
//   WRONG_ANSWER — a plainly wrong answer to a one-mark recall / choice part
// `why` states the truth rule from the scheme, readable without the answer.
const C = (a) => ({ a, d: 'CLEAN' });
const clean = {
  '1(a)': C('At the anode: 2Cl⁻(aq) → Cl₂(g) + 2e⁻\nAt the cathode: Cu²⁺(aq) + 2e⁻ → Cu(s)'),
  '1(b)(i)': C('B'), '1(b)(ii)': C('A'), '1(b)(iii)': C('C'), '1(b)(iv)': C('C'),
  '2(a)': C('TiCl₄ is a simple covalent molecule but TiO₂ has a giant covalent structure. Less energy is needed to overcome the weak intermolecular forces of attraction between TiCl₄ molecules than the large amount of energy needed to break the many strong covalent bonds in TiO₂, so TiCl₄ has a much lower melting point.'),
  '2(b)(i)': C('Titanium is reduced as its oxidation state decreases from +4 in TiCl₄ to 0 in Ti. Sodium is oxidised as its oxidation state increases from 0 in Na to +1 in NaCl.'),
  '2(b)(ii)': C('Add water to the mixture to dissolve the sodium chloride, then filter. Titanium is collected as the residue.'),
  '2(b)(iii)': C('They form coloured compounds and they can act as catalysts.'),
  '2(b)(iv)': C('HCl'),
  '2(c)': C('Fe²⁺ and TiO₃²⁻'),
  '5(a)': C('In the solid crystals the ions are held in fixed positions and cannot move. When the crystals dissolve in water the ions become mobile, so they can diffuse through the water, meet and react.'),
  '5(b)': C('Ag⁺(aq) + I⁻(aq) → AgI(s)'),
  '5(d)': C('Add aqueous sodium hydroxide and aluminium foil and warm. Test the gas with moist red litmus paper. The litmus turns blue, ammonia is given off, so nitrate ions are present.'),
  '6': C('Student A: not suitable. Insoluble barium sulfate forms a layer that coats the barium carbonate so the reaction stops.\nStudent B: suitable. Barium carbonate reacts completely with nitric acid to form soluble barium nitrate, and adding sulfuric acid precipitates insoluble barium sulfate which is filtered, washed and dried.\nStudent C: not suitable. Barium sulfate is a precipitate and neither salt is an acid or alkali, so there is no end point for methyl orange to show; titration cannot be used.'),
  '8(a)': C('Sodium chloride is a neutral salt, not an acid, so it does not react with calcium carbonate. Calcium carbonate only reacts with acids.'),
  '8(b)(i)': C('Burning coke is exothermic. The energy given out is used for the decomposition of calcium carbonate, which is endothermic.'),
  '8(b)(ii)': C('2 moles. The burning of coke gives out 393 kJ, which is about twice the 178 kJ needed to decompose one mole of calcium carbonate.'),
  '8(b)(iii)': C('Stage 5'),
  '8(b)(iv)': C('Filtration'),
  '8(b)(v)': C('The carbon dioxide made in stages 2 and 5 is used in stage 3.'),
  '8(b)(vi)': C('Ca(OH)₂ + 2NH₄Cl → 2NH₃ + 2H₂O + CaCl₂'),
  '8(c)': C('Calcium chloride'),
};
const seeds = [
  { seed: 1, grade: 'A', over: {
    '2(a)': { a: 'TiCl₄ is a simple covalent molecule but TiO₂ has a giant covalent structure. The intermolecular forces between TiCl₄ molecules are weak while the covalent bonds in TiO₂ are strong, so TiCl₄ melts at a lower temperature.', d: 'MISS_POINT', t: 2, why: 'structure mark + link mark given; the energy comparison ("less energy needed … than …") never stated → that point withheld' },
    '5(d)': { a: 'Add aqueous sodium hydroxide and aluminium foil and warm the mixture. Test the gas given off with moist red litmus paper.', d: 'MISS_POINT', t: 1, why: 'procedure point given; no observation / conclusion (litmus turns blue, ammonia) → second point withheld' },
    '8(c)': { a: 'CaCl₂', d: 'WRONG_WORD', t: 0, why: 'scheme: "reject: chemical formula of calcium chloride" — the question asks for a name' },
  } },
  { seed: 2, grade: 'C', over: {
    '1(a)': { a: '2Cl⁻ → Cl₂ + 2e⁻\nCu²⁺ + 2e⁻ → Cu', d: 'NO_STATE', t: 0, why: 'scheme: [1] per half equation WITH state symbols; none given → 0/2' },
    '1(b)(iv)': { a: 'B', d: 'WRONG_ANSWER', t: 0, why: 'answer is C' },
    '2(a)': { a: 'TiCl₄ is a simple covalent molecule but TiO₂ has a giant covalent structure. The intermolecular forces between TiCl₄ molecules are weak while the covalent bonds in TiO₂ are strong.', d: 'MISS_POINT', t: 2, why: 'structure + what is overcome/broken given; no energy comparison → 2/3' },
    '2(b)(i)': { a: 'Titanium is reduced because its oxidation state decreases. Sodium is oxidised because its oxidation state increases.', d: 'HALF_POINT', t: 0, why: '"use oxidation states": each [1] needs the states (+4 → 0, 0 → +1); direction alone → 0 each' },
    '2(b)(iii)': { a: 'They have variable oxidation states. They are good conductors of electricity.', d: 'MISS_POINT', t: 1, why: 'variable oxidation states is on the list; conducting electricity is every metal, not on the list → 1/2' },
    '5(a)': { a: 'Water dissolves the crystals so that the ions can move freely through the water and react when they meet.', d: 'MISS_POINT', t: 1, why: 'point 2 (dissolved → ions mobile) given; point 1 (ions not mobile in the solid) not stated → 1/2' },
    '6': { a: 'Student A: not suitable. Insoluble barium sulfate forms a layer on the barium carbonate so the reaction stops.\nStudent B: suitable. Barium carbonate reacts with nitric acid to give soluble barium nitrate, then sulfuric acid precipitates barium sulfate which is filtered, washed and dried.\nStudent C: not suitable.', d: 'MISS_POINT', t: 3, why: 'all three verdicts right [1] + A and B explained [2]; C has no reason → 3/4' },
    '8(b)(ii)': { a: '1 mole', d: 'WRONG_ANSWER', t: 0, why: 'answer is 2 (393 ≈ 2 × 178)' },
  } },
  { seed: 3, grade: 'E', over: {
    '1(a)': { a: 'Cl⁻(aq) → Cl₂(g) + e⁻\nCu²⁺(aq) + 2e⁻ → Cu(s)', d: 'WRONG_FORMULA', t: 1, why: 'chlorine half equation unbalanced → 0 for it; copper half equation correct with state symbols → 1' },
    '1(b)(ii)': { a: 'B', d: 'WRONG_ANSWER', t: 0, why: 'answer is A' },
    '1(b)(iii)': { a: '', d: 'BLANK', t: 0, why: 'not attempted' },
    '1(b)(iv)': { a: 'A', d: 'WRONG_ANSWER', t: 0, why: 'answer is C' },
    '2(a)': { a: 'TiO₂ has stronger bonds so it has a higher melting point than TiCl₄.', d: 'HALF_POINT', t: 0, why: 'no structure named, no energy comparison, "stronger bonds" does not say which forces are overcome in TiCl₄ → 0/3' },
    '2(b)(i)': { a: 'The oxidation state of titanium decreases from +4 in TiCl₄ to 0 in Ti so titanium is reduced.', d: 'MISS_POINT', t: 1, why: 'Ti point given with states; sodium never mentioned → 1/2' },
    '2(b)(ii)': { a: '', d: 'BLANK', t: 0, why: 'not attempted' },
    '2(b)(iv)': { a: 'Cl₂', d: 'WRONG_ANSWER', t: 0, why: 'answer is HCl' },
    '2(c)': { a: 'Fe²⁺ and TiO₃⁻', d: 'MISS_POINT', t: 1, why: 'cation right [1]; anion charge wrong → 0 for it' },
    '5(a)': { a: 'So that the crystals can dissolve.', d: 'HALF_POINT', t: 0, why: 'dissolving alone: no ions, no mobility, neither point stated → 0/2' },
    '5(d)': { a: '', d: 'BLANK', t: 0, why: 'not attempted' },
    '6': { a: 'Student A does not work because barium sulfate is insoluble.\nStudent B works.\nStudent C does not work.', d: 'HALF_POINT', t: 1, why: 'three verdicts right [1]; A\'s reason lacks the coating / reaction stops idea, B and C unexplained → 1/4' },
    '8(a)': { a: '', d: 'BLANK', t: 0, why: 'not attempted' },
    '8(b)(i)': { a: 'To make the furnace hot.', d: 'HALF_POINT', t: 0, why: 'scheme needs exothermic burning supplying energy to the endothermic decomposition ("unpack exothermic") → 0' },
    '8(b)(iii)': { a: 'Stage 4', d: 'WRONG_ANSWER', t: 0, why: 'answer is Stage 5' },
    '8(b)(v)': { a: '', d: 'BLANK', t: 0, why: 'not attempted' },
    '8(b)(vi)': { a: 'Ca(OH)₂ + NH₄Cl → NH₃ + H₂O + CaCl₂', d: 'WRONG_FORMULA', t: 0, why: 'unbalanced → 0' },
    '8(c)': { a: 'CaCl₂', d: 'WRONG_WORD', t: 0, why: 'scheme rejects the formula; a name is asked for' },
  } },
];
module.exports = { clean, seeds };
