// The Chemistry definitions list (14 Oct 2026, Adrian: "does chemistry and
// biology test definitions? if so yes") — the same page as the Physics and
// Biology lists (lib/science-definitions.ts), by O-Level Chemistry (6092)
// topic. **bold** = the words a marking point wants. Pure data; the parser and
// search are shared.
import { defn as d, withOften, type Definition } from './science-definitions';

export const CHEMISTRY_TOPICS: readonly string[] = [
  'Particulate nature of matter', 'Chemical bonding and structure', 'Chemical calculations',
  'Acid–base chemistry', 'Redox chemistry', 'Patterns in the Periodic Table',
  'Chemical energetics', 'Rate of reactions', 'Organic chemistry', 'Maintaining air quality',
];

// ⭐ "Often asked" (14 Oct 2026, Adrian: "#1 > do it"): the terms our science
// bank asks to define most — at least 3 questions, the top 20 at most.
// Counted by scripts/definitions-often-asked.ts; the number is how many
// questions asked. Re-run it and update this list when the bank grows.
export const CHEMISTRY_OFTEN: readonly string[] = [
  'patterns-in-the-periodic-table-alloy', // 19,
  'particulate-nature-of-matter-isotopes', // 17,
  'chemical-calculations-relative-atomic-mass-a', // 11,
  'particulate-nature-of-matter-diatomic', // 8,
  'chemical-energetics-exothermic-reaction', // 8,
  'organic-chemistry-hydrocarbon', // 7,
  'acid-base-chemistry-weak-acid', // 6,
  'organic-chemistry-isomers', // 6,
  'organic-chemistry-homologous-series', // 5,
  'acid-base-chemistry-acid', // 5,
  'acid-base-chemistry-amphoteric-oxide', // 4,
  'organic-chemistry-unsaturated', // 4,
  'acid-base-chemistry-strong-acid', // 3,
  'chemical-bonding-and-structure-allotropes', // 3
];

export const CHEMISTRY_DEFINITIONS: readonly Definition[] = withOften([
  d('Particulate nature of matter', 'Element', 'A substance that **cannot be broken down** into simpler substances by **chemical methods**.'),
  d('Particulate nature of matter', 'Compound', 'A substance made of **two or more elements chemically combined** in a **fixed proportion**.'),
  d('Particulate nature of matter', 'Proton number', 'The **number of protons** in the nucleus of an atom.'),
  d('Particulate nature of matter', 'Nucleon number', 'The **total number of protons and neutrons** in the nucleus of an atom.'),
  d('Particulate nature of matter', 'Isotopes', 'Atoms of the **same element** with the **same number of protons** but **different numbers of neutrons**.'),
  d('Particulate nature of matter', 'Diatomic', 'A molecule made of **two atoms**, such as H₂, O₂, N₂ or Cl₂.'),

  d('Chemical bonding and structure', 'Ionic bond', 'The **strong electrostatic attraction** between **oppositely charged ions**.'),
  d('Chemical bonding and structure', 'Covalent bond', 'A bond formed when two atoms **share a pair of electrons**.'),
  d('Chemical bonding and structure', 'Allotropes', '**Different structural forms** of the **same element**, such as diamond and graphite.'),

  d('Chemical calculations', 'Relative atomic mass (Aᵣ)', 'The **average mass of one atom** of an element compared with **1/12 the mass of one carbon-12 atom**.'),
  d('Chemical calculations', 'Relative molecular mass (Mᵣ)', 'The **average mass of one molecule** compared with **1/12 the mass of one carbon-12 atom**. It is the **sum of the relative atomic masses** of the atoms in the molecule.'),
  d('Chemical calculations', 'Relative formula mass', 'The **sum of the relative atomic masses** of all the atoms in the **formula** of an **ionic compound**.'),
  d('Chemical calculations', 'The mole', 'The **amount of substance** that contains **6.02 × 10²³ particles** (the Avogadro constant).', 'number of moles = mass ÷ molar mass'),

  d('Acid–base chemistry', 'Acid', 'A substance that produces **hydrogen ions, H⁺(aq)**, when **dissolved in water**.'),
  d('Acid–base chemistry', 'Base', 'A substance that **reacts with an acid** to form a **salt and water only**.'),
  d('Acid–base chemistry', 'Alkali', 'A **soluble base** that produces **hydroxide ions, OH⁻(aq)**, when dissolved in water.'),
  d('Acid–base chemistry', 'Strong acid', 'An acid that **ionises completely** in water.'),
  d('Acid–base chemistry', 'Weak acid', 'An acid that **ionises partially** in water.'),
  d('Acid–base chemistry', 'Neutralisation', 'The reaction between an **acid and a base** to form a **salt and water only**.', 'H⁺(aq) + OH⁻(aq) → H₂O(l)'),
  d('Acid–base chemistry', 'Salt', 'A compound formed when the **hydrogen ions of an acid are replaced** by **metal ions or ammonium ions**.'),
  d('Acid–base chemistry', 'Amphoteric oxide', 'An oxide that **reacts with both acids and bases** to form a salt and water. Examples: aluminium oxide, zinc oxide.'),

  d('Redox chemistry', 'Oxidation', '**Gain of oxygen**, **loss of hydrogen**, **loss of electrons** or an **increase in oxidation state**.'),
  d('Redox chemistry', 'Reduction', '**Loss of oxygen**, **gain of hydrogen**, **gain of electrons** or a **decrease in oxidation state**.'),
  d('Redox chemistry', 'Oxidising agent', 'A substance that **oxidises another substance** and is **itself reduced**.'),
  d('Redox chemistry', 'Reducing agent', 'A substance that **reduces another substance** and is **itself oxidised**.'),
  d('Redox chemistry', 'Electrolysis', 'The **decomposition** of a compound, **molten or in aqueous solution**, by **passing an electric current** through it.'),

  d('Patterns in the Periodic Table', 'Alloy', 'A **mixture** of a **metal with one or more other elements**, usually other metals.'),

  d('Chemical energetics', 'Exothermic reaction', 'A reaction that **gives out heat energy** to the surroundings. ΔH is **negative**.'),
  d('Chemical energetics', 'Endothermic reaction', 'A reaction that **takes in heat energy** from the surroundings. ΔH is **positive**.'),

  d('Rate of reactions', 'Activation energy', 'The **minimum energy** that colliding particles need **for a reaction to happen**.'),
  d('Rate of reactions', 'Catalyst', 'A substance that **speeds up a chemical reaction** and **remains chemically unchanged** at the end. It gives an **alternative pathway with a lower activation energy**.'),

  d('Organic chemistry', 'Hydrocarbon', 'A compound made of **carbon and hydrogen only**.'),
  d('Organic chemistry', 'Homologous series', 'A family of organic compounds with the **same general formula**, the **same functional group** and **similar chemical properties**. Each member differs from the next by a **–CH₂– group**.'),
  d('Organic chemistry', 'Isomers', 'Compounds with the **same molecular formula** but **different structural formulae**.'),
  d('Organic chemistry', 'Saturated', 'An organic compound with **only single bonds** between carbon atoms.'),
  d('Organic chemistry', 'Unsaturated', 'An organic compound with **at least one carbon–carbon double bond** (C=C).'),
  d('Organic chemistry', 'Polymer', 'A **very large molecule** made by joining **many small molecules (monomers)** together.'),

  d('Maintaining air quality', 'Greenhouse gas', 'A gas that **absorbs infrared radiation** given off by the Earth and **traps heat in the atmosphere**. Examples: carbon dioxide, methane.'),
], CHEMISTRY_OFTEN);
