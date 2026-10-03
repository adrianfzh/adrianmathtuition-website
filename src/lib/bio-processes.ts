// Processes in pictures (3 Oct 2026): the Biology answers that are a CHAIN —
// each step causes the next. One box a step, an arrow between, the scoring
// phrase in **bold** (splitBold in lib/science-definitions). A control loop is
// two branches side by side that both end at "back to normal". Pure data.

export interface ProcessBranch { label: string; steps: readonly string[] }
export interface BioProcess {
  id: string;
  title: string;
  /** One line: what the chain explains. */
  lede: string;
  /** The single chain (absent when the process is only branches). */
  steps?: readonly string[];
  /** Two routes from one start: a control loop, or two cases to compare. */
  branches?: readonly ProcessBranch[];
  /** Where both branches end. */
  end?: string;
  /** The slip that loses the mark. */
  remember?: string;
}

export const BIO_PROCESSES: readonly BioProcess[] = [
  {
    id: 'osmosis',
    title: 'Osmosis in a plant cell',
    lede: 'What happens to a plant cell in a dilute solution, and in a concentrated one.',
    branches: [
      { label: 'In a dilute solution', steps: [
        'The solution has a **higher water potential** than the cell sap.',
        'Water **enters the cell by osmosis**, through the **partially permeable** cell membrane.',
        'The vacuole swells and **pushes against the cell wall**.',
        'The cell is **turgid**. The **cell wall stops it bursting**.',
      ] },
      { label: 'In a concentrated solution', steps: [
        'The solution has a **lower water potential** than the cell sap.',
        'Water **leaves the cell by osmosis**.',
        'The vacuole shrinks. The cell becomes **flaccid**.',
        'The **cell membrane pulls away from the cell wall**: the cell is **plasmolysed**.',
      ] },
    ],
    remember: 'Write “water potential”, never “concentration of water”. Say which way the water moves.',
  },
  {
    id: 'enzyme-action',
    title: 'How an enzyme works',
    lede: 'The lock and key hypothesis, in four steps.',
    steps: [
      'The **active site** has a shape **complementary** to the **substrate**.',
      'The substrate **fits into the active site**: an **enzyme–substrate complex** forms.',
      'The reaction takes place. The **products leave** the active site.',
      'The enzyme is **unchanged** and can be **used again**.',
    ],
    remember: 'The substrate fits the enzyme. The shapes are complementary, not “the same”.',
  },
  {
    id: 'enzyme-temperature',
    title: 'Temperature and enzyme activity',
    lede: 'Why the rate rises to the optimum, then falls.',
    branches: [
      { label: 'Up to the optimum', steps: [
        'Temperature rises: molecules have **more kinetic energy**.',
        'Enzyme and substrate **collide more often**.',
        '**More enzyme–substrate complexes** form each second.',
        'The **rate of reaction increases**, highest at the **optimum temperature**.',
      ] },
      { label: 'Above the optimum', steps: [
        'The bonds holding the enzyme in shape **break**.',
        'The **active site loses its shape**: the enzyme is **denatured**.',
        'The **substrate no longer fits** the active site.',
        'The **rate of reaction falls** to zero.',
      ] },
    ],
    remember: 'An enzyme is denatured, never “killed”. At low temperature it is inactive, not denatured.',
  },
  {
    id: 'digestion',
    title: 'Digestion of a meal',
    lede: 'What is broken down, where, and by which enzyme.',
    steps: [
      '**Mouth**: **salivary amylase** digests **starch to maltose**.',
      '**Stomach**: **protease (pepsin)** digests **proteins to polypeptides**. Hydrochloric acid gives the acidic pH.',
      '**Small intestine**: **bile emulsifies fats** into small droplets, a larger surface area for lipase.',
      '**Small intestine**: amylase: starch to maltose. **Maltase: maltose to glucose**.',
      '**Small intestine**: protease: polypeptides to **amino acids**. **Lipase: fats to fatty acids and glycerol**.',
      'Glucose and amino acids are **absorbed into the blood capillaries** of the **villi**.',
    ],
    remember: 'Bile is not an enzyme. It breaks fat up physically; it does not digest it.',
  },
  {
    id: 'heart',
    title: 'One beat of the heart',
    lede: 'The path of blood through the left side. The right side does the same, to the lungs.',
    steps: [
      'The **atria contract**. Blood is forced into the **ventricles**.',
      'The **ventricles contract**. The pressure in the ventricle rises.',
      'The **bicuspid valve closes**, to **prevent backflow** into the atrium (“lub”).',
      'The **semilunar valve opens**. Blood leaves through the **aorta**.',
      'The **ventricles relax**. The pressure in the ventricle falls.',
      'The **semilunar valve closes**, to **prevent backflow** into the ventricle (“dub”).',
    ],
    remember: 'A valve opens or closes because of a pressure difference. Name the valve and say what it prevents.',
  },
  {
    id: 'blood-glucose',
    title: 'Control of blood glucose',
    lede: 'Negative feedback: both routes end with the level back to normal.',
    branches: [
      { label: 'Blood glucose rises (after a meal)', steps: [
        'The **islets of Langerhans** in the **pancreas** detect the rise.',
        'They **secrete more insulin** into the blood.',
        'The **liver and muscles convert excess glucose to glycogen**. Cells take in more glucose.',
        'Blood glucose concentration **falls**.',
      ] },
      { label: 'Blood glucose falls (fasting, exercise)', steps: [
        'The **islets of Langerhans** in the **pancreas** detect the fall.',
        'They **secrete more glucagon** into the blood.',
        'The **liver converts glycogen to glucose**.',
        'Blood glucose concentration **rises**.',
      ] },
    ],
    end: 'Back to the normal level. This is **negative feedback**.',
    remember: 'Glucagon is the hormone; glycogen is the stored carbohydrate. Spell them right.',
  },
  {
    id: 'temperature',
    title: 'Control of body temperature',
    lede: 'Negative feedback through the skin.',
    branches: [
      { label: 'Too hot', steps: [
        '**Thermoreceptors** detect the rise. The **hypothalamus** sends nerve impulses.',
        '**Arterioles in the skin dilate** (vasodilation): **more blood** flows to the skin capillaries.',
        '**More heat is lost** by radiation, convection and conduction.',
        '**Sweat glands produce more sweat**. Water in sweat **evaporates** and removes **latent heat**.',
      ] },
      { label: 'Too cold', steps: [
        '**Thermoreceptors** detect the fall. The **hypothalamus** sends nerve impulses.',
        '**Arterioles in the skin constrict** (vasoconstriction): **less blood** flows to the skin capillaries.',
        '**Less heat is lost**. Sweat glands produce less sweat.',
        '**Shivering**: muscles contract and **release heat from respiration**.',
      ] },
    ],
    end: 'Body temperature returns to normal.',
    remember: 'Arterioles dilate or constrict. Capillaries do not, and blood vessels do not move.',
  },
  {
    id: 'photosynthesis',
    title: 'Photosynthesis',
    lede: 'From light to starch.',
    steps: [
      '**Chlorophyll absorbs light energy**.',
      'Light energy is converted to **chemical energy**.',
      'The energy is used to make **glucose** from **carbon dioxide and water**. **Oxygen** is released.',
      'Glucose is **used in respiration**, or converted to **starch for storage**.',
      'Glucose is converted to **sucrose** and transported in the **phloem**.',
    ],
    remember: 'Carbon dioxide enters by diffusion through the stomata. Water comes up the xylem.',
  },
  {
    id: 'transpiration',
    title: 'Water from root to leaf',
    lede: 'How water moves up a plant.',
    steps: [
      '**Root hair cells** take in water **by osmosis**: the soil solution has a higher water potential.',
      'Water moves **from cell to cell by osmosis** to the **xylem**.',
      'In the leaf, water **evaporates** from the mesophyll cells into the air spaces.',
      'Water vapour **diffuses out through the stomata**: **transpiration**.',
      'This creates the **transpiration pull**, which draws water up the xylem.',
    ],
  },
  {
    id: 'nephron',
    title: 'How the kidney makes urine',
    lede: 'One nephron, from blood to urine.',
    steps: [
      '**Ultrafiltration**: **high blood pressure** in the **glomerulus** forces small molecules into the Bowman’s capsule.',
      'The filtrate has **water, glucose, amino acids, salts and urea**. Blood cells and proteins are too large.',
      '**Selective reabsorption**: **all the glucose and amino acids**, and most of the salts and water, return to the blood.',
      'More water is reabsorbed at the **collecting duct**, controlled by **ADH**.',
      'What is left, **urea, excess salts and excess water**, is **urine**.',
    ],
    remember: 'A healthy person’s urine has no glucose and no protein. Say why for each.',
  },
  {
    id: 'adh',
    title: 'Control of water in the blood',
    lede: 'Negative feedback with ADH.',
    branches: [
      { label: 'Too little water (water potential falls)', steps: [
        'The **hypothalamus** detects the fall.',
        'The **pituitary gland releases more ADH**.',
        'The collecting duct walls become **more permeable to water**.',
        '**More water is reabsorbed**. Urine: **less, more concentrated**.',
      ] },
      { label: 'Too much water (water potential rises)', steps: [
        'The **hypothalamus** detects the rise.',
        'The **pituitary gland releases less ADH**.',
        'The collecting duct walls become **less permeable to water**.',
        '**Less water is reabsorbed**. Urine: **more, more dilute**.',
      ] },
    ],
    end: 'The water potential of the blood returns to normal.',
  },
  {
    id: 'reflex',
    title: 'A reflex arc',
    lede: 'Hand on a hot object: the path of the impulse.',
    steps: [
      '**Receptors** in the skin detect the stimulus and produce **nerve impulses**.',
      'The **sensory neurone** carries the impulses to the **spinal cord**.',
      'They cross a **synapse** to the **relay neurone**, then another synapse to the motor neurone.',
      'The **motor neurone** carries the impulses to the **effector**.',
      'The effector, a **muscle**, **contracts**. The hand pulls away.',
    ],
    remember: 'Impulses travel; “messages” and “signals” do not score.',
  },
];
