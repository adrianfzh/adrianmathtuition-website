// P2 Q5 — sector OAB, centre O, radius 9 cm, angle AOB = 1.2 rad; C on OB with OC = 5 cm.
// Shaded: sector OAB minus triangle OAC (bounded by AC, CB and arc AB).
module.exports = ({ Construction, el }) => {
  const R = 9;
  const TH = 1.2;                       // radians
  const THD = (TH * 180) / Math.PI;     // 68.7549...
  const Ax = R * Math.cos(TH), Ay = R * Math.sin(TH);

  const c = new Construction()
    .circle('k', 0, 0, R)
    .point('O', 0, 0)
    .point('B', R, 0)
    .point('A', Ax, Ay)
    .point('C', 5, 0)
    .midpoint('M1', 'O', 'A')
    .midpoint('M2', 'O', 'C')
    .point('L5', 2.5, -0.55)
    .assertOnCircle('A on circle centre O radius 9', 'A', 'k')
    .assertOnCircle('B on circle centre O radius 9', 'B', 'k')
    .assertEqualLength('OA = OB (radii)', ['O', 'A'], ['O', 'B'])
    .assertCollinear('C lies on OB', ['O', 'C', 'B'])
    .assertBetween('C between O and B', 'O', 'C', 'B')
    .assertAngle('angle AOB = 1.2 rad', ['A', 'O', 'B'], THD)
    .assertNum('OC = 5', Math.hypot(5, 0), 5);

  // arc B -> A sampled densely for the hatched region boundary
  const arc = [];
  for (let i = 0; i <= 60; i++) {
    const t = (TH * i) / 60;
    arc.push({ x: R * Math.cos(t), y: R * Math.sin(t) });
  }

  const region = [{ x: Ax, y: Ay }, { x: 5, y: 0 }, { x: R, y: 0 }, ...arc];

  return {
    cons: c,
    width: 300,
    height: 258,
    margin: 26,
    base: [
      el.region(region, { spacing: 7, hatchAngle: 45 }),
      el.seg('O', 'A'),
      el.seg('O', 'B'),
      el.seg('A', 'C'),
      el.arcAt('O', R, 0, THD),
      el.arc('B', 'O', 'A', { r: 24, label: '1.2 rad', labelR: 44 }),
      el.dot('O'), el.dot('A'), el.dot('B'), el.dot('C'),
      el.label('O', 'O', -13, 13, { italic: true }),
      el.label('A', 'A', -2, -12, { italic: true }),
      el.label('B', 'B', 11, 12, { italic: true }),
      el.label('C', 'C', 2, 17, { italic: true }),
      el.label('M1', '9 cm', -24, -2, { halo: true }),
      el.label('L5', '5 cm', 0, 6, { halo: true }),
    ],
    layers: [[]],
  };
};
