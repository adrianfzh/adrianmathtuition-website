import { describe, expect, it } from 'vitest';
import { areaOf, markerTopics, parseAskTopic, subjectKey } from './stuck-topics';

describe('subjectKey', () => {
  it('reads every spelling the sources use', () => {
    expect(subjectKey('A Math')).toBe('AM');
    expect(subjectKey('S3_AM')).toBe('AM');
    expect(subjectKey('E Math')).toBe('EM');
    expect(subjectKey('S2')).toBe('EM');
    expect(subjectKey('H2 Math')).toBe('H2');
    expect(subjectKey('JC2')).toBe('H2');
    expect(subjectKey('Chemistry')).toBe('CHEM');
    expect(subjectKey('Physics')).toBe('PHY');
    expect(subjectKey('BIO')).toBe('BIO');
    expect(subjectKey('CS_CHEM')).toBe('CHEM');
    expect(subjectKey('Science')).toBeNull();
    expect(subjectKey(null)).toBeNull();
  });
});

describe('parseAskTopic', () => {
  it('splits the bot\'s "AM: …" prefix', () => {
    expect(parseAskTopic('AM: Trigonometry (Graphs)')).toEqual({ subject: 'AM', topic: 'Trigonometry (Graphs)' });
    expect(parseAskTopic('Vectors')).toEqual({ subject: null, topic: 'Vectors' });
    // the science label the bot writes since 5 Oct 2026 (lib/ask-science-topic.js)
    expect(parseAskTopic('CHEM: Electrolysis')).toEqual({ subject: 'CHEM', topic: 'Electrolysis' });
    expect(parseAskTopic('PHY: D.C. Circuits')).toEqual({ subject: 'PHY', topic: 'D.C. Circuits' });
    expect(parseAskTopic('  ')).toBeNull();
  });
});

describe('areaOf', () => {
  it('folds a split chapter into one area', () => {
    expect(areaOf('AM', 'Trigonometry (Identities)')).toBe('Trigonometry');
    expect(areaOf('AM', 'Nature of Roots')).toBe('Quadratics');
    expect(areaOf('AM', 'Circles')).toBe('Coordinate Geometry');
    expect(areaOf('EM', 'Algebra (Fractions)')).toBe('Algebra (Fractions)');
    expect(areaOf('EM', 'Financial Math (Interest)')).toBe('Money');
    expect(areaOf('H2', 'Distributions (Normal)')).toBe('Distributions');
    expect(areaOf('H2', 'APGP')).toBe('Sequences and Series');
    expect(areaOf('CHEM', 'Electrolysis')).toBe('Electrolysis');
    expect(areaOf('CHEM', 'Ionic Bonding')).toBe('Chemical Bonding');
    expect(areaOf('CHEM', 'Alcohols and Carboxylic Acids')).toBe('Organic Chemistry');
    expect(areaOf('PHY', 'D.C. Circuits')).toBe('Electricity');
    expect(areaOf('BIO', 'Sexual Reproduction in Plants')).toBe('Reproduction');
  });
});

