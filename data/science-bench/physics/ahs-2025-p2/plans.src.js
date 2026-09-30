// The seeded scripts for AHS 2025 Prelim Physics P2 (bench §1, 30 Sep 2026).
// Each part: the student's answer, the defect code and the truth mark the school's own
// scheme (scheme.pdf) gives. Codes are SPEC-SCIENCE-BENCH §1's, plus chemistry's WRONG_ANSWER
// (a plainly wrong answer to a one-mark recall / choice part).
// NO_UNIT is the one rule not printed in this scheme: the SEAB convention that the answer mark
// needs the unit. It is marked "convention" in `why` so Adrian can overrule it.
// `why` states the truth rule from the scheme, readable without the answer.
const C = (a) => ({ a, d: 'CLEAN' });
const clean = {
  '1(a)': C('Electric current and temperature.'),
  '1(b)(i)': C('10⁻¹'),
  '1(b)(ii)': C('G, k, m, μ, n'),
  '7(a)': C('The distance between the optical centre of the lens and its focal point.'),
  '7(b)': C('Point the lens at a distant object, such as a window across the room, and hold a screen behind the lens. Move the screen until a sharp image of the window is formed on it. Measure the distance from the lens to the screen. This distance is the focal length.'),
  '7(d)': C('The image is virtual and upright.'),
  '9(a)': C('TV and computer: 2.0 kWh\nkettle: 0.40 kWh\nlights: 2.4 kWh\nwater heater: 0.70 kWh\nair conditioner: 9.0 kWh'),
  '9(b)': C('Total energy = 2.0 + 0.40 + 2.4 + 0.70 + 9.0 = 14.5 kWh\nCost = 14.5 × $0.31 = $4.50'),
  '9(c)': C('The water heater has a much higher power, so a larger current flows in its wires. A thicker wire has a lower resistance, so less power is lost as heat and the wires do not overheat.'),
  '11(a)': C('The surrounding (room) temperature.'),
  '11(b)': C('Polystyrene. After 25 minutes only 30 g of ice melted in the polystyrene bowl without a lid, but 79 g melted in the paper cardboard bowl.'),
  '11(c)': C('With a lid, air is trapped above the ice. Air is a poor conductor of heat, so less energy is transferred to the ice by conduction.'),
  '11(d)': C('Light-coloured, because a light surface is a poorer absorber of infra-red radiation.'),
  '11(e)(i)': C('340 J of energy is transferred for every 1 g of water to change between the solid and liquid states, at constant temperature.'),
  '11(e)(ii)': C('As the water solidifies, the particles move closer together and the attraction between them increases, so their potential energy decreases. The temperature is constant, so their kinetic energy does not change. The internal energy therefore decreases.'),
  '11(e)(iii)': C('Cooling the water: Q = mcΔθ = 500 × 4.2 × 25.0 = 52 500 J\nFreezing: Q = ml = 500 × 340 = 170 000 J\nCooling the ice: Q = mcΔθ = 500 × 2.1 × 3.0 = 3 150 J\nTotal = 52 500 + 170 000 + 3 150 = 225 650 J ≈ 226 000 J'),
  '12(a)': C('Beta particles are fast-moving electrons, but gamma rays are electromagnetic waves.\nBeta particles are charged, but gamma rays have no charge.'),
  '12(b)(i)': C('Radioactive decay is random and spontaneous.'),
  '12(b)(ii)': C('Average = (40 + 38 + 36 + 40) ÷ 4 = 38.5 per second\nVolume = 144 000 ÷ 38.5 × 2.0 = 7480 cm³ ≈ 7500 cm³'),
  '12(b)(iii)': C('[131/53]I → [131/54]Xe + [0/-1]β'),
  '12(b)(iv)': C('16 days = 2 half-lives\nCount rate = 40 ÷ 2 ÷ 2 = 10 per second'),
  '12(c)': C('It must have a short half-life.\nIt must not be poisonous to the body.'),
};
const seeds = [
  { seed: 1, grade: 'A', over: {
    '11(c)': { a: 'With a lid, air is trapped above the ice. Air is a poor conductor of heat, so less energy reaches the ice by conduction. The lid also stops convection currents.', d: 'EXTRA_WRONG', t: 1, why: 'scheme: "if more than 1 thermal process is stated, mark only the first" — the first is conduction, which is right → 1' },
    '12(a)': { a: 'Beta particles are fast-moving electrons, but gamma rays are electromagnetic waves.', d: 'MISS_POINT', t: 1, why: 'any 2 differences, one given → 1/2' },
    '11(e)(iii)': { a: 'Cooling the water: Q = mcΔθ = 500 × 4.2 × 25.0 = 52 500\nFreezing: Q = ml = 500 × 340 = 170 000\nCooling the ice: Q = mcΔθ = 500 × 2.1 × 3.0 = 3 150\nTotal = 225 650 ≈ 226 000', d: 'NO_UNIT', t: 2, why: 'both formula marks given; the final answer carries no unit (J) → answer mark withheld (convention)' },
  } },
  { seed: 2, grade: 'C', over: {
    '1(a)': { a: 'Temperature and weight.', d: 'MISS_POINT', t: 1, why: 'temperature is a base quantity [1]; weight is not (it is a force) → 1/2' },
    '7(b)': { a: 'Point the lens at a window across the room and move a screen behind the lens until a sharp image of the window is seen on the screen.', d: 'HALF_POINT', t: 1, why: 'distant object focused on a screen [1]; no measurement of the lens-to-screen distance as f → second mark withheld' },
    '9(c)': { a: 'A thicker wire has a lower resistance, so the wire does not overheat.', d: 'HALF_POINT', t: 1, why: '2 of the 3 points (lower resistance, prevents overheating); higher current not stated → "1 mark for 1–2 points"' },
    '11(c)': { a: 'The lid stops convection currents of warm air reaching the ice. Air trapped under the lid is also a poor conductor.', d: 'EXTRA_WRONG', t: 0, why: 'scheme: reject convection; mark only the first process stated — the first is convection → 0' },
    '11(d)': { a: 'Light-coloured, because it is a poorer absorber of heat.', d: 'WRONG_WORD', t: 0, why: 'scheme: "reject absorber of heat (must be specific since the thermal process is radiation)" → 0' },
    '11(e)(i)': { a: '340 J of energy is needed for every 1 g of water to change between the solid and liquid states.', d: 'MISS_POINT', t: 1, why: '"at constant temperature" missing → 4 of the 5 points → 1 m' },
    '12(b)(ii)': { a: 'Average = (40 + 38 + 36 + 40) ÷ 4 = 38.5 ≈ 39 per second\nVolume = 144 000 ÷ 39 × 2.0 = 7385 cm³ ≈ 7400 cm³', d: 'EARLY_ROUND', t: 1, why: 'average 38.5 shown [1]; rounded to 39 before dividing, so the volume is 7400 cm³, not 7500 cm³ → answer mark withheld' },
    '12(c)': { a: 'It must have a short half-life.\nIt must not be harmful to the patient.', d: 'WRONG_WORD', t: 1, why: 'short half-life [1]; scheme: "do not accept harmful as it is too general" → 1/2' },
  } },
  { seed: 3, grade: 'E', over: {
    '1(a)': { a: 'Temperature.', d: 'MISS_POINT', t: 1, why: 'one base quantity of the two asked → 1/2' },
    '1(b)(i)': { a: '10⁻²', d: 'WRONG_ANSWER', t: 0, why: 'deci is 10⁻¹; 10⁻² is centi → 0' },
    '7(a)': { a: 'The distance from the lens to the image.', d: 'WRONG_WORD', t: 0, why: 'scheme: optical centre to focal point; lens-to-image is the image distance → 0' },
    '7(b)': { a: '', d: 'BLANK', t: 0, why: 'no answer' },
    '7(d)': { a: 'Upright.', d: 'MISS_POINT', t: 1, why: 'upright [1]; virtual not stated → 1/2' },
    '9(b)': { a: '', d: 'BLANK', t: 0, why: 'no answer' },
    '9(c)': { a: 'The water heater takes more current so it needs a thicker wire.', d: 'HALF_POINT', t: 1, why: 'one point (higher current) → "1 mark for 1–2 points"' },
    '11(a)': { a: 'The time.', d: 'WRONG_ANSWER', t: 0, why: 'time is the variable being measured against, not a controlled variable → 0' },
    '11(b)': { a: '', d: 'BLANK', t: 0, why: 'no answer' },
    '11(c)': { a: 'The lid stops convection.', d: 'EXTRA_WRONG', t: 0, why: 'scheme: reject convection → 0' },
    '11(d)': { a: 'Dark-coloured, because dark colours absorb heat better.', d: 'WRONG_ANSWER', t: 0, why: 'the scheme answer is light-coloured → 0' },
    '11(e)(i)': { a: 'It is the energy needed to raise the temperature of 1 g of water by 1 °C.', d: 'WRONG_WORD', t: 0, why: 'scheme: "zero marks if change in temperature is suggested" → 0' },
    '11(e)(ii)': { a: '', d: 'BLANK', t: 0, why: 'no answer' },
    '11(e)(iii)': { a: 'Q = mcΔθ = 500 × 4.2 × 28 = 58 800 J', d: 'WRONG_FORMULA', t: 1, why: 'Q = mcΔθ written [1]; no Q = ml for the freezing, final answer wrong → 1/3' },
    '12(a)': { a: 'Gamma rays are more penetrating than beta particles.', d: 'MISS_POINT', t: 1, why: 'one difference of the two asked → 1/2' },
    '12(b)(i)': { a: 'Because of background radiation.', d: 'WRONG_ANSWER', t: 0, why: 'background is already subtracted; the scheme wants random, spontaneous decay → 0' },
    '12(b)(ii)': { a: 'Average = (40 + 38 + 36 + 40) ÷ 4 = 38.5\nVolume = 144 000 ÷ 38.5 = 3740 cm³', d: 'WRONG_FORMULA', t: 1, why: 'average 38.5 [1]; forgot × 2.0 cm³ per sample, so 3740, not 7500 → answer mark withheld' },
    '12(b)(iii)': { a: '[131/53]I → [131/52]Xe + [0/1]β', d: 'WRONG_ANSWER', t: 0, why: 'the atomic number must rise to 54 and the beta particle is ⁰₋₁ → 0' },
    '12(b)(iv)': { a: '', d: 'BLANK', t: 0, why: 'no answer' },
    '12(c)': { a: 'It must not be harmful.\nIt must be able to penetrate the skin.', d: 'WRONG_WORD', t: 0, why: 'scheme rejects both: "harmful" is too general; penetrating the skin is not needed as the blood samples are removed → 0' },
  } },
  { seed: 4, grade: 'C', over: {
    '1(b)(ii)': { a: 'G, k, μ, m, n', d: 'WRONG_ANSWER', t: 0, why: 'm (10⁻³) is larger than μ (10⁻⁶); order wrong → 0' },
    '7(d)': { a: 'Virtual.', d: 'MISS_POINT', t: 1, why: 'virtual [1]; upright not stated → 1/2' },
    '9(b)': { a: 'Total energy = 2.0 + 0.40 + 2.4 + 0.70 + 9.0 = 14.5 kWh\nCost = 14.5 × $0.31 = $4.05', d: 'SLIP_CARRY', t: 1, why: 'total 14.5 kWh [1]; 14.5 × 0.31 is 4.50, not 4.05 → answer mark withheld' },
    '11(e)(ii)': { a: 'As the water freezes the particles slow down, so their kinetic energy decreases and the internal energy decreases.', d: 'WRONG_ANSWER', t: 0, why: 'the scheme wants potential energy falling with kinetic energy unchanged; kinetic energy falling contradicts the constant temperature → 0' },
    '11(e)(iii)': { a: 'Cooling the water: Q = mcΔθ = 500 × 4.2 × 25.0 = 5 250 J\nFreezing: Q = ml = 500 × 340 = 170 000 J\nCooling the ice: Q = mcΔθ = 500 × 2.1 × 3.0 = 3 150 J\nTotal = 5 250 + 170 000 + 3 150 = 178 400 J', d: 'SLIP_CARRY', t: 2, why: 'both formula marks given; 500 × 4.2 × 25 slipped to 5 250 and carried, so the total is 178 400 J, not 226 000 J → answer mark withheld' },
    '12(b)(ii)': { a: 'Average = (40 + 38 + 36 + 40) ÷ 4 = 38.5 per second\nVolume = 144 000 ÷ 38.5 × 2.0 = 7480 ≈ 7500', d: 'NO_UNIT', t: 1, why: 'average 38.5 [1]; the volume has no unit (cm³) → answer mark withheld (convention)' },
    '12(b)(iv)': { a: '16 days = 2 half-lives\nCount rate = 40 ÷ 2 = 20 per second', d: 'WRONG_FORMULA', t: 1, why: '"1 mark for recognising 2 half lives" given; halved only once, so 20, not 10 → answer mark withheld' },
  } },
];
module.exports = { clean, seeds };
