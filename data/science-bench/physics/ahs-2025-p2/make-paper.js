// Writes paper.json for AHS 2025 Prelim Physics P2 (bench §1, 30 Sep 2026). Run: node make-paper.js
// Schemes are the school's own mark scheme (scheme.pdf), summarised. Tables are printed as lines.
const P = (label, max, text, scheme) => ({ label, text, max, scheme });
const H = (label, text) => ({ label, text, max: null, scheme: null, header: true });
const paper = {
  subject: 'physics',
  paperKey: 'AHS 2025 Prelim Physics P2',
  note: 'Figure-free parts only. Q7(c) (ray diagram) and Q2–6, Q8, Q10 left out: they need a figure or a drawing',
  questions: [
    { question: '1', bankId: 'd1eb5199-ddaf-4bd5-b064-f9fbbda587b9', stem: '', parts: [
      P('(a)', 2, 'The second, metre and kilogram are all SI units of base quantities. Name two other base quantities whose SI units are not stated above.', 'any two of: electric current, temperature, amount of substance [1] each'),
      H('(b)', ''),
      P('(b)(i)', 1, 'Circle the value for the prefix deci.   10⁻⁹   10⁻⁶   10⁻³   10⁻²   10⁻¹   10³   10⁶   10⁹   10¹²', '10⁻¹ [1]'),
      P('(b)(ii)', 1, 'Rearrange the following prefixes in order from the largest value to the smallest value.   n   μ   G   m   k', 'G, k, m, μ, n [1]'),
    ] },
    { question: '7', bankId: '71545135-c1d4-46dc-98f5-b4b3cf166c87', stem: 'A small object is placed in front of a thin converging lens.', parts: [
      P('(a)', 1, 'Define the focal length of a converging lens.', 'distance between the optical centre and the focal point [1]'),
      P('(b)', 2, 'Describe briefly an experiment to determine the focal length of such a lens.', 'distant object focused on a screen [1]; adjust until the image is sharp, lens-to-screen distance = f [1]'),
      P('(d)', 2, 'Other than the location and the magnification of the image, state two other characteristics of the image formed.', 'virtual [1]; upright [1]'),
    ] },
    { question: '9', bankId: '29fd9283-85af-4445-9750-6bd6d61ef18b', stem: 'The owner of a house records the details of the electricity usage for one day (Fig. 9.1).\nappliance — power rating / W — time switched on / hours — energy used / kWh\nTV and computer — 1000 — 2.0 — ....\nkettle — 2000 — 0.20 — ....\nlights — 800 — 3.0 — ....\nwater heater — 3500 — 0.20 — ....\nair conditioner — 1500 — 6.0 — ....', parts: [
      P('(a)', 1, 'Complete Fig. 9.1 by calculating the amount of energy used by each appliance.', '2.0, 0.40, 2.4, 0.70, 9.0 kWh — 1 mark for all correct values'),
      P('(b)', 2, 'The cost of electricity is 31 cents per unit. Calculate the cost of the electricity usage for one day.', 'total 14.5 kWh [1]; cost = 14.5 × 0.31 = $4.50 [1]'),
      P('(c)', 2, 'The wires supplying electric current to the water heater are thicker than those supplying current to the lights. Explain why this is necessary.', 'higher power → higher current; thick wire → lower resistance; reduces energy/power loss or prevents overheating — 2 marks for 3 points, 1 mark for 1–2 points'),
    ] },
    { question: '11', bankId: 'e98b3516-4958-410b-970a-49a1ad1d7715', stem: 'A company makes insulating bowls to keep food cool. Bowls made of polystyrene and of paper cardboard are filled with 200 g of ice at 0 °C. The mass of water (melted ice) is recorded every 5 minutes (Table 11.1).\ntime / min: 0, 5, 10, 15, 20, 25\npolystyrene, without lid / g: 0, 2, 9, 13, 20, 30\npolystyrene, with lid / g: 0, 0, 5, 9, 14, 23\npaper cardboard, without lid / g: 0, 12, 25, 44, 58, 79\npaper cardboard, with lid / g: 0, 5, 14, 30, 45, 63', parts: [
      P('(a)', 1, 'State one other variable that should be kept constant to ensure a fair test.', 'e.g. size of bowl / size of ice cubes / surrounding temperature [1]'),
      P('(b)', 1, 'Using the information from Table 11.1, suggest which material is better for insulation and explain your choice.', 'polystyrene, with data from the table [1]'),
      P('(c)', 1, 'Using ideas about thermal processes, suggest one reason for the difference in the mass of water collected with and without lid for both materials.', 'lid traps air, a poor conductor / less conduction; OR less radiation reaches the ice [1]; reject convection or evaporation; if more than one process is stated, mark only the first'),
      P('(d)', 1, 'State and explain whether the bowl should be light-coloured or dark-coloured.', 'light-coloured; poorer absorber of (infra-red) radiation [1]; reject "absorber of heat"'),
      H('(e)', 'An ice maker takes in water at 25.0 °C and gives out ice cubes at −3.0 °C. Specific heat capacity of water = 4.2 J/(g °C); specific latent heat of fusion of water = 340 J/g; specific heat capacity of ice = 2.1 J/(g °C).'),
      P('(e)(i)', 2, 'State what is meant by specific latent heat of fusion of water is 340 J / g.', '340 J / energy / per 1 g / change between solid and liquid / at constant temperature: all points 2 m, 2–4 points 1 m; zero if a change in temperature is suggested'),
      P('(e)(ii)', 1, 'Explain why the internal energy of water decreases even though the temperature of water remains constant as it solidifies into ice.', 'potential energy of the particles decreases (distance decreases / attraction increases) while kinetic energy is unchanged [1]'),
      P('(e)(iii)', 3, 'Calculate the total amount of energy transferred as 500 g of water at 25.0 °C is cooled to form ice at −3.0 °C.', 'Q = mcΔθ = 52 500 J; Q = ml = 170 000 J; Q = mcΔθ = 3 150 J; total 226 000 J (or 230 000 J) — [1] for each of the 2 formulae, [1] for the final answer'),
    ] },
    { question: '12', bankId: '471321d1-552d-4c2e-ba9a-ee66fe4f2d58', stem: 'A doctor uses a radioactive isotope, iodine-131, to determine the volume of blood in a patient\'s body. Iodine-131 decays by emitting beta particles and gamma rays.', parts: [
      P('(a)', 2, 'State two differences between beta particles and gamma rays.', 'any 2: electron vs EM wave; more ionising; less penetrating; charged vs uncharged; mass vs no mass'),
      H('(b)', 'Some iodine-131 is injected and spreads evenly through the blood after twelve minutes. Nine samples of blood, each 2.0 cm³, are taken at two-minute intervals (Fig. 12.1, background subtracted).\nsample number: 1, 2, 3, 4, 5, 6, 7, 8, 9\ntime after injection / min: 2, 4, 6, 8, 10, 12, 14, 16, 18\ncount rate / per second: 0, 4, 12, 18, 28, 40, 38, 36, 40'),
      P('(b)(i)', 1, 'State the reason why the count rates of samples 6 to 9 are not constant throughout.', 'nuclear decay is random and spontaneous [1]'),
      P('(b)(ii)', 2, 'The average value of the last four samples is the average count rate from 2.0 cm³ of blood. Determine the volume of blood in the patient\'s body which has a total count rate of 144 000 per second.', 'average = 38.5 [1]; volume = 144 000 / 38.5 × 2.0 = 7500 cm³ [1]'),
      P('(b)(iii)', 1, 'Iodine-131 (I) has nucleon number 131 and atomic number 53. It decays into Xenon (Xe) by emitting beta radiation. Write the nuclear decay equation.', '¹³¹₅₃I → ¹³¹₅₄Xe + ⁰₋₁β [1]'),
      P('(b)(iv)', 2, 'Sample number 9 is kept. The count rate is measured after 16 days. Estimate the count rate given that the half-life of iodine-131 is 8.0 days.', '2 half-lives [1]; 40 / 2² = 10 counts per second [1]'),
      P('(c)', 2, 'State two factors the doctor must consider when selecting the radioactive isotope to be used for this purpose.', 'short half-life [1]; not poisonous to the body [1]; do not accept "harmful" (too general) or "able to penetrate the skin"'),
    ] },
  ],
};
paper.source = 'science bank (adrianscience) questions, school=AHS, year=2025, paper=2; truth from the school mark scheme, scheme.pdf';
require('fs').writeFileSync(__dirname + '/paper.json', JSON.stringify(paper, null, 1));
console.log('paper.json:', paper.questions.reduce((a, q) => a + q.parts.reduce((b, p) => b + (p.max || 0), 0), 0), 'marks');