describe('markerTopics — the marker\'s own words', () => {
  const cases: [Parameters<typeof markerTopics>[0], string, string[]][] = [
    ['AM', 'Kinematics — differentiation', ['Kinematics']],
    ['AM', 'Differentiation — tangents and normals', ['Differentiation (Tangents and Normals)']],
    ['AM', 'Coordinate geometry — circles, tangents', ['Circles']],
    ['AM', 'Trigonometric equations — double angle and quadrants', ['Trigonometry (Equations)']],
    ['AM', 'Trigonometric identities and equations', ['Trigonometry (Identities)']],
    ['AM', 'Differentiation (increasing functions) and cubic factorisation', ['Differentiation (Increasing and Decreasing Functions)', 'Polynomials']],
    ['AM', 'Differentiation (product rule) and integration by reversal', ['Differentiation (Techniques)', 'Integration (Definite Integrals)']],
    ['AM', 'Circle geometry — alternate segment theorem, isosceles triangle proof', ['Plane Geometry']],
    ['AM', 'Partial fractions (improper algebraic fraction, irreducible quadratic factor)', ['Partial Fractions']],
    ['AM', 'Linear law (exponential)', ['Linear Law']],
    ['AM', 'Trigonometry — R-formula, maximum value', ['Trigonometry (R-Formula)']],
    ['AM', 'Quadratic functions — discriminant, curve and line not intersecting', ['Quadratic Functions']],
    ['EM', 'Compound interest', ['Financial Math (Interest)']],
    ['EM', 'Mensuration — half cylinder; similar solids', ['Mensuration']],
    ['EM', 'Money, exchange rates, percentage', ['Financial Math (Exchange Rate)', 'Numbers (Percentages)']],
    ['EM', 'Probability of combined events', ['Probability']],
    ['EM', 'Algebra: linear equations, algebraic fractions, completing the square', ['Algebra (Linear Equations)']],
    ['EM', 'HCF and LCM by prime factorisation', ['Numbers (HCF and LCM)']],
    ['EM', 'Set notation and Venn diagrams; simple probability', ['Sets', 'Probability']],
    ['EM', 'Graphs of cubic functions — solving an inequality by drawing a straight line', ['Graphs of Functions']],
    ['H2', 'Differential equations — substitution and separation of variables', ['Integration (Differential Equations)']],
    ['H2', 'Hypothesis testing: z-test on a mean using the Central Limit Theorem', ['Hypothesis Testing']],
    // science: the marker's words (real notebook_mistakes topics) → the science bank's tree topics
    ['CHEM', 'Electrolysis', ['Electrolysis']],
    ['CHEM', 'Electrochemistry (simple cells)', ['Electrolysis']],
    ['CHEM', 'Speed of reaction; Acids and bases', ['Rate of Reaction', 'Acids and Bases']],
    ['CHEM', 'Mole concept / Redox', ['Chemical Calculations', 'Oxidation and Reduction']],
    ['CHEM', 'Organic chemistry — alcohols and carboxylic acids', ['Alcohols and Carboxylic Acids']],
    ['CHEM', 'Organic chemistry — fermentation; Mole concept', ['Alcohols and Carboxylic Acids', 'Chemical Calculations']],
    ['CHEM', 'Air and the atmosphere (carbon cycle)', ['Atmosphere and Environment']],
    ['CHEM', 'Energy changes — bond energies', ['Energy from Chemicals']],
    ['CHEM', 'Qualitative analysis / Salts', ['Salts']],
    ['CHEM', 'Periodic table: Group 1 (alkali metals)', ['The Periodic Table']],
    ['CHEM', 'Atomic structure / Structure and bonding', ['Atomic Structure', 'Covalent Bonding and Structure']],
    ['CHEM', 'Separation techniques: paper chromatography', ['Methods of Purification']],
    ['CHEM', 'Industrial chemistry (Haber process), air and environment', ['Salts', 'Atmosphere and Environment']],
    ['PHY', 'Electricity', ['Current of Electricity']],
    ['PHY', 'Light / Electromagnetic spectrum', ['Light', 'Electromagnetic Spectrum']],
    ['PHY', 'Thermal properties', ['Thermal Properties of Matter']],
    ['PHY', 'Magnetism', ['Magnetism']],
    ['PHY', 'Kinematics; Energy', ['Kinematics', 'Energy Work and Power']],
    ['BIO', 'Inheritance — monohybrid ratios and chance', ['Inheritance']],
    ['BIO', 'Inheritance (protein synthesis and gene mutation)', ['Inheritance', 'Molecular Genetics']],
    ['BIO', 'Transport in flowering plants — transpiration and stomata', ['Transport in Plants']],
    ['BIO', 'Immunity (vaccination, active and passive immunity) and antibiotics', ['Microorganisms and Biotechnology']],
    ['BIO', 'Excretion — urine composition and concentration', ['Excretion']],
    ['BIO', 'Respiration and gas exchange — humans vs plants', ['Respiration and Gas Exchange']],
    ['BIO', 'Enzymes — effect of temperature, pH and specificity', ['Enzymes']],
    ['BIO', 'Ecology (energy flow and pyramids of biomass)', ['Organisms and their Environment']],
    ['BIO', 'Human reproduction — reproductive organs, contraception, prostate', ['Sexual Reproduction in Humans']],
  ];
  for (const [s, text, want] of cases) {
    it(`${s}: ${text}`, () => expect(markerTopics(s, text)).toEqual(want));
  }
  it('never guesses: unknown words map to nothing', () => {
    expect(markerTopics('EM', 'Not identified')).toEqual([]);
    expect(markerTopics('AM', 'Forming an area expression from a diagram')).toEqual([]);
    expect(markerTopics('AM', null)).toEqual([]);
  });
});
