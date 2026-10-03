// The Physics definitions page (3 Oct 2026, Adrian: "we should just have a
// definition page … that students can easily access in the physics/science
// tab"). One list, by O-Level Physics (6091) topic. The words a marking point
// wants are in **bold** — `splitBold` turns a line into runs the page draws.
// Pure: the list, the bold parser, the search.

export interface Definition {
  id: string;
  topic: string;
  term: string;
  /** One sentence. **bold** = the words the scheme looks for. */
  text: string;
  /** The formula, with what each letter stands for. */
  formula?: string;
}

export const DEFINITION_TOPICS: readonly string[] = [
  'Measurement', 'Kinematics', 'Forces', 'Turning effect of forces', 'Pressure', 'Energy',
  'Kinetic particle model', 'Thermal processes', 'Thermal properties', 'Waves', 'Light',
  'Static electricity', 'Current electricity', 'Practical electricity', 'Magnetism',
  'Electromagnetic induction', 'Radioactivity',
];

const d = (topic: string, term: string, text: string, formula?: string): Definition => ({
  id: `${topic}:${term}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  topic, term, text, ...(formula ? { formula } : {}),
});

export const DEFINITIONS: readonly Definition[] = [
  d('Measurement', 'Scalar quantity', 'A quantity that has **magnitude only**.'),
  d('Measurement', 'Vector quantity', 'A quantity that has **both magnitude and direction**.'),
  d('Measurement', 'Period of a pendulum', 'The **time taken** for **one complete oscillation**.'),

  d('Kinematics', 'Speed', 'The **distance travelled per unit time**.', 'speed = distance ÷ time'),
  d('Kinematics', 'Average speed', 'The **total distance** travelled divided by the **total time** taken.'),
  d('Kinematics', 'Velocity', 'The **rate of change of displacement**.'),
  d('Kinematics', 'Acceleration', 'The **rate of change of velocity**.', 'a = (v − u) ÷ t'),
  d('Kinematics', 'Uniform acceleration', 'The velocity changes by the **same amount in every unit of time**.'),
  d('Kinematics', 'Free fall', 'Falling with **only the force of gravity** acting. The acceleration is constant, about 10 m/s².'),
  d('Kinematics', 'Terminal velocity', 'The **constant velocity** reached when **air resistance equals the weight**, so the resultant force is zero.'),

  d('Forces', "Newton's first law", 'An object stays **at rest** or moves at **constant speed in a straight line** unless a **resultant force** acts on it.'),
  d('Forces', "Newton's second law", 'The **resultant force** on an object equals its **mass × acceleration**. The acceleration is in the direction of the resultant force.', 'F = ma'),
  d('Forces', "Newton's third law", 'If body A exerts a force on body B, then B exerts an **equal and opposite** force on A. The two forces act on **different bodies**.'),
  d('Forces', 'Mass', 'The **amount of matter** in a body.'),
  d('Forces', 'Weight', 'The **gravitational force** acting on a body.', 'W = mg'),
  d('Forces', 'Inertia', 'The **reluctance** of a body to **change its state of rest or motion**. It depends on mass.'),
  d('Forces', 'Gravitational field', 'A **region** in which a **mass experiences a force** due to gravitational attraction.'),
  d('Forces', 'Gravitational field strength', 'The **gravitational force per unit mass** placed at that point.', 'g = W ÷ m'),
  d('Forces', 'Density', 'The **mass per unit volume**.', 'ρ = m ÷ V'),
  d('Forces', 'Friction', 'The force that **opposes motion** between two surfaces **in contact**.'),

  d('Turning effect of forces', 'Moment of a force', 'The **product** of the **force** and the **perpendicular distance** from the **pivot** to the line of action of the force.', 'moment = F × d'),
  d('Turning effect of forces', 'Principle of moments', 'For a body **in equilibrium**, the **sum of clockwise moments** about a pivot equals the **sum of anticlockwise moments** about the **same pivot**.'),
  d('Turning effect of forces', 'Centre of gravity', 'The **point** through which the **whole weight** of the body **appears to act**.'),
  d('Turning effect of forces', 'Stability', 'The ability of an object to **return to its original position** after being tilted slightly.'),

  d('Pressure', 'Pressure', 'The **force acting per unit area**.', 'p = F ÷ A'),
  d('Pressure', 'Pressure in a liquid', 'It increases with **depth** and with the **density** of the liquid.', 'p = hρg'),

  d('Energy', 'Principle of conservation of energy', 'Energy **cannot be created or destroyed**. It can only be **transferred from one store to another**. The **total energy** of an isolated system stays **constant**.'),
  d('Energy', 'Work done', 'The **product** of the **force** and the **distance moved in the direction of the force**.', 'W = F × s'),
  d('Energy', 'Power', 'The **rate of doing work**, or the rate of energy transfer.', 'P = W ÷ t'),
  d('Energy', 'Efficiency', 'The **useful energy output** divided by the **total energy input**, × 100%.'),
  d('Energy', 'Kinetic energy', 'The energy a body has **due to its motion**.', 'Eₖ = ½mv²'),
  d('Energy', 'Gravitational potential energy', 'The energy a body has **due to its position** in a gravitational field.', 'Eₚ = mgh'),

  d('Kinetic particle model', 'Brownian motion', 'The **random, continuous** motion of small particles in a fluid, caused by **uneven bombardment by the fluid molecules**.'),
  d('Kinetic particle model', 'Temperature and particles', 'The higher the temperature, the greater the **average kinetic energy** of the particles.'),
  d('Kinetic particle model', 'Gas pressure', 'Gas molecules **collide with the walls** of the container and exert a **force** on them. Pressure is this **force per unit area**.'),

  d('Thermal processes', 'Thermal equilibrium', 'Two bodies are at the **same temperature**, so there is **no net transfer** of energy between them.'),
  d('Thermal processes', 'Conduction', 'The transfer of thermal energy **through a medium** **without any flow of the medium**.'),
  d('Thermal processes', 'Convection', 'The transfer of thermal energy by **currents in a fluid**, caused by a **difference in density**.'),
  d('Thermal processes', 'Radiation', 'The transfer of thermal energy by **infrared (electromagnetic) waves**. It needs **no medium**.'),

  d('Thermal properties', 'Internal energy', 'The **total kinetic energy and potential energy** of the particles in a body.'),
  d('Thermal properties', 'Heat capacity', 'The thermal energy needed to raise the **temperature of a body** by **1 K (or 1 °C)**.', 'C = Q ÷ Δθ'),
  d('Thermal properties', 'Specific heat capacity', 'The thermal energy needed to raise the temperature of a **unit mass** of a substance by **1 K (or 1 °C)**.', 'c = Q ÷ (mΔθ)'),
  d('Thermal properties', 'Latent heat', 'The thermal energy absorbed or released during a **change of state**, **at constant temperature**.'),
  d('Thermal properties', 'Specific latent heat of fusion', 'The thermal energy needed to change a **unit mass** of a substance from **solid to liquid**, **without a change in temperature**.', 'l = Q ÷ m'),
  d('Thermal properties', 'Specific latent heat of vaporisation', 'The thermal energy needed to change a **unit mass** of a substance from **liquid to gas**, **without a change in temperature**.', 'l = Q ÷ m'),
  d('Thermal properties', 'Evaporation', 'A liquid changes to a gas **at any temperature**, **at the surface** only.'),
  d('Thermal properties', 'Boiling', 'A liquid changes to a gas at a **fixed temperature**, **throughout** the liquid.'),

  d('Waves', 'Wave', 'A wave **transfers energy** from one place to another **without transferring matter**.'),
  d('Waves', 'Transverse wave', 'The vibrations are **perpendicular** to the **direction of travel** of the wave.'),
  d('Waves', 'Longitudinal wave', 'The vibrations are **parallel** to the **direction of travel** of the wave.'),
  d('Waves', 'Amplitude', 'The **maximum displacement** of a point **from its rest position**.'),
  d('Waves', 'Wavelength', 'The **shortest distance** between two points that are **in phase**, such as two neighbouring crests.'),
  d('Waves', 'Frequency', 'The **number of complete waves** produced **per unit time**.', 'f = 1 ÷ T'),
  d('Waves', 'Period', 'The **time taken** to produce **one complete wave**.'),
  d('Waves', 'Wave speed', 'The **distance travelled by a wave per unit time**.', 'v = fλ'),
  d('Waves', 'Wavefront', 'An imaginary **line joining all points** on a wave that are **in phase**.'),
  d('Waves', 'Compression and rarefaction', 'A compression is a region where the air pressure is **higher than** the surrounding pressure. A rarefaction is where it is **lower**.'),
  d('Waves', 'Echo', 'The **reflection of sound**.'),
  d('Waves', 'Ultrasound', 'Sound with a frequency **above 20 kHz**, the upper limit of human hearing.'),
  d('Waves', 'Electromagnetic waves', '**Transverse** waves that travel at the **same speed in a vacuum** (3.0 × 10⁸ m/s) and **need no medium**.'),

  d('Light', 'Laws of reflection', 'The **angle of incidence equals the angle of reflection**. The incident ray, the reflected ray and the **normal** all lie in the **same plane**.'),
  d('Light', 'Refraction', 'The **bending of light** as it passes from one medium to another, caused by a **change in speed**.'),
  d('Light', 'Refractive index', 'The ratio of the **speed of light in vacuum** to the **speed of light in the medium**.', 'n = c ÷ v = sin i ÷ sin r'),
  d('Light', 'Critical angle', 'The **angle of incidence in the optically denser medium** for which the **angle of refraction** in the less dense medium is **90°**.', 'sin c = 1 ÷ n'),
  d('Light', 'Total internal reflection', 'All the light is reflected inside the **optically denser medium**. It happens when the **angle of incidence is greater than the critical angle**.'),
  d('Light', 'Focal length', 'The **distance** between the **optical centre** and the **focal point** of the lens.'),
  d('Light', 'Focal point (principal focus)', 'The point on the principal axis where rays **parallel to the principal axis** **converge** after passing through the lens.'),

  d('Static electricity', 'Electric field', 'A **region** in which an **electric charge experiences a force**.'),
  d('Static electricity', 'Direction of an electric field', 'The direction of the **force on a positive charge**.'),

  d('Current electricity', 'Current', 'The **rate of flow of charge**.', 'I = Q ÷ t'),
  d('Current electricity', 'Electromotive force (e.m.f.)', 'The **work done by the source** in driving a **unit charge** around a **complete circuit**.', 'ε = W ÷ Q'),
  d('Current electricity', 'Potential difference', 'The **work done** to drive a **unit charge** **through the component**.', 'V = W ÷ Q'),
  d('Current electricity', 'Resistance', 'The ratio of the **potential difference across** a component to the **current through** it.', 'R = V ÷ I'),
  d('Current electricity', "Ohm's law", 'The current through a metallic conductor is **directly proportional** to the **potential difference across it**, provided the **temperature stays constant**.'),

  d('Practical electricity', 'Kilowatt-hour', 'The energy used by a **1 kW** appliance in **1 hour**.', '1 kWh = 3.6 × 10⁶ J'),
  d('Practical electricity', 'Fuse', 'A thin wire that **melts and breaks the circuit** when the **current exceeds its rated value**. It goes in the **live wire**.'),
  d('Practical electricity', 'Earthing', 'The metal casing is joined to the **earth wire**, a **low-resistance path** for the current if the casing becomes live.'),

  d('Magnetism', 'Magnetic field', 'A **region** in which a **magnetic object experiences a force**.'),
  d('Magnetism', 'Direction of a magnetic field', 'The direction of the **force on the north pole** of a magnet placed there.'),
  d('Magnetism', 'Induced magnetism', 'A magnetic material **becomes a magnet** when it is placed **near or in contact with** a magnet.'),

  d('Electromagnetic induction', "Faraday's law", 'The **induced e.m.f.** is **directly proportional** to the **rate of change of magnetic flux** linking the circuit.'),
  d('Electromagnetic induction', "Lenz's law", 'The **induced current** flows in the direction that **opposes the change** producing it.'),
  d('Electromagnetic induction', 'Electromagnetic induction', 'An **e.m.f. is induced** in a conductor when the **magnetic flux linking it changes**.'),

  d('Radioactivity', 'Proton number', 'The **number of protons** in the nucleus.'),
  d('Radioactivity', 'Nucleon number', 'The **total number of protons and neutrons** in the nucleus.'),
  d('Radioactivity', 'Isotopes', 'Atoms of the same element with the **same number of protons** but **different numbers of neutrons**.'),
  d('Radioactivity', 'Radioactive decay', 'An **unstable nucleus** emits radiation. The process is **random** and **spontaneous**.'),
  d('Radioactivity', 'Half-life', 'The **time taken** for **half the nuclei** of the radioactive isotope in a sample to **decay**.'),
  d('Radioactivity', 'Background radiation', 'The radiation **always present** in the environment, from natural and man-made sources.'),
  d('Radioactivity', 'Nuclear fission', 'A **heavy nucleus splits** into **two smaller nuclei**, releasing energy.'),
  d('Radioactivity', 'Nuclear fusion', '**Two light nuclei join** to form a **heavier nucleus**, releasing energy.'),
];

export interface BoldRun { text: string; bold: boolean }

/** "The **rate** of change" → runs the page draws. An odd `**` leaves the rest plain. */
export function splitBold(text: string): BoldRun[] {
  const parts = String(text ?? '').split('**');
  // An unclosed marker: put it back as text rather than bolding the tail.
  if (parts.length % 2 === 0) {
    const tail = parts.pop() as string;
    parts[parts.length - 1] += `**${tail}`;
  }
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter(r => r.text !== '');
}

const fold = (s: string) => s.toLowerCase().replace(/\*\*/g, '').replace(/[’']/g, "'").trim();

/** Definitions whose term, topic or words carry every word of the query. Empty query = all. */
export function searchDefinitions(query: string, list: readonly Definition[] = DEFINITIONS): Definition[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter(x => {
    const hay = fold(`${x.term} ${x.topic} ${x.text} ${x.formula ?? ''}`);
    return words.every(w => hay.includes(w));
  });
}

/** Topics in syllabus order, each with its definitions; empty topics dropped. */
export function groupByTopic(list: readonly Definition[]): { topic: string; items: Definition[] }[] {
  return DEFINITION_TOPICS
    .map(topic => ({ topic, items: list.filter(x => x.topic === topic) }))
    .filter(g => g.items.length > 0);
}

export const topicAnchor = (topic: string) => `t-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
